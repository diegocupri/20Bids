
import dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Cleaning Up Data (Dec 21) ---');

    const allRecs = await prisma.recommendation.findMany({
        select: { id: true, date: true }
    });

    const dec21 = allRecs.filter(r => {
        const d = new Date(r.date);
        return d.getDate() === 21 && d.getMonth() === 11;
    });

    console.log(`Found ${dec21.length} records for Dec 21`);

    if (dec21.length > 0) {
        const ids = dec21.map(r => r.id);
        await prisma.recommendation.deleteMany({ where: { id: { in: ids } } });
        console.log(`Deleted ${ids.length} records.`);
    } else {
        console.log("Nothing to delete.");
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
