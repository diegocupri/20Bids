import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-prod';

// REGISTER
router.post('/register', async (req: Request, res: Response) => {
    try {
        const { email, password, name } = req.body;

        if (!email || !password) {
            res.status(400).json({ error: 'Email and password are required' });
            return;
        }

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            res.status(400).json({ error: 'User already exists' });
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                name: name || email.split('@')[0], // Default name from email
                avatarUrl: `https://ui-avatars.com/api/?name=${name || email}&background=random` // Default avatar
            }
        });

        // Generate Token
        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

        res.json({ token, user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl, settings: user.settings } });

    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// LOGIN
router.post('/login', async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            res.status(400).json({ error: 'Invalid credentials' });
            return;
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            res.status(400).json({ error: 'Invalid credentials' });
            return;
        }

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

        res.json({ token, user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl, settings: user.settings } });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET PROFILE (ME)
// @ts-ignore - Middleware type mismatch workaround if needed
router.get('/me', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user?.id) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { id: true, email: true, name: true, avatarUrl: true, createdAt: true, settings: true }
        });

        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// UPDATE PROFILE
// @ts-ignore
router.put('/profile', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const { name, avatarUrl, password, settings } = req.body;
        const userId = req.user?.id;

        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return
        }

        const updateData: any = {};
        if (name) updateData.name = name;
        if (avatarUrl) updateData.avatarUrl = avatarUrl;
        if (password) {
            updateData.password = await bcrypt.hash(password, 10);
        }
        if (settings) {
            // Merge existing settings with new ones if possible, but simplest is replacement or deep merge
            // Prisma Json replacement is standard behavior. Frontend should send full settings object or we merge here?
            // Let's do a simple merge on the backend if we could read it first, but for now replace is fine if frontend sends whole object.
            // Better: updateData.settings = settings
            updateData.settings = settings; // Valid if settings is a JSON object
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: updateData,
            select: { id: true, email: true, name: true, avatarUrl: true, settings: true }
        });

        res.json(user);

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// UPLOAD AVATAR (as base64)
// @ts-ignore
router.post('/avatar', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        // Check if it's multipart form data
        const contentType = req.headers['content-type'] || '';

        if (contentType.includes('multipart/form-data')) {
            // Handle file upload using raw body
            const chunks: Buffer[] = [];
            req.on('data', (chunk: Buffer) => chunks.push(chunk));
            req.on('end', async () => {
                const body = Buffer.concat(chunks);

                // Simple multipart parser - extract file data
                const boundary = contentType.split('boundary=')[1];
                if (!boundary) {
                    res.status(400).json({ error: 'No boundary found' });
                    return;
                }

                const parts = body.toString('binary').split('--' + boundary);
                let fileData: string | null = null;
                let mimeType = 'image/png';

                for (const part of parts) {
                    if (part.includes('filename=')) {
                        // Extract content type
                        const ctMatch = part.match(/Content-Type:\s*([^\r\n]+)/i);
                        if (ctMatch) mimeType = ctMatch[1].trim();

                        // Extract file data (after double CRLF)
                        const dataStart = part.indexOf('\r\n\r\n') + 4;
                        const dataEnd = part.lastIndexOf('\r\n');
                        if (dataStart > 0 && dataEnd > dataStart) {
                            const rawData = part.substring(dataStart, dataEnd);
                            fileData = Buffer.from(rawData, 'binary').toString('base64');
                        }
                    }
                }

                if (!fileData) {
                    res.status(400).json({ error: 'No file found in request' });
                    return;
                }

                const dataUrl = `data:${mimeType};base64,${fileData}`;

                const user = await prisma.user.update({
                    where: { id: userId },
                    data: { avatarUrl: dataUrl },
                    select: { id: true, avatarUrl: true }
                });

                res.json({ avatarUrl: user.avatarUrl });
            });
        } else {
            res.status(400).json({ error: 'Expected multipart/form-data' });
        }
    } catch (error) {
        console.error('Avatar upload error:', error);
        res.status(500).json({ error: 'Failed to upload avatar' });
    }
});

export default router;
