import express, { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

function todayUTC(): Date {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function parseDate(input?: string): Date {
    if (!input) return todayUTC();
    const parsed = new Date(input);
    return Number.isNaN(parsed.getTime()) ? todayUTC() : new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

// LIST reveals for a date (default today)
// @ts-ignore
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const date = parseDate(req.query.date as string | undefined);
        const reveals = await prisma.reveal.findMany({
            where: { userId, date },
            select: { symbol: true },
            orderBy: { createdAt: 'asc' },
        });
        res.json(reveals.map((r) => r.symbol));
    } catch (error) {
        console.error('List reveals error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// CREATE a reveal — enforces 1/day cap for FREE users.
// @ts-ignore
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const { symbol } = req.body;
        if (!symbol || typeof symbol !== 'string') {
            res.status(400).json({ error: 'symbol is required' });
            return;
        }

        const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const date = todayUTC();

        // Idempotent: if already revealed today, return success.
        const existing = await prisma.reveal.findUnique({
            where: { userId_symbol_date: { userId, symbol, date } },
        });
        if (existing) {
            res.json({ symbol, date, alreadyRevealed: true });
            return;
        }

        if (user.plan === 'FREE') {
            const count = await prisma.reveal.count({ where: { userId, date } });
            if (count >= 1) {
                res.status(402).json({ error: 'Daily reveal limit reached', upgradeRequired: true });
                return;
            }
        }

        const reveal = await prisma.reveal.create({
            data: { userId, symbol, date },
            select: { symbol: true, date: true },
        });

        res.json(reveal);
    } catch (error) {
        console.error('Create reveal error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
