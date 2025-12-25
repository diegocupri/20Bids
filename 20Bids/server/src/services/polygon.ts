import axios from 'axios';
import dotenv from 'dotenv';
import { format } from 'date-fns';

dotenv.config();

const API_KEY = process.env.POLYGON_API_KEY;
const BASE_URL = 'https://api.polygon.io';

// Cache for 10:20 AM reference prices: { "AAPL": 150.20, ... }
let referencePrices: Record<string, number> = {};
let referenceDate: string = ''; // To clear cache on new day

// Helper to get ET time
function getETDate() {
    const now = new Date();
    return new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
}

function isMarketOpen() {
    const etNow = getETDate();
    const day = etNow.getDay();
    const hour = etNow.getHours();
    const minute = etNow.getMinutes();

    // Weekend check
    if (day === 0 || day === 6) return false;

    // Hours check (9:30 - 15:30)
    const time = hour * 100 + minute;
    return time >= 930 && time < 1530;
}

export async function getReferencePrice(ticker: string, dateStr: string): Promise<number | null> {
    // If we already have a reference for this ticker today, return it
    if (referenceDate === dateStr && referencePrices[ticker]) {
        return referencePrices[ticker];
    }

    // Reset cache if new day
    if (referenceDate !== dateStr) {
        referencePrices = {};
        referenceDate = dateStr;
    }

    // Try to fetch 10:20 AM price (1 minute bar)
    // Timestamp for 10:20 AM ET on this date
    // We need to construct the timestamp carefully
    // 10:20 AM ET = 15:20 UTC (Standard) or 14:20 UTC (Daylight)
    // Easier to ask Polygon for the specific minute

    // Actually, Polygon Aggregates API takes 'from' and 'to' in YYYY-MM-DD
    // But we want a specific minute.
    // We can use v2/aggs/ticker/{ticker}/range/1/minute/{date}/{date}?sort=asc&limit=500
    // And find the bar at 10:20.

    try {
        const url = `${BASE_URL}/v2/aggs/ticker/${ticker}/range/1/minute/${dateStr}/${dateStr}`;
        console.log(`[Polygon] Fetching 10:20 ref for ${ticker} on ${dateStr}`);
        const res = await axios.get(url, {
            params: {
                apiKey: API_KEY,
                sort: 'asc',
                limit: 5000
            }
        });

        if (res.data.results) {
            // Find bar closest to 10:20 AM ET
            const targetRef = res.data.results.find((bar: any) => {
                const barDate = new Date(bar.t);
                const barET = new Date(barDate.toLocaleString("en-US", { timeZone: "America/New_York" }));
                const h = barET.getHours();
                const m = barET.getMinutes();
                // Return first bar at or after 10:20
                return (h > 10) || (h === 10 && m >= 20);
            });

            if (targetRef) {
                referencePrices[ticker] = targetRef.c;
                return targetRef.c;
            } else {
                console.warn(`[Polygon] No 10:20 ref found for ${ticker}`);
            }
        }
    } catch (e) {
        console.error(`Error fetching ref price for ${ticker}:`, (e as any).message);
    }

    return null;
}

