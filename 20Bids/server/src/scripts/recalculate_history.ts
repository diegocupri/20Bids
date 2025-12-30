
import { PrismaClient } from '@prisma/client';
import { getIntradayStats } from '../services/polygon';
import { format } from 'date-fns';
import dotenv from 'dotenv';
import path from 'path';

// Load env from server root or parent
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const prisma = new PrismaClient();

async function recalculateHistory() {
    console.log('=== Starting Historical Data Recalculation ===');

    try {
        const allRecs = await prisma.recommendation.findMany({
            orderBy: { date: 'desc' }
        });

        console.log(`Found ${allRecs.length} recommendations to update.`);

        let successCount = 0;
        let errorCount = 0;

        for (const rec of allRecs) {
            const dateStr = format(rec.date, 'yyyy-MM-dd');
            console.log(`Processing ${rec.symbol} on ${dateStr}...`);

            try {
                // Determine if we need to update
                // We force update since the logic changed

                // Add delay to avoid rate limits
                await new Promise(r => setTimeout(r, 200));

                const stats = await getIntradayStats(rec.symbol, dateStr);

                if (stats && stats.mvso1020) {
                    await prisma.recommendation.update({
                        where: { id: rec.id },
                        data: {
                            high: stats.mvso1020.highPost,
                            refPrice1020: stats.mvso1020.refPrice,
                            lowBeforePeak: stats.mvso1020.lowBeforePeak, // The corrected MaxDD metric

                            // Also update 11:20 / 12:20 if available
                            refPrice1120: stats.mvso1120?.refPrice,
                            highPost1120: stats.mvso1120?.highPost,
                            refPrice1220: stats.mvso1220?.refPrice,
                            highPost1220: stats.mvso1220?.highPost
                        }
                    });
                    console.log(`  -> Updated.`);
                    successCount++;
                } else {
                    console.log(`  -> No data found (Market Closed or API Error).`);
                    errorCount++; // Soft error
                }

            } catch (err: any) {
                console.error(`  -> Error: ${err.message}`);
                errorCount++;
            }
        }

        console.log(`\n=== Recalculation Complete ===`);
        console.log(`Success: ${successCount}`);
        console.log(`Errors/Skipped: ${errorCount}`);

    } catch (e: any) {
        console.error('Fatal Error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

recalculateHistory();
