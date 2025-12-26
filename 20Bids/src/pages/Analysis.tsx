import { useState, useEffect, useMemo } from 'react';
import { Sidebar } from '../components/Sidebar';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    AreaChart, Area, ComposedChart, Line, Legend, LabelList, Cell, ReferenceLine
} from 'recharts';
import { cn } from '../lib/utils';
import { fetchAnalysis } from '../api/client';
import { startOfYear, subWeeks, subMonths, isAfter, startOfWeek, startOfMonth, format } from 'date-fns';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { Calendar, Info, TrendingUp, TrendingDown, BarChart2, DollarSign, Percent } from 'lucide-react';

interface AnalysisData {
    equityCurve: { date: string, return: number, equity: number, drawdown: number, hitTP?: number, hitSL?: number, other?: number, count?: number }[];
    dailyAverages: { date: string, avgReturn: number, avgPrice: number, count: number }[];
    distribution: { name: string, count: number }[];
    seasonality: { name: string, count: number, avgMvso: number, winRate: number }[];
    topTickers: { name: string, count: number, avgMvso: number, winRate: number }[];
    topSectors: { name: string, count: number, avgMvso: number, winRate: number }[];
    boxPlotData?: { name: string, min: number, q1: number, median: number, q3: number, max: number, count: number }[];
    volume: { x: number, y: number, rvol: number }[];
    riskMetrics: {
        profitFactor: number;
        maxDrawdown: number;
        maxWinStreak: number;
        maxLossStreak: number;
        totalReturn: number;
    };
}

const CustomizedLabel = (props: any) => {
    const { x, y, value } = props;
    if (!value && value !== 0) return null;
    return (
        <g>
            <rect x={x - 18} y={y - 20} width={36} height={16} fill="white" rx={4} stroke="#e5e5e5" strokeWidth={1} />
            <text x={x} y={y - 9} fill="#059669" textAnchor="middle" dominantBaseline="middle" fontSize={10} fontWeight="bold">
                {Number(value).toFixed(2)}%
            </text>
        </g>
    );
};

type TimeRange = '1W' | '1M' | '3M' | 'YTD' | '1Y' | 'ALL';

