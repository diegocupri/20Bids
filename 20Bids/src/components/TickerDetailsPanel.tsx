import { X } from 'lucide-react';
import { cn } from '../lib/utils';
import { useMemo } from 'react';

// Reusing MarketContext logic but in a side panel layout
interface TickerDetailsPanelProps {
    recommendations: any[];
    selectedTicker: string | null;
    selectedPrice: number | null;
    selectedSector: string | null;
    isOpen: boolean;
    onClose: () => void;
}

// ... imports
import { useState, useEffect } from 'react';
import { fetchTickerNews } from '../api/client';
import { NewsTab } from './ticker-details/NewsTab';
import { Newspaper } from 'lucide-react';

// ... interface TickerDetailsPanelProps ...

export function TickerDetailsPanel({
    recommendations,
    selectedTicker,
    selectedPrice,
    selectedSector,
    isOpen,
    onClose
}: TickerDetailsPanelProps) {
    const [news, setNews] = useState<any[]>([]);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);

    useEffect(() => {
        if (!selectedTicker || !isOpen) return;

        const fetchData = async () => {
            setIsLoadingDetails(true);
            try {
                const data = await fetchTickerNews(selectedTicker);
                setNews(data);
            } catch (error) {
                console.error("Error fetching details:", error);
            } finally {
                setIsLoadingDetails(false);
            }
        };

        fetchData();
    }, [selectedTicker, isOpen]);

    // ... existing useMemo logic ...
    const tickerDetails = useMemo(() => {
        return recommendations.find(r => r.symbol === selectedTicker);
    }, [recommendations, selectedTicker]);

    return (
        <>
            {isOpen && (
                <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity" onClick={onClose} />
            )}

            <div className={cn(
                "fixed top-0 right-0 h-full w-[500px] bg-bg-primary border-l border-border-primary shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col",
                isOpen ? "translate-x-0" : "translate-x-full"
            )}>
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-border-primary/50 bg-bg-primary z-10">
                    <h2 className="text-xl font-bold text-text-primary">Ticker Details</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-bg-secondary text-text-secondary hover:text-text-primary transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {selectedTicker ? (
                    <div className="flex-1 overflow-y-auto">
                        <div className="p-6 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            {/* Ticker Header */}
                            <div className="flex items-start gap-4">
                                <div className="w-16 h-16 rounded-2xl bg-white p-2 shadow-sm border border-border-primary/50 flex items-center justify-center overflow-hidden shrink-0">
                                    <img
                                        src={`https://financialmodelingprep.com/image-stock/${selectedTicker}.png`}
                                        alt={selectedTicker}
                                        className="w-full h-full object-contain"
                                        onError={(e) => {
                                            e.currentTarget.style.display = 'none';
                                            const parent = e.currentTarget.parentElement;
                                            if (parent) {
                                                parent.classList.add('bg-bg-secondary');
                                                if (!parent.querySelector('.fallback-text')) {
                                                    const fallback = document.createElement('div');
                                                    fallback.className = 'text-xl font-bold text-text-primary fallback-text';
                                                    fallback.innerText = selectedTicker[0];
                                                    parent.appendChild(fallback);
                                                }
                                            }
                                        }}
                                    />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-bold text-text-primary">{selectedTicker}</h3>
                                    <p className="text-sm text-text-secondary font-medium">{tickerDetails?.name}</p>
                                    <div className="flex items-center gap-2 mt-2">
                                        <span className="px-2 py-0.5 rounded-full bg-accent-primary/10 text-accent-primary text-xs font-bold border border-accent-primary/20">
                                            {selectedSector}
                                        </span>
                                        {tickerDetails?.userTag && (
                                            <div
                                                className="w-3 h-3 rounded-full"
                                                style={{ backgroundColor: tickerDetails.userTag }}
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Compact Summary Table */}
                            <div className="bg-bg-secondary/30 rounded-xl border border-border-primary/50 overflow-hidden">
                                <table className="w-full text-sm">
                                    <tbody className="divide-y divide-border-primary/30">
                                        <tr className="bg-bg-secondary/20">
                                            <td className="px-4 py-2 text-text-secondary font-medium w-1/3">Price</td>
                                            <td className="px-4 py-2 text-text-primary font-bold tabular-nums text-right">${selectedPrice?.toFixed(2)}</td>
                                        </tr>
                                        <tr>
                                            <td className="px-4 py-2 text-text-secondary font-medium">Probability</td>
                                            <td className={cn(
                                                "px-4 py-2 font-bold tabular-nums text-right",
                                                (tickerDetails?.probabilityValue || 0) >= 90 ? "text-emerald-600" :
                                                    (tickerDetails?.probabilityValue || 0) >= 80 ? "text-amber-600" : "text-text-primary"
                                            )}>
                                                {tickerDetails?.probabilityValue}%
                                            </td>
                                        </tr>
                                        <tr className="bg-bg-secondary/20">
                                            <td className="px-4 py-2 text-text-secondary font-medium">Signal</td>
                                            <td className={cn(
                                                "px-4 py-2 font-bold text-right",
                                                tickerDetails?.type === 'Long' ? "text-emerald-600" : "text-rose-600"
                                            )}>
                                                {tickerDetails?.type}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="px-4 py-2 text-text-secondary font-medium">Volume</td>
                                            <td className="px-4 py-2 text-text-primary tabular-nums text-right">
                                                {((tickerDetails?.volume || 0) / 1000000).toFixed(2)}M
                                            </td>
                                        </tr>
                                        <tr className="bg-bg-secondary/20">
                                            <td className="px-4 py-2 text-text-secondary font-medium">Stop Loss</td>
                                            <td className="px-4 py-2 text-text-primary tabular-nums text-right">${tickerDetails?.stopLoss?.toFixed(2)}</td>
                                        </tr>
                                        <tr>
                                            <td className="px-4 py-2 text-text-secondary font-medium">Target</td>
                                            <td className="px-4 py-2 text-text-primary tabular-nums text-right">${tickerDetails?.priceTarget?.toFixed(2)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <div className="pt-2 border-t border-border-primary/50">
                                <h4 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2 uppercase tracking-wider">
                                    <Newspaper className="w-4 h-4" />
                                    Latest News
                                </h4>
                                <NewsTab news={news} isLoading={isLoadingDetails} />
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-text-secondary">
                        <div className="w-12 h-12 rounded-full bg-bg-secondary flex items-center justify-center mb-4">
                            <BarChart2 className="w-6 h-6 opacity-30" />
                        </div>
                        <p className="text-sm">Select a ticker to view details</p>
                    </div>
                )}
            </div>
        </>
    );
}

import { BarChart2 } from 'lucide-react';
