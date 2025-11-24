import { Globe, Zap, Newspaper, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '../lib/utils';

interface MarketIndex {
    name: string;
    value: number;
    change: number;
}

interface MarketContextProps {
    indices?: MarketIndex[];
}

const SECTORS = [
    { name: 'Tech', change: 1.2 },
    { name: 'Energy', change: -0.5 },
    { name: 'Finance', change: 0.3 },
    { name: 'Healthcare', change: -0.2 },
];

const NEWS = [
    "Fed signals potential rate cuts in Q3 2025 as inflation cools",
    "Tech sector rallies on new AI chip announcements from major players",
    "Oil prices stabilize after week of volatility amid geopolitical tensions",
    "Consumer sentiment hits 6-month high ahead of holiday season"
];

export function MarketContext({ indices }: MarketContextProps) {
    const displayIndices = indices || [];
    return (
        <div className="h-full flex flex-col bg-bg-primary border-t border-border-primary transition-colors duration-300">
            {/* Header */}
            <div className="px-4 py-2 bg-bg-secondary border-b border-border-primary flex justify-between items-center">
                <div className="flex items-center gap-2 text-accent-primary font-bold text-xs uppercase tracking-widest font-sans">
                    <Globe className="h-3 w-3" />
                    Global Markets Context
                </div>
                <div className="text-[10px] text-text-secondary font-mono">
                    LIVE DATA // DELAYED 15MIN
                </div>
            </div>

            <div className="grid grid-cols-5 gap-4 p-4">
                {displayIndices.map((index) => (
                    <div key={index.name} className="glass-panel p-3 rounded-lg flex flex-col justify-between hover:bg-[var(--bg-secondary)] transition-colors group">
                        <div className="flex justify-between items-start">
                            <span className="text-xs text-[var(--text-muted)] font-bold">{index.name}</span>
                            {index.change >= 0 ?
                                <TrendingUp className="w-3 h-3 text-[var(--terminal-green)]" /> :
                                <TrendingDown className="w-3 h-3 text-[var(--red-500)]" />
                            }
                        </div>
                        <div className="mt-2">
                            <div className="text-lg font-bold text-[var(--text-primary)] font-mono tracking-tight">
                                {index.value.toLocaleString()}
                            </div>
                            <div className={cn(
                                "text-xs font-mono font-medium",
                                index.change >= 0 ? "text-[var(--terminal-green)]" : "text-[var(--red-500)]"
                            )}>
                                {index.change >= 0 ? '+' : ''}{index.change}%
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Sector Performance */}
                <div className="w-1/3 border-r border-border-primary p-4">
                    <h3 className="text-[10px] text-text-secondary uppercase tracking-wider mb-3 font-bold flex items-center gap-2">
                        <Zap className="h-3 w-3" />
                        Sector Heatmap
                    </h3>
                    <div className="space-y-2">
                        {SECTORS.map((sec) => (
                            <div key={sec.name} className="flex items-center gap-2 text-xs font-mono">
                                <span className="w-20 text-text-secondary">{sec.name}</span>
                                <div className="flex-1 h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                                    <div
                                        className={cn("h-full rounded-full", sec.change >= 0 ? "bg-terminal-green" : "bg-red-500")}
                                        style={{ width: `${Math.abs(sec.change) * 40}%`, marginLeft: sec.change < 0 ? 'auto' : '0' }}
                                    />
                                </div>
                                <span className={cn("w-10 text-right", sec.change >= 0 ? "text-terminal-green" : "text-red-500")}>
                                    {sec.change}%
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* News Ticker */}
                <div className="w-1/3 p-4 bg-bg-secondary/50">
                    <h3 className="text-[10px] text-text-secondary uppercase tracking-wider mb-3 font-bold flex items-center gap-2">
                        <Newspaper className="h-3 w-3" />
                        Top Headlines
                    </h3>
                    <div className="space-y-3">
                        {NEWS.map((item, i) => (
                            <div key={i} className="flex gap-2 items-start">
                                <span className="text-accent-primary font-bold text-[10px] mt-0.5">{">>"}</span>
                                <p className="text-xs text-text-primary leading-tight font-sans hover:text-accent-secondary cursor-pointer transition-colors">
                                    {item}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
