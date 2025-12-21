import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🔍 Checking for blocking advisory locks...');
    try {
        // 1. Find who is holding the lock
        // Lock ID from error logs: 72707369
        const locks: any[] = await prisma.$queryRaw`
      SELECT 
        l.pid, 
        a.usename, 
        a.application_name, 
        a.client_addr, 
        a.state, 
        a.query_start
      FROM pg_locks l
      JOIN pg_stat_activity a ON l.pid = a.pid
      WHERE l.locktype = 'advisory'
    `;

        if (locks.length === 0) {
            console.log('✅ No advisory locks found. The path holds be clear.');
        } else {
            console.log(`⚠️ Found ${locks.length} active advisory locks:`);
            console.table(locks);

            // 2. Kill the sessions holding the locks
            for (const lock of locks) {
                console.log(`🔫 Terminating backend PID ${lock.pid}...`);
                try {
                    await prisma.$executeRawUnsafe(`SELECT pg_terminate_backend(${lock.pid})`);
                    console.log(`✅ Killed PID ${lock.pid}`);
                } catch (err) {
                    console.error(`❌ Failed to kill PID ${lock.pid}:`, err);
                }
            }
        }

    } catch (e) {
        console.error('Error during debugging:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
