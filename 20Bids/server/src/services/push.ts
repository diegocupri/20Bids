/**
 * Push notification service — talks to Expo's Push API.
 *
 * Why Expo and not raw APNs/FCM? Because the app is built with Expo and
 * the tokens we collect are Expo Push Tokens (a wrapper that lets one
 * server-side endpoint deliver to both iOS and Android, with retries and
 * receipts handled by Expo). EAS Credentials holds the .p8 APNs key, so
 * Expo signs and forwards on our behalf.
 *
 * Docs: https://docs.expo.dev/push-notifications/sending-notifications/
 */

import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Expo accepts up to 100 messages per request.
const BATCH_SIZE = 100;

export interface PushPayload {
  title: string;
  body: string;
  /** Arbitrary JSON delivered to the app — used for deep-linking ("/(tabs)/bids"). */
  data?: Record<string, unknown>;
  /** Optional sound; "default" plays the system sound. */
  sound?: 'default' | null;
  /** iOS badge count to set. */
  badge?: number;
  /** Channel ID for Android (we use "default"). */
  channelId?: string;
}

interface ExpoMessage extends PushPayload {
  to: string; // Expo Push Token
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface ExpoResponse {
  data: ExpoTicket[];
}

/** Returns true for "ExponentPushToken[...]" or "ExpoPushToken[...]" strings. */
function isExpoToken(t: string): boolean {
  return /^Expo(nent)?PushToken\[/.test(t);
}

/** Chunks an array into pieces of `size`. */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Send to a raw list of tokens. Caller is responsible for filtering /
 * permissions / opt-in checks. Returns the count of ok tickets.
 *
 * Errors per-token are surfaced via console.warn and we delete tokens that
 * Expo reports as "DeviceNotRegistered" (the user uninstalled or revoked).
 */
export async function sendPushToTokens(
  tokens: string[],
  payload: PushPayload
): Promise<{ ok: number; failed: number }> {
  const valid = Array.from(new Set(tokens.filter(isExpoToken)));
  if (valid.length === 0) return { ok: 0, failed: 0 };

  let okCount = 0;
  let failCount = 0;
  const toRemove: string[] = [];

  for (const batch of chunk(valid, BATCH_SIZE)) {
    const messages: ExpoMessage[] = batch.map((to) => ({
      to,
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
      sound: payload.sound ?? 'default',
      ...(payload.badge != null ? { badge: payload.badge } : {}),
      ...(payload.channelId ? { channelId: payload.channelId } : { channelId: 'default' }),
    }));

    try {
      const { data } = await axios.post<ExpoResponse>(EXPO_PUSH_URL, messages, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        timeout: 10_000,
      });

      data.data.forEach((ticket, i) => {
        if (ticket.status === 'ok') {
          okCount++;
        } else {
          failCount++;
          const reason = ticket.details?.error || ticket.message || 'unknown';
          console.warn(`[Push] Ticket error for token ${batch[i].slice(0, 30)}...: ${reason}`);
          // Common reason: the user uninstalled / revoked / token rotated.
          if (reason === 'DeviceNotRegistered') toRemove.push(batch[i]);
        }
      });
    } catch (err: any) {
      failCount += batch.length;
      console.error('[Push] Batch send failed:', err?.message || err);
    }
  }

  // Reap dead tokens so we don't keep bothering Expo with them.
  if (toRemove.length > 0) {
    await prisma.pushToken.deleteMany({ where: { token: { in: toRemove } } });
    console.log(`[Push] Reaped ${toRemove.length} dead tokens`);
  }

  return { ok: okCount, failed: failCount };
}

/**
 * Broadcast to every opted-in user. We consider a user opted-in unless
 * their `riskProfile.notifications === false` (default: opt-in).
 */
export async function sendPushToAllOptedIn(payload: PushPayload): Promise<{ ok: number; failed: number; total: number }> {
  // Pull every user with at least one token. Filter opt-out client-side
  // because riskProfile is JSON (not a column) — cheaper than a raw SQL
  // jsonb cast when the user count is small (which it is, by design).
  const users = await prisma.user.findMany({
    select: {
      id: true,
      riskProfile: true,
      pushTokens: { select: { token: true } },
    },
  });

  const tokens: string[] = [];
  for (const u of users) {
    const rp = (u.riskProfile as { notifications?: boolean } | null) ?? null;
    const optedOut = rp?.notifications === false;
    if (optedOut) continue;
    for (const t of u.pushTokens) tokens.push(t.token);
  }

  if (tokens.length === 0) {
    console.log('[Push] No opted-in tokens to notify');
    return { ok: 0, failed: 0, total: 0 };
  }

  console.log(`[Push] Broadcasting to ${tokens.length} tokens — "${payload.title}"`);
  const { ok, failed } = await sendPushToTokens(tokens, payload);
  return { ok, failed, total: tokens.length };
}

/**
 * Idempotent "morning bids" broadcast. Only fires the FIRST time we're
 * called for a given date (subsequent re-ingestions during the day are
 * no-ops, so refreshes don't spam users).
 *
 * Returns:
 *   { fired: true, ok, total }   if this was the first call today
 *   { fired: false }             if a broadcast already happened today
 */
export async function broadcastMorningBidsOnce(
  date: Date,
  bidsCount: number
): Promise<{ fired: boolean; ok?: number; total?: number }> {
  // Normalize to midnight UTC so the @db.Date column comparison is exact.
  const dateOnly = new Date(date);
  dateOnly.setUTCHours(0, 0, 0, 0);

  // Already broadcasted today?
  const existing = await prisma.broadcastLog.findUnique({
    where: { kind_date: { kind: 'morning_bids', date: dateOnly } },
  });
  if (existing) {
    console.log(`[Push] Morning broadcast already sent for ${dateOnly.toISOString().slice(0, 10)} (skipping)`);
    return { fired: false };
  }

  const result = await sendPushToAllOptedIn({
    title: "20Bids · Today's 20 are in",
    body: `${bidsCount} bids ready — tap to open`,
    data: { route: '/(tabs)/bids', kind: 'morning' },
    sound: 'default',
  });

  // Record the broadcast so re-ingestions don't fire again today.
  // We do this AFTER the send so a failed send doesn't lock us out — but
  // we still write the row to prevent retry-storms. Better duplicate
  // notifications than zero on a real ingest, which is the lesser evil.
  await prisma.broadcastLog.create({
    data: {
      kind: 'morning_bids',
      date: dateOnly,
      count: result.ok,
    },
  });

  return { fired: true, ok: result.ok, total: result.total };
}