export async function getIntradayStats(ticker: string, dateStr: string): Promise<{
    mvso1020: { refPrice: number, highPost: number, lowBeforePeak: number } | null,
    mvso1120: { refPrice: number, highPost: number, lowBeforePeak: number } | null,
    mvso1220: { refPrice: number, highPost: number, lowBeforePeak: number } | null
} | null> {
    // Fetch 1-minute bars for the entire day
    try {
        const url = `${BASE_URL}/v2/aggs/ticker/${ticker}/range/1/minute/${dateStr}/${dateStr}`;
        console.log(`[Polygon] Fetching intraday stats for ${ticker} on ${dateStr}`);
        const res = await axios.get(url, {
            params: {
                apiKey: API_KEY,
                sort: 'asc',
                limit: 5000
            }
        });

        if (res.data.results && res.data.results.length > 0) {
            const bars = res.data.results;

            const calculateMvso = (targetHour: number, targetMinute: number) => {
                const refBarIndex = bars.findIndex((bar: any) => {
                    const barDate = new Date(bar.t);
                    const barET = new Date(barDate.toLocaleString("en-US", { timeZone: "America/New_York" }));
                    const h = barET.getHours();
                    const m = barET.getMinutes();
                    return (h > targetHour) || (h === targetHour && m >= targetMinute);
                });

                if (refBarIndex === -1) return null;
                const refPrice = bars[refBarIndex].c;

                // Calculate HIGH AFTER entry time and finding LOW until that High (MAE)
                let maxHighAfter = -Infinity;
                let highBarIndex = -1;

                // 1. Find the Peak High and its timestamp/index
                for (let i = refBarIndex; i < bars.length; i++) {
                    const b = bars[i];
                    const bDate = new Date(b.t);
                    const bET = new Date(bDate.toLocaleString("en-US", { timeZone: "America/New_York" }));
                    if (bET.getHours() >= 16) break; // Stop at market close

                    if (b.h > maxHighAfter) {
                        maxHighAfter = b.h;
                        highBarIndex = i;
                    }
                }
                const highPost = maxHighAfter === -Infinity ? refPrice : maxHighAfter;

                // 2. Find Lowest Low between Entry and Peak High
                let minLowBeforePeak = Infinity;
                if (highBarIndex !== -1) {
                    for (let j = refBarIndex; j <= highBarIndex; j++) {
                        if (bars[j].l < minLowBeforePeak) {
                            minLowBeforePeak = bars[j].l;
                        }
                    }
                }

                // If we didn't find a valid peak or range, fallback to refPrice
                const lowBeforePeak = minLowBeforePeak === Infinity ? refPrice : minLowBeforePeak;

                return { refPrice, highPost, lowBeforePeak };
            };

            // Return signature need update too
            // But strict return type is defined in Promise<{...}> earlier. 
            // I should return compatible object, or update the return type definition in the next step.
            // Actually, I can just return it and Typescript might infer or error if explicit.
            // Looking at lines 93-96, return type is explicit. I need to update that too.
            // I'll do it in a separate edit or MultiReplace. I'll use replace_file_content for the logic block first.

            return {
                mvso1020: calculateMvso(10, 20), // High AFTER 10:20
                mvso1120: calculateMvso(11, 20), // High AFTER 11:20
                mvso1220: calculateMvso(12, 20)  // High AFTER 12:20
            };
        }
    } catch (e) {
        console.error(`Error fetching intraday stats for ${ticker}:`, (e as any).message);
    }
    return null;
}

// Cache for ticker details (Sector, Name, etc.)
let tickerDetailsCache: Record<string, { sector: string, name: string }> = {};

export async function fetchTickerDetails(ticker: string) {
    if (!API_KEY) return null;
    if (tickerDetailsCache[ticker]) return tickerDetailsCache[ticker];

    try {
        const url = `${BASE_URL}/v3/reference/tickers/${ticker}`;
        const res = await axios.get(url, { params: { apiKey: API_KEY } });

        if (res.data.results) {
            const details = {
                sector: res.data.results.sic_description || 'Unknown',
                name: res.data.results.name,
                market_cap: res.data.results.market_cap
            };
            tickerDetailsCache[ticker] = details;
            return details;
        }
    } catch (e) {
        console.error(`Error fetching details for ${ticker}:`, (e as any).message);
    }
    return null;
}

export async function fetchGroupedDaily(date: string) {
    if (!API_KEY) return null;

    // /v2/aggs/grouped/locale/us/market/stocks/{date}
    const url = `${BASE_URL}/v2/aggs/grouped/locale/us/market/stocks/${date}`;

    try {
        console.log(`[Polygon] Fetching grouped daily stats for ${date}`);
        const res = await axios.get(url, {
            params: { apiKey: API_KEY, adjusted: true }
        });
        return res.data; // { results: [{ T: 'AAPL', c: 150, ... }] }
    } catch (e) {
        console.error(`[Polygon] Error fetching grouped daily for ${date}:`, (e as any).message);
        return null;
    }
}

