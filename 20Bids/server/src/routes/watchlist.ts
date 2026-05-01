import express, { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// LIST watchlist symbols
// @ts-ignore
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const items = await prisma.watchlist.findMany({
            where: { userId },
            select: { symbol: true },
            orderBy: { id: 'asc' },
        });
        res.json(items.map((w) => w.symbol));
    } catch (error) {
        console.error('List watchlist error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// ADD a symbol to the watchlist (idempotent)
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

        const item = await prisma.watchlist.upsert({
            where: { userId_symbol: { userId, symbol } },
            update: {},
            create: { userId, symbol },
            select: { symbol: true },
        });
        res.json(item);
    } catch (error) {
        console.error('Add watchlist error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// REMOVE a symbol from the watchlist
// @ts-ignore
router.delete('/:symbol', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const { symbol } = req.params;
        await prisma.watchlist.deleteMany({ where: { userId, symbol } });
        res.status(204).end();
    } catch (error) {
        console.error('Remove watchlist error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
