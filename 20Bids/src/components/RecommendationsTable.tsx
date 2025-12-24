import { useState, useEffect } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, ExternalLink } from 'lucide-react';
import { cn } from '../lib/utils';
import { fetchRecommendations, fetchPrices, updateTag, fetchIndices } from '../api/client';

const TAG_COLORS = [
    '#ef4444', // Red
    '#f97316', // Orange
    '#eab308', // Yellow
    '#22c55e', // Green
    '#06b6d4', // Cyan
    '#3b82f6', // Blue
    '#a855f7', // Purple
];

interface RecommendationsTableProps {
    selectedDate: Date;
    onRowClick: (rec: any) => void;
    onDataLoaded?: (data: any[]) => void;
    mvsoThreshold: number;
    onMvsoThresholdChange: (value: number) => void;
}

// ... (TAG_COLORS)

type SortKey = 'symbol' | 'price' | 'refPrice1020' | 'change' | 'volume' | 'rsi' | 'relativeVol' | 'type' | 'probabilityValue' | 'sector' | 'open' | 'mvso';

export function RecommendationsTable({ selectedDate, onRowClick, onDataLoaded, mvsoThreshold, onMvsoThresholdChange }: RecommendationsTableProps) {
    const [recommendations, setRecommendations] = useState<any[]>([]);
    const [prices, setPrices] = useState<Record<string, { price: number, change: number, refPrice1020?: number, volume?: number, sector?: string, open?: number, high?: number }>>({});
    const [indices, setIndices] = useState<any[]>([]);
    const [tagPopover, setTagPopover] = useState<{ symbol: string, x: number, y: number } | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: SortKey, direction: 'asc' | 'desc' }>({ key: 'probabilityValue', direction: 'desc' });

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
        const loadIndices = async () => {
            try {
                const data = await fetchIndices();
                setIndices(data);
            } catch (error) {
                console.error('Failed to load indices:', error);
            }
        };
        loadIndices();
        const interval = setInterval(loadIndices, 60000); // Poll every minute
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const loadData = async () => {
            try {
                const data = await fetchRecommendations(selectedDate);
                setRecommendations(data);
                onDataLoaded?.(data);
            } catch (error) {
                console.error('Failed to load recommendations:', error);
            }
        };
        loadData();
    }, [selectedDate, onDataLoaded]);

    // Poll for real-time prices every 10 seconds (only if today)
    useEffect(() => {
        const isToday = new Date(selectedDate).toDateString() === new Date().toDateString();
        if (!isToday) {
            setPrices({}); // Clear live prices for past dates
            return;
        }

        const pollPrices = async () => {
            try {
                const updates = await fetchPrices();
                setPrices(prev => ({ ...prev, ...updates }));
            } catch (error) {
                console.error('Failed to poll prices:', error);
            }
        };

        pollPrices(); // Initial poll
        const interval = setInterval(pollPrices, 10000);
        return () => clearInterval(interval);
    }, [selectedDate]);

    const handleTagClick = async (symbol: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        setTagPopover({ symbol, x: rect.left, y: rect.bottom + 5 });
    };

    const handleColorSelect = async (color: string | null) => {
        if (!tagPopover) return;

        // Optimistic update
        setRecommendations(prev => prev.map(r =>
            r.symbol === tagPopover.symbol ? { ...r, userTag: color } : r
        ));

        try {
            await updateTag(tagPopover.symbol, color);
        } catch (error) {
            console.error('Failed to update tag:', error);
            // Revert on error
            const data = await fetchRecommendations(selectedDate);
            setRecommendations(data);
        }
        setTagPopover(null);
    };

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

    const [selectedSymbols, setSelectedSymbols] = useState<Set<string>>(new Set());

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

            {/* Header / Filters */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border-primary/50 bg-bg-primary relative z-20">
                <h2 className="text-lg font-bold text-text-primary tracking-tight flex items-center gap-2">
                    Market Opportunities
                </h2>

                <div className="flex items-center gap-6">
                    {/* Toggle Extra Hours */}
                    <button
                        onClick={() => setShowExtraHours(!showExtraHours)}
                        className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 border",
                            showExtraHours
                                ? "bg-accent-primary text-white border-accent-primary shadow-sm"
                                : "bg-bg-secondary text-text-secondary border-transparent hover:text-text-primary hover:bg-bg-tertiary"
                        )}
                    >
                        {showExtraHours ? 'Hide Extended' : 'Show Extended'}
                    </button>

                    {/* Market Indices */}
                    <div className="flex items-center gap-4 mr-6 border-r border-border-primary/50 pr-6 hidden md:flex">
                        {indices.map(idx => (
                            <div key={idx.symbol} className="flex items-center gap-2 text-xs">
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

                    <div className="flex items-center gap-4">
                        {/* MVSO Threshold Input */}
                        <div className="flex items-center gap-2 group">
                            <div className="flex items-center bg-bg-secondary rounded-lg px-2 py-1 transition-all group-hover:bg-bg-tertiary">
                                <label className="text-[10px] font-bold text-text-primary mr-2">MVSO</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={mvsoThreshold}
                                    onChange={(e) => onMvsoThresholdChange(parseFloat(e.target.value) || 0)}
                                    className="w-12 bg-transparent text-xs font-bold text-text-primary outline-none text-right tabular-nums focus:text-accent-primary"
                                />
                            </div>
                        </div>

                        {/* Min Volume Input */}
                        <div className="flex items-center gap-2 group">
                            <div className="flex items-center bg-bg-secondary rounded-lg px-2 py-1 transition-all group-hover:bg-bg-tertiary">
                                <label className="text-[10px] font-bold text-text-primary mr-2">VOL (M)</label>
                                <input
                                    type="number"
                                    value={minVolume}
                                    onChange={(e) => setMinVolume(parseFloat(e.target.value) || 0)}
                                    placeholder="0"
                                    className="w-12 bg-transparent text-xs font-bold text-text-primary outline-none text-right tabular-nums focus:text-accent-primary"
                                />
                            </div>
                        </div>

                        {/* Min Open Price Input */}
                        <div className="flex items-center gap-2 group">
                            <div className="flex items-center bg-bg-secondary rounded-lg px-2 py-1 transition-all group-hover:bg-bg-tertiary">
                                <label className="text-[10px] font-bold text-text-primary mr-2">OPEN $</label>
                                <input
                                    type="number"
                                    value={minOpenPrice}
                                    onChange={(e) => setMinOpenPrice(parseFloat(e.target.value) || 0)}
                                    placeholder="0"
                                    className="w-12 bg-transparent text-xs font-bold text-text-primary outline-none text-right tabular-nums focus:text-accent-primary"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 min-h-0 overflow-y-auto px-6 pt-2 relative z-10">
                <table className="w-full border-collapse text-sm table-fixed">
                    <thead className="sticky top-0 bg-bg-primary z-20">
                        <tr className="text-left text-text-secondary border-b border-border-primary/50 text-xs font-medium align-bottom">
                            <th className="pt-6 pb-3 pl-4 w-[4%]">
                                <input
                                    type="checkbox"
                                    className="rounded border-border-primary text-accent-primary focus:ring-0 cursor-pointer"
                                    checked={selectedSymbols.size === sortedData.length && sortedData.length > 0}
                                    onChange={toggleAll}
                                />
                            </th>
                            <th className="pt-6 pb-3 w-[4%]"></th> {/* Tag Column */}

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

                            // Calculate change vs 10:20 if available, else use daily change
                            // User Feedback: Always show standard Daily Change
                            // Fallback: Calculate from high/open for historical data (where price often equals open)
                            let liveChange = update.change ?? rec.changePercent;
                            if (liveChange === 0 && openPrice > 0 && highPrice > 0) {
                                liveChange = ((highPrice - openPrice) / openPrice) * 100;
                            }

                            // Calculate MVSO: ((High - Ref1020) / Ref1020) * 100
                            const mvso = (highPrice && refPrice)
                                ? ((highPrice - refPrice) / refPrice) * 100
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
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => toggleSelection(rec.symbol)}
                                            className="rounded border-border-primary text-accent-primary focus:ring-0 cursor-pointer"
                                        />
                                    </td>
                                    <td className="py-3 pl-4">
                                        <button
                                            onClick={(e) => handleTagClick(rec.symbol, e)}
                                            className="w-4 h-4 rounded-full border-2 border-border-primary flex items-center justify-center hover:border-text-primary transition-colors"
                                            style={{ backgroundColor: rec.userTag || 'transparent', borderColor: rec.userTag ? 'transparent' : undefined }}
                                        >
                                            {!rec.userTag && <div className="w-1 h-1 rounded-full bg-text-secondary opacity-0 group-hover:opacity-50" />}
                                        </button>
                                    </td>
                                    <td className="py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full overflow-hidden shrink-0">
                                                <img
                                                    src={`https://financialmodelingprep.com/image-stock/${rec.symbol}.png`}
                                                    alt={rec.symbol}
                                                    className="w-full h-full object-contain"
                                                    onError={(e) => {
                                                        e.currentTarget.style.display = 'none';
                                                        e.currentTarget.parentElement!.classList.add('bg-bg-secondary', 'flex', 'items-center', 'justify-center');
                                                        const fallback = document.createElement('div');
                                                        fallback.className = 'text-xs font-bold text-text-primary';
                                                        fallback.innerText = rec.symbol[0];
                                                        e.currentTarget.parentElement!.appendChild(fallback);
                                                    }}
                                                />
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-text-primary text-sm tracking-tight">{rec.symbol}</span>
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
                                    <td className="py-3 text-right font-mono text-xs text-text-secondary">
                                        {formattedVol}
                                    </td>

                                    {/* Open */}
                                    <td className="py-3 text-right font-mono text-xs text-text-secondary">
                                        {openPrice ? `$${openPrice.toFixed(2)}` : '-'}
                                    </td>

                                    {/* 10:20 Ref */}
                                    <td className="py-3 text-right font-mono text-xs text-text-secondary">
                                        {refPrice ? `$${refPrice.toFixed(2)}` : '-'}
                                    </td>

                                    {/* Price RT */}
                                    <td className="py-3 text-right font-mono text-xs font-medium text-text-primary">
                                        {livePrice.toFixed(2)}
                                    </td>

                                    {/* % Chg 10:20 */}
                                    <td className="py-3 text-right">
                                        <span className={cn(
                                            "inline-block font-mono text-xs font-bold",
                                            liveChange >= 0 ? "text-emerald-600" : "text-rose-600"
                                        )}>
                                            {liveChange >= 0 ? '+' : ''}{liveChange.toFixed(2)}%
                                        </span>
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

                                    {showExtraHours && (
                                        <>
                                            {/* Ref 11:20 */}
                                            <td className="px-3 py-3 whitespace-nowrap text-right font-mono text-xs text-text-secondary">
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
                                            <td className="px-3 py-3 whitespace-nowrap text-right font-mono text-xs text-text-secondary">
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
                                                            prob > 80 ? "stroke-emerald-500" :
                                                                prob >= 75 ? "stroke-amber-500" : "stroke-rose-400"
                                                        )}
                                                    />
                                                </svg>
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <span className={cn(
                                                        "text-[11px] font-bold tabular-nums",
                                                        prob > 80 ? "text-emerald-600" :
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

            {/* Tag Popover */}
            {
                tagPopover && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setTagPopover(null)} />
                        <div
                            className="fixed z-50 bg-bg-secondary border border-border-primary rounded-lg shadow-xl p-2 grid grid-cols-3 gap-2 animate-in fade-in zoom-in-95 duration-200"
                            style={{ top: tagPopover.y + 5, left: tagPopover.x }}
                        >
                            <button
                                onClick={() => handleColorSelect(null)}
                                className="w-6 h-6 rounded-full border border-text-secondary/50 flex items-center justify-center hover:bg-bg-tertiary"
                                title="Clear"
                            >
                                <div className="w-3 h-0.5 bg-text-secondary rotate-45" />
                            </button>
                            {TAG_COLORS.map((color) => (
                                <button
                                    key={color}
                                    onClick={() => handleColorSelect(color)}
                                    className="w-6 h-6 rounded-full border border-transparent hover:scale-110 transition-transform"
                                    style={{ backgroundColor: color }}
                                />
                            ))}
                        </div>
                    </>
                )
            }
        </div >
    );
}
