import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

const prisma = new PrismaClient();

/**
 * Admin gate for the operator surface: /api/admin/*, /api/trading/*, the CSV
 * upload, the corpus-wide stats and the global tag writes. All of those were
 * reachable without any credential.
 *
 * Two ways in, because the callers are of two kinds:
 *   1) `x-api-key` matching UPLOAD_API_KEY — machines (cron, the ingest
 *      pipeline), the same credential /api/external/ingest already uses.
 *   2) A valid Bearer JWT whose user has `isTester: true` — the internal team,
 *      who already sign in to the analyst panel.
 *
 * There is no isAdmin column in the schema and adding one would need a
 * migration; `isTester` already means "one of us" and is set for the team. If
 * admin and tester ever need to diverge, add `isAdmin Boolean @default(false)`
 * to User and switch the select/check below.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
    // 1) Service key.
    const apiKey = req.headers['x-api-key'];
    if (typeof apiKey === 'string' && apiKey.length > 0 && apiKey === env.UPLOAD_API_KEY) {
        return next();
    }

    // 2) Internal-team JWT.
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        res.status(401).json({ error: 'Admin authentication required' });
        return;
    }
    try {
        const payload = jwt.verify(token, env.JWT_SECRET) as { id?: string };
        if (!payload?.id) {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }
        const user = await prisma.user.findUnique({
            where: { id: payload.id },
            select: { isTester: true },
        });
        if (!user?.isTester) {
            res.status(403).json({ error: 'Admin privileges required' });
            return;
        }
        (req as any).user = payload;
        next();
    } catch {
        res.status(403).json({ error: 'Invalid or expired token' });
    }
}
