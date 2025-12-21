import { MoreHorizontal, Settings, LogOut, BarChart2, PieChart } from 'lucide-react';
import { format, isWeekend } from 'date-fns';
import { cn } from '../lib/utils';
import { useState, useEffect } from 'react';
import { fetchDates, fetchMvsoHistory } from '../api/client';
import { ThemeSelector } from './ThemeSelector';
import { useNavigate, useLocation } from 'react-router-dom';

interface SidebarProps {
    selectedDate?: Date;
    onDateSelect?: (date: Date) => void;
    mvsoThreshold?: number;
}

export function Sidebar({ selectedDate, onDateSelect, mvsoThreshold = 0.5 }: SidebarProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const isAnalysis = location.pathname === '/analysis';

    const [dates, setDates] = useState<Date[]>([]);
    const [mvsoHistory, setMvsoHistory] = useState<Record<string, number[]>>({});
    const [showUserMenu, setShowUserMenu] = useState(false);

    useEffect(() => {
        if (!isAnalysis) {
            fetchDates().then(setDates);
        }
        fetchMvsoHistory().then(setMvsoHistory);
    }, [isAnalysis]);

    const getAccuracy = (date: Date) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        const mvsos = mvsoHistory[dateStr] || [];
        if (mvsos.length === 0) return null;

        const hits = mvsos.filter(m => m >= mvsoThreshold).length;
        const accuracy = Math.round((hits / mvsos.length) * 100);
        return { accuracy, count: mvsos.length, hits };
    };

    const [selectedPeriod, setSelectedPeriod] = useState<'7D' | 'MTD' | '1M' | 'YTD' | '1Y'>('7D');

    const calculatePeriodStats = (period: '7D' | 'MTD' | '1M' | 'YTD' | '1Y') => {
        const now = new Date();
        let startDate = new Date();

        switch (period) {
            case '7D':
                startDate.setDate(now.getDate() - 7);
                break;
            case 'MTD':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case '1M':
                startDate.setDate(now.getDate() - 30);
                break;
            case 'YTD':
                startDate = new Date(now.getFullYear(), 0, 1);
                break;
            case '1Y':
                startDate.setFullYear(now.getFullYear() - 1);
                break;
        }

        let totalHits = 0;
        let totalCount = 0;

        Object.keys(mvsoHistory).forEach(dateStr => {
            const date = new Date(dateStr);
            if (date >= startDate && date <= now) {
                const mvsos = mvsoHistory[dateStr];
                const hits = mvsos.filter(m => m >= mvsoThreshold).length;
                totalHits += hits;
                totalCount += mvsos.length;
            }
        });

        if (totalCount === 0) return 0;
        return Math.round((totalHits / totalCount) * 100);
    };

    const currentPeriodValue = calculatePeriodStats(selectedPeriod);
    const periods: ('7D' | 'MTD' | '1M' | 'YTD' | '1Y')[] = ['7D', 'MTD', '1M', 'YTD', '1Y'];

    return (
        <div className="w-72 bg-bg-primary border-r border-border-primary/50 flex flex-col h-full transition-colors duration-300 font-sans">
            <div className="p-6">
                <div className="flex items-center gap-3 mb-8 px-2">
                    <div className="w-8 h-8 bg-accent-primary rounded-lg shadow-sm flex items-center justify-center">
                        <span className="text-white font-bold text-lg tracking-tighter">20</span>
                    </div>
                    <span className="text-xl font-bold text-text-primary tracking-tight">Bids</span>
                </div>

                {/* Navigation */}
                <div className="space-y-1 mb-8">
                    <button
                        onClick={() => navigate('/')}
                        className={cn(
                            "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                            !isAnalysis
                                ? "bg-accent-primary/10 text-accent-primary shadow-sm"
                                : "text-text-secondary hover:bg-bg-secondary hover:text-text-primary"
                        )}
                    >
                        <BarChart2 className="w-4 h-4" />
                        Daily Bids
                    </button>
                    <button
                        onClick={() => navigate('/analysis')}
                        className={cn(
                            "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                            isAnalysis
                                ? "bg-accent-primary/10 text-accent-primary shadow-sm"
                                : "text-text-secondary hover:bg-bg-secondary hover:text-text-primary"
                        )}
                    >
                        <PieChart className="w-4 h-4" />
                        Analysis
                    </button>
                </div>

                {/* Performance Summary Widget */}
                <div className="bg-bg-secondary/50 rounded-2xl p-4 space-y-4 border border-border-primary/50">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                            Avg Accuracy
                        </span>
                        <div className={cn(
                            "text-xl font-bold tracking-tight tabular-nums",
                            currentPeriodValue >= 80 ? "text-emerald-600" :
                                currentPeriodValue >= 50 ? "text-amber-600" : "text-rose-600"
                        )}>
                            {currentPeriodValue}%
                        </div>
                    </div>

                    <div className="flex bg-bg-primary rounded-lg p-1 border border-border-primary/50">
                        {periods.map((p) => (
                            <button
                                key={p}
                                onClick={() => setSelectedPeriod(p)}
                                className={cn(
                                    "flex-1 text-[10px] font-medium py-1 rounded-md transition-all duration-200",
                                    selectedPeriod === p
                                        ? "bg-white dark:bg-zinc-800 text-text-primary shadow-sm border border-border-primary/50"
                                        : "text-text-secondary hover:text-text-primary hover:bg-bg-secondary/50"
                                )}
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {!isAnalysis && (
                <div className="flex-1 overflow-y-auto px-4 py-2">
                    <div className="px-4 mb-3 text-xs font-semibold text-text-secondary uppercase tracking-wider sticky top-0 bg-bg-primary py-2 z-10">
                        History (30 Days)
                    </div>
                    <div className="space-y-1">
                        {dates.map((date) => {
                            const stats = getAccuracy(date);
                            const isSelected = selectedDate && selectedDate.toDateString() === date.toDateString();
                            return (
                                <button
                                    key={date.toISOString()}
                                    onClick={() => onDateSelect?.(date)}
                                    className={cn(
                                        "w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm transition-all duration-200 border border-transparent",
                                        isSelected
                                            ? "bg-white dark:bg-zinc-800 border-border-primary/50 shadow-sm text-text-primary font-medium"
                                            : "text-text-secondary hover:bg-bg-secondary hover:text-text-primary"
                                    )}
                                >
                                    <div className="flex items-center gap-2">
                                        <span>{format(date, 'MMM dd')}</span>
                                        {isWeekend(date) && (
                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-bg-secondary text-text-secondary border border-border-primary/50">
                                                W
                                            </span>
                                        )}
                                    </div>
                                    {stats && (
                                        <div className="flex items-center gap-2">
                                            <span className={cn(
                                                "text-xs font-bold tabular-nums",
                                                stats.accuracy >= 80 ? "text-emerald-600" :
                                                    stats.accuracy >= 50 ? "text-amber-600" : "text-rose-600"
                                            )}>
                                                {stats.accuracy}%
                                            </span>
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="p-6 border-t border-border-primary/50 space-y-4 bg-bg-primary">
                <div className="flex items-center justify-between text-text-secondary px-2">
                    <span className="text-xs font-medium">Theme</span>
                    <ThemeSelector />
                </div>

                <div className="relative">
                    <button
                        onClick={() => setShowUserMenu(!showUserMenu)}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-bg-secondary transition-colors text-left border border-transparent hover:border-border-primary/50"
                    >
                        <div className="w-8 h-8 rounded-full bg-accent-primary/10 flex items-center justify-center text-accent-primary font-bold text-xs ring-2 ring-white dark:ring-zinc-800">
                            A
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-text-primary truncate">Analyst</div>
                            <div className="text-xs text-text-secondary truncate">Pro Account</div>
                        </div>
                        <MoreHorizontal className="h-4 w-4 text-text-secondary" />
                    </button>

                    {showUserMenu && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                            <div className="absolute bottom-full left-0 mb-2 w-full bg-bg-primary border border-border-primary/50 rounded-xl shadow-lg p-1.5 z-50 animate-in fade-in zoom-in-95 duration-200">
                                <button
                                    onClick={() => navigate('/upload')}
                                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-secondary hover:bg-bg-secondary hover:text-text-primary transition-colors"
                                >
                                    <Settings className="h-4 w-4" /> Upload Data
                                </button>
                                <div className="h-px bg-border-primary/50 my-1" />
                                <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/10 transition-colors">
                                    <LogOut className="h-4 w-4" /> Log Out
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
