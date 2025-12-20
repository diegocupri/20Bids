import { getIntradayStats } from './src/services/polygon';
import dotenv from 'dotenv';
dotenv.config();

async function debug() {
    const ticker = 'AVAV';
    const date = '2025-12-10';
    console.log(`Checking ${ticker} on ${date}...`);

    const stats = await getIntradayStats(ticker, date);
    console.log(JSON.stringify(stats, null, 2));
}

debug();
