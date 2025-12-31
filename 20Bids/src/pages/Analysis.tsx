import { useState, useEffect, useMemo } from 'react';
import Plot from 'react-plotly.js';
import { Sidebar } from '../components/Sidebar';
import {
    Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    ComposedChart, Line, Legend, Cell,
    LineChart, ReferenceLine
} from 'recharts';
import { cn } from '../lib/utils';
import { fetchAnalysis } from '../api/client';
import { startOfYear, subWeeks, subMonths, isAfter } from 'date-fns';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { Calendar, TrendingUp, TrendingDown, BarChart2, DollarSign, Percent } from 'lucide-react';

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
    tradeReturns: { date: string, return: number, probability: number }[];
    debugVersion?: string;
}

// CustomizedLabel - commented out, not currently used
// const CustomizedLabel = (props: any) => {
//     const { x, y, value } = props;
//     if (!value && value !== 0) return null;
//     return (
//         <g>
//             <rect x={x - 18} y={y - 20} width={36} height={16} fill="white" rx={4} stroke="#e5e5e5" strokeWidth={1} />
//             <text x={x} y={y - 9} fill="#059669" textAnchor="middle" dominantBaseline="middle" fontSize={10} fontWeight="bold">
//                 {Number(value).toFixed(2)}%
//             </text>
//         </g>
//     );
// };

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



    // Optimization Heatmap state
    const [optimizationData, setOptimizationData] = useState<any>(null);
    // const [optimizationLoading, setOptimizationLoading] = useState(false); // Removed unused string


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

    const [debouncedTakeProfit, setDebouncedTakeProfit] = useState<number>(takeProfit);
    const [debouncedStopLoss, setDebouncedStopLoss] = useState<number>(stopLoss);
    const [debouncedMinVolume, setDebouncedMinVolume] = useState<number>(minVolume);
    const [debouncedMinPrice, setDebouncedMinPrice] = useState<number>(minPrice);
    const [debouncedMinProb, setDebouncedMinProb] = useState<number>(minProb);
    const [mvsoThreshold] = useState<number>(0.5); // New MVSO Threshold Filter (Fixed)
    const [maxRiskTolerance] = useState<number>(12); // Max SL% user is willing to accept
    // const [targetTP, setTargetTP] = useState<number>(5); // Removed unused


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

    // Optimization Data Fetcher
    const fetchOptimizationData = async () => {
        // setOptimizationLoading(true);
        try {
            const { API_URL } = await import('../api/client');
            // Handle volume in millions
            const volValue = minVolume || 0;
            const volParam = volValue < 1000 ? volValue * 1000000 : volValue;

            const params = new URLSearchParams({
                tp: takeProfit.toString(),
                sl: stopLoss.toString(),
                minVol: volParam.toString(),
                minPrice: minPrice.toString(),
                minProb: minProb.toString()
            });
            const res = await fetch(`${API_URL}/stats/optimization?${params.toString()}`);
            const data = await res.json();
            console.log('[Frontend] Optimization Data Received:', data); // DEBUG
            if (data.bubbleData) {
                console.log(`[Frontend] Bubble Data items: ${data.bubbleData.length}`);
            } else {
                console.warn('[Frontend] No bubbleData found in response');
            }
            setOptimizationData(data);
        } catch (err) {
            console.error('Optimization fetch error:', err);
        }
        // setOptimizationLoading(false);
    };

    // Auto-Run on Mount
    useEffect(() => {
        fetchOptimizationData();
    }, []);

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
        if (!data) return {
            equityCurve: [],
            dailyAverages: [],
            distribution: [],
            seasonality: [],
            topTickers: [],
            topSectors: [],
            volume: [],
            tradeReturns: [],
            boxPlotData: [] as { name: string, values: number[], count: number }[],
            riskMetrics: {
                profitFactor: 0,
                maxDrawdown: 0,
                maxWinStreak: 0,
                maxLossStreak: 0,
                totalReturn: 0
            }
        };

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
        const bestDayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][bestDayStat.day];
        const bestDayWR = bestDayStat.total > 0 ? (bestDayStat.wins / bestDayStat.total * 100) : 0;

        // Calculate Sessions (unique trading days) and Inversions per Day
        const uniqueDates = new Set(filteredEquity.map((d: any) => d.date));
        const sessions = uniqueDates.size;
        // Inversions per day = total trades in the original data / total unique days in the data
        const totalInvestments = data?.equityCurve?.length || 0;
        const totalUniqueDays = new Set(data?.equityCurve?.map((d: any) => d.date) || []).size;
        const inversionsPerDay = totalUniqueDays > 0 ? totalInvestments / totalUniqueDays : 0;

        const avgWin = totalWins > 0 ? sumWinReturns / totalWins : 0;
        const avgLoss = lossCount > 0 ? sumLossReturns / lossCount : 0;
        const avgR = avgLoss > 0 ? avgWin / avgLoss : avgWin;

        const winRate = totalCount > 0 ? totalWins / totalCount : 0;
        const expectancy = (winRate * avgWin) - ((1 - winRate) * avgLoss);

        const reliability = pf > 1.6 ? 'High' : pf > 1.2 ? 'Medium' : 'Low';
        const reliabilityColor = pf > 1.6 ? 'text-emerald-500' : pf > 1.2 ? 'text-amber-500' : 'text-rose-500';

        // Box Plot Calculation: Distribution by Probability Range
        const probBuckets = [
            { label: '70-75', min: 70, max: 75, values: [] as number[], valuesHighMvso: [] as number[] },
            { label: '75-80', min: 75, max: 80, values: [] as number[], valuesHighMvso: [] as number[] },
            { label: '80-85', min: 80, max: 85, values: [] as number[], valuesHighMvso: [] as number[] },
            { label: '85-90', min: 85, max: 90, values: [] as number[], valuesHighMvso: [] as number[] },
            { label: '90+', min: 90, max: 1000, values: [] as number[], valuesHighMvso: [] as number[] }, // Capture all high probabilities
        ];

        // Populate buckets using granular tradeReturns if available, otherwise fallback (less accurate)
        const sourceData = (data as any).tradeReturns || [];

        sourceData.forEach((d: any) => {
            const prob = d.probability || 70;

            // Apply Date Filter
            if (filterStart) {
                const tradeDate = new Date(d.date);
                if (tradeDate < filterStart) return;
            }

            // Use raw or clamped return based on toggle
            const ret = d.rawReturn ?? d.return;

            const bucket = probBuckets.find(b => prob >= b.min && prob < b.max);
            if (bucket) {
                bucket.values.push(ret);

                // Compare rawReturn (MVSO) against threshold
                const mvso = d.rawReturn ?? 0;
                if (mvso >= mvsoThreshold) {
                    bucket.valuesHighMvso.push(ret);
                }
            }
        });

        // Compute stats for each bucket (for Plotly Box Plot)
        const boxPlotData = probBuckets.map(bucket => {
            const values = bucket.values;
            const count = values.length;

            if (count === 0) return { name: bucket.label, values: [], count: 0 };

            return {
                name: bucket.label,
                values: values, // Raw values for Plotly
                count,
                valuesHighMvso: bucket.valuesHighMvso,
                countHighMvso: bucket.valuesHighMvso.length,
                hitRate: count > 0 ? (bucket.valuesHighMvso.length / count) * 100 : 0
            };
        });

        console.log('Box Plot Data for Plotly:', boxPlotData);

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
                reliabilityColor,
                // New metrics
                sessions,
                inversionsPerDay
            }
        }

    }, [data, timeRange, takeProfit, customStartDate, customEndDate, mvsoThreshold]);



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

    const { riskMetrics, equityCurve, boxPlotData } = filteredMetrics;
    const isTerminal = theme === 'terminal';
    // Deleted chartColor logic entirely logic as it was unused

    // Best Day Calculation (Moved to useMemo)



    return (
        <div className="flex h-screen bg-bg-primary overflow-hidden font-sans">
            <Sidebar />

            <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
                <div className="p-6 space-y-6 bg-bg-primary">

                    {/* Unified Header & Filter Toolbar */}
                    {/* ROW 1: Title & Date (Simpler, Smaller) - SCROLLS AWAY */}
                    <div className="pb-4 border-b border-border-primary/50">
                        <div className="flex items-center justify-between">
                            <h1 className="text-lg font-bold text-text-primary uppercase tracking-wider flex items-center gap-2">
                                <span className={cn("inline-block w-2 h-2 rounded-full", isTerminal ? "bg-amber-400 animate-pulse" : "bg-accent-primary")}></span>
                                SYSTEM PERFORMANCE
                            </h1>
                            <div className="text-[10px] font-medium text-text-secondary uppercase tracking-widest bg-bg-secondary/50 px-3 py-1 rounded-full border border-border-primary/30">
                                {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT: Unified Control Bar - STICKY */}
                    <div className="sticky top-0 z-50 bg-bg-primary/95 backdrop-blur pt-2 pb-4 border-b border-border-primary/50 -mt-2 mb-4">
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

                    {/* Advanced Intraday Metrics Grid (6 Cards) */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
                        {/* 1. Profit Factor */}
                        <TerminalMetric
                            label="Profit Factor"
                            value={(riskMetrics as any).profitFactor.toFixed(2)}
                            subValue={((riskMetrics as any).profitFactor > 1.5 ? 'Healthy' : 'Low')}
                            trend={(riskMetrics as any).profitFactor > 1.5 ? 'up' : 'neutral'}
                        />

                        {/* 2. Max Drawdown */}
                        <TerminalMetric
                            label="Max Drawdown"
                            value={`${(riskMetrics as any).maxDrawdown.toFixed(2)}%`}
                            trend="down"
                            subValue="Peak Drop"
                        />

                        {/* 3. Best Day */}
                        <TerminalMetric
                            label="Best Day"
                            value={(riskMetrics as any).bestDayName || '-'}
                            subValue={`${(riskMetrics as any).bestDayWR?.toFixed(0)}% Win Rate`}
                            trend="up"
                        />

                        {/* 4. Expectancy */}
                        <TerminalMetric
                            label="Expectancy"
                            value={`${(riskMetrics as any).expectancy?.toFixed(2)}%`}
                            subValue="Per Trade"
                            trend={(riskMetrics as any).expectancy > 0 ? 'up' : 'down'}
                        />

                        {/* 5. Sessions (NEW) */}
                        <TerminalMetric
                            label="Sessions"
                            value={`${(riskMetrics as any).sessions || 0}`}
                            subValue="Days Traded"
                            trend="neutral"
                        />

                        {/* 6. Inversions/Day (NEW) */}
                        <TerminalMetric
                            label="Inversions/Day"
                            value={`${(riskMetrics as any).inversionsPerDay?.toFixed(1) || '0'}`}
                            subValue="Avg Per Session"
                            trend="neutral"
                        />
                    </div>

                    <div className="space-y-6">
                        {/* ROW 1: Charts (Performance Evolution 75% + Seasonality 25%) */}
                        <div className="grid grid-cols-1 md:grid-cols-[2.5fr_1fr] lg:grid-cols-[3fr_1fr] gap-6">
                            {/* Performance Evolution Chart - Portfolio Value Style */}
                            <ChartCard title="" height={380}>
                                {/* Header with Big Metric */}
                                <div className="mb-3 pl-0">
                                    <p className="text-sm text-gray-500 mb-1">Portfolio Value</p>
                                    <p className="text-3xl font-semibold">
                                        {(() => {
                                            const total = equityCurve.reduce((acc, d) => acc + (d.return || 0), 0);
                                            return (
                                                <span className={total >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                                                    {total >= 0 ? '+' : ''}{total.toFixed(2)}%
                                                </span>
                                            );
                                        })()}
                                    </p>
                                    <p className="text-xs text-text-secondary mt-1">
                                        {equityCurve.reduce((acc, d) => acc + (d.count || 0), 0)} trades • TP: {takeProfit}%
                                    </p>
                                </div>
                                <ResponsiveContainer width="100%" height="75%">
                                    <ComposedChart data={equityCurve} margin={{ left: -24, right: 0, top: 10, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={1} vertical={false} />
                                        <XAxis
                                            dataKey="date"
                                            stroke="#6b7280"
                                            fontSize={11}
                                            tickFormatter={(val) => val.slice(5)}
                                            minTickGap={50}
                                            axisLine={false}
                                            tickLine={false}
                                            fontFamily='"Source Sans 3", sans-serif'
                                        />
                                        <YAxis
                                            yAxisId="left"
                                            stroke="#9ca3af" // Gray for left axis
                                            fontSize={11}
                                            fontFamily='"Source Sans 3", sans-serif'
                                            domain={[
                                                (_: number) => {
                                                    const maxLeft = Math.max(...equityCurve.map(d => d.return), 0);
                                                    const minLeft = Math.min(...equityCurve.map(d => d.return), 0);

                                                    // Replicate Right Axis Padding Logic to ensure synchronized zero alignment
                                                    const realMaxRight = Math.max(...equityCurve.map((d: any) => d.avgReturn || 0), 0);
                                                    const realMinRight = Math.min(...equityCurve.map((d: any) => d.avgReturn || 0), 0);
                                                    const span = realMaxRight - realMinRight || 0.1;
                                                    const padding = span * 3;
                                                    const maxRight = realMaxRight + padding;
                                                    const minRight = realMinRight - padding;

                                                    const rangeLeft = maxLeft - minLeft || 1;
                                                    const rangeRight = maxRight - minRight || 1;

                                                    const zeroPosLeft = Math.abs(minLeft) / rangeLeft;
                                                    const zeroPosRight = Math.abs(minRight) / rangeRight;

                                                    const targetZero = Math.max(zeroPosLeft, zeroPosRight, 0.1);

                                                    // Adjust minLeft to match targetZero
                                                    const newMin = - (targetZero * maxLeft) / (1 - targetZero);
                                                    return Math.min(newMin, minLeft);
                                                },
                                                'auto'
                                            ]}
                                            axisLine={false}
                                            tickLine={false}
                                            unit="%"
                                        />
                                        <YAxis
                                            yAxisId="right"
                                            orientation="right"
                                            stroke="#9ca3af" // Gray for right axis
                                            fontSize={11}
                                            fontFamily='"Source Sans 3", sans-serif'
                                            tickFormatter={(val) => val.toFixed(1)}
                                            domain={[
                                                (_: number) => {
                                                    // Right Axis Logic - FLATTEN LINE & SYNC ZERO
                                                    const realMaxRight = Math.max(...equityCurve.map((d: any) => d.avgReturn || 0), 0);
                                                    const realMinRight = Math.min(...equityCurve.map((d: any) => d.avgReturn || 0), 0);
                                                    const span = realMaxRight - realMinRight || 0.1;
                                                    const padding = span * 3; // Large padding to flatten

                                                    // Sync Zero with Left Axis
                                                    const maxLeft = Math.max(...equityCurve.map(d => d.return), 0);
                                                    const minLeft = Math.min(...equityCurve.map(d => d.return), 0);
                                                    const rangeLeft = maxLeft - minLeft || 1;
                                                    const zeroPosLeft = Math.abs(minLeft) / rangeLeft;

                                                    const maxRight = realMaxRight + padding;
                                                    const newMin = - (zeroPosLeft * maxRight) / (1 - zeroPosLeft);
                                                    return Math.min(newMin, realMinRight - padding);
                                                },
                                                (_: number) => {
                                                    // Explicit Max to ensure padding is respected
                                                    const realMaxRight = Math.max(...equityCurve.map((d: any) => d.avgReturn || 0), 0);
                                                    const realMinRight = Math.min(...equityCurve.map((d: any) => d.avgReturn || 0), 0);
                                                    const span = realMaxRight - realMinRight || 0.1;
                                                    const padding = span * 3;
                                                    return realMaxRight + padding;
                                                }
                                            ]}
                                            axisLine={false}
                                            tickLine={false}
                                            unit="%"
                                        />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
                                            contentStyle={{
                                                backgroundColor: '#ffffff',
                                                border: 'none',
                                                borderRadius: '12px',
                                                boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                                                padding: '12px 16px',
                                                fontFamily: '"Source Sans 3", sans-serif',
                                            }}
                                            content={({ active, payload, label }) => {
                                                if (!active || !payload || !payload.length) return null;
                                                const data = payload[0]?.payload;
                                                return (
                                                    <div style={{
                                                        backgroundColor: '#ffffff',
                                                        borderRadius: '12px',
                                                        padding: '12px 16px',
                                                        boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                                                        minWidth: '140px'
                                                    }}>
                                                        <div style={{ fontWeight: 600, color: '#1f2937', marginBottom: '8px', fontSize: '14px' }}>
                                                            {label}
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <span style={{
                                                                width: '8px',
                                                                height: '8px',
                                                                borderRadius: '50%',
                                                                backgroundColor: '#3b82f6',
                                                                display: 'inline-block'
                                                            }} />
                                                            <span style={{ color: '#6b7280', fontSize: '13px' }}>Return</span>
                                                            <span style={{
                                                                fontWeight: 600,
                                                                color: '#1f2937',
                                                                marginLeft: 'auto',
                                                                fontSize: '14px'
                                                            }}>
                                                                {data?.return?.toFixed(2)}%
                                                            </span>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                                                            <span style={{
                                                                width: '8px',
                                                                height: '8px',
                                                                borderRadius: '50%',
                                                                backgroundColor: '#8b5cf6',
                                                                display: 'inline-block'
                                                            }} />
                                                            <span style={{ color: '#6b7280', fontSize: '13px' }}>Avg Return</span>
                                                            <span style={{
                                                                fontWeight: 600,
                                                                color: '#1f2937',
                                                                marginLeft: 'auto',
                                                                fontSize: '14px'
                                                            }}>
                                                                {data?.avgReturn?.toFixed(2)}%
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            }}
                                        />
                                        <Legend
                                            verticalAlign="top"
                                            align="right"
                                            height={28}
                                            iconType="circle"
                                            iconSize={8}
                                            wrapperStyle={{ fontSize: '11px', paddingBottom: '4px' }}
                                        />
                                        <ReferenceLine y={0} yAxisId="left" stroke="#e5e7eb" strokeWidth={1} />
                                        <Bar
                                            yAxisId="left"
                                            dataKey="return"
                                            radius={[4, 4, 0, 0]}
                                            name="Total Return"
                                            fill="#3b82f6"
                                        >
                                            {equityCurve.map((entry, index) => (
                                                <Cell
                                                    key={`cell-${index}`}
                                                    fill={entry.return >= 0 ? '#3b82f6' : '#bfdbfe'}
                                                />
                                            ))}
                                        </Bar>
                                        <Line
                                            yAxisId="right"
                                            type="monotone"
                                            dataKey="avgReturn"
                                            stroke="#8b5cf6"
                                            strokeWidth={2}
                                            dot={{ fill: '#8b5cf6', stroke: '#fff', strokeWidth: 2, r: 3 }}
                                            name="Avg Return"
                                        />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </ChartCard>

                            {/* Summary Panel - Trade Breakdown for Selected Range */}
                            <ChartCard title="" height={400}>
                                <div className="flex flex-col h-full px-4">
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
                                            <div className="flex flex-col h-full">
                                                {/* Header with Big Avg Return */}
                                                <div className="mb-4">
                                                    <p className="text-sm text-text-secondary mb-1">Period Summary</p>
                                                    <p className={`text-3xl font-semibold ${avgReturn >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                        {avgReturn >= 0 ? '+' : ''}{avgReturn.toFixed(2)}%
                                                    </p>
                                                    <p className="text-xs text-text-secondary mt-1">Avg Return</p>
                                                </div>

                                                {/* Simple Table */}
                                                <table className="w-full text-sm">
                                                    <tbody>
                                                        <tr className="border-b border-border-primary/40">
                                                            <td className="py-3 text-text-secondary">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                                                    Hit TP ({takeProfit}%)
                                                                </div>
                                                            </td>
                                                            <td className="py-3 text-right font-medium text-text-primary">{totals.hitTP}</td>
                                                            <td className="py-3 text-right text-text-secondary w-16">({tpPct.toFixed(0)}%)</td>
                                                        </tr>
                                                        <tr className="border-b border-border-primary/40">
                                                            <td className="py-3 text-text-secondary">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                                                                    Hit SL ({stopLoss === 100 ? 'Off' : `-${stopLoss}%`})
                                                                </div>
                                                            </td>
                                                            <td className="py-3 text-right font-medium text-text-primary">{totals.hitSL}</td>
                                                            <td className="py-3 text-right text-text-secondary w-16">({slPct.toFixed(0)}%)</td>
                                                        </tr>
                                                        <tr className="border-b border-border-primary/40">
                                                            <td className="py-3 text-text-secondary">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                                                                    Other
                                                                </div>
                                                            </td>
                                                            <td className="py-3 text-right font-medium text-text-primary">{totals.other}</td>
                                                            <td className="py-3 text-right text-text-secondary w-16">({otherPct.toFixed(0)}%)</td>
                                                        </tr>
                                                        <tr className="border-b border-border-primary/40">
                                                            <td className="py-3 text-text-secondary pl-4">Avg Return</td>
                                                            <td colSpan={2} className={`py-3 text-right font-medium ${avgReturn >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                                {avgReturn >= 0 ? '+' : ''}{avgReturn.toFixed(2)}%
                                                            </td>
                                                        </tr>
                                                        <tr>
                                                            <td className="py-3 text-text-secondary font-medium pl-4">Total Trades</td>
                                                            <td colSpan={2} className="py-3 text-right font-medium text-text-primary">{totals.count}</td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </div>
                                        );

                                    })()}
                                </div>
                            </ChartCard>
                        </div>

                        {/* ROW 1: Distribution Analysis: Probability Efficiency + Volume Segment */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                            {/* PROBABILITY EFFICIENCY (Box Plot) */}
                            <ChartCard title="" height={500} className="w-full">
                                <div className="flex flex-col h-full px-4 pt-2">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-sm text-gray-500 mb-1 font-sans">
                                            Probability Efficiency
                                            <span className="text-[10px] text-gray-400 ml-2">
                                                (Return Distribution by Prob %)
                                            </span>
                                        </p>
                                    </div>
                                    <div className="flex-1 w-full min-h-0">
                                        <Plot
                                            data={(() => {
                                                const traces: any[] = [];
                                                // 1. Box Traces
                                                (boxPlotData || []).forEach((bucket) => {
                                                    const vals = (bucket as any).values || [];
                                                    if (vals.length > 0) {
                                                        traces.push({
                                                            y: vals,
                                                            type: 'box',
                                                            name: bucket.name,
                                                            marker: { color: 'rgba(59, 130, 246, 0.4)', line: { color: '#3b82f6', width: 1 }, size: 3 },
                                                            boxpoints: 'all',
                                                            jitter: 0.5,
                                                            pointpos: -1.8,
                                                            fillcolor: '#ffffff',
                                                            line: { color: '#3b82f6', width: 1.5 },
                                                            showlegend: false,
                                                            hovertemplate:
                                                                '<b>%{x}</b><br>' +
                                                                '<span style="color:#3b82f6">●</span> Median: <b>%{median:.2f}%</b><br>' +
                                                                '<span style="color:#3b82f6; opacity: 0.7">●</span> Q3: %{q3:.2f}%<br>' +
                                                                '<span style="color:#3b82f6; opacity: 0.7">●</span> Q1: %{q1:.2f}%<br>' +
                                                                '<span style="color:#9ca3af">●</span> Max: %{max:.2f}%<br>' +
                                                                '<span style="color:#9ca3af">●</span> Min: %{min:.2f}%' +
                                                                '<extra></extra>'
                                                        });
                                                    }
                                                });
                                                // 2. Line Trace
                                                const xValues = (boxPlotData || []).map(b => b.name);
                                                const yValues = (boxPlotData || []).map(b => (b as any).hitRate || 0);
                                                traces.push({
                                                    x: xValues,
                                                    y: yValues,
                                                    name: `MVSO > ${mvsoThreshold}% Rate`,
                                                    type: 'scatter',
                                                    mode: 'lines+markers',
                                                    yaxis: 'y2',
                                                    line: { color: '#f59e0b', width: 2 },
                                                    marker: { color: '#f59e0b', size: 6, symbol: 'circle', line: { color: 'white', width: 1 } },
                                                    hovertemplate:
                                                        '<b>%{x}</b><br>' +
                                                        '<span style="color:#f59e0b">●</span> Hit Rate: <b>%{y:.1f}%</b>' +
                                                        '<extra></extra>'
                                                });
                                                return traces;
                                            })()}
                                            layout={{
                                                hoverlabel: {
                                                    bgcolor: '#ffffff',
                                                    bordercolor: '#e5e7eb',
                                                    font: { family: '"Source Sans 3", sans-serif', size: 12, color: '#1f2937' },
                                                    align: 'left'
                                                },
                                                autosize: true,
                                                margin: { l: 45, r: 45, t: 40, b: 70 },
                                                yaxis: {
                                                    title: { text: 'Return %', font: { size: 10, color: '#64748b', family: '"Source Sans 3", sans-serif' } },
                                                    range: (() => {
                                                        const allVals = (boxPlotData || []).flatMap(b => (b as any).values || []);
                                                        if (allVals.length === 0) return undefined;
                                                        allVals.sort((a, b) => a - b);
                                                        const p98 = allVals[Math.floor(allVals.length * 0.98)] || 10;
                                                        const maxVal = Math.max(...allVals);
                                                        return [Math.min(...allVals, -5), Math.min(maxVal, Math.max(20, p98 * 1.5))];
                                                    })(),
                                                    zeroline: true,
                                                    zerolinecolor: '#e5e7eb',
                                                    gridcolor: '#f3f4f6',
                                                    tickfont: { size: 10, color: '#64748b', family: '"Source Sans 3", sans-serif' }
                                                },
                                                yaxis2: {
                                                    title: { text: 'Hit Rate %', font: { size: 10, color: '#9ca3af', family: '"Source Sans 3", sans-serif' } },
                                                    overlaying: 'y',
                                                    side: 'right',
                                                    range: [0, 115],
                                                    tickfont: { size: 10, color: '#9ca3af', family: '"Source Sans 3", sans-serif' },
                                                    showgrid: false,
                                                    zeroline: false
                                                },
                                                xaxis: {
                                                    tickfont: { size: 10, color: '#64748b', family: '"Source Sans 3", sans-serif' },
                                                    fixedrange: true,
                                                    type: 'category',
                                                    automargin: true,
                                                    showticklabels: true,
                                                    title: { text: 'MVSO Probability', font: { size: 10, color: '#9ca3af' }, standoff: 15 },
                                                    showline: true,
                                                    linecolor: '#d1d5db',
                                                    linewidth: 1
                                                },
                                                showlegend: true,
                                                legend: { orientation: 'h', x: 0, y: 1.1, font: { size: 10, family: '"Source Sans 3", sans-serif' } },
                                                paper_bgcolor: 'white',
                                                plot_bgcolor: 'white',
                                                font: { family: '"Source Sans 3", sans-serif', size: 11, color: '#64748b' },
                                                annotations: (boxPlotData || []).map((bucket) => {
                                                    const vals = (bucket as any).values || [];
                                                    const avg = vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : 0;
                                                    return {
                                                        x: bucket.name,
                                                        y: avg,
                                                        text: `${avg.toFixed(1)}%`,
                                                        showarrow: false,
                                                        xanchor: 'center',
                                                        yanchor: 'bottom',
                                                        yshift: 10,
                                                        font: { size: 11, color: '#111827', weight: 'bold', family: '"Source Sans 3", sans-serif' },
                                                        bgcolor: 'rgba(255, 255, 255, 0.85)',
                                                        borderpad: 2,
                                                        borderwidth: 0
                                                    };
                                                })
                                            }}
                                            config={{ displayModeBar: false, responsive: true }}
                                            style={{ width: '100%', height: '100%' }}
                                            useResizeHandler={true}
                                        />
                                    </div>
                                </div>
                            </ChartCard>

                            {/* VOLUME SEGMENT ANALYSIS */}
                            <ChartCard title="" height={500}>
                                <div className="flex flex-col h-full px-4 pt-2">
                                    <div className="flex items-center justify-between mb-3">
                                        <p className="text-sm text-gray-500 mb-1 font-sans">
                                            Volume Segment Analysis
                                            <span className="text-[10px] text-gray-400 ml-2">
                                                (MVSO distribution by volume)
                                            </span>
                                        </p>
                                    </div>
                                    <div className="flex-1 w-full min-h-0">
                                        {optimizationData?.volumeStats?.length > 0 ? (
                                            <Plot
                                                data={optimizationData.volumeStats.map((stat: any, idx: number) => {
                                                    const techColors = [
                                                        'rgba(0, 200, 255, 0.4)',    // Cyan
                                                        'rgba(130, 80, 255, 0.4)',   // Electric Purple
                                                        'rgba(0, 255, 180, 0.4)',    // Neon Green
                                                        'rgba(255, 80, 180, 0.4)',   // Hot Pink
                                                        'rgba(255, 180, 0, 0.4)',    // Amber
                                                        'rgba(80, 180, 255, 0.4)'    // Sky Blue
                                                    ];
                                                    const borderColors = [
                                                        '#00C8FF', '#8250FF', '#00FFB4', '#FF50B4', '#FFB400', '#50B4FF'
                                                    ];
                                                    return {
                                                        y: stat.values || [],
                                                        type: 'box',
                                                        name: stat.segment,
                                                        marker: { color: borderColors[idx % 6], line: { color: borderColors[idx % 6], width: 1 }, size: 2 },
                                                        boxpoints: 'all',
                                                        jitter: 0.5,
                                                        pointpos: -1.8,
                                                        fillcolor: techColors[idx % 6],
                                                        line: { color: borderColors[idx % 6] },
                                                        showlegend: false
                                                    };
                                                })}
                                                layout={{
                                                    autosize: true,
                                                    margin: { l: 50, r: 20, t: 20, b: 60 },
                                                    yaxis: {
                                                        title: { text: 'MVSO %', font: { size: 10, color: '#64748b' } },
                                                        zeroline: true,
                                                        zerolinecolor: '#e5e7eb',
                                                        gridcolor: '#f3f4f6',
                                                        tickfont: { size: 10, color: '#64748b' },
                                                        range: [-2, 20]  // Clamp Y-axis to max 20%
                                                    },
                                                    xaxis: {
                                                        tickfont: { size: 10, color: '#64748b' },
                                                        type: 'category',
                                                        automargin: true
                                                    },
                                                    showlegend: false,
                                                    paper_bgcolor: 'transparent',
                                                    plot_bgcolor: 'transparent',
                                                    font: { family: 'Inter, sans-serif', size: 11, color: '#64748b' },
                                                    annotations: optimizationData.volumeStats.map((stat: any) => ({
                                                        x: stat.segment,
                                                        y: Math.min(stat.max + 2, 19),  // Keep annotations within clamped range
                                                        text: `n=${stat.count}`,
                                                        showarrow: false,
                                                        font: { size: 9, color: '#9ca3af' }
                                                    }))
                                                }}
                                                config={{ displayModeBar: false, responsive: true }}
                                                style={{ width: '100%', height: '100%' }}
                                                useResizeHandler={true}
                                            />
                                        ) : <div className="text-center text-gray-400 py-10">Loading volume data...</div>}
                                    </div>
                                </div>
                            </ChartCard>
                        </div>

                        {/* ROW 2: Efficiency Analysis: Efficiency Curve + Rec SL */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                            {/* EFFICIENCY CURVE */}
                            <ChartCard title="" height={500} className="w-full">
                                <div className="flex flex-col h-full px-4 pt-2">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-sm text-gray-500 mb-1 font-sans">
                                            Efficiency Curve <span className="text-[10px] text-gray-400 ml-2">(Optimal SL @ TP {takeProfit}%)</span>
                                        </p>
                                    </div>
                                    <div className="flex-1 w-full min-h-0">
                                        {optimizationData?.bubbleData?.length > 0 ? (() => {
                                            const curveData = optimizationData.bubbleData
                                                .filter((d: any) => d.tp === takeProfit && d.sl <= maxRiskTolerance)
                                                .map((d: any) => ({
                                                    sl: d.sl,
                                                    efficiency: d.efficiency,
                                                    winRate: d.winRate,
                                                    avgReturn: d.avgReturn
                                                }))
                                                .sort((a: any, b: any) => a.sl - b.sl);

                                            if (curveData.length === 0) {
                                                return <div className="text-center text-gray-400 py-10">No data for TP {takeProfit}%</div>;
                                            }

                                            // Find optimal point (max efficiency)
                                            const maxEfficiency = Math.max(...curveData.map((d: any) => d.efficiency));
                                            const optimalPoint = curveData.find((d: any) => d.efficiency === maxEfficiency);

                                            return (
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <LineChart data={curveData} margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                                        <XAxis
                                                            dataKey="sl"
                                                            tick={{ fontSize: 10, fontFamily: '"Source Sans 3", sans-serif' }}
                                                            label={{ value: 'Stop Loss %', position: 'bottom', offset: 5, style: { fontSize: 10, fill: '#6b7280', fontFamily: '"Source Sans 3", sans-serif' } }}
                                                            axisLine={false}
                                                            tickLine={false}
                                                        />
                                                        <YAxis
                                                            tick={{ fontSize: 10, fontFamily: '"Source Sans 3", sans-serif' }}
                                                            width={30}
                                                            axisLine={false}
                                                            tickLine={false}
                                                            domain={['auto', 'auto']}
                                                            padding={{ top: 20, bottom: 20 }}
                                                        />
                                                        {optimalPoint && (
                                                            <ReferenceLine
                                                                x={optimalPoint.sl}
                                                                stroke="#ef4444"
                                                                strokeDasharray="5 5"
                                                                strokeWidth={2}
                                                                label={{ value: `Opt: ${optimalPoint.sl}%`, position: 'top', fill: '#ef4444', fontSize: 10, fontFamily: '"Source Sans 3", sans-serif' }}
                                                            />
                                                        )}
                                                        <Tooltip content={({ active, payload }) => {
                                                            if (active && payload && payload.length) {
                                                                const d = payload[0].payload;
                                                                return (
                                                                    <div className="bg-white p-2 rounded-lg shadow-lg border border-gray-200 text-xs font-sans">
                                                                        <p className="font-bold text-gray-700">SL: {d.sl}%</p>
                                                                        <p className="text-blue-600">Efficiency: {d.efficiency?.toFixed(1)}</p>
                                                                        <p className="text-emerald-600">Win Rate: {d.winRate}%</p>
                                                                        <p className="text-gray-500">Avg Ret: {d.avgReturn?.toFixed(2)}%</p>
                                                                    </div>
                                                                );
                                                            }
                                                            return null;
                                                        }} />
                                                        <Legend wrapperStyle={{ fontSize: '10px', fontFamily: '"Source Sans 3", sans-serif' }} />
                                                        <Line type="monotone" dataKey="efficiency" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Eff" activeDot={{ r: 5 }} />
                                                        <Line type="monotone" dataKey="winRate" stroke="#10b981" strokeWidth={1} strokeDasharray="5 5" dot={false} name="WR%" />
                                                    </LineChart>
                                                </ResponsiveContainer>
                                            );
                                        })() : <div className="text-center text-gray-400 py-10">Loading...</div>}
                                    </div>
                                </div>
                            </ChartCard>

                            {/* RECOMMENDED SL PER TP - Table */}
                            <ChartCard title="" height={500}>
                                <div className="flex items-center justify-between mb-3 px-4 pt-2">
                                    <p className="text-sm text-gray-500 mb-1 font-sans">
                                        Recommended Stop Loss
                                        <span className="text-[10px] text-gray-400 ml-2">
                                            (Optimal SL for each TP target)
                                        </span>
                                    </p>
                                </div>
                                <div className="h-full overflow-y-auto px-4 pb-4">
                                    {optimizationData?.bubbleData?.length > 0 ? (() => {
                                        const data = optimizationData.bubbleData;
                                        const tpLevels = optimizationData.tpRange ||
                                            ([...new Set(data.map((d: any) => d.tp))] as number[]).sort((a: number, b: number) => a - b);

                                        const recommendations: any[] = [];
                                        for (const tp of tpLevels) {
                                            const tpData = data.filter((d: any) => d.tp === tp && d.sl <= maxRiskTolerance);
                                            if (tpData.length > 0) {
                                                const best = tpData.reduce((a: any, b: any) =>
                                                    a.efficiency > b.efficiency ? a : b
                                                );
                                                recommendations.push(best);
                                            }
                                        }

                                        if (recommendations.length === 0) {
                                            return <div className="text-center text-gray-400 py-10">No data for selected risk level</div>;
                                        }

                                        return (
                                            <table className="w-full text-xs">
                                                <thead className="sticky top-0 bg-white z-10">
                                                    <tr className="border-b border-border-primary/50 text-gray-500 uppercase text-[10px]">
                                                        <th className="py-2 pl-2 text-left font-medium">TP Target</th>
                                                        <th className="py-2 text-center font-medium">Recommended SL</th>
                                                        <th className="py-2 text-right font-medium">Avg Return</th>
                                                        <th className="py-2 text-right font-medium">Win Rate</th>
                                                        <th className="py-2 pr-2 text-right font-medium">Efficiency</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {recommendations.map((rec, idx) => (
                                                        <tr
                                                            key={idx}
                                                            className={`border-b border-gray-50 transition-colors ${rec.tp === takeProfit ? 'bg-blue-50/80 font-semibold' : 'hover:bg-gray-50'}`}
                                                        >
                                                            <td className="py-2 pl-2 text-left">
                                                                {rec.tp === takeProfit && <span className="mr-1 text-blue-500">→</span>}
                                                                {rec.tp}%
                                                            </td>
                                                            <td className="py-2 text-center">
                                                                <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-[10px] font-medium">
                                                                    {rec.sl}%
                                                                </span>
                                                            </td>
                                                            <td className={`py-2 text-right font-medium ${rec.avgReturn >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                                {rec.avgReturn >= 0 ? '+' : ''}{rec.avgReturn?.toFixed(2)}%
                                                            </td>
                                                            <td className="py-2 text-right text-gray-600">
                                                                {rec.winRate}%
                                                            </td>
                                                            <td className="py-2 pr-2 text-right text-amber-600 font-medium">
                                                                {rec.efficiency?.toFixed(1)}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        );
                                    })() : (
                                        <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
                                            <p>Loading recommendations...</p>
                                        </div>
                                    )}
                                </div>
                            </ChartCard>
                        </div>



                        {/* ========== NEW TRADING ANALYTICS SECTION ========== */}
                    </div>
                </div >
            </div >
        </div >
    );
}

// Minimalist KPI Card
function TerminalMetric({
    label,
    value,
    subValue,
    trend,
    tooltip
}: {
    label: string,
    value: string,
    subValue?: string,
    trend?: 'up' | 'down' | 'neutral',
    tooltip?: string
}) {
    // Determine color based on trend and inverse logic
    // Normal: Up=Green, Down=Red
    // Inverse: Up/High=Green (if good), Down/Low=Red (if bad).
    // Actually simplicity:
    // User wants "Green for positive change", "Red for negative".
    // For things like Drawdown, usually "Low is good", but typically standard is "Red if value is negative or drops".
    // Let's stick to standard colors: Green/Emerald for "Good/Up", Rose for "Bad/Down".

    // If we pass trend='down' for DD, we usually mean it's a negative value we want to highlight as 'bad'.
    // If we pass trend='up' for Profit, it's 'good'.

    // Revised logic to match image:
    // Image has Green for positive %, Red for negative %.
    // Let's assume the passed 'trend' prop indicates the color direction directly or use a specific color prop.

    // Simplified logic:
    // If trend is 'up' -> Green. If 'down' -> Red.
    const colorClass = trend === 'up' ? 'text-emerald-500' : trend === 'down' ? 'text-rose-500' : 'text-gray-400';

    return (
        <div className="bg-white rounded-xl p-4 border border-gray-100 flex flex-col justify-between hover:border-gray-200 transition-colors h-24" title={tooltip}>
            <span className="text-xs font-medium text-gray-500 font-sans tracking-wide uppercase">
                {label}
            </span>
            <div className="flex items-end gap-2 mt-1">
                <span className="text-2xl font-semibold text-gray-900 tracking-tight font-sans">
                    {value}
                </span>
                {subValue && (
                    <span className={`text-[10px] font-semibold mb-1 ${colorClass} bg-opacity-10 px-1 py-0.5 rounded`}>
                        {subValue}
                    </span>
                )}
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
