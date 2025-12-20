import { format, subDays } from 'date-fns';

export interface Recommendation {
    id: string;
    ticker: string;
    name: string;
    price: number;
    change: number;
    probability: 'High' | 'Medium' | 'Low';
    type: 'Intraday' | 'Swing' | 'Long';
    volume: string;
    sector: string;
    date: string; // YYYY-MM-DD
    // New fields
    rsi: number;
    relativeVol: number;
    marketCap: string;
    beta: number;
    earningsDate: string;
    analystRating: 'Buy' | 'Strong Buy' | 'Hold';
    // User/Analyst fields
    userNotes?: string;
    userTag?: string; // hex color
    isWatched?: boolean;
    sentiment?: 'Bullish' | 'Bearish' | 'Neutral';
}

const SECTORS = ['Technology', 'Consumer Cyclical', 'Healthcare', 'Financial', 'Energy', 'Industrial', 'Utilities'];
const TYPES = ['Intraday', 'Swing', 'Long'] as const;
const PROBS = ['High', 'Medium', 'Low'] as const;
const RATINGS = ['Buy', 'Strong Buy', 'Hold'] as const;
const SENTIMENTS = ['Bullish', 'Bearish', 'Neutral'] as const;

const generateMockData = (): Recommendation[] => {
    const data: Recommendation[] = [];
    const today = new Date();

    // Generate data for the last 5 days
    for (let i = 0; i < 5; i++) {
        const dateStr = format(subDays(today, i), 'yyyy-MM-dd');

        // Simulate "Low Data" day for the oldest date (index 4)
        // Otherwise generate 15-20 items
        const count = i === 4 ? 3 : 15 + Math.floor(Math.random() * 6);

        for (let j = 0; j < count; j++) {
            const price = 10 + Math.random() * 490;
            const change = (Math.random() * 10) - 4; // -4% to +6%

            data.push({
                id: `${dateStr}-${j}`,
                ticker: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META', 'AMD', 'NFLX', 'INTC', 'JPM', 'BAC', 'XOM', 'CVX', 'PFE', 'JNJ', 'KO', 'PEP', 'WMT', 'TGT'][Math.floor(Math.random() * 20)],
                name: 'Company Name Inc.', // Simplified for mock
                price: price,
                change: Number(change.toFixed(2)),
                probability: PROBS[Math.floor(Math.random() * PROBS.length)],
                type: TYPES[Math.floor(Math.random() * TYPES.length)],
                volume: `${(Math.random() * 50 + 1).toFixed(1)}M`,
                sector: SECTORS[Math.floor(Math.random() * SECTORS.length)],
                date: dateStr,
                rsi: Math.floor(30 + Math.random() * 50), // 30-80
                relativeVol: Number((0.5 + Math.random() * 2.5).toFixed(2)),
                marketCap: `${(Math.random() * 2 + 0.1).toFixed(1)}T`,
                beta: Number((0.5 + Math.random() * 1.5).toFixed(2)),
                earningsDate: format(subDays(today, Math.floor(Math.random() * 60) - 30), 'MMM dd'),
                analystRating: RATINGS[Math.floor(Math.random() * RATINGS.length)],
                sentiment: SENTIMENTS[Math.floor(Math.random() * SENTIMENTS.length)],
                isWatched: Math.random() > 0.8,
                userTag: Math.random() > 0.7 ? ['#ef4444', '#3b82f6', '#10b981', '#f59e0b'][Math.floor(Math.random() * 4)] : undefined,
            });
        }
    }
    return data;
};

export const mockRecommendations: Recommendation[] = generateMockData();

export const getUniqueDates = () => {
    const dates = new Set(mockRecommendations.map(r => r.date));
    return Array.from(dates).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
};
