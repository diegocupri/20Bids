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
    const [showExtraHours, setShowExtraHours] = useState(false);
    const [minVolume, setMinVolume] = useState<number>(0);
    const [minOpenPrice, setMinOpenPrice] = useState<number>(0);

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

    return (
        <div className="flex flex-col h-full bg-bg-primary">
            {/* Header / Filters */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary bg-bg-secondary/30">
                <h2 className="text-sm font-bold text-text-primary tracking-wide uppercase flex items-center gap-2">
                    <span className="text-accent-primary">Market</span> Opportunities
                </h2>

                <div className="flex items-center gap-4">
                    {/* Toggle Extra Hours */}
                    <button
                        onClick={() => setShowExtraHours(!showExtraHours)}
                        className={cn(
                            "flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium transition-colors border",
                            showExtraHours
                                ? "bg-accent-primary/10 text-accent-primary border-accent-primary/20"
                                : "bg-bg-primary text-text-secondary border-border-primary hover:text-text-primary"
                        )}
                        title={showExtraHours ? "Hide 11:20 & 12:20 Columns" : "Show 11:20 & 12:20 Columns"}
                    >
                        {showExtraHours ? 'Hide Extended' : 'Show Extended'}
                    </button>

                    {/* Market Indices */}
                    <div className="flex items-center gap-3 mr-4 border-r border-border-primary pr-4">
                        {indices.map(idx => (
                            <div key={idx.symbol} className="flex items-center gap-1.5 text-[10px] font-mono">
                                <span className="font-bold text-text-secondary">{idx.symbol === 'VIXY' ? 'VIX' : idx.symbol}</span>
                                <span className={cn(
                                    "font-medium",
                                    idx.change >= 0 ? "text-emerald-500" : "text-rose-500"
                                )}>
                                    {idx.price.toFixed(2)}
                                    <span className="ml-1 opacity-75">
                                        ({idx.change >= 0 ? '+' : ''}{idx.change.toFixed(2)}%)
                                    </span>
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* MVSO Threshold Input */}
                    <div className="flex items-center gap-2">
                        <label className="text-[10px] uppercase text-text-secondary font-medium">MVSO Thresh</label>
                        <input
                            type="number"
                            step="0.1"
                            value={mvsoThreshold}
                            onChange={(e) => onMvsoThresholdChange(parseFloat(e.target.value) || 0)}
                            className="w-16 bg-bg-primary border border-border-primary rounded px-2 py-1 text-xs text-text-primary focus:border-accent-primary outline-none text-right font-mono"
                        />
                    </div>

                    {/* Min Volume Input */}
                    <div className="flex items-center gap-2">
                        <label className="text-[10px] uppercase text-text-secondary font-medium">Min Vol</label>
                        <input
                            type="number"
                            value={minVolume}
                            onChange={(e) => setMinVolume(parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            className="w-20 bg-bg-primary border border-border-primary rounded px-2 py-1 text-xs text-text-primary focus:border-accent-primary outline-none text-right font-mono"
                        />
                    </div>

                    {/* Min Open Price Input */}
                    <div className="flex items-center gap-2">
                        <label className="text-[10px] uppercase text-text-secondary font-medium">Min Open</label>
                        <input
                            type="number"
                            value={minOpenPrice}
                            onChange={(e) => setMinOpenPrice(parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            className="w-16 bg-bg-primary border border-border-primary rounded px-2 py-1 text-xs text-text-primary focus:border-accent-primary outline-none text-right font-mono"
                        />
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
                <table className="w-full border-collapse text-xs font-mono table-fixed">
                    <thead className="sticky top-0 bg-bg-primary z-10 shadow-sm">
                        <tr className="text-left text-accent-secondary border-b border-border-primary uppercase tracking-wider text-[10px]">
                            <th className="py-2 pl-3 w-[4%]"></th> {/* Tag Column */}

                            <th className="py-2 font-medium cursor-pointer hover:text-text-primary w-[12%]" onClick={() => handleSort('symbol')}>
                                <div className="flex items-center gap-1">Ticker <SortIcon column="symbol" /></div>
                            </th>

                            <th className="py-2 font-medium text-right cursor-pointer hover:text-text-primary w-[8%]" onClick={() => handleSort('volume')}>
                                <div className="flex items-center justify-end gap-1">Vol <SortIcon column="volume" /></div>
                            </th>

                            <th className="py-2 font-medium text-right cursor-pointer hover:text-text-primary w-[8%]" onClick={() => handleSort('open')}>
                                <div className="flex items-center justify-end gap-1">Open <SortIcon column="open" /></div>
                            </th>

                            <th className="py-2 font-medium text-right cursor-pointer hover:text-text-primary w-[8%]" onClick={() => handleSort('refPrice1020')}>
                                <div className="flex items-center justify-end gap-1">10:20 Ref <SortIcon column="refPrice1020" /></div>
                            </th>

                            <th className="py-2 font-medium text-right cursor-pointer hover:text-text-primary w-[8%]" onClick={() => handleSort('price')}>
                                <div className="flex items-center justify-end gap-1">Price RT <SortIcon column="price" /></div>
                            </th>

                            <th className="py-2 font-medium text-right cursor-pointer hover:text-text-primary w-[8%]" onClick={() => handleSort('change')}>
                                <div className="flex items-center justify-end gap-1">% Chg <SortIcon column="change" /></div>
                            </th>

                            <th className="py-2 font-medium text-center cursor-pointer hover:text-text-primary w-[8%]" onClick={() => handleSort('mvso')}>
                                <div className="flex items-center justify-center gap-1">MVSO <SortIcon column="mvso" /></div>
                            </th>

                            {showExtraHours && (
                                <>
                                    <th className="py-2 font-medium text-right w-[8%]">
                                        <div className="flex items-center justify-end gap-1">Ref 11:20</div>
                                    </th>
                                    <th className="py-2 font-medium text-center w-[8%]">
                                        <div className="flex items-center justify-center gap-1">MVSO 11:20</div>
                                    </th>
                                    <th className="py-2 font-medium text-right w-[8%]">
                                        <div className="flex items-center justify-end gap-1">Ref 12:20</div>
                                    </th>
                                    <th className="py-2 font-medium text-center w-[8%]">
                                        <div className="flex items-center justify-center gap-1">MVSO 12:20</div>
                                    </th>
                                </>
                            )}

                            <th className="py-2 font-medium text-center cursor-pointer hover:text-text-primary w-[10%]" onClick={() => handleSort('sector')}>
                                <div className="flex items-center justify-center gap-1">Sector <SortIcon column="sector" /></div>
                            </th>

                            <th className="py-2 font-medium text-center cursor-pointer hover:text-text-primary w-[8%]" onClick={() => handleSort('probabilityValue')}>
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
                            const liveChange = refPrice
                                ? ((livePrice - refPrice) / refPrice) * 100
                                : (update.change || rec.changePercent);

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

                            return (
                                <tr
                                    key={rec.symbol}
                                    onClick={() => onRowClick(rec)}
                                    className="border-b border-border-primary/30 hover:bg-accent-primary/10 transition-colors cursor-pointer group"
                                >
                                    <td className="py-2 pl-3">
                                        <button
                                            onClick={(e) => handleTagClick(rec.symbol, e)}
                                            className="w-3 h-3 rounded-full border border-border-primary flex items-center justify-center hover:border-text-primary transition-colors"
                                            style={{ backgroundColor: rec.userTag || 'transparent', borderColor: rec.userTag ? 'transparent' : undefined }}
                                        >
                                            {!rec.userTag && <div className="w-0.5 h-0.5 rounded-full bg-text-secondary opacity-0 group-hover:opacity-50" />}
                                        </button>
                                    </td>
                                    <td className="py-2">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-accent-primary">{rec.symbol}</span>
                                            <button
                                                onClick={(e) => handleTradingViewClick(rec.symbol, e)}
                                                className="text-text-secondary hover:text-accent-primary transition-colors opacity-0 group-hover:opacity-100"
                                                title="Open in TradingView"
                                            >
                                                <ExternalLink className="w-3 h-3" />
                                            </button>
                                            <span className="text-text-secondary truncate max-w-[80px] hidden xl:block text-[10px]">{rec.name}</span>
                                        </div>
                                    </td>

                                    {/* Vol - Lighter Background */}
                                    <td className="py-2 text-right">
                                        <span className="inline-block px-1.5 py-0.5 rounded bg-bg-secondary text-text-primary font-medium text-[10px]">
                                            {formattedVol}
                                        </span>
                                    </td>

                                    {/* Open */}
                                    <td className="py-2 text-right text-text-secondary">
                                        {openPrice ? openPrice.toFixed(2) : '-'}
                                    </td>

                                    {/* 10:20 Ref */}
                                    <td className="py-2 text-right text-text-secondary">
                                        {refPrice ? refPrice.toFixed(2) : '-'}
                                    </td>

                                    {/* Price RT */}
                                    <td className="py-2 text-right text-text-primary font-bold">
                                        {livePrice.toFixed(2)}
                                    </td>

                                    {/* % Chg 10:20 */}
                                    <td className="py-2 text-right">
                                        <span className={cn(
                                            "inline-block w-16 text-right",
                                            liveChange >= 0 ? "text-emerald-500" : "text-rose-500"
                                        )}>
                                            {liveChange >= 0 ? '+' : ''}{liveChange.toFixed(2)}%
                                        </span>
                                    </td>

                                    {/* MVSO - Colored Background Box based on Threshold */}
                                    {/* MVSO 10:20 */}
                                    <td className="px-3 py-2 whitespace-nowrap">
                                        <div className={cn(
                                            "inline-block px-1.5 py-0.5 rounded font-bold text-[10px]",
                                            mvso >= mvsoThreshold ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                                        )}>
                                            {mvso > 0 ? '+' : ''}{mvso.toFixed(2)}%
                                        </div>
                                    </td>

                                    {showExtraHours && (
                                        <>
                                            {/* Ref 11:20 */}
                                            <td className="px-3 py-2 whitespace-nowrap text-right font-mono text-xs text-text-secondary">
                                                {rec.refPrice1120 ? `$${rec.refPrice1120.toFixed(2)}` : '-'}
                                            </td>

                                            {/* MVSO 11:20 */}
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                {(() => {
                                                    if (rec.refPrice1120 && rec.highPost1120) {
                                                        const mvso1120 = ((rec.highPost1120 - rec.refPrice1120) / rec.refPrice1120) * 100;
                                                        return (
                                                            <div className={cn(
                                                                "inline-block px-1.5 py-0.5 rounded font-bold text-[10px]",
                                                                mvso1120 >= mvsoThreshold ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                                                            )}>
                                                                {mvso1120 > 0 ? '+' : ''}{mvso1120.toFixed(2)}%
                                                            </div>
                                                        );
                                                    }
                                                    return <span className="text-text-secondary">-</span>;
                                                })()}
                                            </td>

                                            {/* Ref 12:20 */}
                                            <td className="px-3 py-2 whitespace-nowrap text-right font-mono text-xs text-text-secondary">
                                                {rec.refPrice1220 ? `$${rec.refPrice1220.toFixed(2)}` : '-'}
                                            </td>

                                            {/* MVSO 12:20 */}
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                {(() => {
                                                    if (rec.refPrice1220 && rec.highPost1220) {
                                                        const mvso1220 = ((rec.highPost1220 - rec.refPrice1220) / rec.refPrice1220) * 100;
                                                        return (
                                                            <div className={cn(
                                                                "inline-block px-1.5 py-0.5 rounded font-bold text-[10px]",
                                                                mvso1220 >= mvsoThreshold ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                                                            )}>
                                                                {mvso1220 > 0 ? '+' : ''}{mvso1220.toFixed(2)}%
                                                            </div>
                                                        );
                                                    }
                                                    return <span className="text-text-secondary">-</span>;
                                                })()}
                                            </td>
                                        </>
                                    )}

                                    {/* Sector - Abbreviated & Centered */}
                                    <td className="py-2 text-text-secondary truncate text-center" title={sector}>
                                        {shortSector}
                                    </td>

                                    {/* Prob */}
                                    <td className="py-2">
                                        <div className="flex items-center gap-2 justify-center">
                                            <span className={cn(
                                                "text-[10px] font-bold",
                                                prob >= 90 ? "text-emerald-500" :
                                                    prob >= 80 ? "text-amber-500" : "text-text-secondary"
                                            )}>
                                                {prob}%
                                            </span>
                                            <div className="w-8 h-1 bg-bg-tertiary overflow-hidden rounded-full">
                                                <div
                                                    className={cn("h-full rounded-full",
                                                        prob >= 90 ? "bg-emerald-500" :
                                                            prob >= 80 ? "bg-amber-500" : "bg-rose-500"
                                                    )}
                                                    style={{ width: `${prob}% ` }}
                                                />
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Tag Popover */}
            {tagPopover && (
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
            )}
        </div>
    );
}
