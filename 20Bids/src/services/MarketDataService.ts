import { isBefore, isAfter, setHours, setMinutes } from 'date-fns';

// Types
export interface MarketData {
    price: number;
    change: number;
    changePercent: number;
    volume: number;
    timestamp: number;
}

// Configuration for simulation
const MARKET_OPEN_HOUR = 9;
const MARKET_OPEN_MINUTE = 30;
const MARKET_CLOSE_HOUR = 16;
const MARKET_CLOSE_MINUTE = 0;

// Geometric Brownian Motion parameters for realistic stock movement
const VOLATILITY = 0.02; // 2% daily volatility
const DRIFT = 0.0005; // Slight upward drift (bull market bias)
const DT = 1 / (6.5 * 60); // Time step (1 minute in a 6.5 hour trading day)

class MarketDataService {
    private lastPrices: Map<string, number> = new Map();
    private initialPrices: Map<string, number> = new Map();

    constructor() {
        // Initialize with some base prices if needed, or let them be set dynamically
    }

    /**
     * Generates the next price using Geometric Brownian Motion
     * P_t = P_{t-1} * e^((mu - 0.5 * sigma^2) * dt + sigma * epsilon * sqrt(dt))
     */
    private getNextPrice(currentPrice: number): number {
        const epsilon = this.boxMullerTransform();
        const change = (DRIFT - 0.5 * Math.pow(VOLATILITY, 2)) * DT + VOLATILITY * epsilon * Math.sqrt(DT);
        return currentPrice * Math.exp(change);
    }

    /**
     * Standard Normal variate using Box-Muller transform.
     */
    private boxMullerTransform(): number {
        let u = 0, v = 0;
        while (u === 0) u = Math.random(); // Converting [0,1) to (0,1)
        while (v === 0) v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }

    /**
     * Check if market is currently open
     */
    isMarketOpen(): boolean {
        const now = new Date();
        const open = setMinutes(setHours(now, MARKET_OPEN_HOUR), MARKET_OPEN_MINUTE);
        const close = setMinutes(setHours(now, MARKET_CLOSE_HOUR), MARKET_CLOSE_MINUTE);
        // Simple check, doesn't account for weekends/holidays for this demo
        return isAfter(now, open) && isBefore(now, close);
    }

    /**
     * Get simulated live data for a ticker
     */
    getLiveQuote(ticker: string, basePrice: number): MarketData {
        if (!this.initialPrices.has(ticker)) {
            this.initialPrices.set(ticker, basePrice);
            this.lastPrices.set(ticker, basePrice);
        }

        const currentPrice = this.lastPrices.get(ticker)!;

        // Only update price if market is "open" (or always for demo purposes if requested)
        // For this user request, we want "real time" feel, so we'll always update but maybe slower off-hours
        const nextPrice = this.getNextPrice(currentPrice);

        this.lastPrices.set(ticker, nextPrice);

        const initial = this.initialPrices.get(ticker)!;
        const change = nextPrice - initial;
        const changePercent = (change / initial) * 100;

        return {
            price: nextPrice,
            change: change,
            changePercent: changePercent,
            volume: Math.floor(Math.random() * 10000), // Incremental volume could be better
            timestamp: Date.now()
        };
    }
}

export const marketService = new MarketDataService();
