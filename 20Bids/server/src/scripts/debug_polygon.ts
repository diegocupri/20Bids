
import dotenv from 'dotenv';
dotenv.config();
import { getIntradayStats, fetchDailyStats } from '../services/polygon';

async function main() {
    console.log('--- Debugging Polygon Logic ---');

    // Test Case: Dec 23rd (Monday) for a known ticker, e.g., AAPL
    const ticker = 'AAPL';
    const dateStr = '2024-12-23'; // YYYY-MM-DD

    console.log(`Testing for ${ticker} on ${dateStr}`);

    // 1. Fetch Daily Stats to verify market was open and data exists
    const daily = await fetchDailyStats(ticker, dateStr);
    if (daily) {
        console.log('Daily Stats found:', {
            open: daily.open,
            high: daily.high,
            low: daily.low,
            close: daily.close,
            volume: daily.volume
        });
    } else {
        console.log('No Daily Stats found (Market closed? API Error?)');
    }

    // 2. Fetch Intraday Stats (The logic in question)
    const intraday = await getIntradayStats(ticker, dateStr);

    if (intraday) {
        console.log('Intraday Stats Result:', JSON.stringify(intraday, null, 2));

        if (!intraday.mvso1120) console.warn('WARNING: Missing 11:20 data');
        if (!intraday.mvso1220) console.warn('WARNING: Missing 12:20 data');
    } else {
        console.log('Intraday Stats returned null.');
    }
}

main().catch(console.error);
