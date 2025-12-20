import { MoreHorizontal, User, Settings, LogOut, BarChart2, PieChart } from 'lucide-react';
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
        <div className="w-64 bg-bg-secondary border-r border-border-primary flex flex-col h-full transition-colors duration-300">
            <div className="p-4 border-b border-border-primary">
                <div className="flex items-center gap-2 mb-6">
                    <div className="w-8 h-8 bg-accent-primary rounded flex items-center justify-center">
                        <span className="text-bg-primary font-bold text-xl">20</span>
                    </div>
                    <span className="text-xl font-bold text-text-primary tracking-tight">Bids</span>
                </div>

                {/* Navigation */}
                <div className="space-y-1 mb-6">
                    <button
                        onClick={() => navigate('/')}
                        className={cn(
                            "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                            !isAnalysis
                                ? "bg-accent-primary/10 text-accent-primary"
                                : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
                        )}
                    >
                        <BarChart2 className="w-4 h-4" />
                        Daily Bids
                    </button>
                    <button
                        onClick={() => navigate('/analysis')}
                        className={cn(
                            "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                            isAnalysis
                                ? "bg-accent-primary/10 text-accent-primary"
                                : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
                        )}
                    >
                        <PieChart className="w-4 h-4" />
                        Analysis
                    </button>
                </div>

                {/* Performance Summary Widget */}
                <div className="bg-bg-tertiary rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                            Avg Performance
                        </span>
                        <div className={cn(
                            "text-lg font-bold font-mono",
                            currentPeriodValue >= 80 ? "text-emerald-500" :
                                currentPeriodValue >= 50 ? "text-amber-500" : "text-rose-500"
                        )}>
                            {currentPeriodValue}%
                        </div>
                    </div>

                    <div className="flex bg-bg-primary/50 rounded-md p-0.5">
                        {periods.map((p) => (
                            <button
                                key={p}
                                onClick={() => setSelectedPeriod(p)}
                                className={cn(
                                    "flex-1 text-[10px] font-medium py-1 rounded-sm transition-all",
                                    selectedPeriod === p
                                        ? "bg-bg-secondary text-text-primary shadow-sm"
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
                <div className="flex-1 overflow-y-auto py-4">
                    <div className="px-4 mb-2 text-xs font-semibold text-text-secondary uppercase tracking-wider">
                        History (30 Days)
                    </div>
                    <div className="space-y-1 px-2">
                        {dates.map((date) => {
                            const stats = getAccuracy(date);
                            const isSelected = selectedDate && selectedDate.toDateString() === date.toDateString();
                            return (
                                <button
                                    key={date.toISOString()}
                                    onClick={() => onDateSelect?.(date)}
                                    className={cn(
                                        "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
                                        isSelected
                                            ? "bg-accent-primary/10 text-accent-primary font-medium"
                                            : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
                                    )}
                                >
                                    <div className="flex items-center gap-2">
                                        <span>{format(date, 'MMM dd, yyyy')}</span>
                                        {isWeekend(date) && (
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-bg-tertiary text-text-secondary border border-border-primary/50">
                                                WEEKEND
                                            </span>
                                        )}
                                    </div>
                                    {stats && (
                                        <>
                                            <span className={cn(
                                                "text-xs font-mono font-bold",
                                                stats.accuracy >= 80 ? "text-emerald-500" :
                                                    stats.accuracy >= 50 ? "text-amber-500" : "text-rose-500"
                                            )}>
                                                ({stats.accuracy}%)
                                            </span>
                                            <span className="text-xs font-mono text-text-secondary">
                                                {stats.count}
                                            </span>
                                        </>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="p-4 border-t border-border-primary space-y-4">
                <div className="flex items-center justify-between text-text-secondary">
                    <span className="text-xs">Theme</span>
                    <ThemeSelector />
                </div>

                <div className="relative">
                    <button
                        onClick={() => setShowUserMenu(!showUserMenu)}
                        className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-bg-tertiary transition-colors text-left"
                    >
                        <div className="w-8 h-8 rounded-full bg-accent-secondary/20 flex items-center justify-center text-accent-secondary">
                            <User className="h-4 w-4" />
                        </div>
                        <div className="flex-1">
                            <div className="text-sm font-medium text-text-primary">Analyst</div>
                            <div className="text-xs text-text-secondary">Pro Account</div>
                        </div>
                        <MoreHorizontal className="h-4 w-4 text-text-secondary" />
                    </button>

                    {showUserMenu && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                            <div className="absolute bottom-full left-0 mb-2 w-full bg-bg-secondary border border-border-primary rounded-lg shadow-xl p-1 z-50 animate-in fade-in zoom-in-95 duration-200">
                                <button
                                    onClick={() => navigate('/upload')}
                                    className="w-full flex items-center gap-2 p-2 rounded-md text-sm text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-colors"
                                >
                                    <Settings className="h-4 w-4" /> Upload Data
                                </button>
                                <button className="w-full flex items-center gap-2 p-2 rounded-md text-sm text-red-400 hover:bg-red-500/10 transition-colors">
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
