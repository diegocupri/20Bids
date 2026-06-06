require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const tokens = await prisma.pushToken.findMany({
    include: { user: { select: { email: true } } },
    orderBy: { lastSeenAt: 'desc' },
  });
  console.log(`Total push tokens: ${tokens.length}`);
  tokens.forEach((t) => {
    console.log(`  · ${t.token.slice(0, 40)}...`);
    console.log(`     user: ${t.user?.email ?? '(none)'}  platform: ${t.platform}`);
    console.log(`     device: ${t.deviceName ?? '—'}  version: ${t.appVersion ?? '—'}`);
    console.log(`     created: ${t.createdAt.toISOString()}  lastSeen: ${t.lastSeenAt.toISOString()}`);
  });
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
