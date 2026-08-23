/**
 * Canal unico de alertas operativas.
 *
 * Hasta hoy no habia ninguno. Si la API devolvia 500 a todos los clientes,
 * nadie se enteraba hasta que alguien se quejaba; y el 19 de agosto de 2026 no
 * entro ningun pick y tampoco se supo. Un fallo silencioso en un producto de
 * suscripcion es peor que uno ruidoso: el cliente lo ve antes que tu.
 *
 * Tres destinos, todos opcionales e independientes:
 *
 *   email     — via Resend, que YA esta configurado en produccion porque lo usa
 *               el reset de contrasena. Es el unico que funciona sin dar de alta
 *               nada nuevo, asi que es el destino por defecto.
 *   Telegram  — si TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID estan puestos. El
 *               servicio ya existia para el bot de trading.
 *   Sentry    — si SENTRY_DSN esta puesto. Aporta traza y agrupacion, que el
 *               email no da.
 *
 * Sin ninguno configurado esto escribe en el log y no falla. Una alerta que
 * revienta el proceso al intentar avisar de un fallo es peor que el fallo.
 */
import { sendTelegramNotification } from './telegram';
import { sendOpsAlertEmail } from './email';

/** Cuantas alertas como maximo por ventana, para que un fallo en bucle no
 *  genere miles de emails y queme la cuota de Resend. El limite es global a
 *  proposito: si algo esta tan roto como para disparar 20 alertas distintas en
 *  una hora, el aviso ya llego. */
const MAX_PER_WINDOW = 20;
const WINDOW_MS = 60 * 60 * 1000;

let windowStart = Date.now();
let sentInWindow = 0;

/** Dedupe en memoria: la misma clave no vuelve a avisar en 6 h. Se pierde al
 *  reiniciar el proceso, y eso es aceptable para errores. Para el vigilante de
 *  ingesta NO basta —Render reinicia— y por eso ese usa la tabla BroadcastLog. */
const DEDUPE_MS = 6 * 60 * 60 * 1000;
const lastSent = new Map<string, number>();

export interface AlertInput {
    /** Titulo corto. Va en el asunto del email. */
    title: string;
    /** Cuerpo. Texto plano; se escapa antes de mandarlo como HTML. */
    detail: string;
    /** Si se repite dentro de 6 h, no se reenvia. */
    dedupeKey?: string;
    /** El error original, si lo hay: solo Sentry sabe hacer algo con la traza. */
    error?: unknown;
    /** 'error' manda a los tres destinos. 'warn' omite Sentry. */
    level?: 'warn' | 'error';
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

async function toSentry(input: AlertInput): Promise<void> {
    const dsn = process.env.SENTRY_DSN;
    if (!dsn) return;
    try {
        // Import dinamico: si @sentry/node no esta instalado, esto falla aqui
        // dentro y no al arrancar el servidor.
        const Sentry = await import('@sentry/node');
        if (input.error instanceof Error) Sentry.captureException(input.error);
        else Sentry.captureMessage(`${input.title} — ${input.detail}`, 'error');
    } catch (e) {
        console.error('[alerts] Sentry no disponible:', (e as Error).message);
    }
}

/**
 * Manda una alerta por todos los canales configurados. No lanza nunca: cada
 * destino se intenta por separado y un fallo se registra en el log.
 */
export async function alert(input: AlertInput): Promise<void> {
    const now = Date.now();

    if (now - windowStart > WINDOW_MS) { windowStart = now; sentInWindow = 0; }

    if (input.dedupeKey) {
        const prev = lastSent.get(input.dedupeKey);
        if (prev && now - prev < DEDUPE_MS) {
            console.log(`[alerts] "${input.title}" silenciada (ya avisada hace ${Math.round((now - prev) / 60000)} min)`);
            return;
        }
    }

    if (sentInWindow >= MAX_PER_WINDOW) {
        console.error(`[alerts] limite alcanzado (${MAX_PER_WINDOW}/h) — se descarta "${input.title}"`);
        return;
    }
    sentInWindow++;
    if (input.dedupeKey) lastSent.set(input.dedupeKey, now);

    const stamp = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
    console.error(`[alerts] ${input.level === 'warn' ? 'WARN' : 'ERROR'} — ${input.title}: ${input.detail}`);

    const jobs: Promise<unknown>[] = [
        sendOpsAlertEmail(input.title, input.detail, stamp).catch(e =>
            console.error('[alerts] email fallo:', (e as Error).message)),
        sendTelegramNotification(
            `${input.level === 'warn' ? '⚠️' : '❌'} <b>${escapeHtml(input.title)}</b>\n` +
            `📅 ${stamp}\n\n${escapeHtml(input.detail)}`
        ).catch(e => console.error('[alerts] telegram fallo:', (e as Error).message)),
    ];
    if (input.level !== 'warn') jobs.push(toSentry(input));

    await Promise.allSettled(jobs);
}

/**
 * Inicializa Sentry si hay DSN. Se llama una vez al arrancar. Sin DSN no hace
 * nada y el resto del fichero sigue funcionando por email y Telegram.
 */
export async function initSentry(): Promise<void> {
    const dsn = process.env.SENTRY_DSN;
    if (!dsn) {
        console.log('[alerts] SENTRY_DSN no configurado — alertas por email/Telegram unicamente.');
        return;
    }
    try {
        const Sentry = await import('@sentry/node');
        Sentry.init({
            dsn,
            environment: process.env.NODE_ENV ?? 'development',
            // Sin trazas de rendimiento: aqui interesa saber que algo se rompio,
            // no cuanto tardo. Activarlo tiene coste de cuota.
            tracesSampleRate: 0,
        });
        console.log('[alerts] Sentry inicializado.');
    } catch (e) {
        console.error('[alerts] Sentry no se pudo inicializar:', (e as Error).message);
    }
}
