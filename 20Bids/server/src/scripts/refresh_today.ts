import { PrismaClient } from '@prisma/client';
import { getIntradayStats } from '../services/polygon';
import { format } from 'date-fns';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const prisma = new PrismaClient();

async function refreshToday() {
    const today = format(new Date(), 'yyyy-MM-dd');
    console.log(`\n=== Refreshing MVSO for ${today} ===\n`);

    const recs = await prisma.recommendation.findMany({
        where: {
            date: {
                gte: new Date(today + 'T00:00:00Z'),
                lte: new Date(today + 'T23:59:59Z')
            }
        }
    });

    console.log(`Found ${recs.length} records for today\n`);

    for (const rec of recs) {
        try {
            console.log(`Fetching intraday stats for ${rec.symbol}...`);
            const stats = await getIntradayStats(rec.symbol, today);

            if (stats?.mvso1020) {
                await prisma.recommendation.update({
                    where: { id: rec.id },
                    data: {
                        high: stats.mvso1020.highPost,
                        refPrice1020: stats.mvso1020.refPrice,
                        lowBeforePeak: stats.mvso1020.lowBeforePeak,
                        closePost1020: stats.mvso1020.closePost ?? undefined,
                        lowAfterPeak: stats.mvso1020.lowAfterPeak ?? undefined,
                        peakAt: stats.mvso1020.peakAt ?? undefined,
                        firstCross: stats.mvso1020.firstCross ?? undefined,
                        maeBeforeCross: stats.mvso1020.maeBeforeCross ?? undefined,
                        entryPath: stats.mvso1020.entryPath ?? undefined,
                        low30: stats.mvso1020.low30 ?? undefined,
                        high30: stats.mvso1020.high30 ?? undefined,
                        // Keep ALL writers in sync with the poller — this
                        // script used to omit the 11:20/12:20 columns,
                        // leaving them stale after a manual refresh.
                        refPrice1120: stats.mvso1120?.refPrice,
                        highPost1120: stats.mvso1120?.highPost,
                        refPrice1220: stats.mvso1220?.refPrice,
                        highPost1220: stats.mvso1220?.highPost
                    }
                });
                const mvso = ((stats.mvso1020.highPost - stats.mvso1020.refPrice) / stats.mvso1020.refPrice) * 100;
                console.log(`  -> Updated: MVSO=${mvso.toFixed(2)}%\n`);
            } else {
                console.log(`  -> No data available\n`);
            }
        } catch (err: any) {
            console.error(`  -> Error: ${err.message}\n`);
        }
    }

    await prisma.$disconnect();
    console.log('Done!');
}

refreshToday();
