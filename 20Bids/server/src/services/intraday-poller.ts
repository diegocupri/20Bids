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

const prisma = new PrismaClient();

const POLL_INTERVAL_MS = 30_000;
const PARALLEL_TICKERS = 5;

/** Returns true Mon-Fri 09:30-16:00 ET (rough — DST is approximated). */
function isMarketOpen(): boolean {
  const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = etNow.getDay();
  if (day === 0 || day === 6) return false;
  const hm = etNow.getHours() * 100 + etNow.getMinutes();
  return hm >= 930 && hm < 1600;
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

let timer: NodeJS.Timeout | null = null;
let running = false;

/** Idempotent — calling twice doesn't spawn two timers. */
export function startIntradayPoller(): void {
  if (timer) return;
  console.log(`[Poller] Starting intraday poller (every ${POLL_INTERVAL_MS}ms during market hours)`);

  const tick = async () => {
    if (running) return; // skip if previous tick still in flight
    if (!isMarketOpen()) return; // outside hours: cache stays stale, no-op
    running = true;
    try {
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
