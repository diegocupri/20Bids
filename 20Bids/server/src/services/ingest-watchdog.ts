/**
 * Vigilante de la carga diaria de picks.
 *
 * El servidor NO genera picks: llegan por POST desde un script de R en una
 * instancia de AWS. Si ese script falla —un 401 por una clave rotada, la
 * instancia apagada, un error de red— no pasa nada visible: la API sigue
 * respondiendo y la app muestra la sesion del dia anterior. El 19 de agosto de
 * 2026 no entro ni un pick y nadie se entero.
 *
 * Eso es lo peor que puede pasarle a un producto de suscripcion diaria: el
 * cliente descubre el fallo antes que tu, y lo que ve no es un error sino una
 * afirmacion falsa sobre el producto.
 *
 * Esto lo cierra por el lado del servidor, que es el unico lado que esta
 * siempre encendido.
 */
import { PrismaClient } from '@prisma/client';
import { fetchGroupedDaily } from './polygon';
import { alert } from './alerts';

const prisma = new PrismaClient();

/** Los picks se publican a las 10:25 ET. Se espera hasta las 10:45 para no
 *  avisar por veinte minutos de retraso en la subida. */
const CHECK_AFTER_ET_MINUTES = 10 * 60 + 45;

const EVERY_MS = 15 * 60 * 1000;

/** Marca en BroadcastLog, no en memoria: Render reinicia el proceso y una
 *  variable en memoria haria que cada reinicio reenviara la alerta del dia. */
const ALERT_KIND = 'ingest-missing';

/** Fecha y hora del mercado, no del servidor. Render corre en UTC: a las 02:00
 *  UTC del sabado en Nueva York siguen siendo las 22:00 del viernes, y usar la
 *  fecha del servidor consultaria el dia equivocado. */
function marketNow(): { date: string; minutes: number; weekday: number } {
    const now = new Date();
    const date = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD
    const hhmm = now.toLocaleTimeString('en-GB', {
        timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const [h, m] = hhmm.split(':').map(Number);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 = domingo
    return { date, minutes: h * 60 + m, weekday };
}

/**
 * ¿Abrio la bolsa ese dia?
 *
 * No hay calendario de festivos en el proyecto, y mantener uno a mano es una
 * lista que caduca. Se le pregunta a Polygon: si no publica barras diarias
 * agregadas para esa fecha, no hubo sesion. Eso cubre los ~9 festivos anuales
 * sin mantener nada.
 *
 * Ante la duda (Polygon caido, sin clave) devuelve true: mas vale un aviso de
 * mas que un dia sin picks en silencio.
 */
async function marketWasOpen(date: string): Promise<boolean> {
    try {
        const data: any = await fetchGroupedDaily(date);
        if (!data) return true;
        const n = Array.isArray(data.results) ? data.results.length
            : typeof data.resultsCount === 'number' ? data.resultsCount : null;
        if (n === null) return true;
        return n > 0;
    } catch {
        return true;
    }
}

async function checkOnce(): Promise<void> {
    const { date, minutes, weekday } = marketNow();

    if (weekday === 0 || weekday === 6) return;      // fin de semana
    if (minutes < CHECK_AFTER_ET_MINUTES) return;    // aun no toca

    const day = new Date(`${date}T00:00:00.000Z`);

    const count = await prisma.recommendation.count({ where: { date: day } });
    if (count > 0) return;                            // todo bien, lo normal

    // Ya avisado hoy? El unique (kind, date) hace esta comprobacion atomica mas
    // abajo, pero se consulta antes para no pedirle a Polygon el dia entero en
    // cada tick de un dia que ya se reporto.
    const already = await prisma.broadcastLog.findUnique({
        where: { kind_date: { kind: ALERT_KIND, date: day } },
    });
    if (already) return;

    if (!(await marketWasOpen(date))) {
        console.log(`[watchdog] ${date}: sin picks, pero la bolsa no abrio. Sin alerta.`);
        return;
    }

    // Se registra ANTES de avisar y se deja que el unique falle si otra
    // instancia se adelanto: asi dos procesos no mandan la misma alerta.
    try {
        await prisma.broadcastLog.create({ data: { kind: ALERT_KIND, date: day, count: 0 } });
    } catch {
        return; // otra instancia ya avisa
    }

    const last = await prisma.recommendation.findFirst({
        orderBy: { date: 'desc' }, select: { date: true },
    });
    const lastStr = last ? last.date.toISOString().slice(0, 10) : 'ninguna';

    await alert({
        title: `Sin picks para hoy (${date})`,
        detail:
            `La bolsa abrio el ${date} y a las ${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')} ET ` +
            `no hay ninguna recomendacion cargada.\n\n` +
            `Ultima sesion con datos: ${lastStr}\n\n` +
            `Que comprobar, en este orden:\n` +
            `  1. Que la instancia de RStudio en AWS este encendida.\n` +
            `  2. Que upload_data.R se haya ejecutado y su salida no sea un 401 ` +
            `(seria INGEST_API_KEY desincronizada entre ~/.Renviron y Render).\n` +
            `  3. Reintentar la subida a mano: POST /api/recommendations/upload\n\n` +
            `Mientras no se cargue, la app muestra la sesion del ${lastStr} sin indicar que es antigua.`,
        dedupeKey: `${ALERT_KIND}:${date}`,
        level: 'error',
    });
}

export function startIngestWatchdog(): void {
    // Un tick al arrancar, con margen para que la conexion a la base este lista.
    setTimeout(() => { checkOnce().catch(e => console.error('[watchdog]', e)); }, 30_000);
    setInterval(() => { checkOnce().catch(e => console.error('[watchdog]', e)); }, EVERY_MS);
    console.log('[watchdog] vigilante de ingesta activo (cada 15 min, desde las 10:45 ET).');
}

/** Estado de la ingesta para /api/health/ingest, que es lo que puede vigilar un
 *  monitor externo gratuito sin depender de que el email salga. */
export async function ingestHealth(): Promise<{
    ok: boolean; lastSession: string | null; picks: number; staleDays: number | null;
}> {
    const last = await prisma.recommendation.findFirst({
        orderBy: { date: 'desc' }, select: { date: true },
    });
    if (!last) return { ok: false, lastSession: null, picks: 0, staleDays: null };

    const lastStr = last.date.toISOString().slice(0, 10);
    const picks = await prisma.recommendation.count({ where: { date: last.date } });

    // Dias de calendario, no de mercado: un fin de semana da 2 sin que nada
    // este roto, y por eso el umbral de "obsoleto" son 4 dias y no 1.
    const staleDays = Math.floor(
        (Date.now() - new Date(`${lastStr}T00:00:00.000Z`).getTime()) / 86_400_000);

    return { ok: staleDays <= 4, lastSession: lastStr, picks, staleDays };
}
