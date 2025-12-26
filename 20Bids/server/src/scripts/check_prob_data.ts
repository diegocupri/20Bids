
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Checking Probability Data...');

    // Check total count
    const total = await prisma.recommendation.count();
    console.log(`Total Recommendations: ${total}`);

    // Check count with non-null probabilityValue
    const withProb = await prisma.recommendation.count({
        where: {
            probabilityValue: { gte: 0 }
        }
    });
    console.log(`With Probability Value: ${withProb}`);

    if (withProb === 0) {
        console.error('CRITICAL: No probability values found in DB!');
    } else {
        // Sample distribution
        const sample = await prisma.recommendation.findMany({
            take: 5,
            select: { symbol: true, date: true, probabilityValue: true, probability: true }
        });
        console.log('Sample Data:', sample);
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
