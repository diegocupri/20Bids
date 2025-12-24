
import dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';
import { startOfDay, endOfDay } from 'date-fns';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Debugging Data ---');

    // Helper dates (Assuming local time or simplified date strings for now)
    // Ideally we should match how the app saves dates. 
    // Let's check what's actually in determining the "Dec 21" and "Dec 23"

    const allRecs = await prisma.recommendation.findMany({
        select: { id: true, date: true, symbol: true, refPrice1120: true, refPrice1220: true }
    });

    console.log(`Total records: ${allRecs.length}`);

    const dec21 = allRecs.filter(r => {
        const d = new Date(r.date);
        return d.getDate() === 21 && d.getMonth() === 11; // Month is 0-indexed
    });

    const dec23 = allRecs.filter(r => {
        const d = new Date(r.date);
        return d.getDate() === 23 && d.getMonth() === 11;
    });

    console.log(`Records for Dec 21: ${dec21.length}`);
    console.log(`Records for Dec 23: ${dec23.length}`);

    if (dec23.length > 0) {
        console.log('Sample Dec 23 record:', dec23[0]);
        const missing1120 = dec23.filter(r => r.refPrice1120 === null || r.refPrice1120 === 0);
        const missing1220 = dec23.filter(r => r.refPrice1220 === null || r.refPrice1220 === 0);
        console.log(`Dec 23 records missing 11:20 data: ${missing1120.length}`);
        console.log(`Dec 23 records missing 12:20 data: ${missing1220.length}`);
    }

    // CLEANUP DEC 21
    if (dec21.length > 0) {
        console.log('Deleting Dec 21 data...');
        // We can't easily use deleteMany with client-side filtered dates if timezones are messy, 
        // but let's try assuming the date field is handled consistently.
        // Better to delete by ID to be safe
        const idsToDelete = dec21.map(r => r.id);
        const result = await prisma.recommendation.deleteMany({
            where: {
                id: { in: idsToDelete }
            }
        });
        console.log(`Deleted ${result.count} records from Dec 21.`);
    } else {
        console.log("No records found for Dec 21 to delete.");
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
