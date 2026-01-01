import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { subDays, format } from 'date-fns';
import { fetchRealTimePrices, fetchTickerDetails, fetchGroupedDaily, fetchDailyStats, getReferencePrice, fetchSectorPerformance, fetchMarketIndices, getIntradayStats, fetchTickerNews, fetchSocialSentiment } from './services/polygon';
import { parse } from 'csv-parse/sync';
import authRouter from './routes/auth';

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.UPLOAD_API_KEY || 'dev-api-key-change-in-production';

app.use(cors({
    origin: '*', // Allow all origins (for now)
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
}));
app.use(express.json());
app.use(express.text({ type: 'text/csv', limit: '10mb' }));

// Auth Routes
app.use('/api/auth', authRouter);

// Health Check for Render
app.get('/', (req, res) => {
    res.send('20Bids API is running');
});

// --- Mock Data Generation Logic (Ported from frontend) ---
const TICKERS = [
    { symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology', marketCap: 2.8 },
    { symbol: 'MSFT', name: 'Microsoft Corp.', sector: 'Technology', marketCap: 3.1 },
    { symbol: 'GOOGL', name: 'Alphabet Inc.', sector: 'Technology', marketCap: 1.9 },
    { symbol: 'AMZN', name: 'Amazon.com Inc.', sector: 'Consumer Cyclical', marketCap: 1.8 },
    { symbol: 'NVDA', name: 'NVIDIA Corp.', sector: 'Technology', marketCap: 2.2 },
    { symbol: 'META', name: 'Meta Platforms', sector: 'Technology', marketCap: 1.2 },
    { symbol: 'TSLA', name: 'Tesla Inc.', sector: 'Automotive', marketCap: 0.6 },
    { symbol: 'AMD', name: 'Adv. Micro Devices', sector: 'Technology', marketCap: 0.3 },
    { symbol: 'NFLX', name: 'Netflix Inc.', sector: 'Communication', marketCap: 0.28 },
    { symbol: 'JPM', name: 'JPMorgan Chase', sector: 'Financial', marketCap: 0.5 },
];

// --- API Endpoints ---

// Get Recommendations
// Helper to refresh intraday stats for a list of recommendations
async function refreshIntradayData(recommendations: any[]) {
    console.log(`[Refresh] Updating intraday stats for ${recommendations.length} tickers...`);

    for (const rec of recommendations) {
        // Skip if we already have all data (optimization)
        // Check if we are past market close and data looks complete? 
        // For now, refresh all to be safe during market hours.

        try {
            const dateStr = format(rec.date, 'yyyy-MM-dd');
            const stats = await getIntradayStats(rec.symbol, dateStr);

            if (stats) {
                // Update DB
                await prisma.recommendation.update({
                    where: { id: rec.id },
                    data: {
                        high: stats.mvso1020?.highPost, // Day High for main MVSO
                        refPrice1020: stats.mvso1020?.refPrice,
                        lowBeforePeak: stats.mvso1020?.lowBeforePeak, // NEW: Max Adverse Excursion
                        refPrice1120: stats.mvso1120?.refPrice,
                        highPost1120: stats.mvso1120?.highPost,
                        refPrice1220: stats.mvso1220?.refPrice,
                        highPost1220: stats.mvso1220?.highPost,
                    }
                });
            }
        } catch (err) {
            console.error(`[Refresh] Failed for ${rec.symbol}:`, err);
        }
    }
}

// Get Recommendations
app.get('/api/recommendations', async (req, res) => {
    try {
        const { date } = req.query;
        const dateStr = date ? (date as string) : format(new Date(), 'yyyy-MM-dd');
        const targetDate = new Date(dateStr);
        const isToday = format(new Date(), 'yyyy-MM-dd') === dateStr;

        console.log(`[API] Fetching recommendations for ${dateStr}`);

        // Query database for recommendations on this date (Full Day Range)
        const startOfDay = new Date(targetDate);
        startOfDay.setUTCHours(0, 0, 0, 0);

        const endOfDay = new Date(targetDate);
        endOfDay.setUTCHours(23, 59, 59, 999);

        let dbRecommendations = await prisma.recommendation.findMany({
            where: {
                date: {
                    gte: startOfDay,
                    lte: endOfDay
                }
            }
        });

        console.log(`[API] Found ${dbRecommendations.length} recommendations in database`);

        // AUTO-REFRESH LOGIC:
        // If it is today, verify if we have missing MVSO data for active time windows.
        // Or simply trigger a refresh every time (throttled by client polling).
        // Since getIntradayStats is reasonably cheap (1 call per ticker), we can do it.
        // To avoid blocking the UI response, we can fire this in background?
        // No, user wants to SEE the data. We should await it OR return old data and background update.
        // Let's await it for accuracy, but limit to small batches if needed.
        // Since list is usually < 20 tickers, it is fast enough.

        if (isToday && dbRecommendations.length > 0) {
            console.log('[API] Triggering auto-refresh of intraday stats...');
            await refreshIntradayData(dbRecommendations);

            // Re-fetch updated data
            dbRecommendations = await prisma.recommendation.findMany({
                where: {
                    date: {
                        gte: startOfDay,
                        lte: endOfDay
                    }
                }
            });
        }

        // If we have data from database, use it
        if (dbRecommendations.length > 0) {
            // Enrich with real-time prices if today
            if (isToday) {
                const symbols = dbRecommendations.map(r => r.symbol);
                const realTimePrices = await fetchRealTimePrices(symbols);

                const enriched = dbRecommendations.map(rec => {
                    const rtPrice = realTimePrices[rec.symbol]; // It's a Record, not an Array

                    return {
                        ...rec,
                        date: format(rec.date, 'yyyy-MM-dd'),
                        price: rtPrice?.price || rec.price,
                        changePercent: rtPrice?.change ?? rec.changePercent,
                        volume: rtPrice?.volume || rec.volume
                    };
                });

                // Fetch user tags
                const allTags = await prisma.tag.findMany();
                const result = enriched.map(rec => {
                    const tag = allTags.find(t => t.symbol === rec.symbol);
                    return { ...rec, userTag: tag?.color };
                });

                return res.json(result);
            } else {
                // For historical dates, just return DB data
                const formatted = dbRecommendations.map(rec => ({
                    ...rec,
                    date: format(rec.date, 'yyyy-MM-dd')
                }));

                // Fetch user tags
                const allTags = await prisma.tag.findMany();
                const result = formatted.map(rec => {
                    const tag = allTags.find(t => t.symbol === rec.symbol);
                    return { ...rec, userTag: tag?.color };
                });

                return res.json(result);
            }
        }

        // If no data in database, return empty array
        console.log('[API] No recommendations found for this date');
        res.json([]);

    } catch (error) {
        console.error('[API] Error fetching recommendations:', error);
        res.status(500).json({ error: 'Failed to fetch recommendations' });
    }
});

// Get available dates
app.get('/api/dates', async (req, res) => {
    const recs = await prisma.recommendation.findMany({
        select: { date: true },
        distinct: ['date'],
        orderBy: { date: 'desc' }
    });

    // Deduplicate by YYYY-MM-DD
    const uniqueDays = new Set<string>();
    const distinctDates: Date[] = [];

    for (const r of recs) {
        // Use ISO string date part (UTC) for consistent deduplication
        const dayStr = r.date.toISOString().split('T')[0];
        if (!uniqueDays.has(dayStr)) {
            uniqueDays.add(dayStr);
            distinctDates.push(r.date);
        }
    }

    res.json(distinctDates);
});

// Update Tag
app.post('/api/tags', async (req, res) => {
    const { symbol, color } = req.body;
    const userId = 'default-user'; // Simulated user

    // Ensure user exists
    await prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: { id: userId, email: 'demo@example.com', name: 'Analyst', password: '' }
    });

    if (!color) {
        // Remove tag
        await prisma.tag.deleteMany({
            where: { userId, symbol }
        });
    } else {
        // Upsert tag
        const existing = await prisma.tag.findFirst({ where: { userId, symbol } });
        if (existing) {
            await prisma.tag.update({ where: { id: existing.id }, data: { color } });
        } else {
            await prisma.tag.create({ data: { userId, symbol, color } });
        }
    }
    res.json({ success: true });
});

