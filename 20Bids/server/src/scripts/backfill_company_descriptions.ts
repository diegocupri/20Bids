
import { PrismaClient } from '@prisma/client';
import { fetchCompanyProfile } from '../services/polygon';
import dotenv from 'dotenv';
import path from 'path';

// Load env from server root or parent
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const prisma = new PrismaClient();

// Polygon rate-limit pacing, same as backfill_entry_path. fetchCompanyProfile
// also serializes internally; this delay keeps the script polite on top of it.
const DELAY_MS = 200;
const PROGRESS_EVERY = 25;

// How long a NEGATIVE answer stands. Polygon genuinely has no description for
// ETFs and many small caps; without a cooling-off period every run would
// re-request the same dead symbols forever. Descriptions for companies that
// DO have one are never re-fetched — they change once in a corporate lifetime.
const RETRY_EMPTY_AFTER_DAYS = 90;

async function backfillCompanyDescriptions() {
    console.log('=== Starting Company Description Backfill ===');

    try {
        // Every symbol we have ever recommended — the description is a
        // property of the issuer, so one row covers all of its bids.
        const symbolRows = await prisma.recommendation.findMany({
            distinct: ['symbol'],
            select: { symbol: true },
            orderBy: { symbol: 'asc' }
        });
        const symbols = symbolRows.map(r => r.symbol);

        const existing = await prisma.company.findMany({
            select: { symbol: true, description: true, fetchedAt: true }
        });
        const known = new Map(existing.map(c => [c.symbol, c]));

        const retryBefore = new Date(Date.now() - RETRY_EMPTY_AFTER_DAYS * 86400_000);

        // Idempotency: a symbol that already has a description is done for
        // good, and one Polygon answered about recently is left alone even if
        // the answer was empty. Re-running after a crash resumes where it
        // stopped instead of re-hitting the whole universe.
        const pending = symbols.filter(sym => {
            const row = known.get(sym);
            if (!row) return true;
            if (row.description) return false;
            return !row.fetchedAt || row.fetchedAt < retryBefore;
        });

        console.log(`${pending.length} of ${symbols.length} symbols need a description.`);

        let successCount = 0;
        let emptyCount = 0;
        let errorCount = 0;

        for (const [i, symbol] of pending.entries()) {
            try {
                // Add delay to avoid rate limits
                await new Promise(r => setTimeout(r, DELAY_MS));

                const profile = await fetchCompanyProfile(symbol);

                // null = the REQUEST failed (429, network, unknown ticker).
                // Write nothing at all: stamping fetchedAt here would make a
                // rate-limited run look like "Polygon has no description" and
                // silence the symbol for 90 days.
                if (!profile) {
                    console.log(`  ${symbol} -> no answer from Polygon, left for a later run.`);
                    errorCount++;
                    continue;
                }

                await prisma.company.upsert({
                    where: { symbol },
                    create: {
                        symbol,
                        name: profile.name,
                        description: profile.description,
                        homepageUrl: profile.homepageUrl,
                        totalEmployees: profile.totalEmployees,
                        listDate: profile.listDate ? new Date(profile.listDate) : null,
                        fetchedAt: new Date()
                    },
                    update: {
                        name: profile.name,
                        description: profile.description,
                        homepageUrl: profile.homepageUrl,
                        totalEmployees: profile.totalEmployees,
                        listDate: profile.listDate ? new Date(profile.listDate) : null,
                        fetchedAt: new Date()
                    }
                });

                if (profile.description) {
                    successCount++;
                } else {
                    // A real answer with nothing in it. Recorded (fetchedAt is
                    // now set) so the next run skips it for RETRY_EMPTY_AFTER_DAYS.
                    console.log(`  ${symbol} -> Polygon has no description.`);
                    emptyCount++;
                }
            } catch (err: any) {
                console.error(`  ${symbol} -> Error: ${err.message}`);
                errorCount++;
            }

            if ((i + 1) % PROGRESS_EVERY === 0) {
                console.log(`[${i + 1}/${pending.length}] ok=${successCount} empty=${emptyCount} errors=${errorCount}`);
            }
        }

        console.log(`\n=== Backfill Complete ===`);
        console.log(`Success: ${successCount}`);
        console.log(`Empty (Polygon has none): ${emptyCount}`);
        console.log(`Errors: ${errorCount}`);

    } catch (e: any) {
        console.error('Fatal Error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

backfillCompanyDescriptions();