export async function fetchDailyStats(ticker: string, date: string) {
    if (!API_KEY) return null;

    // /v1/open-close/{stocksTicker}/{date}
    const url = `${BASE_URL}/v1/open-close/${ticker}/${date}`;

    try {
        console.log(`[Polygon] Fetching daily stats for ${ticker} on ${date}`);
        const res = await axios.get(url, {
            params: { apiKey: API_KEY, adjusted: true }
        });
        return res.data; // { open, high, low, close, volume, ... }
    } catch (e) {
        console.error(`[Polygon] Error fetching daily stats for ${ticker} on ${date}:`, (e as any).message);
        // 404 means no data for that date (e.g. weekend/holiday)
        // console.warn(`No daily stats for ${ticker} on ${date}`);
        return null;
    }
}

export async function fetchRealTimePrices(tickers: string[]) {
    if (!API_KEY) return {};

    // 1. Check Market Hours
    // 1. Check Market Hours
    // if (!isMarketOpen()) {
    //     // Return empty if market closed?
    //     // For now, we want to see data even if market is closed (Snapshot returns last close).
    //     // return {};
    // }

    try {
        const etNow = getETDate();
        const dateStr = format(etNow, 'yyyy-MM-dd');
        const isBefore1020 = (etNow.getHours() < 10) || (etNow.getHours() === 10 && etNow.getMinutes() < 20);

        // 2. Fetch Grouped Snapshot (Efficient: 1 call for ALL tickers)
        // /v2/snapshot/locale/us/markets/stocks/tickers
        const snapshotUrl = `${BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers`;
        const res = await axios.get(snapshotUrl, {
            params: {
                apiKey: API_KEY,
                tickers: tickers.join(',') // Filter server-side if supported, or client-side
            }
        });

        // Polygon's Grouped Daily doesn't support 'tickers' param filter efficiently in all plans,
        // but it returns all. We filter in memory.
        const allTickers = res.data.tickers || [];
        const updates: Record<string, { price: number, change: number, refPrice1020?: number, volume: number, open: number, high: number }> = {};

        for (const t of allTickers) {
            if (tickers.includes(t.ticker)) {
                const currentPrice = t.lastTrade?.p || t.day?.c || t.prevDay?.c;

                if (!currentPrice) continue;

                let change = t.todaysChangePerc; // Default to daily change
                let refPrice1020 = undefined;

                // 3. Apply 10:20 AM Logic
                if (!isBefore1020) {
                    // Try to get 10:20 reference
                    let refPrice = await getReferencePrice(t.ticker, dateStr);

                    if (refPrice) {
                        refPrice1020 = refPrice;
                        // Calculate change relative to 10:20 AM
                        change = ((currentPrice - refPrice) / refPrice) * 100;
                    }
                } else {
                    // Before 10:20, maybe use Open price as reference?
                    // Or just keep daily change.
                    // User said "change relative to 10:20".
                    // Before 10:20, that reference doesn't exist.
                    // Let's stick to daily change (todaysChangePerc) until then.
                }

                updates[t.ticker] = {
                    price: currentPrice,
                    change: change,
                    refPrice1020: refPrice1020,
                    volume: t.day?.v || 0,
                    open: t.day?.o || t.prevDay?.c || 0, // Fallback to prev close if no open yet
                    high: t.day?.h || 0
                };
            }
        }

        return updates;

    } catch (error) {
        console.error('Error in Polygon service:', (error as any).message);
        return {};
    }
}

