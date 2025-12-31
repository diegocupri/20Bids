import { PrismaClient } from '@prisma/client';
import { format } from 'date-fns';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const prisma = new PrismaClient();

async function checkToday() {
    const today = format(new Date(), 'yyyy-MM-dd');
    console.log(`\n=== Checking MVSO for ${today} ===\n`);
    
    const recs = await prisma.recommendation.findMany({
        where: {
            date: {
                gte: new Date(today + 'T00:00:00Z'),
                lte: new Date(today + 'T23:59:59Z')
            }
        },
        select: {
            symbol: true,
            refPrice1020: true,
            high: true,
            lowBeforePeak: true
        }
    });
    
    console.log(`Found ${recs.length} records for today\n`);
    
    let successCount = 0;
    const threshold = 0.5; // Example threshold
    
    for (const rec of recs) {
        if (rec.refPrice1020 && rec.high) {
            const mvso = ((rec.high - rec.refPrice1020) / rec.refPrice1020) * 100;
            const isSuccess = mvso >= threshold;
            if (isSuccess) successCount++;
            console.log(`${rec.symbol}: ref=${rec.refPrice1020?.toFixed(2)}, high=${rec.high?.toFixed(2)}, MVSO=${mvso.toFixed(2)}% ${isSuccess ? '✓' : '✗'}`);
        } else {
            console.log(`${rec.symbol}: MISSING DATA (ref=${rec.refPrice1020}, high=${rec.high})`);
        }
    }
    
    const accuracy = recs.length > 0 ? Math.round((successCount / recs.length) * 100) : 0;
    console.log(`\n=== Summary ===`);
    console.log(`Total: ${recs.length}, Success (>=0.5%): ${successCount}, Accuracy: ${accuracy}%`);
    
    await prisma.$disconnect();
}

checkToday();
