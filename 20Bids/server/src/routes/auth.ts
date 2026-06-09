import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { sendPasswordResetEmail } from '../services/email';

const router = express.Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-prod';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const USER_PUBLIC_SELECT = {
    id: true,
    email: true,
    name: true,
    avatarUrl: true,
    createdAt: true,
    settings: true,
    plan: true,
    planRenewsAt: true,
    riskProfile: true,
} as const;

/**
 * Convert a stored avatar (which may be a giant `data:image/...;base64,...`
 * string saved at upload time) into a small URL pointing to the streaming
 * endpoint below. Keeps user-object responses compact (~1KB instead of
 * ~400KB), which makes login / me / profile snappy on mobile data.
 *
 * Already-http URLs are passed through untouched.
 */
function publicizeAvatar<T extends { id: string; avatarUrl: string | null }>(
    user: T,
    req: Request,
): T {
    if (!user.avatarUrl) return user;
    if (user.avatarUrl.startsWith('data:')) {
        const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
        const host = req.get('host');
        return { ...user, avatarUrl: `${proto}://${host}/api/auth/avatar/${user.id}?v=${Date.now()}` };
    }
    return user;
}

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
                name: name || email.split('@')[0],
                avatarUrl: `https://ui-avatars.com/api/?name=${name || email}&background=random`,
            },
            select: USER_PUBLIC_SELECT,
        });

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user });

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
        const { password: _pw, ...publicUser } = user as any;

        res.json({
            token,
            user: publicizeAvatar({
                id: publicUser.id,
                email: publicUser.email,
                name: publicUser.name,
                avatarUrl: publicUser.avatarUrl,
                settings: publicUser.settings,
                plan: publicUser.plan,
                planRenewsAt: publicUser.planRenewsAt,
                riskProfile: publicUser.riskProfile,
            }, req),
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET PROFILE (ME)
// @ts-ignore
router.get('/me', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user?.id) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: USER_PUBLIC_SELECT,
        });

        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        res.json(publicizeAvatar(user, req));
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// UPDATE PROFILE
// @ts-ignore
router.put('/profile', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const { name, email, avatarUrl, password, settings, riskProfile } = req.body;
        const userId = req.user?.id;

        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const updateData: any = {};
        if (name) updateData.name = name;
        // Email change — normalise + guard uniqueness (it's the login id).
        if (email && typeof email === 'string') {
            const normalized = email.trim().toLowerCase();
            if (normalized && normalized !== '') {
                const clash = await prisma.user.findUnique({ where: { email: normalized } });
                if (clash && clash.id !== userId) {
                    res.status(400).json({ error: 'That email is already in use' });
                    return;
                }
                updateData.email = normalized;
            }
        }
        if (avatarUrl) updateData.avatarUrl = avatarUrl;
        if (password) {
            updateData.password = await bcrypt.hash(password, 10);
        }
        if (settings !== undefined) updateData.settings = settings;
        if (riskProfile !== undefined) updateData.riskProfile = riskProfile;

        const user = await prisma.user.update({
            where: { id: userId },
            data: updateData,
            select: USER_PUBLIC_SELECT,
        });

        res.json(publicizeAvatar(user, req));

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// UPLOAD AVATAR
// @ts-ignore
router.post('/avatar', authenticateToken, upload.single('avatar'), async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const file = (req as any).file;
        if (!file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }

        const base64 = file.buffer.toString('base64');
        const dataUrl = `data:${file.mimetype};base64,${base64}`;

        const user = await prisma.user.update({
            where: { id: userId },
            data: { avatarUrl: dataUrl },
            select: { id: true, avatarUrl: true },
        });

        res.json(publicizeAvatar(user, req));
    } catch (error) {
        console.error('Avatar upload error:', error);
        res.status(500).json({ error: 'Failed to upload avatar' });
    }
});

// SERVE AVATAR (binary). Reads the data: URL stored on the user, decodes it,
// and streams the bytes back with the right Content-Type. This is what
// publicizeAvatar() above points clients at, instead of dumping ~400KB of
// base64 into every JSON user response.
router.get('/avatar/:userId', async (req: Request, res: Response) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.params.userId },
            select: { avatarUrl: true },
        });
        if (!user?.avatarUrl) {
            res.status(404).end();
            return;
        }
        // External URL stored directly (e.g. ui-avatars.com fallback) → redirect.
        if (!user.avatarUrl.startsWith('data:')) {
            res.redirect(302, user.avatarUrl);
            return;
        }
        const m = /^data:([^;,]+)(;base64)?,(.+)$/i.exec(user.avatarUrl);
        if (!m) { res.status(404).end(); return; }
        const [, mime, , payload] = m;
        const buf = Buffer.from(payload, 'base64');
        res.setHeader('Content-Type', mime);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('Content-Length', String(buf.length));
        res.end(buf);
    } catch (error) {
        console.error('Avatar serve error:', error);
        res.status(500).end();
    }
});

// UPGRADE TO PRO
// MVP: directly sets plan + 1-month renewal. v2 → Stripe Checkout webhook.
// @ts-ignore
router.post('/upgrade', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const renewsAt = new Date();
        renewsAt.setMonth(renewsAt.getMonth() + 1);

        const user = await prisma.user.update({
            where: { id: userId },
            data: { plan: 'PRO', planRenewsAt: renewsAt },
            select: { id: true, plan: true, planRenewsAt: true },
        });

        res.json(user);
    } catch (error) {
        console.error('Upgrade error:', error);
        res.status(500).json({ error: 'Failed to upgrade plan' });
    }
});

