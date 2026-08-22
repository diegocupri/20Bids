/**
 * Backfill atrPct / gapPct / rvol1020 / spyDayPct on every Recommendation.
 *
 * Grouped BY SYMBOL, not by row: Polygon serves a whole date range in one
 * aggregates call, so a ticker that appears fifty times costs two requests
 * instead of a hundred. The range for each symbol runs from 45 calendar days
 * before its first pick (enough sessions to seed ATR(14) and the 20-session
 * volume baseline) to its last pick.
 *
 * Idempotent: rows that already carry all four values are skipped, so a run
 * that dies halfway resumes where it stopped. Every value is nullable and a
 * symbol Polygon has no history for is left NULL rather than zeroed — the
 * charts drop a null, and a zero would be a lie the reader cannot see.
 *
 *   npx ts-node src/scripts/backfill_market_context.ts
 */
import { PrismaClient } from '@prisma/client';
import { format, subDays } from 'date-fns';
import dotenv from 'dotenv';
import path from 'path';
import {
    fetchDailyRange, fetchOpeningVolumeRange, atrPercent, type DailyBar,
} from '../services/polygon';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const prisma = new PrismaClient();

/** Pacing between Polygon calls, same as the other backfills. */
const DELAY_MS = 180;
/** Sessions of history to pull before the first pick: 14 for ATR, 20 for the
 *  volume baseline, plus slack for holidays. */
const LOOKBACK_DAYS = 45;
/** Sessions in the relative-volume baseline. */
const RVOL_WINDOW = 20;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
    console.log('=== Market-context backfill ===');

    const pending = await prisma.recommendation.findMany({
        where: {
            OR: [
                { atrPct: null }, { gapPct: null }, { rvol1020: null }, { spyDayPct: null },
            ],
        },
        select: { id: true, symbol: true, date: true },
        orderBy: { date: 'asc' },
    });
    const total = await prisma.recommendation.count();
    console.log(`${pending.length} of ${total} rows need market context.`);
    if (pending.length === 0) { await prisma.$disconnect(); return; }

    // ── SPY first: one symbol, one request, keyed by session ───────────────
    const allDays = [...new Set(pending.map((r) => format(r.date, 'yyyy-MM-dd')))].sort();
    const spyFrom = format(subDays(new Date(`${allDays[0]}T12:00:00Z`), 10), 'yyyy-MM-dd');
    const spyTo = allDays[allDays.length - 1];
    const spyByDay = new Map<string, number>();
    try {
        const spy = await fetchDailyRange('SPY', spyFrom, spyTo);
        for (let i = 1; i < spy.length; i++) {
            const prev = spy[i - 1].c;
            if (prev > 0) spyByDay.set(spy[i].day, ((spy[i].c - prev) / prev) * 100);
        }
        console.log(`SPY: ${spyByDay.size} sessions.`);
    } catch (e: any) {
        console.error('SPY fetch failed — spyDayPct will stay NULL:', e?.message ?? e);
    }

    // ── group the work by symbol ───────────────────────────────────────────
    const bySymbol = new Map<string, { id: string; day: string }[]>();
    for (const r of pending) {
        const day = format(r.date, 'yyyy-MM-dd');
        const list = bySymbol.get(r.symbol) ?? [];
        list.push({ id: r.id, day });
        bySymbol.set(r.symbol, list);
    }
    console.log(`${bySymbol.size} distinct symbols.`);

    let done = 0, failed = 0, partial = 0;
    let symbolIdx = 0;

    for (const [symbol, rows] of bySymbol) {
        symbolIdx += 1;
        const days = rows.map((r) => r.day).sort();
        const from = format(subDays(new Date(`${days[0]}T12:00:00Z`), LOOKBACK_DAYS), 'yyyy-MM-dd');
        const to = days[days.length - 1];

        let daily: DailyBar[] = [];
        let openVol = new Map<string, number>();
        try {
            await sleep(DELAY_MS);
            daily = await fetchDailyRange(symbol, from, to);
        } catch (e: any) {
            console.error(`  ${symbol}: daily fetch failed (${e?.message ?? e}) — skipped.`);
            failed += rows.length;
            continue;
        }
        try {
            await sleep(DELAY_MS);
            openVol = await fetchOpeningVolumeRange(symbol, from, to);
        } catch (e: any) {
            // Non-fatal: ATR and the gap still land, rvol stays NULL.
            console.warn(`  ${symbol}: 5-minute fetch failed (${e?.message ?? e}) — rvol left NULL.`);
        }

        const idxOf = new Map(daily.map((b, i) => [b.day, i]));
        // Sessions that actually traded, in order — the rvol baseline walks
        // this rather than calendar days so holidays don't dilute the mean.
        const volDays = [...openVol.keys()].sort();

        for (const row of rows) {
            const i = idxOf.get(row.day);
            const data: Record<string, number | null> = {
                atrPct: null, gapPct: null, rvol1020: null,
                spyDayPct: spyByDay.get(row.day) ?? null,
            };

            if (i != null && i > 0) {
                const prevClose = daily[i - 1].c;
                const open = daily[i].o;
                if (prevClose > 0 && open > 0) data.gapPct = ((open - prevClose) / prevClose) * 100;
                data.atrPct = atrPercent(daily, i, 14);
            }

            const today = openVol.get(row.day);
            if (today != null && today > 0) {
                const pos = volDays.indexOf(row.day);
                const base = volDays.slice(Math.max(0, pos - RVOL_WINDOW), pos)
                    .map((d) => openVol.get(d) ?? 0)
                    .filter((v) => v > 0);
                // Median, not mean: one halted or news-driven session in the
                // baseline would otherwise halve every rvol that follows it.
                if (base.length >= 5) {
                    const sorted = [...base].sort((a, b) => a - b);
                    const med = sorted[Math.floor(sorted.length / 2)];
                    if (med > 0) data.rvol1020 = today / med;
                }
            }

            const got = Object.values(data).filter((v) => v != null).length;
            if (got === 0) { failed += 1; continue; }
            if (got < 4) partial += 1;

            await prisma.recommendation.update({ where: { id: row.id }, data });
            done += 1;
        }

        if (symbolIdx % 25 === 0) {
            console.log(`  …${symbolIdx}/${bySymbol.size} symbols · ${done} rows written`);
        }
    }

    console.log('=== done ===');
    console.log(`written ${done} · partial ${partial} · no data ${failed}`);

    const cov = await prisma.recommendation.aggregate({
        _count: { atrPct: true, gapPct: true, rvol1020: true, spyDayPct: true },
    });
    console.log(`coverage of ${total}:`, cov._count);
    await prisma.$disconnect();
}

main().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
