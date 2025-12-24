import { PrismaClient } from '@prisma/client';
import { getIntradayStats } from '../services/polygon';
import { format } from 'date-fns';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
    console.log('=== DIAGNOSTIC REPORT ===');

    // 1. Check Dec 21st (Should be empty)
    const start21 = new Date('2024-12-21T00:00:00.000Z');
    const end21 = new Date('2024-12-21T23:59:59.999Z');
    const count21 = await prisma.recommendation.count({
        where: { date: { gte: start21, lte: end21 } }
    });
    console.log(`[Dec 21] Records found: ${count21} (Should be 0)`);

    // 2. Check Dec 23rd (Should have data)
    const start23 = new Date('2024-12-23T00:00:00.000Z');
    const end23 = new Date('2024-12-23T23:59:59.999Z');
    const recs23 = await prisma.recommendation.findMany({
        where: { date: { gte: start23, lte: end23 } }
    });
    console.log(`[Dec 23] Records found: ${recs23.length}`);

    if (recs23.length > 0) {
        let missingCount = 0;
        let fixedCount = 0;

        for (const rec of recs23) {
            const hasData = rec.refPrice1120 !== null && rec.refPrice1220 !== null;
            if (!hasData) {
                missingCount++;
                console.log(`\n[Missing Data] ${rec.symbol} (ID: ${rec.id})`);
                console.log(`   - Current Ref1120: ${rec.refPrice1120}`);

                // Attempt Fix
                const dateStr = format(rec.date, 'yyyy-MM-dd');
                console.log(`   - Fetching Polygon for ${rec.symbol} on ${dateStr}...`);

                try {
                    const stats = await getIntradayStats(rec.symbol, dateStr);
                    if (stats && stats.mvso1120) {
                        await prisma.recommendation.update({
                            where: { id: rec.id },
                            data: {
                                refPrice1020: stats.mvso1020?.refPrice,
                                refPrice1120: stats.mvso1120?.refPrice,
                                highPost1120: stats.mvso1120?.highPost,
                                refPrice1220: stats.mvso1220?.refPrice,
                                highPost1220: stats.mvso1220?.highPost,
                            }
                        });
                        console.log(`   -> FIXED! New Ref1120: ${stats.mvso1120.refPrice}`);
                        fixedCount++;
                    } else {
                        console.log(`   -> FAILED. Polygon returned no stats.`);
                    }
                } catch (err) {
                    console.error(`   -> ERROR calling Polygon: ${err}`);
                }
            }
        }
        console.log(`\n[Summary] Missing: ${missingCount}, Fixed: ${fixedCount}`);
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
