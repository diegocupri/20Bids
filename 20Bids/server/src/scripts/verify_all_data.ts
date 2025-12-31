/**
 * COMPREHENSIVE DATABASE VERIFICATION SCRIPT
 * 
 * Verifies and updates ALL recommendation data against Polygon API:
 * - Volume
 * - Open Price  
 * - 10:20 Reference Price
 * - High (MVSO Peak)
 * - Low Before Peak (Max DD)
 * - MVSO calculations for 10:20, 11:20, 12:20
 */

import { PrismaClient } from '@prisma/client';
import { getIntradayStats } from '../services/polygon';
import { format } from 'date-fns';
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const prisma = new PrismaClient();
const API_KEY = process.env.POLYGON_API_KEY;
const BASE_URL = 'https://api.polygon.io';

// Rate limiting: delay between API calls (in ms)
const RATE_LIMIT_DELAY = 250;

interface VerificationStats {
    total: number;
    updated: number;
    noData: number;
    errors: number;
    skipped: number;
}

async function getDailyData(ticker: string, date: string) {
    try {
        // Get daily OHLCV data
        const url = `${BASE_URL}/v1/open-close/${ticker}/${date}`;
        const res = await axios.get(url, {
            params: { apiKey: API_KEY, adjusted: true }
        });

        if (res.data && res.data.status === 'OK') {
            return {
                open: res.data.open,
                high: res.data.high,
                low: res.data.low,
                close: res.data.close,
                volume: res.data.volume
            };
        }
        return null;
    } catch (err: any) {
        if (err.response?.status === 404) {
            return null; // No data for this date
        }
        throw err;
    }
}

async function verifyAndUpdateAll() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║     COMPREHENSIVE DATABASE VERIFICATION - POLYGON API        ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    const stats: VerificationStats = {
        total: 0,
        updated: 0,
        noData: 0,
        errors: 0,
        skipped: 0
    };

    try {
        // Get all recommendations ordered by date (newest first)
        const allRecs = await prisma.recommendation.findMany({
            orderBy: { date: 'desc' }
        });

        stats.total = allRecs.length;
        console.log(`📊 Found ${allRecs.length} total recommendations to verify\n`);
        console.log('─'.repeat(70) + '\n');

        let currentDate = '';

        for (let i = 0; i < allRecs.length; i++) {
            const rec = allRecs[i];
            const dateStr = format(rec.date, 'yyyy-MM-dd');

            // Print date header when date changes
            if (dateStr !== currentDate) {
                currentDate = dateStr;
                console.log(`\n📅 Processing ${dateStr}`);
                console.log('─'.repeat(40));
            }

            process.stdout.write(`  [${i + 1}/${allRecs.length}] ${rec.symbol.padEnd(6)} `);

            try {
                // Rate limiting
                await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY));

                // 1. Get intraday stats (10:20, 11:20, 12:20 MVSO data)
                const intradayStats = await getIntradayStats(rec.symbol, dateStr);

                // 2. Get daily OHLCV data for volume
                const dailyData = await getDailyData(rec.symbol, dateStr);

                if (!intradayStats && !dailyData) {
                    console.log('⚪ No data available');
                    stats.noData++;
                    continue;
                }

                // Build update object with only changed fields
                const updateData: any = {};
                const changes: string[] = [];

                // Update from intraday stats (MVSO data)
                if (intradayStats) {
                    if (intradayStats.mvso1020) {
                        if (rec.refPrice1020 !== intradayStats.mvso1020.refPrice) {
                            updateData.refPrice1020 = intradayStats.mvso1020.refPrice;
                            changes.push('ref1020');
                        }
                        if (rec.high !== intradayStats.mvso1020.highPost) {
                            updateData.high = intradayStats.mvso1020.highPost;
                            changes.push('high');
                        }
                        if (rec.lowBeforePeak !== intradayStats.mvso1020.lowBeforePeak) {
                            updateData.lowBeforePeak = intradayStats.mvso1020.lowBeforePeak;
                            changes.push('maxDD');
                        }
                    }

                    if (intradayStats.mvso1120) {
                        if (rec.refPrice1120 !== intradayStats.mvso1120.refPrice) {
                            updateData.refPrice1120 = intradayStats.mvso1120.refPrice;
                            changes.push('ref1120');
                        }
                        if (rec.highPost1120 !== intradayStats.mvso1120.highPost) {
                            updateData.highPost1120 = intradayStats.mvso1120.highPost;
                            changes.push('high1120');
                        }
                    }

                    if (intradayStats.mvso1220) {
                        if (rec.refPrice1220 !== intradayStats.mvso1220.refPrice) {
                            updateData.refPrice1220 = intradayStats.mvso1220.refPrice;
                            changes.push('ref1220');
                        }
                        if (rec.highPost1220 !== intradayStats.mvso1220.highPost) {
                            updateData.highPost1220 = intradayStats.mvso1220.highPost;
                            changes.push('high1220');
                        }
                    }
                }

                // Update from daily data (volume, open)
                if (dailyData) {
                    if (dailyData.volume && rec.volume !== dailyData.volume) {
                        updateData.volume = dailyData.volume;
                        changes.push('vol');
                    }
                    if (dailyData.open && rec.open !== dailyData.open) {
                        updateData.open = dailyData.open;
                        changes.push('open');
                    }
                }

                // Apply updates if there are changes
                if (Object.keys(updateData).length > 0) {
                    await prisma.recommendation.update({
                        where: { id: rec.id },
                        data: updateData
                    });

                    // Calculate and display MVSO
                    const mvso = (updateData.high && (updateData.refPrice1020 || rec.refPrice1020))
                        ? (((updateData.high || rec.high) - (updateData.refPrice1020 || rec.refPrice1020)) / (updateData.refPrice1020 || rec.refPrice1020)) * 100
                        : null;

                    console.log(`✅ Updated [${changes.join(', ')}]${mvso !== null ? ` MVSO=${mvso.toFixed(2)}%` : ''}`);
                    stats.updated++;
                } else {
                    console.log('✓ Already correct');
                    stats.skipped++;
                }

            } catch (err: any) {
                console.log(`❌ Error: ${err.message.substring(0, 50)}`);
                stats.errors++;
            }
        }

        // Summary
        console.log('\n' + '═'.repeat(70));
        console.log('\n📈 VERIFICATION COMPLETE\n');
        console.log(`   Total Records:    ${stats.total}`);
        console.log(`   ✅ Updated:       ${stats.updated}`);
        console.log(`   ✓  Already OK:    ${stats.skipped}`);
        console.log(`   ⚪ No Data:       ${stats.noData}`);
        console.log(`   ❌ Errors:        ${stats.errors}`);
        console.log('\n' + '═'.repeat(70));

    } catch (e: any) {
        console.error('\n💥 Fatal Error:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}

// Execute
verifyAndUpdateAll();