export const fetchSectorPerformance = async (dateStr?: string) => {
    const SECTOR_ETFS = [
        { symbol: 'XLK', name: 'Technology' },
        { symbol: 'XLF', name: 'Financials' },
        { symbol: 'XLV', name: 'Healthcare' },
        { symbol: 'XLY', name: 'Cons. Discret.' },
        { symbol: 'XLP', name: 'Cons. Staples' },
        { symbol: 'XLE', name: 'Energy' },
        { symbol: 'XLI', name: 'Industrials' },
        { symbol: 'XLB', name: 'Materials' },
        { symbol: 'XLU', name: 'Utilities' },
        { symbol: 'XLRE', name: 'Real Estate' },
        { symbol: 'XLC', name: 'Comm. Svcs' },
    ];

    try {
        // Check if date is today (or not provided)
        const today = format(getETDate(), 'yyyy-MM-dd');
        const isToday = !dateStr || dateStr === today;

        if (isToday) {
            // Real-time logic
            const symbols = SECTOR_ETFS.map(s => s.symbol);
            const prices = await fetchRealTimePrices(symbols);

            const results = SECTOR_ETFS.map(etf => {
                const data = prices[etf.symbol];
                if (!data) return null;
                return {
                    name: etf.name,
                    symbol: etf.symbol,
                    change: data.change,
                    price: data.price
                };
            }).filter(Boolean);
            return results.sort((a: any, b: any) => b.change - a.change);
        } else {
            // Historical logic
            // Use fetchGroupedDaily with retry logic to find the last valid trading day
            let targetDate = new Date(dateStr!);
            let attempts = 0;
            let foundData: any[] = [];

            while (attempts < 5 && foundData.length === 0) {
                const dateQuery = format(targetDate, 'yyyy-MM-dd');
                const res = await fetchGroupedDaily(dateQuery);

                if (res && res.resultsCount > 0) {
                    foundData = res.results;
                } else {
                    // Go back 1 day
                    targetDate.setDate(targetDate.getDate() - 1);
                    attempts++;
                }
            }

            if (foundData.length === 0) return [];

            // Filter for sector ETFs
            const results = SECTOR_ETFS.map(etf => {
                const data = foundData.find((d: any) => d.T === etf.symbol);
                if (!data) return null;
                // data.o = open, data.c = close
                const change = ((data.c - data.o) / data.o) * 100;
                return {
                    name: etf.name,
                    symbol: etf.symbol,
                    change: change,
                    price: data.c
                };
            }).filter(Boolean);

            return results.sort((a: any, b: any) => b.change - a.change);
        }

    } catch (error) {
        console.error('Error fetching sector performance:', error);
        return [];
    }
};

export async function fetchMarketIndices() {
    const INDICES = [
        { symbol: 'SPY', name: 'S&P 500' },
        { symbol: 'QQQ', name: 'Nasdaq 100' },
        { symbol: 'VIXY', name: 'VIX' } // Using VIXY as proxy for VIX if direct index not available
    ];

    try {
        const symbols = INDICES.map(i => i.symbol);
        const prices = await fetchRealTimePrices(symbols);

        return INDICES.map(idx => {
            const data = prices[idx.symbol];
            if (!data) return null;
            return {
                name: idx.name,
                symbol: idx.symbol,
                price: data.price,
                change: data.change
            };
        }).filter(Boolean);
    } catch (error) {
        console.error('Error fetching indices:', error);
        return [];
    }

}

export async function fetchTickerNews(ticker: string, limit: number = 20) {
    if (!API_KEY) return [];

    // /v2/reference/news?ticker={ticker}
    const url = `${BASE_URL}/v2/reference/news`;

    try {
        const res = await axios.get(url, {
            params: {
                apiKey: API_KEY,
                ticker: ticker,
                limit: limit,
                sort: 'published_utc',
                order: 'desc'
            }
        });
        return res.data.results || [];
    } catch (e) {
        console.error(`[Polygon] Error fetching news for ${ticker}:`, (e as any).message);
        return [];
    }
}

// NOTE: Polygon doesn't have a specific "Social Sentiment" endpoint in the Basic plan.
// We will mock this or use FMP if available in future.
// For now, we return empty or mock data structure for the frontend to consume.
export async function fetchSocialSentiment(ticker: string) {
    // Mock data for demonstration as per request "Tweets/Social"
    // In a real scenario with FMP Enterprise or other providers, we'd fetch here.

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));

    return {
        sentiment: Math.random() > 0.5 ? 'Bullish' : 'Bearish',
        score: (Math.random() * 100).toFixed(0),
        volume: Math.floor(Math.random() * 5000),
        tweets: [
            {
                id: '1',
                user: 'StockTraderPro',
                text: `$${ticker} looking strong at support! 🚀`,
                time: '10m ago',
                sentiment: 'Bullish'
            },
            {
                id: '2',
                user: 'MarketWatchDog',
                text: `Volume spike in $${ticker}. Something is brewing.`,
                time: '25m ago',
                sentiment: 'Bullish'
            },
            {
                id: '3',
                user: 'BearTrap',
                text: `$${ticker} hitting resistance, time to short?`,
                time: '1h ago',
                sentiment: 'Bearish'
            },
            {
                id: '4',
                user: 'ChartWizard',
                text: `Technical breakout on $${ticker} daily chart.`,
                time: '2h ago',
                sentiment: 'Bullish'
            }
        ]
    };
}
