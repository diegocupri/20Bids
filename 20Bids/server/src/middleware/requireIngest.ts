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
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    if (apiKey === env.INGEST_API_KEY || apiKey === env.UPLOAD_API_KEY) {
        next();
        return;
    }
    res.status(401).json({ error: 'Unauthorized' });
}
