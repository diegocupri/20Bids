import axios from 'axios';
import dotenv from 'dotenv';
import { format } from 'date-fns';

dotenv.config();

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

    // Hours check (9:30 - 16:00). Was 15:30 — half an hour short of the
    // close and inconsistent with intraday-poller's version.
    const time = hour * 100 + minute;
    return time >= 930 && time < 1600;
}

const BASE_URL = 'https://api.polygon.io';

export async function getReferencePrice(ticker: string, dateStr: string): Promise<number | null> {
    const API_KEY = process.env.POLYGON_API_KEY;
    if (!API_KEY) return null;
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
                limit: 50000 // Increased limit to ensure we get the day
            }
        });

        if (res.data.results) {
            // Find bar closest to 10:20 AM ET
            const targetRef = res.data.results.find((bar: any) => {
                const barDate = new Date(bar.t);
                const barET = new Date(barDate.toLocaleString("en-US", { timeZone: "America/New_York" }));
                const h = barET.getHours();
                const m = barET.getMinutes();
                // First REGULAR-SESSION bar at/after 10:20 (h < 16 keeps a
                // halted name from matching an after-hours bar).
                return h < 16 && ((h > 10) || (h === 10 && m >= 20));
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

/** Waypoints for one entry time.
 *  - closePost:    the REAL post-entry regular-session close. `Recommendation.price`
 *                  holds the 09:30 open on historical rows, so it must never be
 *                  used as a backtest exit.
 *  - lowAfterPeak: lowest low after the peak — lets a post-peak stop be detected.
 *  - peakAt:       the minute of the peak (was computed and discarded).
 *  - firstCross:   gain level -> minutes after entry of the FIRST touch.
 *  - entryPath:    price at fixed minute offsets after entry.
 *  - low30/high30: extremes of the first 30 minutes after entry. */
export interface IntradayWaypoints {
    refPrice: number;
    highPost: number;
    lowBeforePeak: number;
    closePost: number | null;
    lowAfterPeak: number | null;
    peakAt: Date | null;
    firstCross: Record<string, number>;
    /** level -> max adverse excursion (%) BEFORE that level was first touched. */
    maeBeforeCross: Record<string, number>;
    /** minutes after entry -> price, at 5-minute steps up to +30. Lets a
     *  client-side simulator reprice a DELAYED entry without re-downloading
     *  the minute bars. */
    entryPath: Record<string, number>;
    /** Lowest low / highest high within +30 min of entry. A below-ref LIMIT
     *  order only fills if the tape actually traded there, which neither
     *  lowBeforePeak (spans entry→peak) nor highPost (full session) can say. */
    low30: number | null;
    high30: number | null;
}

export async function getIntradayStats(ticker: string, dateStr: string): Promise<{
    mvso1020: IntradayWaypoints | null,
    mvso1120: IntradayWaypoints | null,
    mvso1220: IntradayWaypoints | null
} | null> {
    const API_KEY = process.env.POLYGON_API_KEY;
    if (!API_KEY) return null;

    // Fetch 1-minute bars for the entire day
    try {
        const url = `${BASE_URL}/v2/aggs/ticker/${ticker}/range/1/minute/${dateStr}/${dateStr}`;
        console.log(`[Polygon] Fetching intraday stats for ${ticker} on ${dateStr}`);
        const res = await axios.get(url, {
            params: {
                apiKey: API_KEY,
                sort: 'asc',
                limit: 50000
            }
        });

        if (res.data.results && res.data.results.length > 0) {
            const bars = res.data.results;

            const calculateMvso = (targetHour: number, targetMinute: number) => {
                // Entry = CLOSE of the first REGULAR-SESSION bar at/after the
                // target time. The `h < 16` bound matters for halted/illiquid
                // names: without it, a stock with no prints between the target
                // and the close would match its first AFTER-HOURS bar and the
                // ref would silently be an extended-hours price.
                const refBarIndex = bars.findIndex((bar: any) => {
                    const barDate = new Date(bar.t);
                    const barET = new Date(barDate.toLocaleString("en-US", { timeZone: "America/New_York" }));
                    const h = barET.getHours();
                    const m = barET.getMinutes();
                    return h < 16 && ((h > targetHour) || (h === targetHour && m >= targetMinute));
                });

                if (refBarIndex === -1) return null;
                const refPrice = bars[refBarIndex].c;

                // Scan the post-entry regular session (next bar → 15:59 ET;
                // the 16:00 closing-auction bar is intentionally excluded —
                // the strategy's exit convention is "before the close").
                // Track BOTH the peak high and the session low after entry.
                let maxHighAfter = -Infinity;
                let highBarIndex = -1;
                let sessionLowAfterEntry = Infinity;
                // The real post-entry CLOSE. Historical rows store the 09:30
                // OPEN in `price` (the CSV backfill writes `price: open`), so
                // the backtest was settling ~38% of trades against a price from
                // 50 minutes BEFORE entry. This is the honest exit.
                let closePost: number | null = null;
                // First time each gain level is touched, in minutes after entry.
                // A running maximum censors the first touch, so it has to be
                // recorded while walking the bars — this is what makes
                // "time to target" answerable at all.
                const CROSS_LEVELS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5];
                const firstCross: Record<string, number> = {};
                // Max adverse excursion BEFORE each level is first touched.
                // This is what makes exit ORDER decidable: a stop only really
                // fired if the price fell to −SL *before* reaching +TP.
                // `lowBeforePeak` alone cannot answer that — it spans entry to
                // the PEAK, which is often hours after the TP already filled,
                // so it booked winners as stop-outs.
                const maeBeforeCross: Record<string, number> = {};
                let runMinLow = Infinity;
                // Entry path: the price a LATE entry would have paid, sampled
                // every PATH_STEP minutes. An offset is filled by the first bar
                // in [off, off + PATH_STEP) — a market order sent at +off fills
                // on the next print, not on a print that already happened. If
                // the tape is silent for a whole bucket the offset stays MISSING
                // rather than being forward-filled from minutes later, which
                // would quote a price no order could have got.
                const PATH_STEP = 5;
                const PATH_OFFSETS = [5, 10, 15, 20, 25, 30];
                const entryPath: Record<string, number> = {};
                // Extremes of the same +30 window, for limit-order fill checks.
                let low30 = Infinity;
                let high30 = -Infinity;
                const entryT = bars[refBarIndex].t;

                for (let i = refBarIndex + 1; i < bars.length; i++) {
                    const b = bars[i];
                    const bDate = new Date(b.t);
                    const bET = new Date(bDate.toLocaleString("en-US", { timeZone: "America/New_York" }));
                    if (bET.getHours() >= 16) break; // stop at market close

                    const mins = Math.round((b.t - entryT) / 60000);
                    if (mins <= 30) {
                        if (b.l < low30) low30 = b.l;
                        if (b.h > high30) high30 = b.h;
                    }
                    for (const off of PATH_OFFSETS) {
                        const key = String(off);
                        if (entryPath[key] === undefined && mins >= off && mins < off + PATH_STEP) {
                            entryPath[key] = b.c;
                        }
                    }

                    if (b.h > maxHighAfter) {
                        maxHighAfter = b.h;
                        highBarIndex = i;
                    }
                    if (b.l < sessionLowAfterEntry) sessionLowAfterEntry = b.l;
                    closePost = b.c; // last regular-session bar wins

                    // Update the running low BEFORE testing the cross: within
                    // the crossing bar we cannot know whether the low or the
                    // high came first, so we assume the dip did. That biases
                    // toward booking a stop — the conservative direction.
                    if (b.l < runMinLow) runMinLow = b.l;

                    for (const lvl of CROSS_LEVELS) {
                        const key = String(lvl);
                        if (firstCross[key] === undefined && b.h >= refPrice * (1 + lvl / 100)) {
                            firstCross[key] = mins;
                            maeBeforeCross[key] = runMinLow === Infinity
                                ? 0
                                : ((refPrice - runMinLow) / refPrice) * 100;
                        }
                    }
                }
                const highPost = maxHighAfter === -Infinity ? refPrice : maxHighAfter;

                // The minute of the peak. This was already computed and thrown
                // away; keeping it is what unlocks peak-timing analysis.
                const peakAt = highBarIndex !== -1 ? new Date(bars[highBarIndex].t) : null;

                // Lowest low AFTER the peak. Without it a trade that peaks
                // below TP, collapses through the stop and recovers into the
                // close is booked at the close instead of at -SL.
                let lowAfterPeak: number | null = null;
                if (highBarIndex !== -1) {
                    for (let j = highBarIndex + 1; j < bars.length; j++) {
                        const b = bars[j];
                        const bET = new Date(new Date(b.t).toLocaleString("en-US", { timeZone: "America/New_York" }));
                        if (bET.getHours() >= 16) break;
                        if (lowAfterPeak === null || b.l < lowAfterPeak) lowAfterPeak = b.l;
                    }
                }

                // lowBeforePeak = max adverse excursion (MAE):
                //   • Winning path (peak above entry): the lowest low between
                //     entry and the peak — the drawdown a trader sat through
                //     before the move paid off.
                //   • Losing path (no bar above entry): the session low after
                //     entry. The old code returned ~refPrice here (the "low
                //     before" a peak that never happened), reporting ~zero
                //     drawdown on exactly the days a stop-loss would have
                //     fired — which made the SL simulation in /api/stats
                //     systematically overstate performance.
                let lowBeforePeak: number;
                if (highBarIndex !== -1 && maxHighAfter > refPrice) {
                    let minLowBeforePeak = Infinity;
                    for (let j = refBarIndex + 1; j <= highBarIndex; j++) {
                        if (bars[j].l < minLowBeforePeak) minLowBeforePeak = bars[j].l;
                    }
                    lowBeforePeak = minLowBeforePeak === Infinity ? refPrice : minLowBeforePeak;
                } else {
                    lowBeforePeak = sessionLowAfterEntry === Infinity ? refPrice : sessionLowAfterEntry;
                }

                return {
                    refPrice, highPost, lowBeforePeak,
                    closePost: closePost ?? null,
                    lowAfterPeak,
                    peakAt,
                    firstCross,
                    maeBeforeCross,
                    entryPath,
                    low30: low30 === Infinity ? null : low30,
                    high30: high30 === -Infinity ? null : high30,
                };
            };

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
    const API_KEY = process.env.POLYGON_API_KEY;
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

/** Issuer reference data from the same /v3/reference/tickers endpoint
 *  fetchTickerDetails uses, but the *company* half of it: the long
 *  description plus the fields that hang off it. */
export interface CompanyProfile {
    name: string | null;
    description: string | null;      // full paragraph, untrimmed
    homepageUrl: string | null;
    totalEmployees: number | null;
    listDate: string | null;         // "YYYY-MM-DD", as Polygon sends it
}

// Process-lifetime cache, same shape as tickerDetailsCache above. A profile
// with a NULL description is cached too: that is Polygon's real answer for
// ETFs and many small caps, and re-asking every time would burn the reference
// quota on symbols that will never have one.
let companyProfileCache: Record<string, CompanyProfile> = {};

// The reference endpoint is rate-limited harder than aggregates (5 req/min on
// the free tier). The batch loops elsewhere in this file pace with a sleep
// between fixed-size batches, which only works because those callers control
// the fan-out; profile calls arrive one symbol at a time from the backfill and
// from request handlers, so the pacing has to live here.
const PROFILE_MIN_INTERVAL_MS = 200;
let profileGate: Promise<unknown> = Promise.resolve();

function paceProfileCall<T>(fn: () => Promise<T>): Promise<T> {
    const run = profileGate.then(fn);
    // The next caller waits for this one *and* the interval regardless of
    // outcome — a burst of 429s is exactly when the queue must not drain fast.
    profileGate = run
        .then(() => undefined, () => undefined)
        .then(() => new Promise(resolve => setTimeout(resolve, PROFILE_MIN_INTERVAL_MS)));
    return run;
}

/** Fetch a company profile. Returns null when the REQUEST failed (network,
 *  429, 404) — the caller must treat that as "unknown, retry later". A
 *  resolved object with `description: null` is a real, cacheable answer:
 *  Polygon knows the symbol and simply has no description for it. */
export async function fetchCompanyProfile(ticker: string): Promise<CompanyProfile | null> {
    const API_KEY = process.env.POLYGON_API_KEY;
    if (!API_KEY) return null;
    if (companyProfileCache[ticker]) return companyProfileCache[ticker];

    try {
        const url = `${BASE_URL}/v3/reference/tickers/${ticker}`;
        console.log(`[Polygon] Fetching company profile for ${ticker}`);
        const res = await paceProfileCall(() => axios.get(url, { params: { apiKey: API_KEY } }));

        const r = res.data?.results;
        if (!r) return null;

        const description = typeof r.description === 'string' && r.description.trim()
            ? r.description.trim()
            : null;

        const profile: CompanyProfile = {
            name: r.name ?? null,
            description,
            homepageUrl: r.homepage_url ?? null,
            totalEmployees: typeof r.total_employees === 'number' ? r.total_employees : null,
            listDate: typeof r.list_date === 'string' ? r.list_date : null,
        };
        companyProfileCache[ticker] = profile;
        return profile;
    } catch (e) {
        console.error(`Error fetching company profile for ${ticker}:`, (e as any).message);
        return null;
    }
}

// Periods that do NOT end a sentence. Polygon's descriptions are dense with
// these ("Apple Inc. designs…"), and a naive split on ". " decapitates the
// very first sentence of most rows.
const NON_TERMINAL_ABBREV = /\b(?:Inc|Corp|Cos|Co|Ltd|LLC|LP|PLC|AG|NV|SA|Bros|Mfg|Dept|Div|Est|No|St|Jr|Sr|Dr|Mr|Ms|vs|etc|approx|U\.S|U\.K|E\.U|Ph\.D)\./g;
// Stand-in for a masked period while the text is being sliced. NUL cannot
// occur in Polygon's prose, so the unmask at the end is lossless.
const ABBREV_DOT = '\u0000';

/** Cut a Polygon description down to the lede the card shows.
 *  Trimming lives here, on the read path, NOT in the column: the stored text
 *  is the full paragraph, so changing "3 sentences" to "2" or adding a
 *  "read more" is a deploy, not a re-fetch of the whole universe. */
export function shortDescription(
    full: string | null | undefined,
    maxSentences = 3,
    // A Polygon sentence averages ~130 chars, so 400 is a backstop against a
    // run-on first sentence — not the usual cut. Keeping it above 3×130 means
    // a normal lede ends on a period instead of an ellipsis.
    maxChars = 400
): string | null {
    if (!full) return null;
    const text = full.replace(/\s+/g, ' ').trim();
    if (!text) return null;

    // Mask abbreviation periods (and single-letter initials) so the sentence
    // matcher can't break on them, then unmask after slicing.
    const masked = text
        .replace(NON_TERMINAL_ABBREV, m => m.split('.').join(ABBREV_DOT))
        .replace(/\b([A-Z])\./g, `$1${ABBREV_DOT}`);

    // No lookbehind: tsconfig targets es2016 and TS rejects it.
    const sentences = masked.match(/[^.!?]+[.!?]+(\s|$)/g);
    let out = (sentences ? sentences.slice(0, maxSentences).join('') : masked).trim();
    out = out.split(ABBREV_DOT).join('.');

    if (out.length > maxChars) {
        const cut = out.lastIndexOf(' ', maxChars);
        out = out.slice(0, cut > 0 ? cut : maxChars).replace(/[\s,;:.]+$/, '') + '…';
    }
    return out;
}

export async function fetchGroupedDaily(date: string) {
    const API_KEY = process.env.POLYGON_API_KEY;
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
    const API_KEY = process.env.POLYGON_API_KEY;
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
    const API_KEY = process.env.POLYGON_API_KEY;
    if (!API_KEY) return {};
    if (tickers.length === 0) return {};

    try {
        const etNow = getETDate();
        const dateStr = format(etNow, 'yyyy-MM-dd');
        const isBefore1020 = (etNow.getHours() < 10) || (etNow.getHours() === 10 && etNow.getMinutes() < 20);

        const updates: Record<string, { price: number, change: number, refPrice1020?: number, volume: number, open: number, high: number }> = {};

        // Fetch individual ticker snapshots to avoid OOM from loading all market data
        // Process in small batches to avoid rate limiting
        const BATCH_SIZE = 10;

        for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
            const batch = tickers.slice(i, i + BATCH_SIZE);

            // Fetch each ticker individually (more API calls but much less memory)
            const promises = batch.map(async (ticker) => {
                try {
                    const snapshotUrl = `${BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`;
                    const res = await axios.get(snapshotUrl, {
                        params: { apiKey: API_KEY }
                    });

                    const t = res.data.ticker;
                    if (!t) return null;

                    const currentPrice = t.lastTrade?.p || t.day?.c || t.prevDay?.c;
                    if (!currentPrice) return null;

                    let change = t.todaysChangePerc;
                    let refPrice1020 = undefined;

                    if (!isBefore1020) {
                        let refPrice = await getReferencePrice(ticker, dateStr);
                        if (refPrice) {
                            refPrice1020 = refPrice;
                            change = ((currentPrice - refPrice) / refPrice) * 100;
                        }
                    }

                    return {
                        ticker,
                        data: {
                            price: currentPrice,
                            change: change,
                            refPrice1020: refPrice1020,
                            volume: t.day?.v || 0,
                            open: t.day?.o || t.prevDay?.c || 0,
                            high: t.day?.h || 0
                        }
                    };
                } catch (e) {
                    console.error(`Error fetching snapshot for ${ticker}:`, (e as any).message);
                    return null;
                }
            });

            const results = await Promise.all(promises);
            for (const result of results) {
                if (result) {
                    updates[result.ticker] = result.data;
                }
            }

            // Small delay between batches to avoid rate limiting
            if (i + BATCH_SIZE < tickers.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
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
    const API_KEY = process.env.POLYGON_API_KEY;
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
// Add this to the END of `server/src/services/polygon.ts`. It's purely additive.
// Requires the existing POLYGON_API_KEY env var (already used by the file).


const POLYGON_BASE = 'https://api.polygon.io';
const API_KEY = process.env.POLYGON_API_KEY;

export type AggregateRange = '1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL';

interface RangeSpec {
    multiplier: number;
    timespan: 'minute' | 'hour' | 'day' | 'week' | 'month';
    from: () => Date;
    to?: () => Date;
}

function daysAgo(n: number): Date {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - n);
    return d;
}

/** Epoch ms of a given ET wall-clock time on TODAY's ET date, DST-aware
 * (IANA roundtrip — no fixed offset; the old startOfTodayET hardcoded
 * 13:30 UTC, which is an hour off during EST). */
function etTodayMs(hour: number, minute: number): number {
    return etSessionMs(new Date(), hour, minute);
}

/** Epoch ms for a given ET wall-clock time on a given DAY. Same DST-safe
 * offset trick as etTodayMs, but for an arbitrary date — needed so a 1D chart
 * can be pinned to a past session instead of always meaning "today". */
function etSessionMs(day: Date, hour: number, minute: number): number {
    const ny = new Date(day.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const utc = new Date(day.toLocaleString('en-US', { timeZone: 'UTC' }));
    const offsetMs = ny.getTime() - utc.getTime(); // −4h EDT / −5h EST
    return Date.UTC(ny.getFullYear(), ny.getMonth(), ny.getDate(), hour, minute) - offsetMs;
}

const RANGE_SPECS: Record<AggregateRange, RangeSpec> = {
    '1D':  { multiplier: 5,  timespan: 'minute', from: () => new Date() /* unused — 1D uses ms session bounds below */ },
    '1W':  { multiplier: 30, timespan: 'minute', from: () => daysAgo(7) },
    '1M':  { multiplier: 1,  timespan: 'day',    from: () => daysAgo(30) },
    '3M':  { multiplier: 1,  timespan: 'day',    from: () => daysAgo(90) },
    '1Y':  { multiplier: 1,  timespan: 'week',   from: () => daysAgo(365) },
    'ALL': { multiplier: 1,  timespan: 'month',  from: () => new Date(Date.UTC(2018, 0, 1)) },
};

function toDateOnly(d: Date): string {
    return d.toISOString().slice(0, 10);
}

export async function fetchAggregates(symbol: string, range: AggregateRange, date?: string): Promise<{
    points: { t: number; o: number; h: number; l: number; c: number }[];
    resolution: string;
}> {
    if (!API_KEY) {
        throw new Error('POLYGON_API_KEY is not configured');
    }

    const spec = RANGE_SPECS[range];
    // 1D: bound to the REGULAR session (09:30–16:00 ET) using epoch-ms
    // from/to (Polygon accepts ms in the path). The old date-only strings
    // returned the FULL extended session — premarket from 04:00 ET and
    // after-hours to 20:00 — which visibly disagreed with the RTH-only
    // MVSO stats and confused the 1D chart.
    let from: string | number;
    let to: string | number;
    if (range === '1D') {
        // With an explicit date, bound THAT session; otherwise today's. Noon
        // UTC anchors the day safely on either side of a DST switch.
        const day = date ? new Date(`${date}T12:00:00Z`) : new Date();
        from = etSessionMs(day, 9, 30);
        to = etSessionMs(day, 16, 0);
    } else {
        from = toDateOnly(spec.from());
        to = toDateOnly(spec.to ? spec.to() : new Date());
    }

    const url = `${POLYGON_BASE}/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/${spec.multiplier}/${spec.timespan}/${from}/${to}`;

    const { data } = await axios.get(url, {
        params: { adjusted: 'true', sort: 'asc', limit: 5000, apiKey: API_KEY },
    });

    const results = Array.isArray(data?.results) ? data.results : [];
    // Full OHLC per bar — the mobile fullscreen chart renders candlesticks,
    // and a close-only series hides intra-bar wicks (the post-10:20 peaks
    // behind the Result metric live in `h`, not in any close).
    const points = results.map((row: any) => ({ t: row.t, o: row.o, h: row.h, l: row.l, c: row.c }));

    return { points, resolution: `${spec.multiplier}${spec.timespan}` };
}

/* ===========================================================================
 * Market context for the Reliability crosses (added 2026-07-27).
 *
 * Two range fetches per symbol, not one per pick: Polygon serves a whole date
 * range in a single aggregates call, and a symbol that appears fifty times in
 * the record would otherwise cost fifty round trips for data that overlaps
 * almost completely.
 * ======================================================================== */

export interface DailyBar { t: number; o: number; h: number; l: number; c: number; v: number; day: string }

/** Adjusted daily bars, inclusive, oldest first. `day` is the ET session date,
 *  which is what every caller actually keys on. */
export async function fetchDailyRange(symbol: string, from: string, to: string): Promise<DailyBar[]> {
    if (!API_KEY) throw new Error('POLYGON_API_KEY is not configured');
    const url = `${POLYGON_BASE}/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/1/day/${from}/${to}`;
    const { data } = await axios.get(url, {
        params: { adjusted: 'true', sort: 'asc', limit: 50000, apiKey: API_KEY },
    });
    const rows = Array.isArray(data?.results) ? data.results : [];
    return rows.map((r: any) => ({
        t: r.t, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v ?? 0,
        // Daily bars are stamped at ET midnight, so the UTC date can be the
        // previous day. Formatting through the ET zone is the only way to get
        // the session label the rest of the system uses.
        day: new Date(r.t).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
    }));
}

/** Volume traded between 09:30 and 10:20 ET, per session, over a date range.
 *  Returns a map of `YYYY-MM-DD` → shares. Built from 5-minute bars: ten bars
 *  a session, so a year of range is ~2.5k bars and fits one request. */
export async function fetchOpeningVolumeRange(
    symbol: string, from: string, to: string,
): Promise<Map<string, number>> {
    if (!API_KEY) throw new Error('POLYGON_API_KEY is not configured');
    const url = `${POLYGON_BASE}/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/5/minute/${from}/${to}`;
    const { data } = await axios.get(url, {
        params: { adjusted: 'true', sort: 'asc', limit: 50000, apiKey: API_KEY },
    });
    const rows = Array.isArray(data?.results) ? data.results : [];
    const out = new Map<string, number>();
    for (const r of rows) {
        const d = new Date(r.t);
        const et = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const mins = et.getHours() * 60 + et.getMinutes();
        // [09:30, 10:20). The 10:15 bar covers 10:15–10:20 and is the last one
        // that closes at or before the reference, so premarket and anything
        // after the entry are both excluded.
        if (mins < 9 * 60 + 30 || mins >= 10 * 60 + 20) continue;
        const day = d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        out.set(day, (out.get(day) ?? 0) + (r.v ?? 0));
    }
    return out;
}

/** Wilder's ATR over `period` sessions ending at index `end` (exclusive), as a
 *  PERCENT of the last close before `end`. Percent, not dollars: the whole
 *  point is to compare a $4 stock's daily range with a $400 one's. */
export function atrPercent(bars: DailyBar[], end: number, period = 14): number | null {
    if (end < period + 1) return null;
    let sum = 0;
    for (let i = end - period; i < end; i++) {
        const prev = bars[i - 1];
        const b = bars[i];
        if (!prev || !b) return null;
        sum += Math.max(b.h - b.l, Math.abs(b.h - prev.c), Math.abs(b.l - prev.c));
    }
    const atr = sum / period;
    const ref = bars[end - 1]?.c;
    if (!ref || ref <= 0) return null;
    return (atr / ref) * 100;
}
