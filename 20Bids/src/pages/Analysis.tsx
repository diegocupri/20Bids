import { useState, useEffect, useMemo } from 'react';
import { Sidebar } from '../components/Sidebar';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    AreaChart, Area, ComposedChart, Line, Legend, LabelList
} from 'recharts';
import { cn } from '../lib/utils';
import { fetchAnalysis } from '../api/client';
import { startOfYear, subWeeks, subMonths, isAfter, startOfWeek, startOfMonth, format } from 'date-fns';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { Calendar, Info, TrendingUp } from 'lucide-react';

interface AnalysisData {
    equityCurve: { date: string, return: number, equity: number, drawdown: number }[];
    dailyAverages: { date: string, avgReturn: number, avgPrice: number, count: number }[];
    distribution: { name: string, count: number }[];
    seasonality: { name: string, count: number, avgMvso: number, winRate: number }[];
    topTickers: { name: string, count: number, avgMvso: number, winRate: number }[];
    topSectors: { name: string, count: number, avgMvso: number, winRate: number }[];
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
    const [isCumulative, setIsCumulative] = useState(true);
    const [periodGranularity, setPeriodGranularity] = useState<'days' | 'weeks' | 'months'>('days');

    const [debouncedTakeProfit, setDebouncedTakeProfit] = useState<number>(takeProfit);

