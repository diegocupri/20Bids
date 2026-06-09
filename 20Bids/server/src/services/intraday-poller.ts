// Add this as a NEW file: server/src/services/intraday-poller.ts
//
// Why: today, every GET /api/recommendations call to a "today" date triggers
// 20 Polygon REST calls (one per ticker) inside refreshIntradayData. With N
// mobile clients polling every 5s that scales as 20 × N × 12 calls/min to
// Polygon — burning rate limit and cost for no benefit, since the upstream
// data is the same for all users.
//
// This module flips it: ONE server-side timer refreshes the 20 tickers every
// 5s and writes to the DB. All client requests just read from DB. Polygon
// usage becomes a flat 240 calls/min regardless of how many users connect.
//
// HOW TO WIRE IN:
//   1. Drop this file at server/src/services/intraday-poller.ts
//   2. In server/src/index.ts, near the top after imports:
//        import { startIntradayPoller } from './services/intraday-poller';
//   3. After app.listen(...), call:
//        startIntradayPoller();   // begins background refresh loop
//   4. In the GET /api/recommendations handler, REMOVE the inline
//      refreshIntradayData call. The DB is now kept fresh by the poller.
//
// Tunables:
//   POLL_INTERVAL_MS = 30000     // MVSO/peak stats every 30s; live PRICE
//                                 // comes from polygon-ws (sub-second).
//   PARALLEL_TICKERS = 5         // throttle Polygon REST concurrency

import { PrismaClient } from '@prisma/client';
import { format } from 'date-fns';
import { getIntradayStats } from './polygon';
import { broadcastMorningBidsOnce } from './push';

const prisma = new PrismaClient();

const POLL_INTERVAL_MS = 30_000;
const PARALLEL_TICKERS = 5;

// Morning push backstop — see maybeBroadcastMorning().
const BROADCAST_AFTER_ET = 1025;        // 10:25 ET — just after the 10:20 entry window
const MIN_BIDS_TO_BROADCAST = 5;        // don't push for a half-empty/partial batch
let broadcastSettledForDate: string | null = null; // UTC YYYY-MM-DD already handled today

/** Returns true Mon-Fri 09:30-16:00 ET (rough — DST is approximated). */
function isMarketOpen(): boolean {
  const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = etNow.getDay();
  if (day === 0 || day === 6) return false;
  const hm = etNow.getHours() * 100 + etNow.getMinutes();
  return hm >= 930 && hm < 1600;
}

/** Poller window: market hours PLUS a 10-minute finalization tail (until
 * 16:10 ET). Without the tail, the last refresh ran at ~15:59:30 against
 * incomplete final bars, so highs printed in the session's last minute were
 * permanently missing from the stored post-10:20 peak (seen live: APH's
 * stored high lagged the real one by the final-bar print). */
function isPollerWindow(): boolean {
  const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = etNow.getDay();
  if (day === 0 || day === 6) return false;
  const hm = etNow.getHours() * 100 + etNow.getMinutes();
  return hm >= 930 && hm < 1610;
}

/** Refresh ONE ticker — same logic as the inline path, but isolated so we
 * can swallow per-ticker errors without aborting the batch. */
async function refreshOne(rec: { id: string; symbol: string; date: Date }): Promise<void> {
  try {
    const dateStr = format(rec.date, 'yyyy-MM-dd');
    const stats = await getIntradayStats(rec.symbol, dateStr);
    if (!stats) return;
    await prisma.recommendation.update({
      where: { id: rec.id },
      data: {
        high: stats.mvso1020?.highPost,
        refPrice1020: stats.mvso1020?.refPrice,
        lowBeforePeak: stats.mvso1020?.lowBeforePeak,
        refPrice1120: stats.mvso1120?.refPrice,
        highPost1120: stats.mvso1120?.highPost,
        refPrice1220: stats.mvso1220?.refPrice,
        highPost1220: stats.mvso1220?.highPost,
      },
    });
  } catch (err) {
    console.error(`[Poller] ${rec.symbol} refresh failed:`, (err as any)?.message ?? err);
  }
}

/** Refresh today's recs in small parallel batches so a slow ticker
 * doesn't stall the whole loop. */
