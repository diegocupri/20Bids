/** Coverage probe for the market-context backfill. Read-only. */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
(async () => {
  const total = await prisma.recommendation.count();
  const c = await prisma.recommendation.aggregate({
    _count: { atrPct: true, gapPct: true, rvol1020: true, spyDayPct: true },
  });
  console.log('total', total, c._count);
  const sample = await prisma.recommendation.findMany({
    where: { rvol1020: { not: null } },
    select: { symbol: true, date: true, atrPct: true, gapPct: true, rvol1020: true, spyDayPct: true },
    orderBy: { date: 'desc' },
    take: 5,
  });
  console.table(sample);
  await prisma.$disconnect();
})();
