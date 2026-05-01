import express, { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// GET note for a symbol
// @ts-ignore
router.get('/:symbol', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const { symbol } = req.params;
        const note = await prisma.note.findUnique({
            where: { userId_symbol: { userId, symbol } },
            select: { body: true, updatedAt: true },
        });

        if (!note) {
            res.status(404).json({ error: 'Note not found' });
            return;
        }

        res.json(note);
    } catch (error) {
        console.error('Get note error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// PUT (upsert) note for a symbol
// @ts-ignore
router.put('/:symbol', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const { symbol } = req.params;
        const { body } = req.body;
        if (typeof body !== 'string') {
            res.status(400).json({ error: 'body is required' });
            return;
        }

        const note = await prisma.note.upsert({
            where: { userId_symbol: { userId, symbol } },
            update: { body },
            create: { userId, symbol, body },
            select: { body: true, updatedAt: true },
        });

        res.json(note);
    } catch (error) {
        console.error('Upsert note error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE note
// @ts-ignore
router.delete('/:symbol', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const { symbol } = req.params;
        await prisma.note.deleteMany({ where: { userId, symbol } });
        res.status(204).end();
    } catch (error) {
        console.error('Delete note error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
