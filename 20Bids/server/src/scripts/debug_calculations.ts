import { getIntradayStats } from '../services/polygon';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.POLYGON_API_KEY;
const BASE_URL = 'https://api.polygon.io';

async function debugTicker(ticker: string, dateStr: string) {
    console.log(`\n=== DEBUGGING ${ticker} on ${dateStr} ===`);

    // 1. Fetch Raw Bars around 10:20
    const url = `${BASE_URL}/v2/aggs/ticker/${ticker}/range/1/minute/${dateStr}/${dateStr}`;
    try {
        const res = await axios.get(url, { params: { apiKey: API_KEY, sort: 'asc', limit: 5000 } });
        if (!res.data.results) {
            console.log('No data found.');
            return;
        }

        const bars = res.data.results;

        // Find 10:20 bar
        const bar1020 = bars.find((b: any) => {
            const d = new Date(b.t);
            const et = new Date(d.toLocaleString("en-US", { timeZone: "America/New_York" }));
            return et.getHours() === 10 && et.getMinutes() === 20;
        });

        console.log('--- 10:20 Reference ---');
        if (bar1020) {
            console.log(`Bar 10:20 found: Open=${bar1020.o}, High=${bar1020.h}, Low=${bar1020.l}, Close=${bar1020.c}`);
            console.log(`Ref Price Used (Close): ${bar1020.c}`);
        } else {
            console.log('Bar 10:20 NOT FOUND (using next available?)');
        }

        // Run actual service function
        const stats = await getIntradayStats(ticker, dateStr);
        console.log('\n--- Service Results ---');
        console.log(JSON.stringify(stats, null, 2));

        if (stats?.mvso1020 && bar1020) {
            const ref = stats.mvso1020.refPrice;
            const highPost = stats.mvso1020.highPost;

            // Find the bar that has this high
            const highBar = bars.find((b: any) => b.h === highPost);
            if (highBar) {
                const hd = new Date(highBar.t);
                const het = new Date(hd.toLocaleString("en-US", { timeZone: "America/New_York" }));
                console.log(`\nMax High (${highPost}) found at: ${het.toLocaleTimeString()} (Bar Time)`);
            }

            const mvso = ((highPost - ref) / ref) * 100;
            console.log(`Manual Calc: ((${highPost} - ${ref}) / ${ref}) * 100 = ${mvso.toFixed(2)}%`);
        }

    } catch (e) {
        console.error(e);
    }
}

// Test with a ticker that likely has data for Dec 23
debugTicker('AAPL', '2024-12-23');
