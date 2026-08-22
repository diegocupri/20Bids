
import { PrismaClient, Prisma } from '@prisma/client';
import { getIntradayStats } from '../services/polygon';
import { format } from 'date-fns';
import dotenv from 'dotenv';
import path from 'path';

// Load env from server root or parent
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const prisma = new PrismaClient();

// Polygon rate-limit pacing, same as recalculate_history.
const DELAY_MS = 200;
const PROGRESS_EVERY = 25;

async function backfillEntryPath() {
    console.log('=== Starting Entry-Path Backfill ===');

    try {
        // Idempotency: only rows that never got a path. Re-running after a
        // crash resumes where it stopped instead of re-hitting Polygon for
        // the whole history.
        //
        // Today's rows are normally already claimed by the intraday poller,
        // which fills the path minute by minute — so this script leaves them
        // alone rather than fighting it for the same row.
        const pending = await prisma.recommendation.findMany({
            where: { entryPath: { equals: Prisma.DbNull } },
            orderBy: { date: 'desc' },
            select: { id: true, symbol: true, date: true }
        });

        const total = await prisma.recommendation.count();
        console.log(`${pending.length} of ${total} recommendations need an entry path.`);

        let successCount = 0;
        let errorCount = 0;
        let skippedCount = 0;

        for (const [i, rec] of pending.entries()) {
            const dateStr = format(rec.date, 'yyyy-MM-dd');

            try {
                // Add delay to avoid rate limits
                await new Promise(r => setTimeout(r, DELAY_MS));

                const stats = await getIntradayStats(rec.symbol, dateStr);
                const wp = stats?.mvso1020;

                // An empty path means no bars after 10:20 at all (halt, or a
                // date Polygon has no minute data for). Leave the column NULL
                // so a later run retries it — writing {} would mark the row
                // done forever.
                if (!wp || Object.keys(wp.entryPath).length === 0) {
                    console.log(`  ${rec.symbol} ${dateStr} -> no intraday data, left for a later run.`);
                    skippedCount++;
                    continue;
                }

                await prisma.recommendation.update({
                    where: { id: rec.id },
                    data: {
                        entryPath: wp.entryPath,
                        low30: wp.low30 ?? undefined,
                        high30: wp.high30 ?? undefined
                    }
                });
                successCount++;
            } catch (err: any) {
                console.error(`  ${rec.symbol} ${dateStr} -> Error: ${err.message}`);
                errorCount++;
            }

            if ((i + 1) % PROGRESS_EVERY === 0) {
                console.log(`[${i + 1}/${pending.length}] ok=${successCount} skipped=${skippedCount} errors=${errorCount}`);
            }
        }

        console.log(`\n=== Backfill Complete ===`);
        console.log(`Success: ${successCount}`);
        console.log(`Skipped (no data): ${skippedCount}`);
        console.log(`Errors: ${errorCount}`);

    } catch (e: any) {
        console.error('Fatal Error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

backfillEntryPath();
