import { useEffect, useState } from 'react';
import { Globe, Zap } from 'lucide-react';
import { cn } from '../lib/utils';
import { fetchSectors } from '../api/client';
import { PositionCalculator } from './PositionCalculator';
import { TickerNotes } from './TickerNotes';

interface MarketContextProps {
    recommendations?: any[];
    selectedTicker?: string;
    selectedPrice?: number;
    selectedSector?: string;
    selectedDate?: Date;
}

export function MarketContext({ selectedTicker, selectedPrice, selectedSector, selectedDate }: MarketContextProps) {
    const [sectors, setSectors] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Fetch Sectors
    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | null = null;

        const loadSectors = async () => {
            if (document.hidden) return; // Skip if tab not visible
            setIsLoading(true);
            try {
                const data = await fetchSectors(selectedDate);
                setSectors(data);
            } catch (error) {
                console.error('Failed to fetch sectors:', error);
            } finally {
                setIsLoading(false);
            }
        };
        loadSectors();
        // Only poll if it's today
        const isToday = !selectedDate || new Date().toDateString() === selectedDate.toDateString();
        if (isToday) {
            interval = setInterval(loadSectors, 120000); // Changed from 60s to 120s
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [selectedDate]);

    return (
        <div className="h-full flex flex-col bg-bg-primary border-t border-border-primary transition-colors duration-300">
            {/* Header */}
            <div className="px-4 py-2 bg-bg-secondary border-b border-border-primary flex justify-between items-center">
                <div className="flex items-center gap-2 text-accent-primary font-bold text-xs uppercase tracking-widest font-sans">
                    <Globe className="h-3 w-3" />
                    Ticker Data
                </div>
                <div className="text-[10px] text-text-secondary font-mono">
                    LIVE DATA // POLYGON & TRADINGVIEW
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Notes (Left) */}
                <div className="w-1/3 border-r border-border-primary p-0 overflow-hidden relative bg-bg-primary">
                    <TickerNotes ticker={selectedTicker || ''} />
                </div>

                {/* Sector Performance (Center) */}
                <div className="w-1/3 border-r border-border-primary p-4 overflow-y-auto custom-scrollbar">
                    <h3 className="text-[10px] text-text-secondary uppercase tracking-wider mb-3 font-bold flex items-center gap-2">
                        <Zap className="h-3 w-3" />
                        Sector Performance {selectedDate && new Date().toDateString() !== selectedDate.toDateString() ? '(Historical)' : '(Real-time)'}
                    </h3>
                    <div className="space-y-2">
                        {isLoading ? (
                            <div className="flex flex-col items-center justify-center h-32 text-text-secondary gap-2">
                                <div className="w-4 h-4 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
                                <span className="text-xs italic">Loading sector data...</span>
                            </div>
                        ) : sectors.length === 0 ? (
                            <div className="text-xs text-text-secondary italic">No sector data available.</div>
                        ) : (
                            sectors.map((sec) => {
                                // Improved matching logic
                                const match = selectedSector && (
                                    sec.name.includes(selectedSector) ||
                                    selectedSector.includes(sec.name) ||
                                    (selectedSector.includes('Financial') && sec.name === 'Financials') ||
                                    (selectedSector.includes('Technology') && sec.name === 'Technology') ||
                                    (selectedSector === 'Consumer Cyclical' && sec.name === 'Cons. Discret.') ||
                                    (selectedSector === 'Consumer Defensive' && sec.name === 'Cons. Staples') ||
                                    (selectedSector === 'Basic Materials' && sec.name === 'Materials') ||
                                    (selectedSector === 'Communication Services' && sec.name === 'Comm. Svcs')
                                );

                                return (
                                    <div
                                        key={sec.symbol}
                                        className={cn(
                                            "flex items-center gap-2 text-xs font-mono p-1 rounded transition-colors",
                                            match ? "bg-accent-primary/20 border border-accent-primary/50" : "hover:bg-bg-secondary/50"
                                        )}
                                    >
                                        <span className={cn("w-32 truncate", match ? "text-text-primary font-bold" : "text-text-secondary")} title={sec.name}>
                                            {sec.name}
                                        </span>
                                        <div className="flex-1 h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                                            <div
                                                className={cn("h-full rounded-full", sec.change >= 0 ? "bg-terminal-green" : "bg-red-500")}
                                                style={{ width: `${Math.min(Math.abs(sec.change) * 20, 100)}%`, marginLeft: sec.change < 0 ? 'auto' : '0' }}
                                            />
                                        </div>
                                        <span className={cn("w-12 text-right", sec.change >= 0 ? "text-terminal-green" : "text-red-500")}>
                                            {sec.change > 0 ? '+' : ''}{sec.change.toFixed(2)}%
                                        </span>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Position Calculator (Right) */}
                <div className="w-1/3 p-0 bg-bg-primary relative overflow-hidden">
                    <PositionCalculator
                        ticker={selectedTicker || ''}
                        currentPrice={selectedPrice || 0}
                    />
                </div>
            </div>
        </div>
    );
}