// Real-time Price Updates (Polygon.io)
app.get('/api/prices', async (req, res) => {
    try {
        // Get today's recommendations to find symbols
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayRecs = await prisma.recommendation.findMany({
            where: { date: today },
            select: { symbol: true }
        });

        if (todayRecs.length === 0) {
            return res.json({});
        }

        const symbols = todayRecs.map(r => r.symbol);
        const updates = await fetchRealTimePrices(symbols);

        res.json(updates);
    } catch (error) {
        console.error('[Prices API] Error:', error);
        res.status(500).json({ error: 'Failed to fetch prices' });
    }
});

// Get Sector Performance
app.get('/api/sectors', async (req, res) => {
    try {
        const date = req.query.date as string;
        const sectors = await fetchSectorPerformance(date);
        res.json(sectors);
    } catch (error) {
        console.error('Error fetching sectors:', error);
        res.status(500).json({ error: 'Failed to fetch sectors' });
    }
});

// Get Market Indices
// Health Check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', version: '1.0.3' });
});

app.get('/api/indices', async (req, res) => {
    try {
        const indices = await fetchMarketIndices();
        res.json(indices);
    } catch (error) {
        console.error('Error fetching indices:', error);
        res.status(500).json({ error: 'Failed to fetch indices' });
    }
});

// Get Ticker News
app.get('/api/external/news', async (req, res) => {
    try {
        const ticker = req.query.ticker as string;
        if (!ticker) return res.status(400).json({ error: 'Ticker is required' });

        const news = await fetchTickerNews(ticker);
        res.json(news);
    } catch (error) {
        console.error('Error fetching news:', error);
        res.status(500).json({ error: 'Failed to fetch news' });
    }
});

// Get Social Sentiment
app.get('/api/external/sentiment', async (req, res) => {
    try {
        const ticker = req.query.ticker as string;
        if (!ticker) return res.status(400).json({ error: 'Ticker is required' });

        const sentiment = await fetchSocialSentiment(ticker);
        res.json(sentiment);
    } catch (error) {
        console.error('Error fetching sentiment:', error);
        res.status(500).json({ error: 'Failed to fetch sentiment' });
    }
});

// Get MVSO History for Accuracy Calculation
app.get('/api/stats/mvso-history', async (req, res) => {
    try {
        const allRecs = await prisma.recommendation.findMany({
            select: {
                date: true,
                high: true,
                refPrice1020: true
            }
        });

        const history: Record<string, number[]> = {};

        for (const rec of allRecs) {
            const dateStr = format(rec.date, 'yyyy-MM-dd');
            if (!history[dateStr]) history[dateStr] = [];

            if (rec.high && rec.refPrice1020) {
                const mvso = ((rec.high - rec.refPrice1020) / rec.refPrice1020) * 100;
                history[dateStr].push(mvso);
            }
        }

        res.json(history);
    } catch (error) {
        console.error('Error fetching MVSO history:', error);
        res.status(500).json({ error: 'Failed to fetch MVSO history' });
    }
});

