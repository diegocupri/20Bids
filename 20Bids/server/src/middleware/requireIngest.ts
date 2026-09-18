import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

/**
 * Puerta para las DOS vias por las que entran picks:
 *   - POST /api/external/ingest          (JSON, script de R en AWS)
 *   - POST /api/recommendations/upload   (CSV multipart, upload_data.R)
 *
 * Usa INGEST_API_KEY, no UPLOAD_API_KEY. La distincion importa: escribir picks
 * y administrar el bot de trading son riesgos distintos, y meterlos bajo la
 * misma clave forzaba a elegir entre romper la carga diaria o dejar el bot
 * detras de un secreto publicado en el repositorio.
 *
 * Acepta tambien la clave de admin: quien puede borrar un dia entero de
 * recomendaciones puede, obviamente, escribirlas.
 */
export function requireIngest(req: Request, res: Response, next: NextFunction) {
    const apiKey = req.headers['x-api-key'];
    if (typeof apiKey !== 'string' || apiKey.length === 0) {
        reject(req, res, 'sin cabecera x-api-key');
        return;
    }
    if (apiKey === env.INGEST_API_KEY || apiKey === env.UPLOAD_API_KEY) {
        next();
        return;
    }
    // La longitud si, la clave no: basta para distinguir "manda la clave
    // equivocada" de "manda una vacia" sin escribir un secreto en el log.
    reject(req, res, `la clave no coincide (longitud ${apiKey.length})`);
}

/**
 * Un rechazo deja rastro. Hasta el 2026-09-18 no lo dejaba: cuatro semanas
 * sin picks y era imposible saber desde el servidor si el script de R estaba
 * llamando con la clave mal, o simplemente no estaba llamando. Son fallos
 * distintos con arreglos distintos, y los dos se veian igual: nada.
 */
function reject(req: Request, res: Response, reason: string) {
    console.warn(`[ingest] rechazado — ${reason} · ${req.method} ${req.path} · ip=${req.ip}`);
    res.status(401).json({ error: 'Unauthorized' });
}
