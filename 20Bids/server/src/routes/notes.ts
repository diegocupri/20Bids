import express, { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// GET Note for a specific date
// @ts-ignore
router.get('/:date', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const { date } = req.params;

        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const note = await prisma.dailyNote.findUnique({
            where: {
                userId_date: {
                    userId,
                    date
                }
            }
        });

        res.json(note || { content: '' });
    } catch (error) {
        console.error('Error fetching note:', error);
        res.status(500).json({ error: 'Failed to fetch note' });
    }
});

// CREATE or UPDATE Note
// @ts-ignore
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const { date, content } = req.body;

        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        if (!date) {
            res.status(400).json({ error: 'Date is required' });
            return;
        }

        const note = await prisma.dailyNote.upsert({
            where: {
                userId_date: {
                    userId,
                    date
                }
            },
            update: {
                content
            },
            create: {
                userId,
                date,
                content
            }
        });

        res.json(note);
    } catch (error) {
        console.error('Error saving note:', error);
        res.status(500).json({ error: 'Failed to save note' });
    }
});

export default router;
