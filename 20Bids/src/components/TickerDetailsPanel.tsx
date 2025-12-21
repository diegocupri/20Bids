import { X, ExternalLink } from 'lucide-react';
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
import { fetchTickerNews, fetchSocialSentiment } from '../api/client';
import { NewsTab } from './ticker-details/NewsTab';
import { SocialTab } from './ticker-details/SocialTab';
import { Newspaper, MessageCircle, Info } from 'lucide-react';

// ... interface TickerDetailsPanelProps ...

export function TickerDetailsPanel({
    recommendations,
    selectedTicker,
    selectedPrice,
    selectedSector,
    isOpen,
    onClose
}: TickerDetailsPanelProps) {
    const [activeTab, setActiveTab] = useState<'overview' | 'news' | 'social'>('overview');
    const [news, setNews] = useState<any[]>([]);
    const [sentiment, setSentiment] = useState<any>(null);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);

    // Reset tab when ticker changes (or keep? Reset seems better)
    useEffect(() => {
        if (selectedTicker && isOpen) {
            setActiveTab('overview');
            setNews([]);
            setSentiment(null);

            // Prefetch? Or fetch on tab click?
            // Let's fetch when tabs change to avoid spamming APIs if user just wants overview
        }
    }, [selectedTicker, isOpen]);

    useEffect(() => {
        if (!selectedTicker || !isOpen) return;

        const fetchData = async () => {
            setIsLoadingDetails(true);
            try {
                if (activeTab === 'news' && news.length === 0) {
                    const data = await fetchTickerNews(selectedTicker);
                    setNews(data);
                } else if (activeTab === 'social' && !sentiment) {
                    const data = await fetchSocialSentiment(selectedTicker);
                    setSentiment(data);
                }
            } catch (error) {
                console.error("Error fetching details:", error);
            } finally {
                setIsLoadingDetails(false);
            }
        };

        fetchData();
    }, [activeTab, selectedTicker, isOpen]);

    // ... existing useMemo logic ...
    const sectorStats = useMemo(() => {
        if (!selectedSector || !recommendations.length) return null;
        const sectorRecs = recommendations.filter(r => r.sector === selectedSector);
        if (sectorRecs.length === 0) return null;
        const avgProb = sectorRecs.reduce((sum, r) => sum + (r.probabilityValue || 0), 0) / sectorRecs.length;
        const avgVol = sectorRecs.reduce((sum, r) => sum + (r.volume || 0), 0) / sectorRecs.length;
        return { count: sectorRecs.length, avgProb, avgVol };
    }, [recommendations, selectedSector]);

    const tickerDetails = useMemo(() => {
        return recommendations.find(r => r.symbol === selectedTicker);
    }, [recommendations, selectedTicker]);

    return (
        <>
            {isOpen && (
                <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity" onClick={onClose} />
            )}

            <div className={cn(
                "fixed top-0 right-0 h-full w-[450px] bg-bg-primary border-l border-border-primary shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col",
                isOpen ? "translate-x-0" : "translate-x-full"
            )}>
                {/* Header with Tabs */}
                <div className="flex flex-col border-b border-border-primary/50 bg-bg-primary z-10">
                    <div className="flex items-center justify-between p-6 pb-4">
                        <h2 className="text-xl font-bold text-text-primary">Ticker Details</h2>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-bg-secondary text-text-secondary hover:text-text-primary transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="flex items-center px-6 gap-6">
                        <button
                            onClick={() => setActiveTab('overview')}
                            className={cn(
                                "flex items-center gap-2 pb-3 text-sm font-semibold transition-colors relative",
                                activeTab === 'overview' ? "text-text-primary" : "text-text-secondary hover:text-text-primary"
                            )}
                        >
                            <Info className="w-4 h-4" />
                            Overview
                            {activeTab === 'overview' && (
                                <div className="absolute bottom-0 left-0 w-full h-0.5 bg-accent-primary rounded-t-full" />
                            )}
                        </button>
                        <button
                            onClick={() => setActiveTab('news')}
                            className={cn(
                                "flex items-center gap-2 pb-3 text-sm font-semibold transition-colors relative",
                                activeTab === 'news' ? "text-text-primary" : "text-text-secondary hover:text-text-primary"
                            )}
                        >
                            <Newspaper className="w-4 h-4" />
                            News
                            {activeTab === 'news' && (
                                <div className="absolute bottom-0 left-0 w-full h-0.5 bg-accent-primary rounded-t-full" />
                            )}
                        </button>
                        <button
                            onClick={() => setActiveTab('social')}
                            className={cn(
                                "flex items-center gap-2 pb-3 text-sm font-semibold transition-colors relative",
                                activeTab === 'social' ? "text-text-primary" : "text-text-secondary hover:text-text-primary"
                            )}
                        >
                            <MessageCircle className="w-4 h-4" />
                            Social
                            {activeTab === 'social' && (
                                <div className="absolute bottom-0 left-0 w-full h-0.5 bg-accent-primary rounded-t-full" />
                            )}
                        </button>
                    </div>
                </div>

                {selectedTicker ? (
                    <div className="flex-1 overflow-y-auto">
                        {/* Content Area */}
                        {activeTab === 'overview' && (
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

                                {/* Price & Stats */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 rounded-xl bg-bg-secondary/50 border border-border-primary/50">
                                        <span className="text-xs text-text-secondary font-medium">Ref Price</span>
                                        <div className="text-lg font-bold text-text-primary tabular-nums">
                                            ${selectedPrice?.toFixed(2)}
                                        </div>
                                    </div>
                                    <div className="p-4 rounded-xl bg-bg-secondary/50 border border-border-primary/50">
                                        <span className="text-xs text-text-secondary font-medium">Probability</span>
                                        <div className={cn(
                                            "text-lg font-bold tabular-nums",
                                            (tickerDetails?.probabilityValue || 0) >= 90 ? "text-emerald-600" :
                                                (tickerDetails?.probabilityValue || 0) >= 80 ? "text-amber-600" : "text-text-secondary"
                                        )}>
                                            {tickerDetails?.probabilityValue}%
                                        </div>
                                    </div>
                                </div>

                                {/* Sector Context */}
                                {sectorStats && (
                                    <div className="space-y-3">
                                        <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider">Sector Context</h4>
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-sm py-2 border-b border-border-primary/30">
                                                <span className="text-text-secondary">Related Tickers</span>
                                                <span className="font-medium text-text-primary">{sectorStats.count}</span>
                                            </div>
                                            <div className="flex justify-between text-sm py-2 border-b border-border-primary/30">
                                                <span className="text-text-secondary">Sector Avg Prob</span>
                                                <span className="font-medium text-text-primary tabular-nums">{sectorStats.avgProb.toFixed(1)}%</span>
                                            </div>
                                            <div className="flex justify-between text-sm py-2 border-b border-border-primary/30">
                                                <span className="text-text-secondary">Sector Avg Vol</span>
                                                <span className="font-medium text-text-primary tabular-nums">{(sectorStats.avgVol / 1000000).toFixed(2)}M</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Actions */}
                                <button
                                    onClick={() => window.open(`https://www.tradingview.com/chart/?symbol=${selectedTicker}`, '_blank')}
                                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-accent-primary text-white font-bold hover:bg-accent-primary/90 transition-all shadow-sm"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    Open TradingView Chart
                                </button>
                            </div>
                        )}

                        {activeTab === 'news' && (
                            <NewsTab news={news} isLoading={isLoadingDetails} />
                        )}

                        {activeTab === 'social' && (
                            <SocialTab data={sentiment} isLoading={isLoadingDetails} />
                        )}

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