// --- External Data Ingestion Endpoint ---
app.post('/api/external/ingest', async (req, res) => {
    try {
        const apiKey = req.headers['x-api-key'];
        if (apiKey !== API_KEY) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const data = req.body;
        if (!Array.isArray(data)) {
            return res.status(400).json({ error: 'Payload must be an array of objects' });
        }

        console.log(`[Ingest] Received ${data.length} records from external source`);
        let successCount = 0;

        for (const item of data) {
            // Expected format: { symbol, date, high, refPrice1020, volume, ... }
            if (!item.symbol || !item.date) {
                console.warn('[Ingest] Skipping item without symbol or date');
                continue;
            }

            // Convert Date
            const date = new Date(item.date);

            // Upsert
            await prisma.recommendation.upsert({
                where: {
                    symbol_date: { symbol: item.symbol, date: date }
                },
                update: {
                    ...item,
                    date: date // Ensure date type correctness
                },
                create: {
                    ...item,
                    date: date,
                    name: item.name || item.symbol,
                    price: item.price || 0,
                    changePercent: item.changePercent || 0,
                    volume: item.volume || 0,
                    relativeVol: item.relativeVol || 1,
                    marketCap: item.marketCap || 0,
                    sector: item.sector || 'Unknown',
                    analystRating: item.analystRating || 'Neutral',
                    type: item.type || 'Long',
                    probability: item.probability || 'Medium',
                    time: item.time || '10:20',
                    stopLoss: item.stopLoss || 0,
                    priceTarget: item.priceTarget || 0,
                    thesis: item.thesis || 'Algorithmic Entry',
                    sentiment: item.sentiment || 'Neutral',
                    rsi: item.rsi || 50,
                    beta: item.beta || 1
                }
            });
            successCount++;
        }

        res.json({ success: true, count: successCount });

    } catch (error) {
        console.error('[Ingest] Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


// TP/SL Optimization Endpoint - Grid Search for optimal parameters
app.get('/api/stats/optimization', async (req, res) => {
    try {
        console.log('[Optimization] Starting TP/SL grid search...');

        // Date Filtering (optional)
        const startDateStr = req.query.startDate as string;
        const endDateStr = req.query.endDate as string;
        const minVolume = parseFloat(req.query.minVol as string) || 0;
        const minPrice = parseFloat(req.query.minPrice as string) || 0;
        const minProb = parseFloat(req.query.minProb as string) || 0;

        const dateFilter: any = {};
        if (startDateStr) dateFilter.gte = new Date(startDateStr);
        if (endDateStr) dateFilter.lte = new Date(endDateStr);

        // Fetch all trades with intraday data
        const allRecs = await prisma.recommendation.findMany({
            where: {
                ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {})
            },
            orderBy: { date: 'asc' }
        });

        console.log(`[Optimization] Found ${allRecs.length} trades with intraday data`);

        // TP and SL ranges to test (0.5% to 12% with 0.5 steps)
        const rangeStep = 0.5;
        const maxVal = 12;
        const tpRange: number[] = [];
        const slRange: number[] = [];
        for (let i = 0.5; i <= maxVal; i += rangeStep) {
            tpRange.push(i);
            slRange.push(i);
        }

        const bubbleData: any[] = [];

        // Optimize loop: Pre-calculate recs data
        const validRecs = allRecs
            .filter(r => r.refPrice1020 && r.high && r.lowBeforePeak)
            .map(r => {
                const price = r.refPrice1020!;
                return {
                    mvso: ((r.high! - price) / price) * 100,
                    maxDD: Math.abs(((r.lowBeforePeak! - price) / price) * 100),
                    vol: r.relativeVol || 0,
                    price: price,
                    prob: r.probabilityValue || 0,
                    // New fields for additional stats
                    sector: r.sector || 'Unknown',
                    rsi: r.rsi || 50,
                    volume: r.volume || 0,
                    relativeVol: r.relativeVol || 0
                };
            });

        // Grid Search: All TP x All SL
        for (const tp of tpRange) {
            for (const sl of slRange) {
                let currentReturn = 0;
                let wins = 0;
                let count = 0;
                let grossWin = 0;
                let grossLoss = 0;

                for (const rec of validRecs) {
                    // Note: minVolume filter removed - rec.vol is relativeVol (ratio), not absolute volume
                    if (rec.price < minPrice) continue;
                    if (rec.prob < minProb) continue;

                    let tradeReturn: number;
                    // Logic: 
                    // 1. Hit SL? -SL
                    // 2. Hit TP? +TP
                    // 3. Neither? (Drift) -> 0 (Breakeven / Time Stop assumption)
                    if (rec.maxDD >= sl) {
                        tradeReturn = -sl;
                    } else if (rec.mvso >= tp) {
                        tradeReturn = tp;
                    } else {
                        tradeReturn = 0;
                    }

                    currentReturn += tradeReturn;
                    if (tradeReturn > 0) {
                        wins++;
                        grossWin += tradeReturn;
                    } else {
                        grossLoss += Math.abs(tradeReturn);
                    }
                    count++;
                }

                if (count > 0) {
                    const pf = grossLoss === 0 ? grossWin : grossWin / grossLoss;
                    const efficiency = sl > 0 ? currentReturn / sl : 0; // Return per unit of risk
                    bubbleData.push({
                        tp,
                        sl,
                        totalReturn: parseFloat(currentReturn.toFixed(2)),
                        winRate: parseFloat(((wins / count) * 100).toFixed(1)),
                        count,
                        avgReturn: parseFloat((currentReturn / count).toFixed(3)),
                        pf: parseFloat(pf.toFixed(2)),
                        efficiency: parseFloat(efficiency.toFixed(2)) // Risk-adjusted return
                    });
                }
            }
        }

        // Sort by Total Return
        bubbleData.sort((a, b) => b.totalReturn - a.totalReturn);

        // Calculate dummy results for legacy if needed, or simply pass partial
        const best = bubbleData.length > 0 ? bubbleData[0] : { tp: 0, sl: 0, totalReturn: 0 };

        console.log(`[Optimization v3] Best Overall: TP=${best.tp}%, SL=${best.sl}% => Total Return: ${best.totalReturn}%`);

        // ========== NEW STATS FOR TRADING CHARTS ==========

        // 1. Sector Stats - Performance by sector
        const sectorMap = new Map<string, { returns: number[], wins: number, count: number }>();
        for (const rec of validRecs) {
            if (!sectorMap.has(rec.sector)) {
                sectorMap.set(rec.sector, { returns: [], wins: 0, count: 0 });
            }
            const s = sectorMap.get(rec.sector)!;
            const tradeReturn = rec.mvso >= 5 ? 5 : (rec.maxDD >= 2 ? -2 : 0); // Simple 5/2 TP/SL for sector analysis
            s.returns.push(tradeReturn);
            if (tradeReturn > 0) s.wins++;
            s.count++;
        }
        const sectorStats = Array.from(sectorMap.entries()).map(([sector, data]) => ({
            sector,
            avgReturn: parseFloat((data.returns.reduce((a, b) => a + b, 0) / data.count).toFixed(2)),
            winRate: parseFloat(((data.wins / data.count) * 100).toFixed(1)),
            count: data.count
        })).sort((a, b) => b.avgReturn - a.avgReturn);

        // 2. RSI Stats - Performance by RSI zone
        const rsiStats = validRecs.map(rec => {
            const tradeReturn = rec.mvso >= 5 ? 5 : (rec.maxDD >= 2 ? -2 : 0);
            return {
                rsi: parseFloat(rec.rsi.toFixed(0)),
                avgReturn: tradeReturn,
                mvso: parseFloat(rec.mvso.toFixed(2)),
                maxDD: parseFloat(rec.maxDD.toFixed(2))
            };
        });

        // 3. Volume Stats - Performance by volume segment (€) WITH BOXPLOT DATA
        const volumeSegments = ['<2M', '2-5M', '5-10M', '>10M'];
        const getVolumeSegment = (vol: number) => {
            if (vol < 2_000_000) return '<2M';
            if (vol < 5_000_000) return '2-5M';
            if (vol < 10_000_000) return '5-10M';
            return '>10M';
        };

        // Helper function for percentile calculation
        const percentile = (arr: number[], p: number) => {
            if (arr.length === 0) return 0;
            const sorted = [...arr].sort((a, b) => a - b);
            const idx = (p / 100) * (sorted.length - 1);
            const lower = Math.floor(idx);
            const upper = Math.ceil(idx);
            if (lower === upper) return sorted[lower];
            return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
        };

        const volumeMap = new Map<string, { values: number[], wins: number, count: number }>();
        volumeSegments.forEach(s => volumeMap.set(s, { values: [], wins: 0, count: 0 }));

        for (const rec of validRecs) {
            const segment = getVolumeSegment(rec.volume);
            const v = volumeMap.get(segment)!;
            // Use REAL MVSO value for boxplot distribution
            v.values.push(parseFloat(rec.mvso.toFixed(2)));
            if (rec.mvso >= 5) v.wins++;
            v.count++;
        }
        const volumeStats = volumeSegments.map(segment => {
            const data = volumeMap.get(segment)!;
            const values = data.values;
            const avgReturn = data.count > 0 ? values.reduce((a, b) => a + b, 0) / data.count : 0;
            return {
                segment,
                avgReturn: parseFloat(avgReturn.toFixed(2)),
                winRate: data.count > 0 ? parseFloat(((data.wins / data.count) * 100).toFixed(1)) : 0,
                count: data.count,
                // Boxplot raw data for Plotly
                values: values,
                // Pre-calculated stats for tooltip
                min: values.length > 0 ? parseFloat(Math.min(...values).toFixed(2)) : 0,
                q1: parseFloat(percentile(values, 25).toFixed(2)),
                median: parseFloat(percentile(values, 50).toFixed(2)),
                q3: parseFloat(percentile(values, 75).toFixed(2)),
                max: values.length > 0 ? parseFloat(Math.max(...values).toFixed(2)) : 0
            };
        });

        // 4. Relative Volume Stats - Scatter data
        const relVolStats = validRecs.map(rec => {
            const tradeReturn = rec.mvso >= 5 ? 5 : (rec.maxDD >= 2 ? -2 : 0);
            return {
                relativeVol: parseFloat(rec.relativeVol.toFixed(2)),
                avgReturn: tradeReturn,
                mvso: parseFloat(rec.mvso.toFixed(2)),
                sector: rec.sector
            };
        });

        // ========== END NEW STATS ==========

        res.json({
            version: 'v4-analytics', // NEW VERSION
            tpRange,
            slRange,
            bubbleData,
            results: bubbleData.slice(0, 1),
            best,
            tradeCount: allRecs.length,
            validRecsCount: validRecs.length,
            // New trading analytics stats
            sectorStats,
            rsiStats,
            volumeStats,
            relVolStats,
            paramsReceived: { minVolume, minPrice, minProb }
        });

    } catch (error) {
        console.error('[Optimization] Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


// Detailed Analysis Endpoint (Intraday Focus)
app.get('/api/stats/analysis', async (req, res) => {
    try {
        // Parse Take Profit parameter (defaults to 100% = no limit)
        const takeProfit = parseFloat(req.query.tp as string) || 100;
        const stopLoss = parseFloat(req.query.sl as string) || 100;
        const minVol = (parseFloat(req.query.minVol as string) || 0) * 1_000_000; // Input is in millions
        const minPrice = parseFloat(req.query.minPrice as string) || 0;
        const minProb = parseInt(req.query.minProb as string) || 0;

        // Date Filtering
        const startDateStr = req.query.startDate as string;
        const endDateStr = req.query.endDate as string;

        const dateFilter: any = {};
        if (startDateStr) dateFilter.gte = new Date(startDateStr);
        if (endDateStr) dateFilter.lte = new Date(endDateStr);

        const allRecs = await prisma.recommendation.findMany({
            where: {
                ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
                volume: { gte: minVol },
                price: { gte: minPrice },
                probabilityValue: { gte: minProb }
            },
            orderBy: { date: 'asc' }
        });

        const filteredRecs = allRecs; // Already filtered by DB query optimize for speed

        const analysis = {
            cumulativePerformance: [] as { date: string, return: number, equity: number, drawdown: number }[],
            distribution: {
                negative: 0,
                flat: 0,
                small: 0,
                medium: 0,
                large: 0
            } as Record<string, number>,
            dayOfWeek: {} as Record<string, { count: number, totalMvso: number, wins: number }>,
            tickers: {} as Record<string, { count: number, totalMvso: number, wins: number }>,
            volume: [] as { x: number, y: number, rvol: number }[],
            sectors: {} as Record<string, { count: number, totalMvso: number, wins: number }>,
            dailyAverages: [] as { date: string, avgReturn: number, avgPrice: number, count: number }[],
            tradeReturns: [] as { date: string, return: number, rawReturn: number, probability: number }[], // Added rawReturn for toggle
            debugVersion: '1.0.3' // FORCE UPDATE CHECK 3
        };

        let cumulativeReturn = 0;
        let peakEquity = 0;
        let maxDrawdown = 0;

        let grossWin = 0;
        let grossLoss = 0;
        let currentWinStreak = 0;
        let maxWinStreak = 0;
        let currentLossStreak = 0;
        let maxLossStreak = 0;

        const dailyMap: Record<string, { total: number, count: number, totalPrice: number, hitTP: number, hitSL: number, other: number }> = {};

        // DEBUG: Sample MVSO Calculations
        let debugSamples = 0;

        for (const rec of filteredRecs) {
            // Validate data
            if (!rec.high || !rec.refPrice1020) continue;

            const mvso = ((rec.high - rec.refPrice1020) / rec.refPrice1020) * 100;

            // Calculate Max DD from lowBeforePeak (if available)
            const maxDD = rec.lowBeforePeak && rec.refPrice1020
                ? ((rec.lowBeforePeak - rec.refPrice1020) / rec.refPrice1020) * 100
                : 0;

            // Determine trade outcome category
            const wasStoppedOut = maxDD < -stopLoss;
            const hitTakeProfit = !wasStoppedOut && mvso >= takeProfit;

            // Apply Stop Loss: if Max DD exceeds -SL, trade was stopped out at -SL
            let effectiveMvso = mvso;
            if (wasStoppedOut) {
                effectiveMvso = -stopLoss;
            }

            // Apply Take Profit: clamp positive returns at TP value
            const clampedMvso = effectiveMvso > 0 ? Math.min(effectiveMvso, takeProfit) : effectiveMvso;

            if (debugSamples < 5) {
                console.log(`[Analysis Debug] ${rec.symbol} on ${format(rec.date, 'yyyy-MM-dd')}: High=${rec.high}, Ref=${rec.refPrice1020} => MVSO=${mvso.toFixed(2)}% (Clamped: ${clampedMvso.toFixed(2)}%) | TP:${hitTakeProfit} SL:${wasStoppedOut}`);
                debugSamples++;
            }

            const isWin = clampedMvso >= 0.5;

            // --- Risk Metrics Calculation ---
            if (clampedMvso > 0) {
                grossWin += clampedMvso;
                currentWinStreak++;
                currentLossStreak = 0;
                if (currentWinStreak > maxWinStreak) maxWinStreak = currentWinStreak;
            } else {
                grossLoss += Math.abs(clampedMvso); // Treat as positive magnitude
                currentLossStreak++;
                currentWinStreak = 0;
                if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak;
            }

            // Equity & Drawdown
            cumulativeReturn += clampedMvso;
            if (cumulativeReturn > peakEquity) peakEquity = cumulativeReturn;

            const currentDrawdown = peakEquity - cumulativeReturn;
            if (currentDrawdown > maxDrawdown) maxDrawdown = currentDrawdown;
            const dateStr = format(rec.date, 'yyyy-MM-dd');

            const existingDay = analysis.cumulativePerformance.find(d => d.date === dateStr);
            if (existingDay) {
                existingDay.return += clampedMvso;
                existingDay.equity = cumulativeReturn;
                existingDay.drawdown = currentDrawdown * -1;
                (existingDay as any).hitTP = ((existingDay as any).hitTP || 0) + (hitTakeProfit ? 1 : 0);
                (existingDay as any).hitSL = ((existingDay as any).hitSL || 0) + (wasStoppedOut ? 1 : 0);
                (existingDay as any).other = ((existingDay as any).other || 0) + (!hitTakeProfit && !wasStoppedOut ? 1 : 0);
                (existingDay as any).count = ((existingDay as any).count || 0) + 1;
            } else {
                analysis.cumulativePerformance.push({
                    date: dateStr,
                    return: clampedMvso,
                    equity: cumulativeReturn,
                    drawdown: currentDrawdown * -1,
                    hitTP: hitTakeProfit ? 1 : 0,
                    hitSL: wasStoppedOut ? 1 : 0,
                    other: !hitTakeProfit && !wasStoppedOut ? 1 : 0,
                    count: 1
                } as any);
            }

            // Daily Average Aggregation
            if (!dailyMap[dateStr]) dailyMap[dateStr] = { total: 0, count: 0, totalPrice: 0, hitTP: 0, hitSL: 0, other: 0 };
            dailyMap[dateStr].total += clampedMvso;
            dailyMap[dateStr].count++;
            dailyMap[dateStr].hitTP += hitTakeProfit ? 1 : 0;
            dailyMap[dateStr].hitSL += wasStoppedOut ? 1 : 0;
            dailyMap[dateStr].other += (!hitTakeProfit && !wasStoppedOut) ? 1 : 0;
            // Use refPrice1020 as entry price proxy, consistent with MVSO calc
            dailyMap[dateStr].totalPrice += (rec.refPrice1020 || rec.open || 0);

            // 2. Move Distribution (use original mvso for distribution buckets)
            if (mvso < 0) analysis.distribution.negative++;
            else if (mvso < 2) analysis.distribution.flat++;
            else if (mvso < 5) analysis.distribution.small++;
            else if (mvso < 10) analysis.distribution.medium++;
            else analysis.distribution.large++;

            // 3. Day of Week Analysis
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const dayName = days[rec.date.getDay()];
            if (!analysis.dayOfWeek[dayName]) analysis.dayOfWeek[dayName] = { count: 0, totalMvso: 0, wins: 0 };
            analysis.dayOfWeek[dayName].count++;
            analysis.dayOfWeek[dayName].totalMvso += clampedMvso;
            if (isWin) analysis.dayOfWeek[dayName].wins++;

            // Ticker Analysis (Keep for leaderboard)
            const ticker = rec.symbol;
            if (!analysis.tickers[ticker]) analysis.tickers[ticker] = { count: 0, totalMvso: 0, wins: 0 };
            analysis.tickers[ticker].count++;
            analysis.tickers[ticker].totalMvso += clampedMvso;
            if (isWin) analysis.tickers[ticker].wins++;

            // --- Sectors (Restored) ---
            const sector = rec.sector || 'Unknown';
            if (!analysis.sectors[sector]) analysis.sectors[sector] = { count: 0, totalMvso: 0, wins: 0 };
            analysis.sectors[sector].count++;
            analysis.sectors[sector].totalMvso += clampedMvso;
            if (isWin) analysis.sectors[sector].wins++;



            // Volume Scatter (Keep - use original mvso for scatter display)
            if (rec.relativeVol) {
                analysis.volume.push({ x: rec.relativeVol, y: clampedMvso, rvol: rec.relativeVol });
            }

            // Trade Returns for Box Plot (Granular Data - both raw and clamped)
            analysis.tradeReturns.push({
                date: dateStr,
                return: clampedMvso,
                rawReturn: mvso, // Raw return without TP/SL
                probability: rec.probabilityValue || 70
            });
        }

        // Format Day of Week Order
        const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        const formattedDays = dayOrder.map(day => ({
            name: day,
            count: analysis.dayOfWeek[day]?.count || 0,
            avgMvso: analysis.dayOfWeek[day] ? parseFloat((analysis.dayOfWeek[day].totalMvso / analysis.dayOfWeek[day].count).toFixed(2)) : 0,
            winRate: analysis.dayOfWeek[day] ? parseFloat(((analysis.dayOfWeek[day].wins / analysis.dayOfWeek[day].count) * 100).toFixed(1)) : 0
        }));

        // Format Distribution
        const formattedDistribution = [
            { name: '< 0%', count: analysis.distribution.negative },
            { name: '0-2%', count: analysis.distribution.flat },
            { name: '2-5%', count: analysis.distribution.small },
            { name: '5-10%', count: analysis.distribution.medium },
            { name: '> 10%', count: analysis.distribution.large },
        ];

        // Format Tickers
        const formattedTickers = Object.entries(analysis.tickers).map(([name, data]) => ({
            name,
            count: data.count,
            avgMvso: parseFloat((data.totalMvso / data.count).toFixed(2)),
            winRate: parseFloat(((data.wins / data.count) * 100).toFixed(1))
        })).sort((a, b) => b.count - a.count);

        // Process Daily Averages
        // Process Daily Averages
        analysis.dailyAverages = Object.entries(dailyMap).map(([date, data]) => ({
            date,
            avgReturn: parseFloat((data.total / data.count).toFixed(2)),
            avgPrice: parseFloat((data.totalPrice / data.count).toFixed(2)),
            count: data.count
        })).sort((a, b) => a.date.localeCompare(b.date));

        const formattedSectors = Object.entries(analysis.sectors).map(([name, data]) => ({
            name,
            count: data.count,
            avgMvso: parseFloat((data.totalMvso / data.count).toFixed(2)),
            winRate: parseFloat(((data.wins / data.count) * 100).toFixed(1))
        })).sort((a, b) => b.avgMvso - a.avgMvso); // Sort by profitability

        const profitFactor = grossLoss === 0 ? grossWin : grossWin / grossLoss;

        res.json({
            equityCurve: analysis.cumulativePerformance,
            dailyAverages: analysis.dailyAverages,
            distribution: formattedDistribution,
            seasonality: formattedDays,
            topTickers: formattedTickers.slice(0, 10),
            topSectors: formattedSectors.slice(0, 5),
            volume: analysis.volume,
            tradeReturns: analysis.tradeReturns, // NEW: For Box Plot
            debugVersion: analysis.debugVersion, // NEW: For version check
            riskMetrics: {
                profitFactor: parseFloat(profitFactor.toFixed(2)),
                maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
                maxWinStreak,
                maxLossStreak,
                totalReturn: parseFloat(cumulativeReturn.toFixed(2))
            }
        });

    } catch (error) {
        console.error('Error in analysis endpoint:', error);
        res.status(500).json({ error: 'Failed to generate analysis' });
    }
});




// Admin: Refresh or Delete Intraday Data for a specific date
// Dedicated Diagnostic Endpoint
app.get('/api/admin/diagnose-ticker', async (req, res) => {
    try {
        const { symbol, date } = req.query;
        if (!symbol || !date) return res.status(400).json({ error: 'Missing symbol or date' });

        const dateStr = date as string;
        const ticker = symbol as string;

        console.log(`[Diagnostic] checking ${ticker} on ${dateStr}`);

        // 1. Fetch raw Polygon data
        const stats = await getIntradayStats(ticker, dateStr);

        // 2. Check DB state
        const dbRec = await prisma.recommendation.findUnique({
            where: { symbol_date: { symbol: ticker, date: new Date(dateStr) } }
        });

        res.json({
            status: 'Diagnostic Run',
            inputs: { ticker, dateStr },
            polygon_calculation: stats,
            db_current_state: dbRec,
            server_time: new Date().toISOString(),
            timezone_check: new Date().toLocaleString("en-US", { timeZone: "America/New_York" })
        });

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: (e as any).message });
    }
});

app.post('/api/admin/refresh-day', async (req, res) => {
    try {
        const { date, action } = req.query;
        if (!date) return res.status(400).json({ error: 'Date is required (YYYY-MM-DD)' });

        const dateStr = date as string;
        console.log(`[Admin] Managing data for ${dateStr} (Action: ${action || 'refresh'})...`);

        const startOfDay = new Date(dateStr);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(dateStr);
        endOfDay.setUTCHours(23, 59, 59, 999);

        const recs = await prisma.recommendation.findMany({
            where: { date: { gte: startOfDay, lte: endOfDay } }
        });

        console.log(`[Admin] Found ${recs.length} records.`);

        if (action === 'delete') {
            if (recs.length > 0) {
                const ids = recs.map(r => r.id);
                await prisma.recommendation.deleteMany({ where: { id: { in: ids } } });
                console.log(`[Admin] Deleted ${ids.length} records.`);
                return res.json({ success: true, count: ids.length, message: 'Records deleted successfully.' });
            } else {
                return res.json({ success: true, count: 0, message: 'No records found to delete.' });
            }
        }

        if (recs.length > 0) {
            console.log(`[Admin] Starting refresh for ${recs.length} records...`);
            let updatedCount = 0;

            for (const rec of recs) {
                try {
                    // Rate limit prevention
                    await new Promise(resolve => setTimeout(resolve, 200));

                    const intraday = await getIntradayStats(rec.symbol, dateStr);
                    if (intraday) {
                        const updateData: any = {};
                        if (intraday.mvso1020) {
                            updateData.refPrice1020 = intraday.mvso1020.refPrice;
                            updateData.high = intraday.mvso1020.highPost;
                            updateData.lowBeforePeak = intraday.mvso1020.lowBeforePeak;
                        }
                        if (intraday.mvso1120) {
                            updateData.refPrice1120 = intraday.mvso1120.refPrice;
                            updateData.highPost1120 = intraday.mvso1120.highPost;
                        }
                        if (intraday.mvso1220) {
                            updateData.refPrice1220 = intraday.mvso1220.refPrice;
                            updateData.highPost1220 = intraday.mvso1220.highPost;
                        }

                        if (Object.keys(updateData).length > 0) {
                            await prisma.recommendation.update({
                                where: { id: rec.id },
                                data: updateData
                            });
                            updatedCount++;
                        }
                    }
                } catch (err) {
                    console.error(`[Admin] Error updating ${rec.symbol}:`, err);
                }
            }
            console.log(`[Admin] Refreshed ${updatedCount} records.`);
        }

        res.json({ success: true, count: recs.length, message: 'Refresh process triggered in background (awaited).' });
    } catch (error) {
        console.error('[Admin] Error refreshing/deleting day:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Upload Recommendations (File Upload with Polygon Enrichment)
import multer from 'multer';
const upload = multer({ storage: multer.memoryStorage() });

app.post('/api/recommendations/upload', upload.array('files'), async (req, res) => {
    try {
        if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        const files = req.files as Express.Multer.File[];
        console.log(`[Upload] Processing ${files.length} files`);

        let totalSuccess = 0;
        let totalErrors = 0;
        const allErrors: any[] = [];

        for (const file of files) {
            console.log(`[Upload] Processing file: ${file.originalname}`);

            // Parse CSV
            const csvContent = file.buffer.toString('utf-8');

            // Auto-detect delimiter (comma or semicolon)
            const firstLine = csvContent.split('\n')[0];
            const delimiter = firstLine.includes(';') ? ';' : ',';

            console.log(`[Upload] Detected delimiter: "${delimiter}" for ${file.originalname}`);

            const records = parse(csvContent, {
                columns: true,
                skip_empty_lines: true,
                cast: false,  // Disable auto-cast to handle European number format manually
                cast_date: false,
                delimiter: delimiter,
                relax_quotes: true
            });

            if (records.length === 0) {
                console.warn(`[Upload] File ${file.originalname} is empty`);
                continue;
            }

            console.log(`[Upload] Processing ${records.length} recommendations from ${file.originalname}`);

            for (const rec of records) {
                try {
                    // Map CSV columns to our format
                    const symbol = (rec as any).Ticker || (rec as any).ticker;
                    const openStr = String((rec as any).Open || (rec as any).open);
                    const dateStr = (rec as any).Date || (rec as any).date;
                    const volumeStr = String((rec as any).voltotal || (rec as any).volume);
                    const probMediaStr = String((rec as any).prob_media || (rec as any).probability);

                    // Convert European number format (comma as decimal) to US format
                    const parseNumber = (str: string): number => {
                        if (!str) return 0;
                        // Replace comma with dot for decimals
                        const normalized = String(str).replace(',', '.');
                        return parseFloat(normalized) || 0;
                    };

                    const open = parseNumber(openStr);
                    const volume = parseNumber(volumeStr);
                    const probMedia = parseNumber(probMediaStr);

                    if (!symbol || !dateStr) {
                        throw new Error('Missing required fields: Ticker or Date');
                    }

                    const date = new Date(dateStr);

                    // Enrich with Polygon data
                    let details: any = {};
                    let sector = 'Unknown';
                    let name = symbol;
                    let marketCap = 0;
                    let beta = 1.0;
                    let rsi = 50;
                    let changePercent = 0;
                    let actualVolume = volume; // Start with CSV volume
                    let high = open; // Default high to open

                    // 1. Get ticker details (name, sector, market cap)
                    try {
                        details = await fetchTickerDetails(symbol);
                        sector = details?.sector || 'Unknown';
                        name = details?.name || symbol;
                        marketCap = details?.market_cap ? details.market_cap / 1_000_000_000_000 : 0;
                    } catch (err) {
                        console.warn(`Could not fetch details for ${symbol}, using defaults`);
                    }

                    // 2. Get daily stats for the date (to get changePercent, high, etc.)
                    try {
                        const stats = await fetchDailyStats(symbol, dateStr);
                        if (stats) {
                            // Calculate changePercent from daily stats
                            if (stats.close && stats.open) {
                                changePercent = ((stats.close - stats.open) / stats.open) * 100;
                            }
                            // Use actual volume from Polygon if available
                            actualVolume = stats.volume || volume;
                            high = stats.high || open;
                        }
                    } catch (err) {
                        console.warn(`Could not fetch daily stats for ${symbol} on ${dateStr}`);
                    }

                    // 3. Get Intraday Stats (Ref Price 10:20 & High Post-10:20)
                    let refPrice1020: number | undefined = undefined;
                    let refPrice1120: number | undefined = undefined;
                    let highPost1120: number | undefined = undefined;
                    let refPrice1220: number | undefined = undefined;
                    let highPost1220: number | undefined = undefined;
                    let lowBeforePeak: number | undefined = undefined;

                    try {
                        const intraday = await getIntradayStats(symbol, dateStr);
                        if (intraday) {
                            if (intraday.mvso1020) {
                                refPrice1020 = intraday.mvso1020.refPrice;
                                high = intraday.mvso1020.highPost; // OVERRIDE high with post-10:20 high
                                lowBeforePeak = intraday.mvso1020.lowBeforePeak;
                            }
                            if (intraday.mvso1120) {
                                refPrice1120 = intraday.mvso1120.refPrice;
                                highPost1120 = intraday.mvso1120.highPost;
                            }
                            if (intraday.mvso1220) {
                                refPrice1220 = intraday.mvso1220.refPrice;
                                highPost1220 = intraday.mvso1220.highPost;
                            }
                            console.log(`[Upload] Got intraday stats for ${symbol}: Ref1020=${refPrice1020}, High1020=${high}`);
                        }
                    } catch (err) {
                        console.warn(`Could not fetch intraday stats for ${symbol} on ${dateStr}`);
                    }

                    // Calculate probability value (0-1 to 0-100)
                    const probabilityValue = Math.round(probMedia * 100);

                    // Determine probability text
                    let probability = 'Medium';
                    if (probabilityValue >= 80) probability = 'High';
                    else if (probabilityValue < 70) probability = 'Low';

                    // Calculate stop loss and target based on probability
                    const stopLoss = open * 0.95;
                    const priceTarget = open * 1.10;

                    // Determine sentiment based on probability
                    const sentiment = probabilityValue >= 80 ? 'Bullish' : probabilityValue >= 70 ? 'Neutral' : 'Bearish';

                    // Upsert to database
                    await prisma.recommendation.upsert({
                        where: {
                            symbol_date: { symbol, date }
                        },
                        update: {
                            name,
                            open, // Opening price from CSV
                            price: open, // For historical data, price = open (will be updated with RT for today)
                            high, // High from Polygon or default to open (Stores 10:20 Max Excursion)
                            refPrice1020, // 10:20 AM reference price from Polygon
                            lowBeforePeak,
                            refPrice1120,
                            highPost1120,
                            refPrice1220,
                            highPost1220,
                            changePercent, // From Polygon daily stats
                            volume: actualVolume, // From Polygon or CSV
                            relativeVol: volume, // Use voltotal from CSV as relative volume
                            marketCap,
                            sector,
                            type: 'Intraday',
                            probability,
                            probabilityValue,
                            time: '09:30 AM',
                            stopLoss,
                            priceTarget,
                            thesis: `Auto-generated from CSV upload. Probability: ${probMedia.toFixed(2)}`,
                            catalyst: null,
                            rsi,
                            beta,
                            earningsDate: null,
                            analystRating: 'Hold',
                            sentiment
                        },
                        create: {
                            symbol,
                            name,
                            date,
                            open, // Opening price from CSV
                            price: open, // For historical data, price = open (will be updated with RT for today)
                            high, // High from Polygon or default to open (Stores 10:20 Max Excursion)
                            refPrice1020, // 10:20 AM reference price from Polygon
                            lowBeforePeak,
                            refPrice1120,
                            highPost1120,
                            refPrice1220,
                            highPost1220,
                            changePercent, // From Polygon daily stats
                            volume: actualVolume, // From Polygon or CSV
                            relativeVol: volume, // Use voltotal from CSV as relative volume
                            marketCap,
                            sector,
                            type: 'Intraday',
                            probability,
                            probabilityValue,
                            time: '09:30 AM',
                            stopLoss,
                            priceTarget,
                            thesis: `Auto-generated from CSV upload. Probability: ${probMedia.toFixed(2)}`,
                            catalyst: null,
                            rsi,
                            beta,
                            earningsDate: null,
                            analystRating: 'Hold',
                            sentiment
                        }
                    });

                    totalSuccess++;
                } catch (error: any) {
                    totalErrors++;
                    allErrors.push({
                        file: file.originalname,
                        symbol: (rec as any).Ticker || (rec as any).ticker || 'Unknown',
                        error: error.message
                    });
                    console.error(`[Upload] Error processing record in ${file.originalname}:`, error.message);
                }
            }
        }

        res.json({
            success: true,
            message: `Upload complete: ${totalSuccess} succeeded, ${totalErrors} failed across ${files.length} files`,
            successCount: totalSuccess,
            errorCount: totalErrors,
            errors: totalErrors > 0 ? allErrors : undefined
        });

    } catch (error: any) {
        console.error('[Upload] Fatal error:', error);
        res.status(500).json({ error: 'Upload failed: ' + error.message });
    }
});

// Backfill 10:20 Data Endpoint
app.post('/api/admin/backfill-1020', async (req, res) => {
    try {
        console.log('[Backfill] Starting backfill of 10:20 data...');

        // 1. Get all recommendations
        const allRecs = await prisma.recommendation.findMany();
        console.log(`[Backfill] Found ${allRecs.length} recommendations to check.`);

        let updatedCount = 0;
        let errorCount = 0;

        for (const rec of allRecs) {
            // Skip if already has refPrice1020 (optional, but user wants to fix existing bad data, so maybe force update?)
            // Let's force update to ensure logic is applied.

            const dateStr = format(rec.date, 'yyyy-MM-dd');

            try {
                // Rate limit prevention (simple pause)
                await new Promise(resolve => setTimeout(resolve, 200));

                const intraday = await getIntradayStats(rec.symbol, dateStr);

                if (intraday) {
                    const updateData: any = {};

                    if (intraday.mvso1020) {
                        updateData.refPrice1020 = intraday.mvso1020.refPrice;
                        updateData.high = intraday.mvso1020.highPost; // 10:20 Max Excursion
                        updateData.lowBeforePeak = intraday.mvso1020.lowBeforePeak;
                    }
                    if (intraday.mvso1120) {
                        updateData.refPrice1120 = intraday.mvso1120.refPrice;
                        updateData.highPost1120 = intraday.mvso1120.highPost;
                    }
                    if (intraday.mvso1220) {
                        updateData.refPrice1220 = intraday.mvso1220.refPrice;
                        updateData.highPost1220 = intraday.mvso1220.highPost;
                    }

                    if (Object.keys(updateData).length > 0) {
                        await prisma.recommendation.update({
                            where: { id: rec.id },
                            data: updateData
                        });
                        console.log(`[Backfill] Updated ${rec.symbol} on ${dateStr}`);
                        updatedCount++;
                    }
                } else {
                    console.warn(`[Backfill] No data for ${rec.symbol} on ${dateStr}`);
                }
            } catch (err) {
                console.error(`[Backfill] Error updating ${rec.symbol} on ${dateStr}:`, err);
                errorCount++;
            }
        }

        res.json({
            success: true,
            message: `Backfill complete. Updated: ${updatedCount}, Errors: ${errorCount}`
        });

    } catch (error) {
        console.error('[Backfill] Fatal error:', error);
        res.status(500).json({ error: 'Backfill failed' });
    }
});

// ==================== TRADING AUTOMATION ENDPOINTS ====================

// Get trading config
app.get('/api/trading/config', async (req, res) => {
    try {
        let config = await prisma.tradingConfig.findFirst();
        if (!config) {
            config = await prisma.tradingConfig.create({
                data: {
                    takeProfit: 3.0,
                    stopLoss: 5.0,
                    maxStocks: 10,
                    minVolume: 1000000,
                    minPrice: 5.0,
                    maxGainSkip: 1.0,
                    prioritizeBelowRef: true,
                    retryIntervalMinutes: 1,
                    maxRetries: 10,
                    executionHour: 10,
                    executionMinute: 25,
                    enabled: false,
                },
            });
        }
        res.json(config);
    } catch (error) {
        console.error('[Trading Config] Error:', error);
        res.status(500).json({ error: 'Failed to get trading config' });
    }
});

// Update trading config
app.put('/api/trading/config', async (req, res) => {
    try {
        const {
            takeProfit, stopLoss, maxStocks, minVolume, minPrice,
            maxGainSkip, prioritizeBelowRef, retryIntervalMinutes, maxRetries,
            executionHour, executionMinute, enabled
        } = req.body;

        let config = await prisma.tradingConfig.findFirst();
        const updateData = {
            takeProfit, stopLoss, maxStocks, minVolume, minPrice,
            maxGainSkip, prioritizeBelowRef, retryIntervalMinutes, maxRetries,
            executionHour, executionMinute, enabled
        };

        // Remove undefined values
        Object.keys(updateData).forEach(key => {
            if ((updateData as any)[key] === undefined) {
                delete (updateData as any)[key];
            }
        });

        if (!config) {
            config = await prisma.tradingConfig.create({ data: updateData as any });
        } else {
            config = await prisma.tradingConfig.update({
                where: { id: config.id },
                data: updateData,
            });
        }
        res.json(config);
    } catch (error) {
        console.error('[Trading Config] Update error:', error);
        res.status(500).json({ error: 'Failed to update trading config' });
    }
});

// Get trade logs
app.get('/api/trading/logs', async (req, res) => {
    try {
        const logs = await prisma.tradeLog.findMany({
            orderBy: { executedAt: 'desc' },
            take: 100,
        });
        res.json(logs);
    } catch (error) {
        console.error('[Trade Logs] Error:', error);
        res.status(500).json({ error: 'Failed to get trade logs' });
    }
});

// Get real-time IBKR positions and orders (requires IB Gateway running)
app.get('/api/trading/positions', async (req, res) => {
    try {
        // Dynamic import to avoid errors when IBKR not installed
        const { getIBKRService } = await import('./services/ibkr_service');
        const ibkr = getIBKRService();

        const connected = await ibkr.connect();
        if (!connected) {
            return res.json({ connected: false, positions: [], orders: [], message: 'IB Gateway not available' });
        }

        const [positions, orders] = await Promise.all([
            ibkr.getPositions(),
            ibkr.getOpenOrders(),
        ]);

        res.json({
            connected: true,
            positions,
            orders,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[IBKR Positions] Error:', error);
        res.json({ connected: false, positions: [], orders: [], error: 'Failed to get positions' });
    }
});

app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);

});