// ============================================================================
// PASSWORD RESET (forgot-password / reset-password)
// ============================================================================
// Flow:
//   1. POST /auth/forgot-password { email }
//      → if user exists, generate a 6-digit code, hash it, store with 60-min
//        expiry, email the raw code via Resend. Always returns 200 even when
//        the email doesn't exist (prevents account enumeration).
//   2. POST /auth/reset-password { email, code, newPassword }
//      → verify code against the hashed stored value, reject after 5 wrong
//        attempts, update the user's password, return a fresh JWT so the
//        user is logged in automatically.
// ============================================================================

const RESET_CODE_EXPIRY_MIN = 60;
const RESET_CODE_MAX_ATTEMPTS = 5;

/** Generate a 6-digit numeric code (zero-padded). 1M possibilities; combined
 * with the 5-attempt cap that's ~5/1M chance of a successful blind guess. */
function generateResetCode(): string {
    // crypto.randomInt is uniform — Math.random is not, especially under load.
    return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

// FORGOT PASSWORD — request a reset code via email.
router.post('/forgot-password', async (req: Request, res: Response) => {
    try {
        const { email } = req.body as { email?: string };
        if (!email || typeof email !== 'string') {
            res.status(400).json({ error: 'Email is required' });
            return;
        }

        const normalized = email.trim().toLowerCase();
        const user = await prisma.user.findUnique({ where: { email: normalized } });

        // Account enumeration defense: ALWAYS respond 200, even when the
        // user doesn't exist. Otherwise a 404 vs 200 leaks which emails are
        // registered. Genuine users still get the email.
        if (user) {
            const code = generateResetCode();
            const codeHash = await bcrypt.hash(code, 10);
            const expiresAt = new Date(Date.now() + RESET_CODE_EXPIRY_MIN * 60_000);

            // Upsert by email — issuing a new code invalidates the prior one.
            await prisma.passwordResetToken.upsert({
                where: { email: normalized },
                create: { email: normalized, codeHash, expiresAt, attempts: 0 },
                update: { codeHash, expiresAt, attempts: 0 },
            });

            try {
                await sendPasswordResetEmail(user.email, code);
            } catch (err) {
                // Email delivery failed — surface a 500 so the client can
                // tell the user to retry. The token was already stored, so
                // a retry from the user will re-issue and re-send.
                console.error('Reset email send failed:', err);
                res.status(500).json({ error: 'Failed to send email. Try again.' });
                return;
            }
        }

        res.json({ ok: true });
    } catch (error) {
        console.error('Forgot-password error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// RESET PASSWORD — exchange a valid reset code for a new password + JWT.
router.post('/reset-password', async (req: Request, res: Response) => {
    try {
        const { email, code, newPassword } = req.body as {
            email?: string; code?: string; newPassword?: string;
        };
        if (!email || !code || !newPassword) {
            res.status(400).json({ error: 'email, code and newPassword are required' });
            return;
        }
        if (typeof newPassword !== 'string' || newPassword.length < 8) {
            res.status(400).json({ error: 'Password must be at least 8 characters' });
            return;
        }

        const normalized = email.trim().toLowerCase();
        const token = await prisma.passwordResetToken.findUnique({ where: { email: normalized } });

        // Same generic message on every "code didn't validate" path so the
        // client can't distinguish "no such code" / "expired" / "wrong code".
        // The only path with a different message is "too many attempts",
        // which the user genuinely needs to know.
        if (!token) {
            res.status(400).json({ error: 'Invalid or expired code' });
            return;
        }
        if (token.expiresAt.getTime() < Date.now()) {
            await prisma.passwordResetToken.delete({ where: { email: normalized } });
            res.status(400).json({ error: 'Invalid or expired code' });
            return;
        }
        if (token.attempts >= RESET_CODE_MAX_ATTEMPTS) {
            await prisma.passwordResetToken.delete({ where: { email: normalized } });
            res.status(429).json({ error: 'Too many attempts. Request a new code.' });
            return;
        }

        const valid = await bcrypt.compare(code, token.codeHash);
        if (!valid) {
            await prisma.passwordResetToken.update({
                where: { email: normalized },
                data: { attempts: { increment: 1 } },
            });
            res.status(400).json({ error: 'Invalid or expired code' });
            return;
        }

        // Code valid — update password + nuke the reset token (single-use).
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const user = await prisma.user.update({
            where: { email: normalized },
            data: { password: hashedPassword },
            select: USER_PUBLIC_SELECT,
        });
        await prisma.passwordResetToken.delete({ where: { email: normalized } });

        // Auto-login: issue a fresh JWT so the user lands in the app
        // immediately, no extra sign-in step.
        const jwtToken = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token: jwtToken, user: publicizeAvatar(user, req) });
    } catch (error) {
        console.error('Reset-password error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DOWNGRADE TO FREE
// @ts-ignore
router.post('/downgrade', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: { plan: 'FREE', planRenewsAt: null },
            select: { id: true, plan: true, planRenewsAt: true },
        });

        res.json(user);
    } catch (error) {
        console.error('Downgrade error:', error);
        res.status(500).json({ error: 'Failed to downgrade plan' });
    }
});

export default router;
