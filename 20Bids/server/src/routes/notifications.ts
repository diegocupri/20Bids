/**
 * Notifications router — manages push token lifecycle and (admin) broadcasts.
 *
 * Mounted at `/api/notifications` in index.ts. JWT-protected routes use
 * the same middleware/secret as /api/auth/*.
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { sendPushToTokens, sendPushToAllOptedIn } from '../services/push';

const router = Router();
const prisma = new PrismaClient();

/**
 * Register / refresh a device's Expo Push Token for the logged-in user.
 *
 * The mobile app calls this on:
 *   - successful login
 *   - app foregrounding (in case the token rotated since last open)
 *
 * Idempotent: upserts by token, so calling twice with the same token is fine.
 * If the token was previously tied to a different user (device shared,
 * account switch), it gets re-assigned to the current user.
 */
router.post('/register-token', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { token, platform, deviceName, appVersion } = req.body as {
      token?: string;
      platform?: 'ios' | 'android';
      deviceName?: string;
      appVersion?: string;
    };

    if (!token || !platform) {
      return res.status(400).json({ error: 'token and platform are required' });
    }
    if (!/^Expo(nent)?PushToken\[/.test(token)) {
      return res.status(400).json({ error: 'Invalid Expo Push Token format' });
    }

    const row = await prisma.pushToken.upsert({
      where: { token },
      update: { userId, platform, deviceName, appVersion },
      create: { token, userId, platform, deviceName, appVersion },
      select: { id: true, token: true, platform: true, createdAt: true, lastSeenAt: true },
    });

    res.json({ success: true, token: row });
  } catch (err: any) {
    console.error('[Notifications] register-token error:', err?.message || err);
    res.status(500).json({ error: 'Failed to register push token' });
  }
});

/**
 * Unregister a token (called on sign-out or when user denies permissions).
 * Auth-protected because we want to make sure the user owns the token.
 */
router.delete('/token', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { token } = req.body as { token?: string };
    if (!token) return res.status(400).json({ error: 'token is required' });

    const result = await prisma.pushToken.deleteMany({
      where: { token, userId },
    });
    res.json({ success: true, deleted: result.count });
  } catch (err: any) {
    console.error('[Notifications] delete token error:', err?.message || err);
    res.status(500).json({ error: 'Failed to delete token' });
  }
});

/**
 * Send a test push to YOURSELF (the logged-in user's devices).
 * Useful from the app's "Notifications" settings screen to verify the
 * whole pipeline (Apple key → Expo → device).
 */
router.post('/test', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const tokens = await prisma.pushToken.findMany({
      where: { userId },
      select: { token: true },
    });
    if (tokens.length === 0) {
      return res.status(404).json({ error: 'No registered devices for this user' });
    }
    const result = await sendPushToTokens(
      tokens.map((t) => t.token),
      {
        title: '20Bids · Test push',
        body: 'If you see this, push notifications are wired correctly.',
        data: { route: '/(tabs)/bids', kind: 'test' },
      }
    );
    res.json({ success: true, devices: tokens.length, ok: result.ok, failed: result.failed });
  } catch (err: any) {
    console.error('[Notifications] test push error:', err?.message || err);
    res.status(500).json({ error: 'Failed to send test push' });
  }
});

/**
 * Admin broadcast — protected by the same x-api-key as /api/external/ingest.
 * Lets you fire arbitrary pushes to all opted-in users from outside the app
 * (e.g. a one-off "Markets are choppy today, check your stops" message).
 *
 * NOT auto-deduplicated — every call sends. For the daily-bids broadcast
 * use the `broadcastMorningBidsOnce` helper from /api/external/ingest, which
 * has idempotency built in.
 */
router.post('/broadcast', async (req: Request, res: Response) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== (process.env.UPLOAD_API_KEY || 'dev-api-key-change-in-production')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { title, body, data } = req.body as { title?: string; body?: string; data?: Record<string, unknown> };
  if (!title || !body) {
    return res.status(400).json({ error: 'title and body are required' });
  }
  try {
    const result = await sendPushToAllOptedIn({ title, body, data });
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[Notifications] broadcast error:', err?.message || err);
    res.status(500).json({ error: 'Broadcast failed' });
  }
});

export default router;