    // Debounce Take Profit
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedTakeProfit(takeProfit);
        }, 800); // Wait 800ms after last keystroke

        return () => {
            clearTimeout(handler);
        };
    }, [takeProfit]);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                // Pass debounced takeProfit to backend
                const result = await fetchAnalysis(debouncedTakeProfit);
                setData(result);
            } catch (error) {
                console.error('Failed to fetch analysis data', error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [debouncedTakeProfit]); // Refetch only when debounced value changes

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

        // Re-simulate equity curve - track both original and clamped
        const rebasedEquityCurve = filteredEquity.map(d => {
            const originalReturn = d.return;
            // Apply Take Profit: clamp positive returns at TP value (for METRICS only)
            const clampedReturn = originalReturn > 0
                ? Math.min(originalReturn, takeProfit)
                : originalReturn;

            // Stats using clamped value (for metrics)
            if (clampedReturn > 0) {
                grossWin += clampedReturn;
                winStreak++;
                lossStreak = 0;
                if (winStreak > maxWinStreak) maxWinStreak = winStreak;
            } else {
                grossLoss += Math.abs(clampedReturn);
                lossStreak++;
                winStreak = 0;
                if (lossStreak > maxLossStreak) maxLossStreak = lossStreak;
            }

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

        return {
            ...data,
            equityCurve: rebasedEquityCurve,
            riskMetrics: {
                profitFactor: pf,
                maxDrawdown: maxDD,
                maxWinStreak: maxWinStreak,
                maxLossStreak: maxLossStreak,
                totalReturn: clampedEquity // Use CLAMPED equity for total return metric
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

    const { riskMetrics, equityCurve, seasonality, distribution, topTickers, topSectors } = filteredMetrics;
    const isTerminal = theme === 'terminal';
    const isTradingView = theme === 'tradingview';
    const isPolar = theme === 'polar';

    // Theme Colors
    let chartColor = '#8b5cf6';
    let safeColor = '#34d399';
    let dangerColor = '#f43f5e';
    let secondaryColor = '#4f46e5';

    if (isTerminal) {
        chartColor = '#fbbf24'; safeColor = '#22c55e'; dangerColor = '#ef4444'; secondaryColor = '#6b7280';
    } else if (isTradingView) {
        chartColor = '#2962ff'; safeColor = '#089981'; dangerColor = '#f23645'; secondaryColor = '#787b86';
    } else if (isPolar) {
        chartColor = '#2563eb'; safeColor = '#059669'; dangerColor = '#dc2626'; secondaryColor = '#4b5563';
    }

    const bestDay = [...seasonality].sort((a, b) => b.winRate - a.winRate)[0];



    return (
        <div className="flex h-screen bg-bg-primary overflow-hidden font-sans">
            <Sidebar />

            <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
                <div className="p-6 space-y-6 bg-bg-primary">

                    {/* Header with Filters */}
                    <div className="flex flex-col md:flex-row justify-between items-end border-b border-border-primary pb-4 gap-4">
                        <div>
                            <h1 className="text-xl font-bold text-text-primary uppercase tracking-wider flex items-center gap-2">
                                <span className={cn("inline-block w-2 h-2 rounded-full", isTerminal ? "bg-amber-400 animate-pulse" : "bg-accent-primary")}></span>
                                System Performance
                            </h1>
                            <p className="text-xs text-text-secondary mt-1 tracking-tight">INTRADAY ALGORITHMIC ANALYSIS // {new Date().toLocaleDateString()}</p>
                        </div>

                        <div className="flex items-center gap-4">
                            {/* Time Filters */}
                            <div className="flex bg-bg-tertiary/30 rounded-md p-1 border border-border-primary">
                                {(['1W', '1M', '3M', 'YTD', '1Y', 'ALL'] as TimeRange[]).map((range) => (
                                    <button
                                        key={range}
                                        onClick={() => {
                                            setTimeRange(range);
                                            setDateRange([null, null]); // Clear custom range
                                        }}
                                        className={cn(
                                            "px-3 py-1 text-xs font-medium rounded transition-all",
                                            timeRange === range && !customStartDate
                                                ? "bg-accent-primary text-white shadow-sm"
                                                : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
                                        )}
                                    >
                                        {range}
                                    </button>
                                ))}
                            </div>

                            {/* Custom Date Range Picker */}
                            <div className="relative">
                                <DatePicker
                                    selectsRange={true}
                                    startDate={customStartDate}
                                    endDate={customEndDate}
                                    onChange={(update) => {
                                        setDateRange(update as [Date | null, Date | null]);
                                        if (update[0] && update[1]) {
                                            setTimeRange('ALL'); // Clear time filter when custom range is set
                                        }
                                    }}
                                    placeholderText="Custom Range"
                                    className="bg-bg-tertiary/30 border border-border-primary rounded-md px-3 py-1.5 text-xs text-text-primary w-44 cursor-pointer placeholder:text-text-secondary focus:outline-none focus:ring-1 focus:ring-accent-primary font-sans"
                                    dateFormat="MMM dd, yyyy"
                                    isClearable={true}
                                    maxDate={new Date()}
                                />
                                <Calendar className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary pointer-events-none" />
                            </div>

                            {/* Take Profit Input */}
                            <div className="flex items-center gap-2 bg-bg-tertiary/30 rounded-md px-3 py-1.5 border border-border-primary">
                                <TrendingUp className="w-3.5 h-3.5 text-text-secondary" />
                                <span className="text-[10px] text-text-secondary uppercase font-medium">TP</span>
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
                                    className="w-14 bg-transparent border-0 text-text-primary text-sm font-sans font-medium text-right focus:outline-none focus:ring-0"
                                />
                                <span className="text-xs text-text-secondary">%</span>
                            </div>

                            {/* Cumulative Toggle */}
                            <button
                                onClick={() => setIsCumulative(!isCumulative)}
                                className={cn(
                                    "px-3 py-1.5 text-[10px] font-medium rounded-md border transition-all uppercase tracking-wide",
                                    isCumulative
                                        ? "bg-accent-primary/10 text-accent-primary border-accent-primary/30"
                                        : "bg-bg-tertiary/30 text-text-secondary border-border-primary hover:text-text-primary"
                                )}
                            >
                                {isCumulative ? 'Cumulative' : 'Daily'}
                            </button>

                            <div className="flex gap-4 text-xs text-text-secondary border-l border-border-primary pl-4">
                                <div><span className={cn("font-bold text-lg font-sans", riskMetrics.totalReturn > 0 ? "text-emerald-500" : "text-rose-500")}>{riskMetrics.totalReturn.toFixed(2)}%</span> NET R</div>
                                <div><span className="font-bold text-lg text-text-primary font-sans">{equityCurve.length}</span> SESSIONS</div>
                            </div>
                        </div>
                    </div>

                    {/* Risk & Efficiency Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                        <TerminalMetric label="Profit Factor" value={riskMetrics.profitFactor.toFixed(2)} trend={riskMetrics.profitFactor > 1.5 ? 'up' : 'neutral'} tooltip="Ratio of Gross Win / Gross Loss. > 1.5 is good." />
                        <TerminalMetric label="Max Drawdown" value={`-${riskMetrics.maxDrawdown.toFixed(2)}%`} trend="down" color={dangerColor} tooltip="Largest peak-to-valley decline in equity." />
                        <TerminalMetric label="Win Streak" value={riskMetrics.maxWinStreak.toString()} tooltip="Max consecutive winning trades." />
                        <TerminalMetric label="Loss Streak" value={riskMetrics.maxLossStreak.toString()} color={dangerColor} tooltip="Max consecutive losing trades." />
                        <TerminalMetric label="Best Day" value={bestDay?.name?.slice(0, 3).toUpperCase() || '-'} subValue={`${bestDay?.winRate}% WR`} tooltip="Day of week with highest win rate." />
                        <TerminalMetric label="Avg R (Est)" value="1.2" subValue="Risk/Reward" tooltip="Estimated Average Profit / Average Loss." />
                        <TerminalMetric label="Expectancy" value={`${(topTickers.slice(0, 10).reduce((acc, curr) => acc + curr.avgMvso, 0) / 10).toFixed(2)}%`} trend="up" tooltip="Avg return of top 10 tickers." />
                        <TerminalMetric label="Reliability" value="High" color={safeColor} tooltip="Overall consistency based on win rate and drawdown." />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Main Equity Curve & Trend Analysis */}
                        <div className="lg:col-span-2 space-y-6">
                            <ChartCard title="" height={350}>
                                {/* Chart Header */}
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
                                                contentStyle={{
                                                    backgroundColor: 'rgba(255,255,255,0.95)',
                                                    border: '1px solid #e5e7eb',
                                                    borderRadius: '6px',
                                                    boxShadow: 'none',
                                                    color: '#1f2937',
                                                    fontFamily: '"Source Sans 3", system-ui, sans-serif',
                                                    fontSize: '12px'
                                                }}
                                                formatter={(value: number, name: string) => [
                                                    `${value.toFixed(2)}%`,
                                                    name === 'return' ? 'Total Return' : 'Avg Return'
                                                ]}
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
                                                fill={chartColor}
                                                radius={[2, 2, 0, 0]}
                                                name="Total Return"
                                            >
                                                <LabelList dataKey="return" position="top" formatter={(val: any) => `${Number(val).toFixed(1)}%`} style={{ fontSize: '10px', fill: '#64748b' }} />
                                            </Bar>
                                            <Line
                                                yAxisId="right"
                                                type="monotone"
                                                dataKey="avgReturn"
                                                stroke={safeColor}
                                                strokeWidth={2}
                                                dot={{ r: 4, fill: safeColor }}
                                                name="Avg Return"
                                            >
                                                <LabelList dataKey="avgReturn" content={<CustomizedLabel />} />
                                            </Line>
                                        </ComposedChart>
                                    )}
                                </ResponsiveContainer>
                            </ChartCard>
                        </div>

                        {/* 3-Column Grid for Leaderboards */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                            {/* Top Tickers Leaderboard (Converted from Chart) */}
                            <ChartCard title="" height={280}>
                                <div className="flex items-center justify-between mb-3 -mt-2">
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
                                <div className="flex items-center justify-between mb-3 -mt-2">
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
                                <div className="flex items-center justify-between mb-3 -mt-2">
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

                        {/* Bottom Charts Row (Seasonality & Distribution) */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                            <ChartCard title="SEASONALITY (PROFITABILITY VS VOL)" height={280}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={seasonality}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" opacity={0.5} vertical={false} />
                                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickFormatter={(val) => val.slice(0, 3).toUpperCase()} axisLine={false} tickLine={false} />
                                        <YAxis yAxisId="left" stroke="#94a3b8" fontSize={11} hide />
                                        <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" fontSize={11} unit="%" />

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
                                        <Legend />
                                        <Bar yAxisId="left" dataKey="count" name="Vol" fill={secondaryColor} barSize={20} radius={[2, 2, 0, 0]} opacity={0.6} />
                                        <Line yAxisId="right" type="linear" dataKey="avgMvso" name="Avg %" stroke={chartColor} strokeWidth={2} dot={{ r: 3 }} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </ChartCard>

                            <ChartCard title="" height={280}>
                                <div className="flex items-center justify-between mb-3 -mt-2">
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
                </div>
            </div>
        </div>
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
            "border border-border-primary/30 rounded-lg p-3 flex flex-col justify-between bg-bg-primary hover:border-border-primary/50 transition-colors",
        )}>
            <div className="text-[10px] font-medium text-text-secondary uppercase tracking-wider mb-2 flex items-center">
                {label}
                {tooltip && <InfoTooltip text={tooltip} />}
                {trend && <div className={cn("ml-auto w-1.5 h-1.5 rounded-full", trend === 'up' ? "bg-emerald-500" : trend === 'down' ? "bg-rose-500" : "bg-gray-500")}></div>}
            </div>
            <div>
                <div className={cn(
                    "text-xl font-bold font-sans tracking-tight",
                    color ? "" :
                        !color && trend === 'up' ? "text-emerald-500" :
                            !color && trend === 'down' ? "text-rose-500" : "text-text-primary"
                )} style={{ color }}>
                    {value}
                </div>
                {subValue && <div className="text-[10px] text-text-secondary mt-1">{subValue}</div>}
            </div>
        </div>
    );
}

function ChartCard({ title, height, children }: { title: string, height: number, children: React.ReactNode }) {
    return (
        <div className={cn(
            "border border-border-primary/30 rounded-lg p-4 bg-bg-primary overflow-hidden flex flex-col",
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