async function refreshAllOnce(): Promise<void> {
  const dateStr = format(new Date(), 'yyyy-MM-dd');
  const targetDate = new Date(dateStr);
  const startOfDay = new Date(targetDate); startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(targetDate); endOfDay.setUTCHours(23, 59, 59, 999);

  const recs = await prisma.recommendation.findMany({
    where: { date: { gte: startOfDay, lte: endOfDay } },
    select: { id: true, symbol: true, date: true },
  });
  if (!recs.length) return;

  // Process in chunks of PARALLEL_TICKERS to avoid hammering Polygon.
  for (let i = 0; i < recs.length; i += PARALLEL_TICKERS) {
    const slice = recs.slice(i, i + PARALLEL_TICKERS);
    await Promise.allSettled(slice.map(refreshOne));
  }
}

/**
 * Daily "today's 20 are in" push — BACKSTOP trigger.
 *
 * The primary trigger lives in POST /api/external/ingest: it fires the moment
 * the morning pipeline uploads today's bids. But that path is fragile — it only
 * fires if the upload hits THIS server with a `date` string that startsWith
 * today's UTC date, with ≥5 rows, before any BroadcastLog row exists. If the
 * timezone rolls over, the date is sent as a non-string, or the bids reach the
 * DB by a different route, the push silently never goes out.
 *
 * This backstop closes that gap. The intraday poller is already awake every 30s
 * during market hours, so once we're past the entry window on a weekday AND
 * today actually has bids in the DB, we fire the (idempotent) broadcast.
 * broadcastMorningBidsOnce de-dupes via the BroadcastLog table, so this and the
 * ingest trigger can both run without ever double-sending.
 */
async function maybeBroadcastMorning(): Promise<void> {
  const utcDate = new Date().toISOString().slice(0, 10);
  if (broadcastSettledForDate === utcDate) return; // already fired/sent today — skip cheaply

  const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = etNow.getDay();
  if (day === 0 || day === 6) { broadcastSettledForDate = utcDate; return; } // weekend
  const hm = etNow.getHours() * 100 + etNow.getMinutes();
  if (hm < BROADCAST_AFTER_ET) return; // too early — let the 10:20 entry window pass first

  // Count today's bids using the same UTC day window the rest of the app uses.
  const start = new Date(utcDate); start.setUTCHours(0, 0, 0, 0);
  const end = new Date(utcDate); end.setUTCHours(23, 59, 59, 999);
  const count = await prisma.recommendation.count({ where: { date: { gte: start, lte: end } } });
  if (count < MIN_BIDS_TO_BROADCAST) return; // no real batch yet — retry on the next tick

  try {
    // Use the UTC date (same key the ingest trigger uses) so both paths share
    // one BroadcastLog row and can never double-send.
    const result = await broadcastMorningBidsOnce(new Date(utcDate), count);
    if (result.fired) {
      console.log(`[Poller] Morning push backstop fired — ok ${result.ok}/${result.total} (${count} bids)`);
    }
    broadcastSettledForDate = utcDate; // fired OR already-logged: stop re-checking today
  } catch (err) {
    console.error('[Poller] Morning broadcast backstop failed:', (err as any)?.message ?? err);
    // Leave broadcastSettledForDate unset so the next tick retries.
  }
}

let timer: NodeJS.Timeout | null = null;
let running = false;

/** Idempotent — calling twice doesn't spawn two timers. */
export function startIntradayPoller(): void {
  if (timer) return;
  console.log(`[Poller] Starting intraday poller (every ${POLL_INTERVAL_MS}ms during market hours)`);

  const tick = async () => {
    if (running) return; // skip if previous tick still in flight
    if (!isPollerWindow()) return; // outside hours (+16:10 finalization tail): no-op
    running = true;
    try {
      await maybeBroadcastMorning(); // idempotent daily push backstop (no-op if already sent)
      await refreshAllOnce();
    } catch (err) {
      console.error('[Poller] tick failed:', (err as any)?.message ?? err);
    } finally {
      running = false;
    }
  };

  // Fire immediately, then on interval
  tick().catch(() => {});
  timer = setInterval(tick, POLL_INTERVAL_MS);
}

export function stopIntradayPoller(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
