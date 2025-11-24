import { format, subDays } from 'date-fns';

export interface Recommendation {
    id: string;
    ticker: string;
    name: string;
    price: number;
    change: number;
    changePercent: number;
    probability: 'High' | 'Medium' | 'Low';
    type: 'Intraday' | 'Swing' | 'Long';
    volume: number;
    sector: string;
    date: string; // YYYY-MM-DD
    // New fields
    rsi: number;
    relativeVol: number;
    marketCap: number;
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

export const generateMockData = (dateStr?: string): Recommendation[] => {
    const data: Recommendation[] = [];
    const today = new Date();

    // If date is provided, use it. Otherwise generate for last 5 days.
    // But the original function generated for last 5 days and returned ALL.
    // The Dashboard calls it with selectedDate.
    // Let's keep the original logic but filter by date if needed, OR just generate based on the date passed.
    // The original code generated 5 days worth of data.
    // Dashboard calls `generateMockData(selectedDate)`.
    // Wait, the original code ignored arguments and generated 5 days.
    // I should adapt it to generate for the specific date if passed, or just return the static set.
    // For simplicity, let's stick to generating a static set for now, but we need to match the interface.

    // Actually, let's just generate the static set as before, but with correct types.

    for (let i = 0; i < 5; i++) {
        const currentDateStr = format(subDays(today, i), 'yyyy-MM-dd');

        // Simulate "Low Data" day for the oldest date (index 4)
        // Otherwise generate 15-20 items
        const count = i === 4 ? 3 : 15 + Math.floor(Math.random() * 6);

        for (let j = 0; j < count; j++) {
            const price = 10 + Math.random() * 490;
            const change = (Math.random() * 10) - 4; // -4% to +6%

            data.push({
                id: `${currentDateStr}-${j}`,
                ticker: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META', 'AMD', 'NFLX', 'INTC', 'JPM', 'BAC', 'XOM', 'CVX', 'PFE', 'JNJ', 'KO', 'PEP', 'WMT', 'TGT'][Math.floor(Math.random() * 20)],
                name: 'Company Name Inc.', // Simplified for mock
                price: price,
                change: Number(change.toFixed(2)),
                changePercent: Number(((change / price) * 100).toFixed(2)),
                probability: PROBS[Math.floor(Math.random() * PROBS.length)],
                type: TYPES[Math.floor(Math.random() * TYPES.length)],
                volume: Number((Math.random() * 50 + 1).toFixed(1)) * 1000000, // stored as number
                sector: SECTORS[Math.floor(Math.random() * SECTORS.length)],
                date: currentDateStr,
                rsi: Math.floor(30 + Math.random() * 50), // 30-80
                relativeVol: Number((0.5 + Math.random() * 2.5).toFixed(2)),
                marketCap: Number((Math.random() * 2 + 0.1).toFixed(1)), // Trillions
                beta: Number((0.5 + Math.random() * 1.5).toFixed(2)),
                earningsDate: format(subDays(today, Math.floor(Math.random() * 60) - 30), 'MMM dd'),
                analystRating: RATINGS[Math.floor(Math.random() * RATINGS.length)],
                sentiment: SENTIMENTS[Math.floor(Math.random() * SENTIMENTS.length)],
                isWatched: Math.random() > 0.8,
                userTag: Math.random() > 0.7 ? ['#ef4444', '#3b82f6', '#10b981', '#f59e0b'][Math.floor(Math.random() * 4)] : undefined,
            });
        }
    }

    // Filter by date if provided (Dashboard passes selectedDate)
    if (dateStr) {
        // Dashboard passes Date object or string? 
        // Dashboard passes `selectedDate` which comes from MainLayout -> Sidebar.
        // In MainLayout: `const dates = getUniqueDates(); const [selectedDate, setSelectedDate] = useState(dates[0]);`
        // So it's a string.
        // But Dashboard.tsx line 17: `useMemo(() => generateMockData(selectedDate), [selectedDate]);`
        // So we should filter.
        return data.filter(d => d.date === dateStr);
    }

    return data;
};

export const mockRecommendations: Recommendation[] = generateMockData();

export const getUniqueDates = () => {
    const dates = new Set(mockRecommendations.map(r => r.date));
    return Array.from(dates).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
};
