import { useState, useMemo } from 'react';
import type { Recommendation } from '../data/mockData';
import { cn } from '../lib/utils';
import { Filter, ChevronUp, ChevronDown, Star } from 'lucide-react';
import { useUserData } from '../context/UserDataContext';

interface RecommendationsTableProps {
    data: Recommendation[];
    onSelect: (rec: Recommendation) => void;
    selectedId?: string;
}

type SortField = 'ticker' | 'price' | 'changePercent' | 'volume' | 'relativeVol' | 'rsi' | 'marketCap' | 'beta' | 'probability';
type SortDirection = 'asc' | 'desc';

export function RecommendationsTable({ data, onSelect, selectedId }: RecommendationsTableProps) {
    const [filterSector, setFilterSector] = useState<string>('All');
    const [filterType, setFilterType] = useState<string>('All');
    const [filterProbability, setFilterProbability] = useState<string>('All');

    const [sortField, setSortField] = useState<SortField>('relativeVol');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    const { getAnnotation } = useUserData();

    const sectors = useMemo(() => Array.from(new Set(data.map(r => r.sector))).sort(), [data]);
    const types = useMemo(() => Array.from(new Set(data.map(r => r.type))).sort(), [data]);
    const probabilities = ['High', 'Medium', 'Low'];

    const filteredData = useMemo(() => {
        return data.filter(rec => {
            const matchSector = filterSector === 'All' || rec.sector === filterSector;
            const matchType = filterType === 'All' || rec.type === filterType;
            const matchProb = filterProbability === 'All' || rec.probability === filterProbability;
            return matchSector && matchType && matchProb;
        });
    }, [data, filterSector, filterType, filterProbability]);

    const sortedData = useMemo(() => {
        return [...filteredData].sort((a, b) => {
            let valA = a[sortField];
            let valB = b[sortField];

            // Handle undefined values
            if (valA === undefined) valA = 0;
            if (valB === undefined) valB = 0;

            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredData, sortField, sortDirection]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };

    if (data.length === 0) {
        return <div className="p-8 text-[var(--text-muted)] font-mono text-xs uppercase">No recommendations available.</div>;
    }

    return (
        <div className="h-full flex flex-col glass-panel rounded-xl overflow-hidden shadow-2xl animate-in fade-in duration-500">
            {/* Header & Filters */}
            <div className="p-4 border-b border-[var(--border-primary)] flex flex-col gap-4 bg-[var(--bg-secondary)]/50 backdrop-blur-sm">
                <div className="flex justify-between items-center">
                    <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2 font-sans">
                        <Filter className="w-5 h-5 text-[var(--accent-primary)]" />
                        Daily Recommendations
                    </h1>
                    <span className="text-xs font-mono text-[var(--text-muted)] bg-[var(--bg-primary)] px-2 py-1 rounded border border-[var(--border-primary)]">
                        {sortedData.length} Tickers
                    </span>
                </div>

                <div className="flex gap-2">
                    <select
                        value={filterSector}
                        onChange={(e) => setFilterSector(e.target.value)}
                        className="bg-[var(--bg-primary)] border border-[var(--border-primary)] text-[var(--text-primary)] text-xs px-2 py-1 rounded focus:outline-none focus:border-[var(--accent-primary)] uppercase"
                    >
                        <option value="All">Sector: All</option>
                        {sectors.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>

                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="bg-[var(--bg-primary)] border border-[var(--border-primary)] text-[var(--text-primary)] text-xs px-2 py-1 rounded focus:outline-none focus:border-[var(--accent-primary)] uppercase"
                    >
                        <option value="All">Type: All</option>
                        {types.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>

                    <select
                        value={filterProbability}
                        onChange={(e) => setFilterProbability(e.target.value)}
                        className="bg-[var(--bg-primary)] border border-[var(--border-primary)] text-[var(--text-primary)] text-xs px-2 py-1 rounded focus:outline-none focus:border-[var(--accent-primary)] uppercase"
                    >
                        <option value="All">Prob: All</option>
                        {probabilities.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 z-10 bg-[var(--bg-secondary)] backdrop-blur-md shadow-sm">
                        <tr>
                            {[
                                { key: 'ticker', label: 'Ticker' },
                                { key: 'price', label: 'Price' },
                                { key: 'changePercent', label: '% Chg' },
                                { key: 'volume', label: 'Vol (M)' },
                                { key: 'relativeVol', label: 'RVol' },
                                { key: 'rsi', label: 'RSI' },
                                { key: 'marketCap', label: 'M. Cap' },
                                { key: 'beta', label: 'Beta' },
                                { key: 'probability', label: 'Prob.' },
                            ].map((col) => (
                                <th
                                    key={col.key}
                                    onClick={() => handleSort(col.key as SortField)}
                                    className="p-2 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider cursor-pointer hover:text-[var(--text-primary)] transition-colors select-none border-b border-[var(--border-primary)]"
                                >
                                    <div className="flex items-center gap-1">
                                        {col.label}
                                        {sortField === col.key && (
                                            sortDirection === 'asc' ? <ChevronUp className="w-3 h-3 text-[var(--accent-primary)]" /> : <ChevronDown className="w-3 h-3 text-[var(--accent-primary)]" />
                                        )}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-primary)]">
                        {sortedData.map((rec) => {
                            const { tag, isWatched } = getAnnotation(rec.ticker);
                            return (
                                <tr
                                    key={rec.id}
                                    onClick={() => onSelect(rec)}
                                    className={cn(
                                        "cursor-pointer transition-colors hover:bg-[var(--bg-secondary)] group",
                                        selectedId === rec.id ? "bg-[var(--accent-primary)]/10 border-l-2 border-l-[var(--accent-primary)]" : "border-l-2 border-l-transparent"
                                    )}
                                >
                                    <td className="p-2">
                                        <div className="flex items-center gap-2">
                                            {tag && (
                                                <div
                                                    className="w-1.5 h-1.5 rounded-full shadow-[0_0_5px_rgba(0,0,0,0.5)]"
                                                    style={{ backgroundColor: tag }}
                                                    title="Tagged"
                                                />
                                            )}
                                            <div>
                                                <div className="font-bold text-[var(--text-primary)] flex items-center gap-1 font-sans text-xs">
                                                    {rec.ticker}
                                                    {isWatched && <Star className="w-2.5 h-2.5 fill-[var(--bloomberg-orange)] text-[var(--bloomberg-orange)]" />}
                                                </div>
                                                <div className="text-[9px] text-[var(--text-muted)] truncate max-w-[80px] font-mono">{rec.name}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-2 font-mono text-xs text-[var(--text-primary)]">${rec.price.toFixed(2)}</td>
                                    <td className={cn("p-2 font-mono text-xs font-medium", rec.changePercent >= 0 ? "text-[var(--terminal-green)]" : "text-[var(--red-500)]")}>
                                        {rec.changePercent >= 0 ? '+' : ''}{rec.changePercent}%
                                    </td>
                                    <td className="p-2 font-mono text-xs text-[var(--text-muted)]">{typeof rec.volume === 'number' ? (rec.volume / 1000000).toFixed(2) : rec.volume}</td>
                                    <td className="p-2 font-mono text-xs text-[var(--text-primary)]">{rec.relativeVol?.toFixed(1)}x</td>
                                    <td className={cn("p-2 font-mono text-xs", (rec.rsi || 0) > 70 || (rec.rsi || 0) < 30 ? "text-[var(--bloomberg-orange)] font-bold" : "text-[var(--text-muted)]")}>
                                        {(rec.rsi || 0).toFixed(0)}
                                    </td>
                                    <td className="p-2 font-mono text-xs text-[var(--text-muted)]">{rec.marketCap?.toFixed(1)}B</td>
                                    <td className="p-2 font-mono text-xs text-[var(--text-muted)]">{rec.beta?.toFixed(2)}</td>
                                    <td className="p-2">
                                        <span className={cn(
                                            "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border",
                                            rec.probability === 'High' ? "bg-[var(--terminal-green)]/20 text-[var(--terminal-green)] border-[var(--terminal-green)]/30" :
                                                rec.probability === 'Medium' ? "bg-[var(--bloomberg-orange)]/20 text-[var(--bloomberg-orange)] border-[var(--bloomberg-orange)]/30" :
                                                    "bg-[var(--text-muted)]/20 text-[var(--text-muted)] border-[var(--text-muted)]/30"
                                        )}>
                                            {rec.probability}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
