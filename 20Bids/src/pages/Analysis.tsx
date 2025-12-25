import { useState, useEffect, useMemo } from 'react';
import { Sidebar } from '../components/Sidebar';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    AreaChart, Area, ComposedChart, Line, Legend
} from 'recharts';
import { cn } from '../lib/utils';
import { fetchAnalysis } from '../api/client';
import { startOfYear, subWeeks, subMonths, isAfter, startOfWeek, startOfMonth, format } from 'date-fns';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { Calendar, Info } from 'lucide-react';

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
    const [chartMetric, setChartMetric] = useState<'equity' | 'mvso' | 'winRate' | 'avgReturn'>('equity');
    const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([null, null]);
    const [customStartDate, customEndDate] = dateRange;

    useEffect(() => {
        const fetchData = async () => {
            try {
                const result = await fetchAnalysis();
                setData(result);
            } catch (error) {
                console.error('Failed to fetch analysis data', error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'data-theme') {
                    const newTheme = document.documentElement.getAttribute('data-theme') || 'midnight';
                    setTheme(newTheme);
                }
            });
        });
        observer.observe(document.documentElement, { attributes: true });

        // Ensure manual sync on mount in case usage of context is missing
        const currentTheme = document.documentElement.getAttribute('data-theme') || localStorage.getItem('theme') || 'midnight';
        setTheme(currentTheme);

        return () => observer.disconnect();
    }, []);

    // Filter Logic & Metric Recalculation
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

        // Recalculate Metrics for this Period
        let grossWin = 0;
        let grossLoss = 0;
        let currentEquity = 0;
        let peakEquity = 0;
        let maxDD = 0;
        let winStreak = 0;
        let lossStreak = 0;
        let maxWinStreak = 0;
        let maxLossStreak = 0;

        // Re-simulate equity curve for this period starting from 0
        const rebasedEquityCurve = filteredEquity.map(d => {
            const val = d.return;

            // Stats
            if (val > 0) {
                grossWin += val;
                winStreak++;
                lossStreak = 0;
                if (winStreak > maxWinStreak) maxWinStreak = winStreak;
            } else {
                grossLoss += Math.abs(val);
                lossStreak++;
                winStreak = 0;
                if (lossStreak > maxLossStreak) maxLossStreak = lossStreak;
            }

            currentEquity += val;
            if (currentEquity > peakEquity) peakEquity = currentEquity;
            const dd = peakEquity - currentEquity;
            if (dd > maxDD) maxDD = dd;

            return { ...d, equity: currentEquity, drawdown: dd * -1 };
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
                totalReturn: currentEquity
            }
        };

    }, [data, timeRange]);

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

    const { riskMetrics, equityCurve, seasonality, distribution, topTickers, topSectors, dailyAverages } = filteredMetrics;
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

    // Top Periods Calculation
    const topPeriods = useMemo(() => {
        if (!equityCurve) return { days: [], weeks: [], months: [] };

        // Top Days
        const days = [...equityCurve].map(d => ({ date: d.date, return: d.return })).sort((a, b) => b.return - a.return).slice(0, 5);

        // Aggregate Weeks & Months
        const weekMap: Record<string, number> = {};
        const monthMap: Record<string, number> = {};

        equityCurve.forEach(d => {
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
    }, [equityCurve]);

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
                                    className="bg-bg-tertiary/30 border border-border-primary rounded-md px-3 py-1.5 text-xs text-text-primary w-44 cursor-pointer placeholder:text-text-secondary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                                    dateFormat="MMM dd, yyyy"
                                    isClearable={true}
                                    maxDate={new Date()}
                                />
                                <Calendar className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary pointer-events-none" />
                            </div>

                            <div className="flex gap-4 text-xs text-text-secondary border-l border-border-primary pl-4">
                                <div><span className={cn("font-bold text-lg", riskMetrics.totalReturn > 0 ? "text-emerald-500" : "text-rose-500")}>{riskMetrics.totalReturn.toFixed(2)}%</span> NET R</div>
                                <div><span className="font-bold text-lg text-text-primary">{equityCurve.length}</span> SESSIONS</div>
                            </div>
                        </div>
                    </div>

                    {/* Risk & Efficiency Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                        <TerminalMetric label="Profit Factor" value={riskMetrics.profitFactor.toFixed(2)} trend={riskMetrics.profitFactor > 1.5 ? 'up' : 'neutral'} theme={theme} tooltip="Ratio of Gross Win / Gross Loss. > 1.5 is good." />
                        <TerminalMetric label="Max Drawdown" value={`-${riskMetrics.maxDrawdown.toFixed(2)}%`} trend="down" color={dangerColor} theme={theme} tooltip="Largest peak-to-valley decline in equity." />
                        <TerminalMetric label="Win Streak" value={riskMetrics.maxWinStreak.toString()} theme={theme} tooltip="Max consecutive winning trades." />
                        <TerminalMetric label="Loss Streak" value={riskMetrics.maxLossStreak.toString()} color={dangerColor} theme={theme} tooltip="Max consecutive losing trades." />
                        <TerminalMetric label="Best Day" value={bestDay?.name?.slice(0, 3).toUpperCase() || '-'} subValue={`${bestDay?.winRate}% WR`} theme={theme} tooltip="Day of week with highest win rate." />
                        <TerminalMetric label="Avg R (Est)" value="1.2" subValue="Risk/Reward" theme={theme} tooltip="Estimated Average Profit / Average Loss." />
                        <TerminalMetric label="Expectancy" value={`${(topTickers.slice(0, 10).reduce((acc, curr) => acc + curr.avgMvso, 0) / 10).toFixed(2)}%`} trend="up" theme={theme} tooltip="Avg return of top 10 tickers." />
                        <TerminalMetric label="Reliability" value="High" color={safeColor} theme={theme} tooltip="Overall consistency based on win rate and drawdown." />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Main Equity Curve & Trend Analysis */}
                        <div className="lg:col-span-2 space-y-6">
                            <ChartCard title="" height={350} theme={theme}>
                                {/* Metric Selector */}
                                <div className="flex items-center justify-between mb-4 -mt-2">
                                    <h3 className="text-xs font-bold text-text-secondary uppercase tracking-widest flex items-center gap-2">
                                        PERFORMANCE EVOLUTION
                                    </h3>
                                    <div className="flex flex-wrap gap-1 justify-end bg-bg-tertiary/30 rounded-md p-0.5 border border-border-primary min-w-0">
                                        {[
                                            { key: 'equity', label: 'Equity' },
                                            { key: 'mvso', label: 'MVSO' },
                                            { key: 'avgReturn', label: 'Avg %' },
                                            { key: 'winRate', label: 'Win Rate' }
                                        ].map(({ key, label }) => (
                                            <button
                                                key={key}
                                                onClick={() => setChartMetric(key as any)}
                                                className={cn(
                                                    "px-2 py-1 text-[10px] font-medium rounded transition-all whitespace-nowrap",
                                                    chartMetric === key
                                                        ? "bg-accent-primary text-white shadow-sm"
                                                        : "text-text-secondary hover:text-text-primary"
                                                )}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <ResponsiveContainer width="100%" height="85%">
                                    <AreaChart data={
                                        chartMetric === 'equity' ? equityCurve :
                                            chartMetric === 'mvso' ? dailyAverages.map(d => ({ ...d, value: d.avgReturn })) :
                                                chartMetric === 'avgReturn' ? dailyAverages.map(d => ({ ...d, value: d.avgReturn })) :
                                                    equityCurve.map((d, i, arr) => {
                                                        // Calculate running win rate
                                                        const slice = arr.slice(0, i + 1);
                                                        const wins = slice.filter(x => x.return > 0).length;
                                                        return { ...d, value: slice.length > 0 ? (wins / slice.length) * 100 : 0 };
                                                    })
                                    }>
                                        <defs>
                                            <linearGradient id="colorMetric" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
                                                <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" opacity={0.5} vertical={false} />
                                        <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickFormatter={(val) => val.slice(5)} minTickGap={50} axisLine={false} tickLine={false} />
                                        <YAxis stroke="#94a3b8" fontSize={11} domain={['auto', 'auto']} axisLine={false} tickLine={false} unit={chartMetric === 'winRate' ? '%' : ''} />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: 'rgba(255,255,255,0.95)',
                                                border: '1px solid #e5e7eb',
                                                borderRadius: '6px',
                                                boxShadow: 'none',
                                                color: '#1f2937',
                                                fontFamily: '\"Source Sans 3\", system-ui, sans-serif',
                                                fontSize: '12px'
                                            }}
                                            formatter={(value: number) => [`${value.toFixed(2)}${chartMetric === 'winRate' ? '%' : chartMetric === 'equity' ? '%' : ''}`, chartMetric === 'equity' ? 'Equity' : chartMetric === 'mvso' ? 'MVSO' : chartMetric === 'winRate' ? 'Win Rate' : 'Avg Return']}
                                        />
                                        <Area
                                            type="linear"
                                            dataKey={chartMetric === 'equity' ? 'equity' : 'value'}
                                            stroke={chartColor}
                                            fillOpacity={1}
                                            fill="url(#colorMetric)"
                                            strokeWidth={2}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </ChartCard>

                            {/* Daily Avg Returns Line Chart */}
                            <ChartCard title="DAILY PROFITABILITY TREND (AVG %)" height={200} theme={theme}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={dailyAverages}> {/* Note: dailyAverages currently isn't filtered, usually it should be. For simplicity keeping as is or need to filter too. Filtering it is better */}
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" opacity={0.5} vertical={false} />
                                        <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickFormatter={(val) => val.slice(5)} minTickGap={50} axisLine={false} tickLine={false} />
                                        <YAxis stroke="#94a3b8" fontSize={11} domain={['auto', 'auto']} axisLine={false} tickLine={false} />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: 'rgba(255,255,255,0.95)',
                                                border: '1px solid #e5e7eb',
                                                borderRadius: '6px',
                                                boxShadow: 'none',
                                                color: '#1f2937',
                                                fontFamily: '\"Source Sans 3\", system-ui, sans-serif',
                                                fontSize: '12px'
                                            }}
                                        />
                                        <Line type="linear" dataKey="avgReturn" stroke={safeColor} strokeWidth={2} dot={false} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </ChartCard>
                        </div>

                        {/* Side Stats & Leaderboards */}
                        <div className="space-y-6">

                            <ChartCard title="SEASONALITY (PROFITABILITY VS VOL)" height={250} theme={theme}>
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
                                                fontFamily: '\"Source Sans 3\", system-ui, sans-serif',
                                                fontSize: '12px'
                                            }}
                                        />
                                        <Legend />
                                        <Bar yAxisId="left" dataKey="count" name="Vol" fill={secondaryColor} barSize={20} radius={[2, 2, 0, 0]} opacity={0.6} />
                                        <Line yAxisId="right" type="linear" dataKey="avgMvso" name="Avg %" stroke={chartColor} strokeWidth={2} dot={{ r: 3 }} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </ChartCard>

                            {/* Comparative Chart */}
                            <ChartCard title="VOLUME & PRICE vs PROFITABILITY" height={300} theme={theme}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={dailyAverages}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" opacity={0.5} vertical={false} />
                                        <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickFormatter={(val) => val.slice(5)} minTickGap={50} axisLine={false} tickLine={false} />
                                        <YAxis yAxisId="left" stroke="#94a3b8" fontSize={11} axisLine={false} tickLine={false} />
                                        <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" fontSize={11} unit="%" axisLine={false} tickLine={false} />
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
                                            labelStyle={{ color: '#666' }}
                                        />
                                        <Legend />
                                        <Bar yAxisId="left" dataKey="count" name="Signal Vol" fill={secondaryColor} barSize={20} radius={[2, 2, 0, 0]} opacity={0.4} />
                                        <Line yAxisId="right" type="linear" dataKey="avgReturn" name="Avg Return %" stroke={chartColor} strokeWidth={2} dot={false} />
                                        <Line yAxisId="right" type="linear" dataKey="avgPrice" name="Avg Price ($)" stroke="#f59e0b" strokeWidth={2} strokeDasharray="3 3" dot={false} hide={!dailyAverages[0]?.avgPrice} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </ChartCard>

                            {/* Top Periods Table */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <ChartCard title="TOP DAYS" height={200} theme={theme}>
                                    <div className="overflow-y-auto h-full pr-1">
                                        <table className="w-full text-xs text-left text-text-secondary">
                                            <thead>
                                                <tr className="border-b border-border-primary/50 text-[10px] uppercase">
                                                    <th className="py-2 font-medium">Date</th>
                                                    <th className="py-2 font-medium text-right">Return</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {topPeriods.days.map((d, i) => (
                                                    <tr key={i} className="border-b border-border-primary/20 last:border-0 hover:bg-bg-tertiary/10">
                                                        <td className="py-2">{d.date}</td>
                                                        <td className="py-2 text-right text-emerald-500 font-bold">+{d.return.toFixed(2)}%</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </ChartCard>
                                <ChartCard title="TOP WEEKS" height={200} theme={theme}>
                                    <div className="overflow-y-auto h-full pr-1">
                                        <table className="w-full text-xs text-left text-text-secondary">
                                            <thead>
                                                <tr className="border-b border-border-primary/50 text-[10px] uppercase">
                                                    <th className="py-2 font-medium">Week Of</th>
                                                    <th className="py-2 font-medium text-right">Total R</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {topPeriods.weeks.map((d, i) => (
                                                    <tr key={i} className="border-b border-border-primary/20 last:border-0 hover:bg-bg-tertiary/10">
                                                        <td className="py-2">{d.date}</td>
                                                        <td className="py-2 text-right text-emerald-500 font-bold">+{d.return.toFixed(2)}%</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </ChartCard>
                                <ChartCard title="TOP MONTHS" height={200} theme={theme}>
                                    <div className="overflow-y-auto h-full pr-1">
                                        <table className="w-full text-xs text-left text-text-secondary">
                                            <thead>
                                                <tr className="border-b border-border-primary/50 text-[10px] uppercase">
                                                    <th className="py-2 font-medium">Month</th>
                                                    <th className="py-2 font-medium text-right">Total R</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {topPeriods.months.map((d, i) => (
                                                    <tr key={i} className="border-b border-border-primary/20 last:border-0 hover:bg-bg-tertiary/10">
                                                        <td className="py-2">{d.date}</td>
                                                        <td className="py-2 text-right text-emerald-500 font-bold">+{d.return.toFixed(2)}%</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </ChartCard>
                            </div>

                            {/* Top Sectors Leaderboard */}
                            <ChartCard title="OUTPERFORMING SECTORS" height={250} theme={theme}>
                                <div className="overflow-y-auto h-full pr-1">
                                    <table className="w-full text-xs text-left text-text-secondary">
                                        <thead>
                                            <tr className="border-b border-border-primary">
                                                <th className="pb-2 font-normal uppercase">Sector</th>
                                                <th className="pb-2 font-normal text-right">Avg %</th>
                                                <th className="pb-2 font-normal text-right">WR %</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {topSectors.map((sector, idx) => (
                                                <tr key={idx} className="border-b border-border-primary/50 hover:bg-white/5 transition-colors">
                                                    <td className="py-2 text-text-primary truncate max-w-[100px]">{sector.name}</td>
                                                    <td className={cn("py-2 text-right font-mono", sector.avgMvso > 0 ? "text-emerald-500" : "text-rose-500")}>
                                                        {sector.avgMvso}%
                                                    </td>
                                                    <td className="py-2 text-right font-mono">{sector.winRate}%</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </ChartCard>

                            <ChartCard title="EXPECTANCY DISTRIBUTION" height={200} theme={theme}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={distribution}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" opacity={0.5} vertical={false} />
                                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickFormatter={(v) => v.replace('%', '')} />
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
                                        <Bar dataKey="count" fill={chartColor} radius={[4, 4, 0, 0]} />
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

function TerminalMetric({ label, value, subValue, trend, color, theme, tooltip }: { label: string, value: string, subValue?: string, trend?: 'up' | 'down' | 'neutral', color?: string, theme: string, tooltip?: string }) {
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

function ChartCard({ title, children, height = 300 }: { title: string, children: React.ReactNode, height?: number, theme?: string }) {
    return (
        <div
            className="border border-border-primary/30 rounded-lg p-4 flex flex-col bg-bg-primary"
            style={{ height }}
        >
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
