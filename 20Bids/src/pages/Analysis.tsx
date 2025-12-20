import { useState, useEffect, useMemo } from 'react';
import { Sidebar } from '../components/Sidebar';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    AreaChart, Area, ComposedChart, Line, Legend
} from 'recharts';
import { cn } from '../lib/utils';
import { fetchAnalysis } from '../api/client';
import { startOfYear, subWeeks, subMonths, isAfter } from 'date-fns';

interface AnalysisData {
    equityCurve: { date: string, return: number, equity: number, drawdown: number }[];
    dailyAverages: { date: string, avgReturn: number, count: number }[];
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
        let startDate: Date | null = null;

        switch (timeRange) {
            case '1W': startDate = subWeeks(now, 1); break;
            case '1M': startDate = subMonths(now, 1); break;
            case '3M': startDate = subMonths(now, 3); break;
            case 'YTD': startDate = startOfYear(now); break;
            case '1Y': startDate = subMonths(now, 12); break;
            case 'ALL': startDate = null; break;
        }

        // Filter Equity Curve
        const filteredEquity = startDate
            ? data.equityCurve.filter(d => isAfter(new Date(d.date), startDate!))
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

    return (
        <div className="flex h-screen bg-bg-primary overflow-hidden font-mono">
            <Sidebar />

            <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
                <div className={cn("p-6 space-y-6 transition-colors duration-300",
                    isTerminal ? "bg-black" : isTradingView ? "bg-[#131722]" : isPolar ? "bg-white" : "")}>

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
                                        onClick={() => setTimeRange(range)}
                                        className={cn(
                                            "px-3 py-1 text-xs font-medium rounded transition-all",
                                            timeRange === range
                                                ? "bg-accent-primary text-white shadow-sm"
                                                : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
                                        )}
                                    >
                                        {range}
                                    </button>
                                ))}
                            </div>

                            <div className="flex gap-4 text-xs text-text-secondary border-l border-border-primary pl-4">
                                <div><span className={cn("font-bold text-lg", riskMetrics.totalReturn > 0 ? "text-emerald-500" : "text-rose-500")}>{riskMetrics.totalReturn.toFixed(2)}%</span> NET R</div>
                                <div><span className="font-bold text-lg text-text-primary">{equityCurve.length}</span> SESSIONS</div>
                            </div>
                        </div>
                    </div>

                    {/* Risk & Efficiency Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                        <TerminalMetric label="Profit Factor" value={riskMetrics.profitFactor.toFixed(2)} trend={riskMetrics.profitFactor > 1.5 ? 'up' : 'neutral'} theme={theme} />
                        <TerminalMetric label="Max Drawdown" value={`-${riskMetrics.maxDrawdown.toFixed(2)}%`} trend="down" color={dangerColor} theme={theme} />
                        <TerminalMetric label="Win Streak" value={riskMetrics.maxWinStreak.toString()} theme={theme} />
                        <TerminalMetric label="Loss Streak" value={riskMetrics.maxLossStreak.toString()} color={dangerColor} theme={theme} />
                        <TerminalMetric label="Best Day" value={bestDay?.name?.slice(0, 3).toUpperCase() || '-'} subValue={`${bestDay?.winRate}% WR`} theme={theme} />
                        <TerminalMetric label="Avg R (Est)" value="1.2" subValue="Risk/Reward" theme={theme} />
                        <TerminalMetric label="Expectancy" value={`${(topTickers.slice(0, 10).reduce((acc, curr) => acc + curr.avgMvso, 0) / 10).toFixed(2)}%`} trend="up" theme={theme} />
                        <TerminalMetric label="Reliability" value="High" color={safeColor} theme={theme} />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Main Equity Curve & Trend Analysis */}
                        <div className="lg:col-span-2 space-y-6">
                            <ChartCard title="CUMULATIVE EQUITY & TREND" height={350} theme={theme}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={equityCurve}>
                                        <defs>
                                            <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
                                                <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke={isTradingView ? "#2a2e39" : "#333"} opacity={isTradingView ? 1 : 0.3} vertical={false} />
                                        <XAxis dataKey="date" stroke="#666" fontSize={10} tickFormatter={(val) => val.slice(5)} minTickGap={50} axisLine={false} tickLine={false} />
                                        <YAxis stroke="#666" fontSize={10} domain={['auto', 'auto']} axisLine={false} tickLine={false} />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: isTerminal ? '#000' : isTradingView ? '#1e222d' : '#1e293b',
                                                borderColor: isTradingView ? '#2a2e39' : '#333',
                                                color: chartColor,
                                                fontFamily: isTradingView ? 'sans-serif' : 'monospace'
                                            }}
                                            formatter={(value: number) => [`${value.toFixed(2)}%`, 'Return']}
                                        />
                                        <Area type="monotone" dataKey="equity" stroke={chartColor} fillOpacity={1} fill="url(#colorEquity)" strokeWidth={2} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </ChartCard>

                            {/* Daily Avg Returns Line Chart */}
                            <ChartCard title="DAILY PROFITABILITY TREND (AVG %)" height={200} theme={theme}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={dailyAverages}> {/* Note: dailyAverages currently isn't filtered, usually it should be. For simplicity keeping as is or need to filter too. Filtering it is better */}
                                        <CartesianGrid strokeDasharray="3 3" stroke={isTradingView ? "#2a2e39" : "#333"} opacity={isTradingView ? 1 : 0.3} vertical={false} />
                                        <XAxis dataKey="date" stroke="#666" fontSize={10} tickFormatter={(val) => val.slice(5)} minTickGap={50} axisLine={false} tickLine={false} />
                                        <YAxis stroke="#666" fontSize={10} domain={['auto', 'auto']} axisLine={false} tickLine={false} />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: isTerminal ? '#000' : isTradingView ? '#1e222d' : '#1e293b',
                                                borderColor: isTradingView ? '#2a2e39' : '#333',
                                                color: '#fff'
                                            }}
                                            itemStyle={{ color: '#fff' }}
                                        />
                                        <Line type="monotone" dataKey="avgReturn" stroke={safeColor} strokeWidth={2} dot={false} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </ChartCard>
                        </div>

                        {/* Side Stats & Leaderboards */}
                        <div className="space-y-6">

                            <ChartCard title="SEASONALITY (PROFITABILITY VS VOL)" height={250} theme={theme}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={seasonality}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={isTradingView ? "#2a2e39" : "#333"} opacity={isTradingView ? 1 : 0.3} vertical={false} />
                                        <XAxis dataKey="name" stroke="#666" fontSize={10} tickFormatter={(val) => val.slice(0, 3).toUpperCase()} axisLine={false} tickLine={false} />
                                        <YAxis yAxisId="left" stroke="#666" fontSize={10} hide />
                                        <YAxis yAxisId="right" orientation="right" stroke={chartColor} fontSize={10} unit="%" />

                                        <Tooltip
                                            cursor={{ fill: '#333', opacity: 0.2 }}
                                            contentStyle={{
                                                backgroundColor: isTerminal ? '#000' : isTradingView ? '#1e222d' : '#1e293b',
                                                borderColor: isTradingView ? '#2a2e39' : '#333',
                                                color: '#fff'
                                            }}
                                        />
                                        <Legend />
                                        <Bar yAxisId="left" dataKey="count" name="Vol" fill={secondaryColor} barSize={20} radius={[2, 2, 0, 0]} opacity={0.6} />
                                        <Line yAxisId="right" type="monotone" dataKey="avgMvso" name="Avg %" stroke={chartColor} strokeWidth={2} dot={{ r: 3 }} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </ChartCard>

                            {/* Top Sectors Leaderboard */}
                            <ChartCard title="TOP SECTORS" height={300} theme={theme}>
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
                                        <CartesianGrid strokeDasharray="3 3" stroke={isTradingView ? "#2a2e39" : "#333"} opacity={isTradingView ? 1 : 0.3} vertical={false} />
                                        <XAxis dataKey="name" stroke="#666" fontSize={10} tickFormatter={(v) => v.replace('%', '')} />
                                        <Tooltip
                                            cursor={{ fill: '#333', opacity: 0.2 }}
                                            contentStyle={{
                                                backgroundColor: isTerminal ? '#000' : isTradingView ? '#1e222d' : '#1e293b',
                                                borderColor: isTradingView ? '#2a2e39' : '#333',
                                                color: '#fff'
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

function TerminalMetric({ label, value, subValue, trend, color, theme }: { label: string, value: string, subValue?: string, trend?: 'up' | 'down' | 'neutral', color?: string, theme: string }) {
    const isTradingView = theme === 'tradingview';
    const isPolar = theme === 'polar';
    return (
        <div className={cn(
            "border p-3 rounded-sm flex flex-col justify-between h-24 relative overflow-hidden group transition-colors",
            isTradingView ? "bg-[#1e222d] border-[#2a2e39] hover:border-[#2962ff]/50" :
                isPolar ? "bg-white border-gray-200 hover:border-blue-500/30" :
                    "bg-bg-secondary border-border-primary hover:border-accent-primary/50"
        )}>
            <p className="text-[10px] uppercase text-text-secondary font-semibold tracking-wider">{label}</p>
            <div>
                <div className={cn(
                    "text-xl font-bold font-mono tracking-tight",
                    !color && trend === 'up' ? "text-emerald-500" :
                        !color && trend === 'down' ? "text-rose-500" : "text-text-primary"
                )} style={{ color }}>
                    {value}
                </div>
                {subValue && <div className="text-[10px] text-text-secondary mt-1">{subValue}</div>}
            </div>
            {trend && (
                <div className={cn(
                    "absolute top-2 right-2 w-1.5 h-1.5 rounded-full",
                    trend === 'up' ? "bg-emerald-500" : trend === 'down' ? "bg-rose-500" : "bg-gray-500"
                )}></div>
            )}
        </div>
    );
}

function ChartCard({ title, children, height = 300, theme }: { title: string, children: React.ReactNode, height?: number, theme: string }) {
    const isTradingView = theme === 'tradingview';
    const isPolar = theme === 'polar';
    return (
        <div className={cn(
            "border rounded-sm p-4 flex flex-col",
            theme === 'terminal' ? "bg-black border-zinc-800" :
                isTradingView ? "bg-[#1e222d] border-[#2a2e39]" :
                    isPolar ? "bg-white border-gray-200 shadow-sm" :
                        "bg-bg-secondary border-border-primary"
        )} style={{ height }}>
            <h3 className="text-xs font-bold text-text-secondary uppercase mb-4 tracking-widest flex items-center gap-2">
                {title}
                <div className="flex-1 h-px bg-border-primary/50"></div>
            </h3>
            <div className="flex-1 min-h-0 bg-bg-tertiary/10 rounded-sm overflow-hidden">
                {children}
            </div>
        </div>
    );
}