export function AnalysisPage() {
    const [data, setData] = useState<AnalysisData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [theme, setTheme] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('theme') || 'midnight';
        }
        return 'midnight';
    });
    const [timeRange, setTimeRange] = useState<TimeRange>('ALL');
    const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([null, null]);
    const [customStartDate, customEndDate] = dateRange;

    // New UX Controls
    const [takeProfit, setTakeProfit] = useState<number>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('takeProfit');
            return saved ? parseFloat(saved) : 2.0;
        }
        return 2.0;
    });
    const [stopLoss, setStopLoss] = useState<number>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('stopLoss');
            return saved ? parseFloat(saved) : 100; // 100 = no SL by default
        }
        return 100;
    });
    // Filter states
    const [minVolume, setMinVolume] = useState<number>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('analysisMinVolume');
            return saved ? parseFloat(saved) : 0;
        }
        return 0;
    });
    const [minPrice, setMinPrice] = useState<number>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('analysisMinPrice');
            return saved ? parseFloat(saved) : 0;
        }
        return 0;
    });
    const [minProb, setMinProb] = useState<number>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('analysisMinProb');
            return saved ? parseInt(saved) : 0;
        }
        return 0;
    });
    const [isCumulative, setIsCumulative] = useState(false);
    const [periodGranularity, setPeriodGranularity] = useState<'days' | 'weeks' | 'months'>('days');

    const [debouncedTakeProfit, setDebouncedTakeProfit] = useState<number>(takeProfit);
    const [debouncedStopLoss, setDebouncedStopLoss] = useState<number>(stopLoss);
    const [debouncedMinVolume, setDebouncedMinVolume] = useState<number>(minVolume);
    const [debouncedMinPrice, setDebouncedMinPrice] = useState<number>(minPrice);
    const [debouncedMinProb, setDebouncedMinProb] = useState<number>(minProb);

    // Debounce Take Profit
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedTakeProfit(takeProfit), 800);
        return () => clearTimeout(handler);
    }, [takeProfit]);

    // Debounce Stop Loss
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedStopLoss(stopLoss), 800);
        return () => clearTimeout(handler);
    }, [stopLoss]);

    // Debounce Filters
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedMinVolume(minVolume), 800);
        return () => clearTimeout(handler);
    }, [minVolume]);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedMinPrice(minPrice), 800);
        return () => clearTimeout(handler);
    }, [minPrice]);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedMinProb(minProb), 800);
        return () => clearTimeout(handler);
    }, [minProb]);

    // Save filters to localStorage
    useEffect(() => { localStorage.setItem('stopLoss', stopLoss.toString()); }, [stopLoss]);
    useEffect(() => { localStorage.setItem('analysisMinVolume', minVolume.toString()); }, [minVolume]);
    useEffect(() => { localStorage.setItem('analysisMinPrice', minPrice.toString()); }, [minPrice]);
    useEffect(() => { localStorage.setItem('analysisMinProb', minProb.toString()); }, [minProb]);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const result = await fetchAnalysis(
                    debouncedTakeProfit,
                    debouncedStopLoss,
                    debouncedMinVolume,
                    debouncedMinPrice,
                    debouncedMinProb,
                    customStartDate,
                    customEndDate
                );
                setData(result);
            } catch (error) {
                console.error('Failed to fetch analysis data', error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [debouncedTakeProfit, debouncedStopLoss, debouncedMinVolume, debouncedMinPrice, debouncedMinProb, customStartDate, customEndDate]);

    // Theme observer hook
    useEffect(() => {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'data-theme') {
                    const newTheme = document.documentElement.getAttribute('data-theme') || 'midnight';
                    setTheme(newTheme);
                }
            });
        });
        observer.observe(document.documentElement, { attributes: true });

        // Sync theme on mount
        const currentTheme = document.documentElement.getAttribute('data-theme') || localStorage.getItem('theme') || 'midnight';
        setTheme(currentTheme);

        return () => observer.disconnect();
    }, []);

    // Filter Logic & Metric Recalculation (with Take Profit)
    const filteredMetrics = useMemo(() => {
        if (!data) return null;

        const now = new Date();
        let filterStart: Date | null = null;

        // If custom date range is set, use it
        if (customStartDate && customEndDate) {
            filterStart = new Date(customStartDate);
            filterStart.setHours(0, 0, 0, 0);
        } else {
            switch (timeRange) {
                case '1W': filterStart = subWeeks(now, 1); break;
                case '1M': filterStart = subMonths(now, 1); break;
                case '3M': filterStart = subMonths(now, 3); break;
                case 'YTD': filterStart = startOfYear(now); break;
                case '1Y': filterStart = subMonths(now, 12); break;
                case 'ALL': break;
            }
        }

        // Filter Equity Curve
        const filteredEquity = filterStart
            ? data.equityCurve.filter(d => isAfter(new Date(d.date), filterStart!))
            : data.equityCurve;

        if (filteredEquity.length === 0) return data; // Fallback


        // Recalculate Metrics for this Period (with Take Profit clamping)
        let grossWin = 0;
        let grossLoss = 0;
        let clampedEquity = 0; // For metrics calculation
        let originalEquity = 0; // For chart display
        let peakEquity = 0;
        let maxDD = 0;
        let winStreak = 0;
        let lossStreak = 0;
        let maxWinStreak = 0;
        let maxLossStreak = 0;

        // Create lookup for daily averages
        const dailyAvgMap = new Map(data.dailyAverages.map(d => [d.date, d]));

        // Calculate Advanced Metrics (Best Day, Avg R, Expectancy)
        const daysOfWeekStats = [0, 1, 2, 3, 4, 5, 6].map(day => ({ day, wins: 0, total: 0, return: 0 }));
        let totalWins = 0;
        let totalCount = 0;
        let sumWinReturns = 0;
        let sumLossReturns = 0;
        let lossCount = 0;

        // Re-simulate equity curve - track both original and clamped
        const rebasedEquityCurve = filteredEquity.map(d => {
            const originalReturn = d.return;
            // Apply Take Profit: clamp positive returns at TP value (for METRICS only)
            // AND Stop Loss: clamp negative returns at SL value
            let clampedReturn = originalReturn;

            if (originalReturn > 0) {
                clampedReturn = Math.min(originalReturn, takeProfit);
                grossWin += clampedReturn;
                winStreak++;
                lossStreak = 0;
                if (winStreak > maxWinStreak) maxWinStreak = winStreak;

                // Advanced stats
                totalWins++;
                sumWinReturns += clampedReturn;
            } else {
                // Apply Stop Loss if enabled (stopLoss < 100)
                if (stopLoss < 100) {
                    clampedReturn = Math.min(Math.max(originalReturn, -stopLoss), 0); // Correctly clamp loss. e.g. -5% vs -2% SL -> max(-5, -2) = -2.
                }
                grossLoss += Math.abs(clampedReturn);
                lossStreak++;
                winStreak = 0;
                if (lossStreak > maxLossStreak) maxLossStreak = lossStreak;

                // Advanced stats
                lossCount++;
                sumLossReturns += Math.abs(clampedReturn);
            }

            // Day Stats
            const day = new Date(d.date).getDay();
            daysOfWeekStats[day].total++;
            daysOfWeekStats[day].return += clampedReturn;
            if (clampedReturn > 0) daysOfWeekStats[day].wins++;
            totalCount++;

            // Clamped equity for metrics
            clampedEquity += clampedReturn;

            // ORIGINAL equity for chart display (shows real variations)
            originalEquity += originalReturn;
            // Store original equity for chart
            if (originalEquity > peakEquity) peakEquity = originalEquity;
            const dd = peakEquity - originalEquity;
            if (dd > maxDD) maxDD = dd;

            const dailyStats = dailyAvgMap.get(d.date);

            return {
                ...d,
                return: originalReturn,
                clampedReturn,
                equity: originalEquity,
                clampedEquity,
                drawdown: dd * -1,
                avgReturn: dailyStats ? dailyStats.avgReturn : 0
            };
        });

        const pf = grossLoss === 0 ? grossWin : grossWin / grossLoss;

        // Advanced Metrics Calculations
        const bestDayStat = daysOfWeekStats.reduce((prev, curr) => (curr.return > prev.return) ? curr : prev, daysOfWeekStats[0]);
        const bestDayName = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][bestDayStat.day];
        const bestDayWR = bestDayStat.total > 0 ? (bestDayStat.wins / bestDayStat.total * 100) : 0;

        const avgWin = totalWins > 0 ? sumWinReturns / totalWins : 0;
        const avgLoss = lossCount > 0 ? sumLossReturns / lossCount : 0;
        const avgR = avgLoss > 0 ? avgWin / avgLoss : avgWin;

        const winRate = totalCount > 0 ? totalWins / totalCount : 0;
        const expectancy = (winRate * avgWin) - ((1 - winRate) * avgLoss);

        const reliability = pf > 1.6 ? 'High' : pf > 1.2 ? 'Medium' : 'Low';
        const reliabilityColor = pf > 1.6 ? 'text-emerald-500' : pf > 1.2 ? 'text-amber-500' : 'text-rose-500';

        // Box Plot Calculation: Distribution by Probability Range
        const probBuckets = [
            { label: '70-75', min: 70, max: 75, values: [] as number[] },
            { label: '75-80', min: 75, max: 80, values: [] as number[] },
            { label: '80-85', min: 80, max: 85, values: [] as number[] },
            { label: '85-90', min: 85, max: 90, values: [] as number[] },
            { label: '90+', min: 90, max: 101, values: [] as number[] }, // 101 to include 100
        ];

        // Populate buckets
        rebasedEquityCurve.forEach(d => {
            const prob = (d as any).probabilityValue || 70; // Default to 70 if missing
            const ret = d.clampedReturn; // Use the clamped return (metrics view)

            const bucket = probBuckets.find(b => prob >= b.min && prob < b.max);
            if (bucket) {
                bucket.values.push(ret);
            }
        });

        // Compute stats for each bucket
        const boxPlotData = probBuckets.map(bucket => {
            const sorted = bucket.values.sort((a, b) => a - b);
            const count = sorted.length;

            if (count === 0) return { name: bucket.label, min: 0, q1: 0, median: 0, q3: 0, max: 0, count: 0 };

            const min = sorted[0];
            const max = sorted[count - 1];
            const median = count % 2 === 0 ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2 : sorted[Math.floor(count / 2)];
            const q1 = sorted[Math.floor(count * 0.25)];
            const q3 = sorted[Math.floor(count * 0.75)];

            return {
                name: bucket.label,
                min,
                q1,
                median,
                q3,
                max,
                count
            };
        });

        return {
            ...data,
            equityCurve: rebasedEquityCurve,
            boxPlotData, // Return the calculated data
            riskMetrics: {
                profitFactor: pf,
                maxDrawdown: maxDD,
                maxWinStreak: maxWinStreak,
                maxLossStreak: maxLossStreak,
                totalReturn: clampedEquity,
                // Advanced
                bestDayName,
                bestDayWR,
                avgR,
                expectancy,
                reliability,
                reliabilityColor
            }
        };

    }, [data, timeRange, takeProfit, customStartDate, customEndDate]);

    // Top Periods Calculation (Moved before conditional return)
    const topPeriods = useMemo(() => {
        const equity = filteredMetrics?.equityCurve;
        if (!equity) return { days: [], weeks: [], months: [] };

        // Top Days
        const days = [...equity].map(d => ({ date: d.date, return: d.return })).sort((a, b) => b.return - a.return).slice(0, 5);

        // Aggregate Weeks & Months
        const weekMap: Record<string, number> = {};
        const monthMap: Record<string, number> = {};

        equity.forEach(d => {
            const date = new Date(d.date);
            const weekKey = format(startOfWeek(date), 'yyyy-MM-dd'); // Week of...
            const monthKey = format(startOfMonth(date), 'yyyy-MM');

            weekMap[weekKey] = (weekMap[weekKey] || 0) + d.return;
            monthMap[monthKey] = (monthMap[monthKey] || 0) + d.return;
        });

        const weeks = Object.entries(weekMap).map(([date, ret]) => ({ date, return: ret }))
            .sort((a, b) => b.return - a.return).slice(0, 5);

        const months = Object.entries(monthMap).map(([date, ret]) => ({ date, return: ret }))
            .sort((a, b) => b.return - a.return).slice(0, 5);

        return { days, weeks, months };
    }, [filteredMetrics]);

    if (isLoading || !filteredMetrics) {
        return (
            <div className="flex h-screen bg-bg-primary">
                <Sidebar />
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-text-secondary animate-pulse font-mono">INITIALIZING TERMINAL DATA...</div>
                </div>
            </div>
        );
    }

    const { riskMetrics, equityCurve, distribution, topTickers, topSectors, boxPlotData } = filteredMetrics;
    const isTerminal = theme === 'terminal';
    const isTradingView = theme === 'tradingview';
    const isPolar = theme === 'polar';

    // Theme Colors
    let chartColor = '#8b5cf6';
    const safeColor = '#10b981';

    if (isTerminal) {
        chartColor = '#fbbf24';
    } else if (isTradingView) {
        chartColor = '#2962ff';
    } else if (isPolar) {
        chartColor = '#2563eb';
    }

    // Best Day Calculation (Moved to useMemo)



    return (
        <div className="flex h-screen bg-bg-primary overflow-hidden font-sans">
            <Sidebar />

            <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
                <div className="p-6 space-y-6 bg-bg-primary">

                    {/* Unified Header & Filter Toolbar */}
                    <div className="flex flex-col gap-5 pb-6 border-b border-border-primary/50">
                        {/* ROW 1: Title & Date (Simpler, Smaller) */}
                        <div className="flex items-center justify-between">
                            <h1 className="text-lg font-bold text-text-primary uppercase tracking-wider flex items-center gap-2">
                                <span className={cn("inline-block w-2 h-2 rounded-full", isTerminal ? "bg-amber-400 animate-pulse" : "bg-accent-primary")}></span>
                                SYSTEM PERFORMANCE
                            </h1>
                            <div className="text-[10px] font-medium text-text-secondary uppercase tracking-widest bg-bg-secondary/50 px-3 py-1 rounded-full border border-border-primary/30">
                                {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                        </div>

                        {/* RIGHT: Unified Control Bar */}
                        <div className="flex flex-wrap xl:flex-nowrap items-center gap-4 w-full">

                            {/* Group 1: Time Range */}
                            <div className="flex items-center gap-2 bg-bg-secondary/30 p-1 rounded-lg border border-border-primary/30">
                                <div className="flex">
                                    {(['1W', '1M', '3M', 'YTD', '1Y', 'ALL'] as TimeRange[]).map((range) => (
                                        <button
                                            key={range}
                                            onClick={() => {
                                                setTimeRange(range);
                                                setDateRange([null, null]);
                                            }}
                                            className={cn(
                                                "px-3 py-1.5 text-[10px] font-bold rounded-md transition-all uppercase tracking-wide",
                                                timeRange === range && !customStartDate
                                                    ? "bg-accent-primary text-white shadow-sm"
                                                    : "text-text-secondary hover:text-text-primary hover:bg-white/5"
                                            )}
                                        >
                                            {range}
                                        </button>
                                    ))}
                                </div>
                                <div className="w-px h-4 bg-border-primary/30 mx-1"></div>
                                <div className="relative">
                                    <DatePicker
                                        selectsRange={true}
                                        startDate={customStartDate}
                                        endDate={customEndDate}
                                        onChange={(update) => {
                                            setDateRange(update as [Date | null, Date | null]);
                                            if (update[0] && update[1]) setTimeRange('ALL');
                                        }}
                                        placeholderText="Custom Range"
                                        className="bg-transparent text-xs text-text-primary w-28 cursor-pointer placeholder:text-text-secondary focus:outline-none font-sans font-medium text-right hover:text-accent-primary transition-colors"
                                        dateFormat="MMM dd, yy"
                                        isClearable={true}
                                        maxDate={new Date()}
                                    />
                                    <Calendar className="absolute left-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary pointer-events-none opacity-50" />
                                </div>
                            </div>

                            {/* Divider (Desktop Only) */}
                            <div className="hidden xl:block w-px h-8 bg-border-primary/20 mx-2"></div>

                            {/* Group 2: Strategy (TP/SL) */}
                            <div className="flex items-center gap-1.5 bg-bg-secondary/30 p-1 rounded-lg border border-border-primary/30">
                                {/* TP */}
                                <div className="flex items-center gap-1.5 px-2 py-1">
                                    <TrendingUp size={14} className="text-emerald-500" />
                                    <span className="text-xs font-bold font-sans text-text-primary">TP</span>
                                    <input
                                        type="number"
                                        min="0.1"
                                        max="100"
                                        step="0.1"
                                        value={takeProfit}
                                        onChange={(e) => {
                                            const val = parseFloat(e.target.value) || 2.0;
                                            setTakeProfit(val);
                                            localStorage.setItem('takeProfit', val.toString());
                                        }}
                                        className="w-10 bg-transparent border-0 text-text-primary text-sm font-black font-sans text-right focus:outline-none focus:ring-0 p-0"
                                    />
                                    <span className="text-[10px] text-text-secondary opacity-50">%</span>
                                </div>

                                <div className="w-px h-5 bg-border-primary/30"></div>

                                {/* SL */}
                                <div className="flex items-center gap-1.5 px-2 py-1">
                                    <TrendingDown size={14} className="text-rose-500" />
                                    <span className="text-xs font-bold font-sans text-text-primary">SL</span>
                                    <input
                                        type="number"
                                        min="0.1"
                                        max="100"
                                        step="0.1"
                                        value={stopLoss === 100 ? '' : stopLoss}
                                        placeholder="Off"
                                        onChange={(e) => {
                                            const val = e.target.value === '' ? 100 : (parseFloat(e.target.value) || 100);
                                            setStopLoss(val);
                                        }}
                                        className="w-10 bg-transparent border-0 text-text-primary text-sm font-black font-sans text-right focus:outline-none focus:ring-0 placeholder:text-text-secondary/50 p-0"
                                    />
                                    <span className="text-[10px] text-text-secondary opacity-50">%</span>
                                </div>
                            </div>

                            {/* Group 3: Filters (Vol/Min$/Prob) */}
                            <div className="flex items-center gap-1.5 bg-bg-secondary/30 p-1 rounded-lg border border-border-primary/30">
                                {/* Vol */}
                                <div className="flex items-center gap-1.5 px-2 py-1 hover:bg-white/5 rounded transition-colors group">
                                    <BarChart2 size={14} className="text-text-secondary group-hover:text-accent-primary" />
                                    <span className="text-xs font-bold font-sans text-text-secondary group-hover:text-text-primary">Vol</span>
                                    <input
                                        type="number"
                                        min="0"
                                        step="100000"
                                        value={minVolume === 0 ? '' : minVolume}
                                        placeholder="Any"
                                        onChange={(e) => setMinVolume(parseFloat(e.target.value) || 0)}
                                        className="w-14 bg-transparent border-0 text-text-primary text-sm font-black font-sans text-right focus:outline-none focus:ring-0 placeholder:text-text-secondary/50 p-0"
                                    />
                                </div>

                                <div className="w-px h-5 bg-border-primary/30"></div>

                                {/* Price */}
                                <div className="flex items-center gap-1.5 px-2 py-1 hover:bg-white/5 rounded transition-colors group">
                                    <DollarSign size={14} className="text-text-secondary group-hover:text-accent-primary" />
                                    <span className="text-xs font-bold font-sans text-text-secondary group-hover:text-text-primary">Min $</span>
                                    <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={minPrice === 0 ? '' : minPrice}
                                        placeholder="0"
                                        onChange={(e) => setMinPrice(parseFloat(e.target.value) || 0)}
                                        className="w-9 bg-transparent border-0 text-text-primary text-sm font-black font-sans text-right focus:outline-none focus:ring-0 placeholder:text-text-secondary/50 p-0"
                                    />
                                </div>

                                <div className="w-px h-5 bg-border-primary/30"></div>

                                {/* Prob */}
                                <div className="flex items-center gap-1.5 px-2 py-1 hover:bg-white/5 rounded transition-colors group">
                                    <Percent size={14} className="text-text-secondary group-hover:text-accent-primary" />
                                    <span className="text-xs font-bold font-sans text-text-secondary group-hover:text-text-primary">Prob</span>
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="5"
                                        value={minProb === 0 ? '' : minProb}
                                        placeholder="0"
                                        onChange={(e) => setMinProb(parseInt(e.target.value) || 0)}
                                        className="w-9 bg-transparent border-0 text-text-primary text-sm font-black font-sans text-right focus:outline-none focus:ring-0 placeholder:text-text-secondary/50 p-0"
                                    />
                                    <span className="text-[10px] text-text-secondary opacity-50">%</span>
                                </div>
                            </div>

                            {/* Group 4: Toggle */}
                            <div className="ml-auto">
                                <button
                                    onClick={() => setIsCumulative(!isCumulative)}
                                    className={cn(
                                        "px-4 py-1.5 text-[10px] font-bold rounded-lg border transition-all uppercase tracking-widest hover:scale-105 active:scale-95",
                                        isCumulative
                                            ? "bg-accent-primary text-white border-accent-primary shadow-lg shadow-accent-primary/20"
                                            : "bg-bg-tertiary text-text-secondary border-border-primary hover:text-text-primary hover:border-text-primary"
                                    )}
                                >
                                    {isCumulative ? 'CUMUL' : 'DAILY'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Advanced Intraday Metrics Grid (8 Cards) */}
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                        {/* 1. Profit Factor */}
                        <TerminalMetric
                            label="Profit Factor"
                            value={(riskMetrics as any).profitFactor.toFixed(2)}
                            trend={(riskMetrics as any).profitFactor > 1.5 ? 'up' : 'neutral'}
                            tooltip="Ratio of Gross Win / Gross Loss (>1.5 Ideal)"
                        />

                        {/* 2. Max Drawdown */}
                        <TerminalMetric
                            label="Max Drawdown"
                            value={`${(riskMetrics as any).maxDrawdown.toFixed(2)}%`}
                            trend="down"
                            color="#f43f5e"
                            tooltip="Maximum peak-to-valley decline"
                        />

                        {/* 3. Win Streak */}
                        <TerminalMetric
                            label="Win Streak"
                            value={(riskMetrics as any).maxWinStreak.toString()}
                            tooltip="Consecutive profitable sessions"
                        />

                        {/* 4. Loss Streak */}
                        <TerminalMetric
                            label="Loss Streak"
                            value={(riskMetrics as any).maxLossStreak.toString()}
                            color="#f43f5e"
                            tooltip="Consecutive losing sessions"
                        />

                        {/* 5. Best Day */}
                        <TerminalMetric
                            label="Best Day"
                            value={(riskMetrics as any).bestDayName || '-'}
                            subValue={`${(riskMetrics as any).bestDayWR?.toFixed(0)}% WR`}
                            tooltip="Most profitable day of the week"
                        />

                        {/* 6. Avg R (Est) */}
                        <TerminalMetric
                            label="Avg R (Est)"
                            value={(riskMetrics as any).avgR ? (riskMetrics as any).avgR.toFixed(1) : '0.0'}
                            subValue="Risk/Reward"
                            tooltip="Ratio of Avg Win / Avg Loss"
                        />

                        {/* 7. Expectancy */}
                        <TerminalMetric
                            label="Expectancy"
                            value={`${(riskMetrics as any).expectancy?.toFixed(2)}%`}
                            color={(riskMetrics as any).expectancy > 0 ? '#10b981' : '#f43f5e'}
                            trend={(riskMetrics as any).expectancy > 0 ? 'up' : 'down'}
                            tooltip="Avg Return per Trade/Session"
                        />

                        {/* 8. Reliability */}
                        <TerminalMetric
                            label="Reliability"
                            value={(riskMetrics as any).reliability || 'Low'}
                            color={(riskMetrics as any).reliability === 'High' ? '#10b981' : (riskMetrics as any).reliability === 'Medium' ? '#f59e0b' : '#f43f5e'}
                            tooltip="Based on Profit Factor consistency"
                        />
                    </div>

                    <div className="space-y-6">
                        {/* ROW 1: Charts (Performance Evolution 75% + Seasonality 25%) */}
                        <div className="grid grid-cols-1 md:grid-cols-[2.5fr_1fr] lg:grid-cols-[3fr_1fr] gap-6">
                            {/* Performance Evolution Chart */}
                            <ChartCard title="" height={350}>
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-xs font-bold text-text-secondary uppercase tracking-widest flex items-center gap-2 font-sans">
                                        PERFORMANCE EVOLUTION
                                        <span className="text-[10px] font-normal text-text-secondary/70">
                                            (TP: {takeProfit}%)
                                        </span>
                                    </h3>
                                </div>
                                <ResponsiveContainer width="100%" height="85%">
                                    {isCumulative ? (
                                        <AreaChart data={equityCurve}>
                                            <defs>
                                                <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" opacity={0.5} vertical={false} />
                                            <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickFormatter={(val) => val.slice(5)} minTickGap={50} axisLine={false} tickLine={false} />
                                            <YAxis stroke="#94a3b8" fontSize={11} domain={['auto', 'auto']} axisLine={false} tickLine={false} unit="%" />
                                            <Tooltip
                                                contentStyle={{
                                                    backgroundColor: 'rgba(255,255,255,0.95)',
                                                    border: '1px solid #e5e7eb',
                                                    borderRadius: '6px',
                                                    boxShadow: 'none',
                                                    color: '#1f2937',
                                                    fontFamily: '"Source Sans 3", system-ui, sans-serif',
                                                    fontSize: '12px'
                                                }}
                                                formatter={(value: number) => [`${value.toFixed(2)}%`, 'Equity']}
                                            />
                                            <Area
                                                type="linear"
                                                dataKey="equity"
                                                stroke={chartColor}
                                                fillOpacity={1}
                                                fill="url(#colorEquity)"
                                                strokeWidth={2}
                                            />
                                        </AreaChart>
                                    ) : (
                                        <ComposedChart data={equityCurve}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" opacity={0.5} vertical={false} />
                                            <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickFormatter={(val) => val.slice(5)} minTickGap={50} axisLine={false} tickLine={false} />
                                            <YAxis yAxisId="left" stroke={chartColor} fontSize={11} domain={['auto', 'auto']} axisLine={false} tickLine={false} unit="%" />
                                            <YAxis yAxisId="right" orientation="right" stroke={safeColor} fontSize={11} domain={[0, 5]} axisLine={false} tickLine={false} unit="%" />
                                            <Tooltip
                                                content={({ active, payload, label }) => {
                                                    if (!active || !payload || !payload.length) return null;
                                                    const data = payload[0]?.payload;
                                                    return (
                                                        <div style={{
                                                            backgroundColor: 'rgba(255,255,255,0.98)',
                                                            border: '1px solid #e5e7eb',
                                                            borderRadius: '8px',
                                                            padding: '10px 14px',
                                                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                                            fontFamily: '"Source Sans 3", system-ui, sans-serif',
                                                            fontSize: '12px',
                                                            minWidth: '160px'
                                                        }}>
                                                            <div style={{ fontWeight: 600, marginBottom: '8px', color: '#1f2937', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
                                                                {label}
                                                            </div>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                                <span style={{ color: '#64748b' }}>Total Return:</span>
                                                                <span style={{ fontWeight: 600, color: data?.return >= 0 ? '#22c55e' : '#ef4444' }}>{data?.return?.toFixed(2)}%</span>
                                                            </div>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                                <span style={{ color: '#64748b' }}>Avg Return:</span>
                                                                <span style={{ fontWeight: 500 }}>{data?.avgReturn?.toFixed(2)}%</span>
                                                            </div>
                                                            <div style={{ borderTop: '1px solid #e5e7eb', marginTop: '8px', paddingTop: '8px' }}>
                                                                <div style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px' }}>Breakdown ({data?.count || 0} trades)</div>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                                                                    <span style={{ color: '#22c55e' }}>✓ Hit TP ({takeProfit}%):</span>
                                                                    <span style={{ fontWeight: 600 }}>{data?.hitTP || 0}</span>
                                                                </div>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                                                                    <span style={{ color: '#ef4444' }}>✗ Hit SL ({stopLoss === 100 ? 'Off' : `-${stopLoss}%`}):</span>
                                                                    <span style={{ fontWeight: 600 }}>{data?.hitSL || 0}</span>
                                                                </div>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                    <span style={{ color: '#64748b' }}>○ Other:</span>
                                                                    <span style={{ fontWeight: 600 }}>{data?.other || 0}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                }}
                                            />
                                            <Legend
                                                verticalAlign="top"
                                                align="left"
                                                height={36}
                                                iconType="circle"
                                                iconSize={8}
                                                wrapperStyle={{ fontSize: '11px', paddingLeft: '0px' }}
                                            />
                                            <Bar
                                                yAxisId="left"
                                                dataKey="return"
                                                radius={[2, 2, 0, 0]}
                                                name="Total Return"
                                            >
                                                {equityCurve.map((entry, index) => (
                                                    <Cell
                                                        key={`cell-${index}`}
                                                        fill={entry.return >= 0 ? '#059669' : '#f59e0b'}
                                                    />
                                                ))}
                                                <LabelList dataKey="return" position="top" formatter={(val: any) => `${Number(val).toFixed(1)}%`} style={{ fontSize: '10px', fill: '#64748b' }} />
                                            </Bar>
                                            <Line
                                                yAxisId="right"
                                                type="monotone"
                                                dataKey="avgReturn"
                                                stroke="#6366f1"
                                                strokeWidth={2}
                                                dot={({ cx, cy, payload }: any) => (
                                                    <circle
                                                        cx={cx}
                                                        cy={cy}
                                                        r={4}
                                                        fill={payload.avgReturn >= 0 ? '#22c55e' : '#ef4444'}
                                                        stroke="white"
                                                        strokeWidth={1}
                                                    />
                                                )}
                                                name="Avg Return"
                                            >
                                                <LabelList dataKey="avgReturn" content={<CustomizedLabel />} />
                                            </Line>
                                        </ComposedChart>
                                    )}
                                </ResponsiveContainer>
                            </ChartCard>

                            {/* Summary Panel - Trade Breakdown for Selected Range */}
                            <ChartCard title="" height={350}>
                                <div className="flex flex-col h-full px-2">
                                    {/* Totals calculated from equityCurve */}
                                    {(() => {
                                        const totals = equityCurve.reduce((acc, d) => ({
                                            return: acc.return + (d.return || 0),
                                            count: acc.count + (d.count || 0),
                                            hitTP: acc.hitTP + (d.hitTP || 0),
                                            hitSL: acc.hitSL + (d.hitSL || 0),
                                            other: acc.other + (d.other || 0)
                                        }), { return: 0, count: 0, hitTP: 0, hitSL: 0, other: 0 });

                                        const avgReturn = totals.count > 0 ? totals.return / totals.count : 0;
                                        const total = totals.hitTP + totals.hitSL + totals.other;
                                        const tpPct = total > 0 ? (totals.hitTP / total) * 100 : 0;
                                        const slPct = total > 0 ? (totals.hitSL / total) * 100 : 0;
                                        const otherPct = total > 0 ? (totals.other / total) * 100 : 0;

                                        return (
                                            <div className="flex flex-col h-full pl-6">
                                                {/* Header */}
                                                <div className="flex items-center gap-2 mb-4">
                                                    <div className="w-2 h-2 rounded-full bg-blue-600"></div>
                                                    <div className="text-[10px] font-bold text-text-secondary uppercase tracking-widest font-sans">
                                                        PERIOD SUMMARY
                                                    </div>
                                                </div>

                                                {/* Total Return */}
                                                <div className="flex flex-col items-center mb-6">
                                                    <div className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-1 font-sans opacity-60">TOTAL RETURN</div>
                                                    <div className={`text-3xl font-medium font-sans tracking-tight ${totals.return >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                                        {totals.return >= 0 ? '+' : ''}{totals.return.toFixed(2)}%
                                                    </div>
                                                </div>

                                                {/* Avg Return */}
                                                <div className="flex justify-between items-center mb-6 px-1">
                                                    <span className="text-xs text-text-secondary font-sans font-medium">Avg Return / Trade</span>
                                                    <span className="text-sm font-extrabold text-text-primary font-sans">
                                                        {avgReturn >= 0 ? '+' : ''}{avgReturn.toFixed(2)}%
                                                    </span>
                                                </div>

                                                {/* Trade Outcomes */}
                                                <div>
                                                    <div className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-3 font-sans opacity-60">
                                                        TRADE OUTCOMES ({totals.count})
                                                    </div>

                                                    {/* Progress Bar */}
                                                    <div className="h-3.5 rounded-full overflow-hidden flex w-full mb-4">
                                                        {tpPct > 0 && <div className="bg-[#10b981] h-full" style={{ width: `${tpPct}%` }}></div>}
                                                        {slPct > 0 && <div className="bg-[#ef4444] h-full" style={{ width: `${slPct}%` }}></div>}
                                                        {otherPct > 0 && <div className="bg-[#94a3b8] h-full" style={{ width: `${otherPct}%` }}></div>}
                                                    </div>

                                                    {/* Legend */}
                                                    <div className="space-y-2.5">
                                                        <div className="flex items-center justify-between text-xs">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-2.5 h-2.5 rounded-[2px] bg-[#10b981]"></div>
                                                                <span className="text-text-secondary font-medium font-sans">Hit TP ({takeProfit}%)</span>
                                                            </div>
                                                            <div className="flex items-center gap-4">
                                                                <span className="text-text-secondary/60 w-8 text-right font-sans">{tpPct.toFixed(0)}%</span>
                                                                <span className="text-text-primary font-bold w-6 text-right font-sans">{totals.hitTP}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center justify-between text-xs">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-2.5 h-2.5 rounded-[2px] bg-[#ef4444]"></div>
                                                                <span className="text-text-secondary font-medium font-sans">Hit SL ({stopLoss === 100 ? 'Off' : `-${stopLoss}%`})</span>
                                                            </div>
                                                            <div className="flex items-center gap-4">
                                                                <span className="text-text-secondary/60 w-8 text-right font-sans">{slPct.toFixed(0)}%</span>
                                                                <span className="text-text-primary font-bold w-6 text-right font-sans">{totals.hitSL}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center justify-between text-xs">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-2.5 h-2.5 rounded-[2px] bg-[#94a3b8]"></div>
                                                                <span className="text-text-secondary font-medium font-sans">Other</span>
                                                            </div>
                                                            <div className="flex items-center gap-4">
                                                                <span className="text-text-secondary/60 w-8 text-right font-sans">{otherPct.toFixed(0)}%</span>
                                                                <span className="text-text-primary font-bold w-6 text-right font-sans">{totals.other}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );

                                    })()}
                                </div>
                            </ChartCard>
                        </div>

                        {/* PROBABILITY EFFICIENCY (Box Plot) */}
                        <ChartCard title="" height={350} className="w-full">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xs font-bold text-text-secondary uppercase tracking-widest flex items-center gap-2 font-sans">
                                    PROBABILITY EFFICIENCY
                                    <span className="text-[10px] font-normal text-text-secondary/70">
                                        (Return Distribution by Prob %)
                                    </span>
                                </h3>
                            </div>
                            <ResponsiveContainer width="100%" height="85%">
                                <BarChart data={boxPlotData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" opacity={0.5} vertical={false} />
                                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} axisLine={false} tickLine={false} />
                                    <YAxis stroke="#94a3b8" fontSize={11} axisLine={false} tickLine={false} unit="%" />
                                    <Tooltip
                                        cursor={{ fill: '#f8fafc' }}
                                        content={({ active, payload, label }) => {
                                            if (!active || !payload || !payload.length) return null;
                                            const data = payload[0].payload;
                                            return (
                                                <div className="bg-white/95 border border-gray-200 rounded-lg p-3 shadow-sm min-w-[140px]">
                                                    <div className="font-bold text-gray-800 mb-2 border-b border-gray-100 pb-1">{label} ({data.count} trades)</div>
                                                    <div className="space-y-1 text-xs">
                                                        <div className="flex justify-between"><span className="text-gray-500">Max:</span> <span className="font-mono text-emerald-600">{data.max.toFixed(2)}%</span></div>
                                                        <div className="flex justify-between"><span className="text-gray-500">Q3:</span> <span className="font-mono text-gray-700">{data.q3.toFixed(2)}%</span></div>
                                                        <div className="flex justify-between"><span className="text-gray-500">Median:</span> <span className="font-mono font-bold text-blue-600">{data.median.toFixed(2)}%</span></div>
                                                        <div className="flex justify-between"><span className="text-gray-500">Q1:</span> <span className="font-mono text-gray-700">{data.q1.toFixed(2)}%</span></div>
                                                        <div className="flex justify-between"><span className="text-gray-500">Min:</span> <span className="font-mono text-rose-500">{data.min.toFixed(2)}%</span></div>
                                                    </div>
                                                </div>
                                            );
                                        }}
                                    />
                                    <Bar dataKey="max" fill="transparent" shape={(props: any) => {
                                        const { x, width, payload, yAxis } = props;
                                        if (!payload || !yAxis) return <g />;
                                        const { min, q1, median, q3, max: maxVal } = payload;

                                        const scale = yAxis.scale;
                                        const yMin = scale(min);
                                        const yQ1 = scale(q1);
                                        const yMedian = scale(median);
                                        const yQ3 = scale(q3);
                                        const yMax = scale(maxVal);
                                        const cx = x + width / 2;
                                        const boxWidth = width * 0.4;

                                        return (
                                            <g>
                                                {/* Whiskers */}
                                                <line x1={cx} y1={yMin} x2={cx} y2={yQ1} stroke="#94a3b8" strokeWidth={1} />
                                                <line x1={cx} y1={yQ3} x2={cx} y2={yMax} stroke="#94a3b8" strokeWidth={1} />
                                                <line x1={cx - boxWidth / 2} y1={yMin} x2={cx + boxWidth / 2} y2={yMin} stroke="#94a3b8" strokeWidth={1} />
                                                <line x1={cx - boxWidth / 2} y1={yMax} x2={cx + boxWidth / 2} y2={yMax} stroke="#94a3b8" strokeWidth={1} />

                                                {/* Box (Rect from Q3 to Q1) */}
                                                <rect
                                                    x={cx - boxWidth / 2}
                                                    y={Math.min(yQ1, yQ3)}
                                                    width={boxWidth}
                                                    height={Math.max(2, Math.abs(yQ1 - yQ3))}
                                                    fill={median > 0 ? "#86efac" : "#fca5a5"}
                                                    opacity={0.6}
                                                    stroke={median > 0 ? "#16a34a" : "#dc2626"}
                                                    strokeWidth={1}
                                                    rx={2}
                                                />

                                                {/* Median Line */}
                                                <line x1={cx - boxWidth / 2} y1={yMedian} x2={cx + boxWidth / 2} y2={yMedian} stroke="#1f2937" strokeWidth={2} />
                                            </g>
                                        );
                                    }} />
                                    <ReferenceLine y={0} stroke="#e5e5e5" />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartCard>

                        {/* ROW 2: Tables (Top Tickers + Top Periods + Sectors) */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Top Tickers Leaderboard */}
                            <ChartCard title="" height={280}>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-xs font-bold text-text-secondary uppercase tracking-widest font-sans">
                                        TOP TICKERS PERFORMANCE
                                    </h3>
                                </div>
                                <div className="overflow-y-auto h-full pr-1">
                                    <table className="w-full text-xs text-left text-text-secondary font-sans border-separate border-spacing-y-1">
                                        <thead>
                                            <tr className="border-b border-border-primary text-[10px] uppercase">
                                                <th className="pb-2 font-medium pl-2">Rank</th>
                                                <th className="pb-2 font-medium">Ticker</th>
                                                <th className="pb-2 font-medium text-right pr-2">Avg Return</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {topTickers.slice(0, 10).map((ticker, idx) => (
                                                <tr key={idx} className="bg-bg-tertiary/20 hover:bg-bg-tertiary/40 transition-colors rounded-md">
                                                    <td className="py-2 pl-2 font-mono text-text-secondary/70 max-w-[40px]">#{idx + 1}</td>
                                                    <td className="py-2 font-bold text-text-primary">{ticker.name}</td>
                                                    <td className={cn(
                                                        "py-2 pr-2 text-right font-bold",
                                                        ticker.avgMvso > 0 ? "text-emerald-500" : "text-rose-500"
                                                    )}>
                                                        {ticker.avgMvso > 0 ? '+' : ''}{ticker.avgMvso.toFixed(2)}%
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </ChartCard>

                            {/* Top Periods Table */}
                            <ChartCard title="" height={280}>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-xs font-bold text-text-secondary uppercase tracking-widest font-sans">
                                        TOP PERIODS
                                    </h3>
                                    <div className="flex bg-bg-tertiary/30 rounded-md p-0.5 border border-border-primary">
                                        {(['days', 'weeks', 'months'] as const).map((period) => (
                                            <button
                                                key={period}
                                                onClick={() => setPeriodGranularity(period)}
                                                className={cn(
                                                    "px-2 py-1 text-[10px] font-medium rounded transition-all capitalize font-sans",
                                                    periodGranularity === period
                                                        ? "bg-accent-primary text-white shadow-sm"
                                                        : "text-text-secondary hover:text-text-primary"
                                                )}
                                            >
                                                {period}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="overflow-y-auto h-full pr-1">
                                    <table className="w-full text-xs text-left text-text-secondary font-sans">
                                        <thead>
                                            <tr className="border-b border-border-primary/50 text-[10px] uppercase">
                                                <th className="py-2 font-medium">
                                                    {periodGranularity === 'days' ? 'Date' : periodGranularity === 'weeks' ? 'Week Of' : 'Month'}
                                                </th>
                                                <th className="py-2 font-medium text-right">Return</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {topPeriods[periodGranularity].map((d, i) => (
                                                <tr key={i} className="border-b border-border-primary/20 last:border-0 hover:bg-bg-tertiary/10">
                                                    <td className="py-2 font-sans">{d.date}</td>
                                                    <td className={cn(
                                                        "py-2 text-right font-bold font-sans",
                                                        d.return >= 0 ? "text-emerald-500" : "text-rose-500"
                                                    )}>
                                                        {d.return >= 0 ? '+' : ''}{d.return.toFixed(2)}%
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </ChartCard>

                            {/* Top Sectors Leaderboard */}
                            <ChartCard title="" height={280}>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-xs font-bold text-text-secondary uppercase tracking-widest font-sans">
                                        OUTPERFORMING SECTORS
                                    </h3>
                                </div>
                                <div className="overflow-y-auto h-full pr-1">
                                    <table className="w-full text-xs text-left text-text-secondary font-sans">
                                        <thead>
                                            <tr className="border-b border-border-primary text-[10px] uppercase">
                                                <th className="pb-2 font-medium">Sector</th>
                                                <th className="pb-2 font-medium text-right">Avg %</th>
                                                <th className="pb-2 font-medium text-right">Freq %</th>
                                                <th className="pb-2 font-medium text-right">WR %</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(() => {
                                                const totalCount = topSectors.reduce((sum, s) => sum + s.count, 0);
                                                return topSectors.map((sector, idx) => (
                                                    <tr key={idx} className="border-b border-border-primary/50 hover:bg-bg-tertiary/10 transition-colors">
                                                        <td className="py-2 text-text-primary truncate max-w-[100px] font-sans">{sector.name}</td>
                                                        <td className={cn("py-2 text-right font-sans", sector.avgMvso > 0 ? "text-emerald-500" : "text-rose-500")}>
                                                            {sector.avgMvso.toFixed(1)}%
                                                        </td>
                                                        <td className="py-2 text-right font-sans text-text-secondary">
                                                            {totalCount > 0 ? ((sector.count / totalCount) * 100).toFixed(1) : 0}%
                                                        </td>
                                                        <td className="py-2 text-right font-sans">{sector.winRate}%</td>
                                                    </tr>
                                                ));
                                            })()}
                                        </tbody>
                                    </table>
                                </div>
                            </ChartCard>
                        </div>

                        {/* ROW 3: Expectancy Distribution (Full Width) */}
                        <ChartCard title="" height={280}>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-xs font-bold text-text-secondary uppercase tracking-widest font-sans">
                                    EXPECTANCY DISTRIBUTION
                                </h3>
                            </div>
                            <ResponsiveContainer width="100%" height="90%">
                                <BarChart data={distribution} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" opacity={0.5} vertical={false} />
                                    <XAxis
                                        dataKey="name"
                                        stroke="#94a3b8"
                                        fontSize={10}
                                        tickFormatter={(v) => v.replace('%', '')}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis stroke="#94a3b8" fontSize={10} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        cursor={{ fill: '#f3f4f6', opacity: 0.5 }}
                                        contentStyle={{
                                            backgroundColor: 'rgba(255,255,255,0.95)',
                                            border: '1px solid #e5e7eb',
                                            borderRadius: '6px',
                                            boxShadow: 'none',
                                            color: '#1f2937',
                                            fontFamily: '"Source Sans 3", system-ui, sans-serif',
                                            fontSize: '12px'
                                        }}
                                    />
                                    <Bar
                                        dataKey="count"
                                        fill={chartColor}
                                        radius={[4, 4, 0, 0]}
                                        fillOpacity={0.8}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartCard>
                    </div>
                </div>
            </div >
        </div >
    );
}

function InfoTooltip({ text }: { text: string }) {
    if (!text) return null;
    return (
        <div className="group relative ml-1.5 cursor-help inline-flex items-center">
            <Info className="w-3 h-3 text-text-secondary opacity-50 hover:opacity-100 transition-opacity" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1.5 bg-bg-secondary border border-border-primary rounded text-[10px] text-text-primary whitespace-nowrap shadow-sm opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                {text}
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px w-2 h-2 bg-bg-secondary border-b border-r border-border-primary rotate-45"></div>
            </div>
        </div>
    );
}

function TerminalMetric({ label, value, subValue, trend, color, tooltip }: { label: string, value: string, subValue?: string, trend?: 'up' | 'down' | 'neutral', color?: string, tooltip?: string }) {
    return (
        <div className={cn(
            "rounded-xl p-4 flex flex-col justify-between bg-bg-primary border border-border-primary/20 shadow-sm hover:shadow-md transition-all duration-200",
        )}>
            <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-bold text-text-secondary uppercase tracking-widest flex items-center gap-1.5 opacity-80">
                    {label}
                    {tooltip && <InfoTooltip text={tooltip} />}
                </div>
                {trend && <div className={cn("w-1.5 h-1.5 rounded-full", trend === 'up' ? "bg-emerald-500" : trend === 'down' ? "bg-rose-500" : "bg-gray-400")}></div>}
            </div>
            <div>
                <div className={cn(
                    "text-2xl font-bold font-sans tracking-tight",
                    color ? "" :
                        !color && trend === 'up' ? "text-emerald-600" :
                            !color && trend === 'down' ? "text-rose-600" : "text-text-primary"
                )} style={{ color }}>
                    {value}
                </div>
                {subValue && <div className="text-[10px] text-text-secondary font-medium mt-1 opacity-70">{subValue}</div>}
            </div>
        </div>
    );
}

function ChartCard({ title, height, children, className }: { title: string, height: number, children: React.ReactNode, className?: string }) {
    return (
        <div className={cn(
            "border border-border-primary/30 rounded-lg p-3 bg-bg-primary overflow-hidden flex flex-col",
            className
        )} style={{ height }}>
            {title && (
                <h3 className="text-xs font-semibold text-text-secondary mb-4 flex items-center gap-2">
                    {title}
                    <div className="flex-1 h-px bg-border-primary/20"></div>
                </h3>
            )}
            <div className="flex-1 min-h-0 overflow-hidden">
                {children}
            </div>
        </div>
    );
}
