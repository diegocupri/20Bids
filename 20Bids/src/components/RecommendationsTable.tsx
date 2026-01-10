import { useState, useEffect } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, ExternalLink, Settings, Maximize2, Minimize2, TrendingDown, BarChart2, DollarSign, Activity, Zap, RotateCcw } from 'lucide-react';
import { cn } from '../lib/utils';
import { fetchRecommendations, fetchPrices, fetchIndices, fetchTradeLogs, API_URL } from '../api/client';
import type { TradeLog } from '../api/client';



interface RecommendationsTableProps {
    selectedDate: Date;
    onRowClick: (rec: any) => void;
    onDataLoaded?: (data: any[]) => void;
    mvsoThreshold: number;
    onMvsoThresholdChange: (value: number) => void;
    stopLossThreshold: number;
    onStopLossThresholdChange: (value: number) => void;
    onOpenTradingModal?: () => void;
}

// ... (TAG_COLORS)

type SortKey = 'symbol' | 'price' | 'refPrice1020' | 'change' | 'volume' | 'rsi' | 'relativeVol' | 'type' | 'probabilityValue' | 'sector' | 'open' | 'mvso' | 'lowBeforePeak';

export function RecommendationsTable({ selectedDate, onRowClick, onDataLoaded, mvsoThreshold, onMvsoThresholdChange, stopLossThreshold, onStopLossThresholdChange, onOpenTradingModal }: RecommendationsTableProps) {
    const [recommendations, setRecommendations] = useState<any[]>([]);
    const [prices, setPrices] = useState<Record<string, { price: number, change: number, refPrice1020?: number, volume?: number, sector?: string, open?: number, high?: number }>>({});
    const [indices, setIndices] = useState<any[]>([]);
    const [sortConfig, setSortConfig] = useState<{ key: SortKey, direction: 'asc' | 'desc' }>({ key: 'probabilityValue', direction: 'desc' });
    const [selectedSymbols, setSelectedSymbols] = useState<Set<string>>(new Set());
    const [tradeLogs, setTradeLogs] = useState<TradeLog[]>([]);
    const [tradeHover, setTradeHover] = useState<{ symbol: string, x: number, y: number } | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Persistent Filter States
    const [showExtraHours, setShowExtraHours] = useState(() => {
        const saved = localStorage.getItem('showExtraHours');
        return saved ? JSON.parse(saved) : false;
    });
    const [minVolume, setMinVolume] = useState<number>(() => {
        const saved = localStorage.getItem('minVolume');
        return saved ? parseFloat(saved) : 0;
    });
    const [minOpenPrice, setMinOpenPrice] = useState<number>(() => {
        const saved = localStorage.getItem('minOpenPrice');
        return saved ? parseFloat(saved) : 0;
    });

    // Save filters on change
    useEffect(() => { localStorage.setItem('showExtraHours', JSON.stringify(showExtraHours)); }, [showExtraHours]);
    useEffect(() => { localStorage.setItem('minVolume', minVolume.toString()); }, [minVolume]);
    useEffect(() => { localStorage.setItem('minOpenPrice', minOpenPrice.toString()); }, [minOpenPrice]);

    // Fetch Indices
    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | null = null;

        const loadIndices = async () => {
            if (document.hidden) return; // Skip if tab not visible
            try {
                const data = await fetchIndices();
                setIndices(data);
            } catch (error) {
                console.error('Failed to load indices:', error);
            }
        };

        loadIndices();
        interval = setInterval(loadIndices, 120000); // Changed from 60s to 120s

        return () => {
            if (interval) clearInterval(interval);
        };
    }, []);

    // Fetch Trade Logs
    useEffect(() => {
        const loadTradeLogs = async () => {
            const logs = await fetchTradeLogs();
            setTradeLogs(logs);
        };
        loadTradeLogs();
    }, [selectedDate]);

    useEffect(() => {
        const loadData = async () => {
            try {
                const data = await fetchRecommendations(selectedDate);
                // Safeguard: Ensure data is an array before setting state
                if (Array.isArray(data)) {
                    setRecommendations(data);
                } else {
                    console.error('[RecommendationsTable] Received invalid data format:', data);
                    setRecommendations([]);
                }

                // Fetch extra data for dashboard
                const indicesData = await fetchIndices();
                setIndices(indicesData);

                if (onDataLoaded) onDataLoaded(data);
            } catch (err) {
                console.error('[RecommendationsTable] Error loading data:', err);
                // Safeguard on error
                setRecommendations([]);
            }
        };
        loadData();
    }, [selectedDate, onDataLoaded]);

    // Poll for real-time prices every 30 seconds (only if today AND tab is visible)
    useEffect(() => {
        const isToday = new Date(selectedDate).toDateString() === new Date().toDateString();
        if (!isToday) {
            setPrices({}); // Clear live prices for past dates
            return;
        }

        let interval: ReturnType<typeof setInterval> | null = null;

        const pollPrices = async () => {
            // Skip polling if tab is not visible
            if (document.hidden) return;

            try {
                const updates = await fetchPrices();
                setPrices(prev => ({ ...prev, ...updates }));
            } catch (error) {
                console.error('Failed to poll prices:', error);
            }
        };

        const handleVisibilityChange = () => {
            if (!document.hidden && !interval) {
                pollPrices(); // Poll immediately when tab becomes visible
                interval = setInterval(pollPrices, 30000);
            } else if (document.hidden && interval) {
                clearInterval(interval);
                interval = null;
            }
        };

        // Initial setup
        pollPrices();
        interval = setInterval(pollPrices, 30000); // Changed from 10s to 30s
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            if (interval) clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [selectedDate]);

    const handleTradingViewClick = (symbol: string, e: React.MouseEvent) => {
        e.stopPropagation();
        window.open(`https://www.tradingview.com/chart/?symbol=${symbol}`, '_blank');
    };

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc'
        }));
    };

    const sortedData = [...recommendations]
        .filter(rec => {
            const update = prices[rec.symbol] || {};
            const volume = update.volume || rec.volume;
            const open = update.open || rec.open || 0;

            // Filter Logic: Treat minVolume input as Millions (e.g. 14 -> 14,000,000)
            if (minVolume > 0 && volume < minVolume * 1000000) return false;

            if (minOpenPrice > 0 && open < minOpenPrice) return false;

            return true;
        })
        .sort((a, b) => {
            const aUpdate = prices[a.symbol] || {};
            const bUpdate = prices[b.symbol] || {};

            let aValue: any = a[sortConfig.key];
            let bValue: any = b[sortConfig.key];

            // Handle dynamic fields
            if (sortConfig.key === 'price') {
                aValue = aUpdate.price || a.price;
                bValue = bUpdate.price || b.price;
            } else if (sortConfig.key === 'change') {
                const aRef = aUpdate.refPrice1020 || a.refPrice1020;
                const bRef = bUpdate.refPrice1020 || b.refPrice1020;
                if (aRef) aValue = (((aUpdate.price || a.price) - aRef) / aRef) * 100;
                else aValue = aUpdate.change || a.changePercent;

                if (bRef) bValue = (((bUpdate.price || b.price) - bRef) / bRef) * 100;
                else bValue = bUpdate.change || b.changePercent;
            } else if (sortConfig.key === 'refPrice1020') {
                aValue = aUpdate.refPrice1020 || a.refPrice1020 || 0;
                bValue = bUpdate.refPrice1020 || b.refPrice1020 || 0;
            } else if (sortConfig.key === 'volume') {
                aValue = aUpdate.volume || a.volume;
                bValue = bUpdate.volume || b.volume;
            } else if (sortConfig.key === 'sector') {
                aValue = aUpdate.sector || a.sector;
                bValue = bUpdate.sector || b.sector;
            } else if (sortConfig.key === 'open') {
                aValue = aUpdate.open || a.open || 0;
                bValue = bUpdate.open || b.open || 0;
            } else if (sortConfig.key === 'mvso') {
                const aRef = aUpdate.refPrice1020 || a.refPrice1020;
                const aHigh = aUpdate.high || a.high || 0;
                aValue = (aHigh && aRef) ? ((aHigh - aRef) / aRef) * 100 : 0;

                const bRef = bUpdate.refPrice1020 || b.refPrice1020;
                const bHigh = bUpdate.high || b.high || 0;
                bValue = (bHigh && bRef) ? ((bHigh - bRef) / bRef) * 100 : 0;
            }

            if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });



    const toggleSelection = (symbol: string) => {
        const newSelection = new Set(selectedSymbols);
        if (newSelection.has(symbol)) {
            newSelection.delete(symbol);
        } else {
            newSelection.add(symbol);
        }
        setSelectedSymbols(newSelection);
    };

    const toggleAll = () => {
        if (selectedSymbols.size === sortedData.length) {
            setSelectedSymbols(new Set());
        } else {
            setSelectedSymbols(new Set(sortedData.map(r => r.symbol)));
        }
    };

    const handleLaunchGraphs = () => {
        const symbols = Array.from(selectedSymbols).join(',');
        const url = `#/graphs?symbols=${symbols}`;
        window.open(url, '_blank');
    };

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            const dateStr = new Date(selectedDate).toISOString().split('T')[0];
            await fetch(`${API_URL}/admin/refresh-day?date=${dateStr}&action=refresh`, { method: 'POST' });

            // Reload data explicitly
            const data = await fetchRecommendations(selectedDate);
            if (Array.isArray(data)) {
                setRecommendations(data);
                if (onDataLoaded) onDataLoaded(data);
            }
        } catch (e) {
            console.error('Refresh failed', e);
        } finally {
            setIsRefreshing(false);
        }
    };

    const SortIcon = ({ column }: { column: SortKey }) => {
        if (sortConfig.key !== column) return <ArrowUpDown className="w-3 h-3 text-border-primary ml-1 opacity-0 group-hover:opacity-50" />;
        return sortConfig.direction === 'asc'
            ? <ArrowUp className="w-3 h-3 text-accent-primary ml-1" />
            : <ArrowDown className="w-3 h-3 text-accent-primary ml-1" />;
    };

    return (
        <div className="flex flex-col h-full min-h-0 bg-bg-primary font-sans relative">
            {/* Launch Button Floating - Compact */}
            {selectedSymbols.size > 0 && (
                <div className="absolute bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <button
                        onClick={handleLaunchGraphs}
                        className="flex items-center gap-2 pl-4 pr-2 py-2 bg-text-primary text-bg-primary rounded-full shadow-lg hover:scale-105 transition-all font-bold text-xs tracking-tight group"
                    >
                        <span>Launch {selectedSymbols.size} Chart{selectedSymbols.size !== 1 ? 's' : ''}</span>
                        <div className="w-6 h-6 rounded-full bg-bg-primary/20 flex items-center justify-center group-hover:bg-accent-primary group-hover:text-white transition-colors">
                            <ExternalLink className="w-3 h-3" />
                        </div>
                    </button>
                </div>
            )}

            {/* Header / Filters - Redesigned to match Analysis.tsx */}
            <div className="sticky top-0 z-30 bg-bg-primary/95 backdrop-blur pt-4 pb-4 border-b border-border-primary/50 px-6">
                <div className="flex flex-col xl:flex-row items-center justify-between gap-4">
                    {/* Left: Title & Indices */}
                    <div className="flex items-center gap-6 w-full xl:w-auto justify-between xl:justify-start">
                        <h2 className="text-base font-bold text-text-primary flex items-center gap-2 whitespace-nowrap">
                            Market Opportunities
                        </h2>

                        {/* Indices - Styled as a group */}
                        <div className="hidden md:flex items-center gap-4 bg-bg-secondary/30 px-3 py-1.5 rounded-lg border border-border-primary/30">
                            {indices.map((idx, i) => (
                                <div key={idx.symbol} className={cn("flex items-center gap-2 text-xs", i < indices.length - 1 && "border-r border-border-primary/30 pr-4")}>
                                    <span className="font-bold text-text-primary">{idx.symbol === 'VIXY' ? 'VIX' : idx.symbol}</span>
                                    <span className={cn(
                                        "font-medium tabular-nums",
                                        idx.change >= 0 ? "text-emerald-600" : "text-rose-600"
                                    )}>
                                        {idx.price.toFixed(2)}
                                        <span className="ml-1 opacity-60 text-[10px]">
                                            {idx.change >= 0 ? '+' : ''}{idx.change.toFixed(2)}%
                                        </span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right: Filters Grouped */}
                    <div className="flex items-center gap-4 w-full xl:w-auto justify-end">
                        <div className="flex items-center gap-1.5 bg-bg-secondary/30 p-1 rounded-lg border border-border-primary/30 overflow-x-auto max-w-full">
                            {/* MVSO */}
                            <div className="flex items-center gap-1.5 px-2 py-1 group hover:bg-white/5 rounded transition-colors shrink-0">
                                <Activity size={14} className="text-text-secondary group-hover:text-accent-primary" />
                                <label className="text-xs font-bold text-text-primary select-none whitespace-nowrap">MVSO</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={mvsoThreshold}
                                    onChange={(e) => onMvsoThresholdChange(parseFloat(e.target.value) || 0)}
                                    className="w-8 bg-transparent text-xs font-normal font-sans text-text-primary outline-none text-right tabular-nums focus:text-accent-primary"
                                />
                                <span className="text-[10px] text-text-secondary opacity-50">%</span>
                            </div>

                            <div className="w-px h-5 bg-border-primary/30 shrink-0"></div>

                            {/* Vol */}
                            <div className="flex items-center gap-1.5 px-2 py-1 group hover:bg-white/5 rounded transition-colors shrink-0">
                                <BarChart2 size={14} className="text-text-secondary group-hover:text-accent-primary" />
                                <label className="text-xs font-bold text-text-primary select-none whitespace-nowrap">Vol</label>
                                <input
                                    type="number"
                                    value={minVolume}
                                    onChange={(e) => setMinVolume(parseFloat(e.target.value) || 0)}
                                    placeholder="0"
                                    className="w-8 bg-transparent text-xs font-normal font-sans text-text-primary outline-none text-right tabular-nums focus:text-accent-primary"
                                />
                                <span className="text-[10px] text-text-secondary opacity-50">M</span>
                            </div>

                            <div className="w-px h-5 bg-border-primary/30 shrink-0"></div>

                            {/* Min $ */}
                            <div className="flex items-center gap-1.5 px-2 py-1 group hover:bg-white/5 rounded transition-colors shrink-0">
                                <DollarSign size={14} className="text-text-secondary group-hover:text-accent-primary" />
                                <label className="text-xs font-bold text-text-primary select-none whitespace-nowrap">Min $</label>
                                <input
                                    type="number"
                                    value={minOpenPrice}
                                    onChange={(e) => setMinOpenPrice(parseFloat(e.target.value) || 0)}
                                    placeholder="0"
                                    className="w-8 bg-transparent text-xs font-normal font-sans text-text-primary outline-none text-right tabular-nums focus:text-accent-primary"
                                />
                            </div>

                            <div className="w-px h-5 bg-border-primary/30 shrink-0"></div>

                            {/* SL */}
                            <div className="flex items-center gap-1.5 px-2 py-1 group hover:bg-white/5 rounded transition-colors shrink-0">
                                <TrendingDown size={14} className="text-rose-500" />
                                <label className="text-xs font-bold text-text-primary select-none whitespace-nowrap">SL</label>
                                <input
                                    type="number"
                                    step="0.5"
                                    value={stopLossThreshold}
                                    onChange={(e) => onStopLossThresholdChange(parseFloat(e.target.value) || 0)}
                                    placeholder="5"
                                    className="w-8 bg-transparent text-xs font-normal font-sans text-text-primary outline-none text-right tabular-nums focus:text-accent-primary"
                                />
                                <span className="text-[10px] text-text-secondary opacity-50">%</span>
                            </div>
                        </div>

                        {/* Controls Group */}
                        <div className="flex items-center gap-2">
                            {/* Trading Config Button */}
                            {onOpenTradingModal && (
                                <button
                                    onClick={onOpenTradingModal}
                                    className="w-8 h-8 flex items-center justify-center bg-bg-secondary hover:bg-bg-tertiary text-text-secondary hover:text-text-primary rounded-lg transition-all border border-transparent hover:border-border-primary/50"
                                    title="Trading Configuration"
                                >
                                    <Settings className="w-4 h-4" />
                                </button>
                            )}

                            {/* Refresh Button - Discrete */}
                            <button
                                onClick={handleRefresh}
                                disabled={isRefreshing}
                                className="w-8 h-8 flex items-center justify-center bg-bg-secondary hover:bg-bg-tertiary text-text-secondary hover:text-text-primary rounded-lg transition-all border border-transparent hover:border-border-primary/50 disabled:opacity-50"
                                title="Refresh Data (Polygon)"
                            >
                                <RotateCcw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                            </button>

                            {/* Discrete Extended Hours Toggle */}
                            <button
                                onClick={() => setShowExtraHours(!showExtraHours)}
                                className="p-2 text-text-secondary hover:text-text-primary transition-colors hover:bg-bg-secondary rounded-lg"
                                title={showExtraHours ? "Hide Extended Hours" : "Show Extended Hours"}
                            >
                                {showExtraHours ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 min-h-0 overflow-y-auto px-6 relative z-10">
                <table className="w-full border-collapse text-sm table-fixed">
                    <thead className="sticky top-0 bg-bg-primary z-20">
                        <tr className="text-left text-text-secondary border-b border-border-primary/50 text-xs font-medium align-bottom">
                            <th className="pt-6 pb-3 pl-4 w-[4%]">
                                <div
                                    className={cn(
                                        "w-4 h-4 rounded-full border-2 cursor-pointer transition-all flex items-center justify-center",
                                        selectedSymbols.size === sortedData.length && sortedData.length > 0
                                            ? "border-accent-primary bg-accent-primary"
                                            : "border-border-primary hover:border-text-secondary"
                                    )}
                                    onClick={toggleAll}
                                >
                                    {selectedSymbols.size === sortedData.length && sortedData.length > 0 && (
                                        <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                    )}
                                </div>
                            </th>

                            <th className="pt-6 pb-3 font-medium cursor-pointer hover:text-text-primary transition-colors w-[12%]" onClick={() => handleSort('symbol')}>
                                <div className="flex items-center gap-1">Ticker <SortIcon column="symbol" /></div>
                            </th>

                            <th className="pt-6 pb-3 font-medium text-right cursor-pointer hover:text-text-primary transition-colors w-[8%]" onClick={() => handleSort('volume')}>
                                <div className="flex items-center justify-end gap-1">Vol <SortIcon column="volume" /></div>
                            </th>

                            <th className="pt-6 pb-3 font-medium text-right cursor-pointer hover:text-text-primary transition-colors w-[8%]" onClick={() => handleSort('open')}>
                                <div className="flex items-center justify-end gap-1">Open <SortIcon column="open" /></div>
                            </th>

                            <th className="pt-6 pb-3 font-medium text-right cursor-pointer hover:text-text-primary transition-colors w-[8%]" onClick={() => handleSort('refPrice1020')}>
                                <div className="flex items-center justify-end gap-1">10:20 Ref <SortIcon column="refPrice1020" /></div>
                            </th>

                            <th className="pt-6 pb-3 font-medium text-right cursor-pointer hover:text-text-primary transition-colors w-[8%]" onClick={() => handleSort('price')}>
                                <div className="flex items-center justify-end gap-1">Price <SortIcon column="price" /></div>
                            </th>

                            <th className="pt-6 pb-3 font-medium text-right cursor-pointer hover:text-text-primary transition-colors w-[8%]" onClick={() => handleSort('change')}>
                                <div className="flex items-center justify-end gap-1">% Chg <SortIcon column="change" /></div>
                            </th>

                            <th className="pt-6 pb-3 font-medium text-center cursor-pointer hover:text-text-primary transition-colors w-[8%]" onClick={() => handleSort('mvso')}>
                                <div className="flex items-center justify-center gap-1">MVSO <SortIcon column="mvso" /></div>
                            </th>

                            <th className="pt-6 pb-3 font-medium text-center cursor-pointer hover:text-text-primary transition-colors w-[8%]" onClick={() => handleSort('lowBeforePeak')}>
                                <div className="flex items-center justify-center gap-1">Max DD <SortIcon column="lowBeforePeak" /></div>
                            </th>

                            {showExtraHours && (
                                <>
                                    <th className="pt-6 pb-3 font-medium text-right w-[8%] text-text-secondary/70">
                                        <div className="flex items-center justify-end gap-1">Ref 11:20</div>
                                    </th>
                                    <th className="pt-6 pb-3 font-medium text-center w-[8%] text-text-secondary/70">
                                        <div className="flex items-center justify-center gap-1">MVSO 11:20</div>
                                    </th>
                                    <th className="pt-6 pb-3 font-medium text-right w-[8%] text-text-secondary/70">
                                        <div className="flex items-center justify-end gap-1">Ref 12:20</div>
                                    </th>
                                    <th className="pt-6 pb-3 font-medium text-center w-[8%] text-text-secondary/70">
                                        <div className="flex items-center justify-center gap-1">MVSO 12:20</div>
                                    </th>
                                </>
                            )}

                            <th className="pt-6 pb-3 font-medium text-center cursor-pointer hover:text-text-primary transition-colors w-[10%]" onClick={() => handleSort('sector')}>
                                <div className="flex items-center justify-center gap-1">Sector <SortIcon column="sector" /></div>
                            </th>

                            <th className="pt-6 pb-3 font-medium text-center cursor-pointer hover:text-text-primary transition-colors w-[8%]" onClick={() => handleSort('probabilityValue')}>
                                <div className="flex items-center justify-center gap-1">Prob <SortIcon column="probabilityValue" /></div>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedData.map((rec) => {
                            const update = prices[rec.symbol] || {};
                            const livePrice = update.price || rec.price;
                            const refPrice = update.refPrice1020 || rec.refPrice1020;
                            const openPrice = update.open || rec.open || 0;
                            const highPrice = update.high || rec.high || 0;

                            // Calculate change vs 10:20 Ref Price (User Requirement)
                            // If RefPrice is available, Change = (Price - Ref) / Ref
                            // Fallback to daily change if Ref is missing
                            let liveChange = update.change ?? rec.changePercent;
                            if (refPrice && refPrice > 0) {
                                liveChange = ((livePrice - refPrice) / refPrice) * 100;
                            } else if (liveChange === 0 && openPrice > 0 && highPrice > 0) {
                                // Fallback for historical data if no ref price
                                liveChange = ((highPrice - openPrice) / openPrice) * 100;
                            }

                            // Calculate MVSO: ((HighPost1020 - Ref1020) / Ref1020) * 100
                            // Backend stores highPost1020 in rec.high field (see index.ts line 65)
                            // For LIVE data: use MAX(rec.high, livePrice) since DB may not be updated yet
                            // For HISTORICAL data: use rec.high only
                            const isToday = new Date(rec.date).toDateString() === new Date().toDateString();
                            const storedHigh = rec.high || 0;
                            const highAfter1020 = isToday && livePrice > storedHigh ? livePrice : storedHigh;
                            const mvso = (highAfter1020 && refPrice)
                                ? ((highAfter1020 - refPrice) / refPrice) * 100
                                : 0;

                            const volume = update.volume || rec.volume;
                            const formattedVol = volume > 1000000
                                ? (volume / 1000000).toFixed(2) + 'M'
                                : volume > 1000
                                    ? (volume / 1000).toFixed(1) + 'K'
                                    : volume.toFixed(1);

                            const sector = update.sector || rec.sector;
                            // Abbreviate Sector
                            const shortSector = sector
                                .replace('Technology', 'Tech')
                                .replace('Communication Services', 'Comm')
                                .replace('Consumer Cyclical', 'Cons Cyc')
                                .replace('Consumer Defensive', 'Cons Def')
                                .replace('Financial Services', 'Fin')
                                .replace('Healthcare', 'Health')
                                .replace('Industrials', 'Ind')
                                .replace('Real Estate', 'RE')
                                .replace('Basic Materials', 'Mat')
                                .replace('Utilities', 'Util')
                                .substring(0, 12); // Max length safety

                            const prob = rec.probabilityValue || 70;

                            const isSelected = selectedSymbols.has(rec.symbol);

                            return (
                                <tr
                                    key={rec.symbol}
                                    onClick={() => onRowClick(rec)}
                                    className={cn(
                                        "border-b border-border-primary/40 hover:bg-bg-secondary/80 transition-all duration-200 cursor-pointer group",
                                        isSelected ? "bg-accent-primary/5" : ""
                                    )}
                                >
                                    <td className="py-3 pl-4" onClick={(e) => e.stopPropagation()}>
                                        <div
                                            onClick={() => toggleSelection(rec.symbol)}
                                            className={cn(
                                                "w-4 h-4 rounded-full border-2 cursor-pointer transition-all flex items-center justify-center",
                                                isSelected
                                                    ? "border-accent-primary bg-accent-primary"
                                                    : "border-border-primary hover:border-text-secondary"
                                            )}
                                        >
                                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                        </div>
                                    </td>
                                    <td className="py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 bg-bg-secondary flex items-center justify-center">
                                                {/* Removed failedImages state and usage */}
                                                <img
                                                    src={`https://financialmodelingprep.com/image-stock/${rec.symbol}.png`}
                                                    alt={rec.symbol}
                                                    className="w-full h-full object-contain"
                                                    onError={(e) => {
                                                        e.currentTarget.onerror = null; // Prevent infinite loop
                                                        e.currentTarget.src = ''; // Hide broken image
                                                        e.currentTarget.style.display = 'none'; // Hide the img tag
                                                        const parent = e.currentTarget.parentElement;
                                                        if (parent) {
                                                            const fallbackSpan = document.createElement('span');
                                                            fallbackSpan.className = 'text-xs font-bold text-text-primary';
                                                            fallbackSpan.textContent = rec.symbol[0];
                                                            parent.appendChild(fallbackSpan);
                                                        }
                                                    }}
                                                />
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-text-primary text-sm tracking-tight">{rec.symbol}</span>

                                                    {/* LIVE IBKR STATUS (Hybrid) */}
                                                    {rec.ibkrPosition && rec.ibkrPosition !== 0 && (
                                                        <div className="relative group cursor-help">
                                                            <Activity className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
                                                            <div className="absolute left-full top-0 ml-2 hidden group-hover:block z-50 bg-[#1A1A1A] border border-white/10 p-3 rounded-lg shadow-xl w-48">
                                                                <div className="text-[10px] text-gray-400 font-mono mb-1 uppercase tracking-wider">IBKR Live Status</div>
                                                                <div className="flex justify-between items-center text-xs mb-1">
                                                                    <span className="text-gray-300">Position:</span>
                                                                    <span className="font-bold text-white">{rec.ibkrPosition} sh</span>
                                                                </div>
                                                                <div className="flex justify-between items-center text-xs mb-1">
                                                                    <span className="text-gray-300">Avg Cost:</span>
                                                                    <span className="text-yellow-400">${rec.ibkrAvgCost?.toFixed(2)}</span>
                                                                </div>
                                                                <div className="flex justify-between items-center text-xs pt-1 border-t border-white/10">
                                                                    <span className="text-gray-300">Open P&L:</span>
                                                                    <span className={cn(
                                                                        "font-bold",
                                                                        (rec.ibkrUnrealizedPNL || 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                                                                    )}>
                                                                        ${rec.ibkrUnrealizedPNL?.toFixed(2)}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Trade Log Icon (Historical/Execution) */}
                                                    {(() => {
                                                        const trade = tradeLogs.find(t => t.symbol === rec.symbol);
                                                        if (!trade) return null;
                                                        return (
                                                            <div
                                                                className="relative"
                                                                onMouseEnter={(e) => setTradeHover({ symbol: rec.symbol, x: e.clientX, y: e.clientY })}
                                                                onMouseLeave={() => setTradeHover(null)}
                                                            >
                                                                <Zap className="w-3 h-3 text-amber-300/60 fill-amber-300/10" />
                                                                {tradeHover?.symbol === rec.symbol && (
                                                                    <div
                                                                        className="fixed z-50 bg-white rounded-xl shadow-2xl border border-gray-100 p-4 min-w-[200px]"
                                                                        style={{ top: (tradeHover?.y ?? 0) - 120, left: (tradeHover?.x ?? 0) + 10 }}
                                                                    >
                                                                        <div className="text-xs font-semibold text-gray-500 mb-2">
                                                                            {new Date(trade.executedAt).toLocaleDateString('es-ES')}
                                                                        </div>
                                                                        <div className="space-y-1.5">
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                                                                <span className="text-xs text-gray-600">Entry</span>
                                                                                <span className="text-xs font-bold text-gray-900 ml-auto">${trade.entryPrice.toFixed(2)}</span>
                                                                            </div>
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                                                                <span className="text-xs text-gray-600">TP</span>
                                                                                <span className="text-xs font-bold text-emerald-600 ml-auto">${trade.takeProfitPrice.toFixed(2)}</span>
                                                                            </div>
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                                                                                <span className="text-xs text-gray-600">SL</span>
                                                                                <span className="text-xs font-bold text-rose-600 ml-auto">${trade.stopLossPrice.toFixed(2)}</span>
                                                                            </div>
                                                                            <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                                                                                <span className="text-xs text-gray-600">Qty</span>
                                                                                <span className="text-xs font-bold text-gray-900 ml-auto">{trade.quantity.toLocaleString()}</span>
                                                                            </div>
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="text-xs text-gray-600">Status</span>
                                                                                <span className={`text-xs font-bold ml-auto ${trade.status === 'SUBMITTED' ? 'text-emerald-600' : trade.status === 'DRY_RUN' ? 'text-amber-600' : 'text-rose-600'}`}>
                                                                                    {trade.status}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}
                                                    <button
                                                        onClick={(e) => handleTradingViewClick(rec.symbol, e)}
                                                        className="text-text-secondary hover:text-accent-primary transition-colors opacity-0 group-hover:opacity-100"
                                                        title="Open in TradingView"
                                                    >
                                                        <ExternalLink className="w-3 h-3" />
                                                    </button>
                                                </div>
                                                <span className="text-text-secondary truncate max-w-[140px] text-xs font-medium">{rec.name}</span>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Vol */}
                                    <td className="py-3 text-right font-sans text-xs text-text-secondary tabular-nums">
                                        {formattedVol}
                                    </td>

                                    {/* Open */}
                                    <td className="py-3 text-right font-sans text-xs text-text-secondary tabular-nums">
                                        {openPrice ? `$${openPrice.toFixed(2)}` : '-'}
                                    </td>

                                    {/* 10:20 Ref */}
                                    <td className="py-3 text-right font-sans text-xs text-text-secondary tabular-nums">
                                        {refPrice ? `$${refPrice.toFixed(2)}` : '-'}
                                    </td>

                                    {/* Price RT */}
                                    <td className="py-3 text-right font-sans text-xs font-medium text-text-primary tabular-nums">
                                        {livePrice.toFixed(2)}
                                    </td>

                                    {/* % Chg 10:20 */}
                                    <td className="py-3 text-right">
                                        <div className={cn(
                                            "font-sans font-bold text-xs tabular-nums",
                                            liveChange >= 0 ? "text-emerald-600" : "text-rose-600"
                                        )}>
                                            {liveChange >= 0 ? '+' : ''}{liveChange.toFixed(2)}%
                                        </div>
                                    </td>

                                    {/* MVSO - Colored Background Box based on Threshold */}
                                    {/* MVSO 10:20 */}
                                    <td className="px-3 py-3 whitespace-nowrap text-center">
                                        <div className={cn(
                                            "inline-block px-2 py-0.5 rounded-full text-xs font-bold tabular-nums",
                                            mvso >= mvsoThreshold ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"
                                        )}>
                                            {mvso > 0 ? '+' : ''}{mvso.toFixed(2)}%
                                        </div>
                                    </td>

                                    {/* Max DD - Gray by default, Red if exceeds Stop Loss */}
                                    <td className="py-3 text-center">
                                        {(() => {
                                            const maxDD = (rec.lowBeforePeak && refPrice)
                                                ? ((rec.lowBeforePeak - refPrice) / refPrice) * 100
                                                : null;
                                            const exceedsSL = maxDD !== null && Math.abs(maxDD) > stopLossThreshold;
                                            return (
                                                <div className={cn(
                                                    "font-sans text-xs tabular-nums",
                                                    exceedsSL ? "text-rose-500 font-bold" : "text-text-secondary"
                                                )}>
                                                    {maxDD !== null ? `${maxDD.toFixed(2)}%` : '-'}
                                                </div>
                                            );
                                        })()}
                                    </td>

                                    {showExtraHours && (
                                        <>
                                            {/* Ref 11:20 */}
                                            <td className="px-3 py-3 whitespace-nowrap text-right font-sans text-xs text-text-secondary tabular-nums">
                                                {rec.refPrice1120 ? `$${rec.refPrice1120.toFixed(2)}` : '-'}
                                            </td>

                                            {/* MVSO 11:20 */}
                                            <td className="px-3 py-3 whitespace-nowrap text-center">
                                                {(() => {
                                                    if (rec.highPost1120 && rec.refPrice1020) {
                                                        const mvso1120 = ((rec.highPost1120 - rec.refPrice1020) / rec.refPrice1020) * 100;
                                                        return (
                                                            <div className={cn(
                                                                "inline-block px-2 py-0.5 rounded text-xs font-medium tabular-nums",
                                                                mvso1120 >= mvsoThreshold ? "text-emerald-600 bg-emerald-500/5" : "text-rose-600 bg-rose-500/5"
                                                            )}>
                                                                {mvso1120 > 0 ? '+' : ''}{mvso1120.toFixed(2)}%
                                                            </div>
                                                        );
                                                    }
                                                    return <span className="text-text-secondary/50">-</span>;
                                                })()}
                                            </td>

                                            {/* Ref 12:20 */}
                                            <td className="px-3 py-3 whitespace-nowrap text-right font-sans text-xs text-text-secondary tabular-nums">
                                                {rec.refPrice1220 ? `$${rec.refPrice1220.toFixed(2)}` : '-'}
                                            </td>

                                            {/* MVSO 12:20 */}
                                            <td className="px-3 py-3 whitespace-nowrap text-center">
                                                {(() => {
                                                    if (rec.highPost1220 && rec.refPrice1020) {
                                                        const mvso1220 = ((rec.highPost1220 - rec.refPrice1020) / rec.refPrice1020) * 100;
                                                        return (
                                                            <div className={cn(
                                                                "inline-block px-2 py-0.5 rounded text-xs font-medium tabular-nums",
                                                                mvso1220 >= mvsoThreshold ? "text-emerald-600 bg-emerald-500/5" : "text-rose-600 bg-rose-500/5"
                                                            )}>
                                                                {mvso1220 > 0 ? '+' : ''}{mvso1220.toFixed(2)}%
                                                            </div>
                                                        );
                                                    }
                                                    return <span className="text-text-secondary/50">-</span>;
                                                })()}
                                            </td>
                                        </>
                                    )}

                                    {/* Sector - Abbreviated & Centered */}
                                    <td className="py-3 text-text-secondary truncate text-center text-xs" title={sector}>
                                        <span className="px-2 py-1 rounded-full bg-bg-tertiary/50 border border-border-primary/50">
                                            {shortSector}
                                        </span>
                                    </td>

                                    {/* Prob - Minimal Ring */}
                                    <td className="py-3">
                                        <div className="flex items-center justify-center">
                                            <div className="relative w-8 h-8">
                                                <svg className="w-8 h-8 transform -rotate-90" viewBox="0 0 36 36">
                                                    <circle
                                                        cx="18" cy="18" r="15"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        strokeWidth="2"
                                                        className="text-bg-tertiary/50"
                                                    />
                                                    <circle
                                                        cx="18" cy="18" r="15"
                                                        fill="none"
                                                        strokeWidth="2"
                                                        strokeLinecap="round"
                                                        strokeDasharray={`${prob * 0.94} 94`}
                                                        className={cn(
                                                            "transition-all duration-300",
                                                            prob >= 80 ? "stroke-emerald-500" :
                                                                prob >= 75 ? "stroke-amber-500" : "stroke-rose-400"
                                                        )}
                                                    />
                                                </svg>
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <span className={cn(
                                                        "text-[11px] font-bold tabular-nums",
                                                        prob >= 80 ? "text-emerald-600" :
                                                            prob >= 75 ? "text-amber-600" : "text-rose-500"
                                                    )}>
                                                        {prob}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div >
        </div >
    );
}
