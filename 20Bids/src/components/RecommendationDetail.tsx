import { X, Copy, Check, TrendingUp, Activity, BarChart2, Star, Edit3 } from 'lucide-react';
import type { Recommendation } from '../data/mockData';
import { TradingViewWidget } from './TradingViewWidget';
import { cn } from '../lib/utils';
import { useUserData } from '../context/UserDataContext';
import { useState } from 'react';

interface RecommendationDetailProps {
    recommendation: Recommendation;
    onClose: () => void;
}

export function RecommendationDetail({ recommendation, onClose }: RecommendationDetailProps) {
    const [copied, setCopied] = useState(false);
    const { getAnnotation, updateTag, toggleWatchlist } = useUserData();

    // Get persistent data for this ticker
    const { tag, isWatched } = getAnnotation(recommendation.ticker);

    const copyToClipboard = () => {
        const text = `${recommendation.ticker} - ${recommendation.type}\nEntry: $${recommendation.price}\nTarget: $${(recommendation.price * 1.1).toFixed(2)}`;
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="h-full flex flex-col bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl overflow-hidden shadow-2xl animate-in fade-in duration-300">
            {/* Header */}
            <div className="p-4 border-b border-[var(--border-primary)] flex justify-between items-center bg-[var(--bg-secondary)]/50 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-[var(--accent-primary)]/10 flex items-center justify-center text-[var(--accent-primary)] font-bold text-lg">
                        {recommendation.ticker[0]}
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2 font-sans">
                            {recommendation.ticker}
                            <button
                                onClick={() => toggleWatchlist(recommendation.ticker)}
                                className="hover:scale-110 transition-transform focus:outline-none"
                            >
                                <Star
                                    className={cn(
                                        "w-5 h-5 transition-colors",
                                        isWatched ? "fill-[var(--bloomberg-orange)] text-[var(--bloomberg-orange)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                    )}
                                />
                            </button>
                        </h2>
                        <p className="text-xs text-[var(--text-muted)] font-mono">{recommendation.name}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={copyToClipboard}
                        className="p-2 hover:bg-[var(--bg-primary)] rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors relative group"
                        title="Copy details"
                    >
                        {copied ? <Check className="w-5 h-5 text-[var(--terminal-green)]" /> : <Copy className="w-5 h-5" />}
                        {copied && (
                            <span className="absolute top-full right-0 mt-2 px-2 py-1 bg-[var(--terminal-green)] text-black text-xs rounded font-bold whitespace-nowrap animate-in fade-in slide-in-from-top-1">
                                Copied!
                            </span>
                        )}
                    </button>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-[var(--red-500)]/10 hover:text-[var(--red-500)] rounded-lg text-[var(--text-muted)] transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {/* TradingView Chart */}
                <div className="h-[300px] w-full border-b border-[var(--border-primary)] bg-black">
                    <TradingViewWidget symbol={recommendation.ticker} />
                </div>

                <div className="p-6 space-y-6">
                    {/* Analyst Annotation Section */}
                    <div className="space-y-3 glass-panel p-4 rounded-xl">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                                <Edit3 className="w-4 h-4 text-[var(--accent-primary)]" />
                                Analyst Notes
                            </h3>
                            <div className="flex gap-2">
                                {['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7'].map((color) => (
                                    <button
                                        key={color}
                                        onClick={() => updateTag(recommendation.ticker, tag === color ? null : color)}
                                        className={cn(
                                            "w-4 h-4 rounded-full transition-all hover:scale-125",
                                            tag === color ? "ring-2 ring-white scale-110" : "opacity-50 hover:opacity-100"
                                        )}
                                        style={{ backgroundColor: color }}
                                    />
                                ))}
                            </div>
                        </div>
                        <textarea
                            defaultValue={recommendation.userNotes}
                        />
                    </div>

                    {/* Key Metrics Grid */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-bg-secondary border border-border-primary rounded-sm">
                            <div className="text-[10px] text-accent-secondary uppercase tracking-widest mb-1 font-bold">Current Price</div>
                            <div className="text-2xl font-bold text-text-primary">
                                ${recommendation.price.toFixed(2)}
                            </div>
                            <div className={cn(
                                "text-sm font-bold mt-1 flex items-center gap-1",
                                recommendation.change >= 0 ? "text-terminal-green" : "text-red-500"
                            )}>
                                {recommendation.change >= 0 ? '+' : ''}{recommendation.change}%
                                <TrendingUp className="h-3 w-3" />
                            </div>
                        </div>

                        <div className="p-4 bg-bg-secondary border border-border-primary rounded-sm">
                            <div className="text-[10px] text-accent-secondary uppercase tracking-widest mb-1 font-bold">Volume</div>
                            <div className="text-2xl font-bold text-text-primary">
                                {recommendation.volume}
                            </div>
                            <div className="text-xs text-text-secondary mt-1 uppercase">
                                Relative Vol: {recommendation.relativeVol}x
                            </div>
                        </div>
                    </div>

                    {/* Thesis */}
                    <div>
                        <h3 className="text-xs font-bold text-accent-primary uppercase tracking-widest mb-3 flex items-center gap-2 border-b border-border-primary pb-2">
                            <Activity className="h-3 w-3" />
                            Investment Thesis
                        </h3>
                        <ul className="space-y-3">
                            <li className="flex gap-3 text-xs text-text-primary leading-relaxed font-sans">
                                <span className="text-accent-primary font-bold">{">>"}</span>
                                Strong breakout above key resistance level at ${Math.floor(recommendation.price * 0.95)}. Volume confirmation suggests institutional accumulation.
                            </li>
                            <li className="flex gap-3 text-xs text-text-primary leading-relaxed font-sans">
                                <span className="text-accent-primary font-bold">{">>"}</span>
                                Sector rotation favoring {recommendation.sector} stocks this week due to macroeconomic tailwinds.
                            </li>
                            <li className="flex gap-3 text-xs text-text-primary leading-relaxed font-sans">
                                <span className="text-accent-primary font-bold">{">>"}</span>
                                RSI divergence on the 4H chart indicates potential for continued upside momentum in the short term.
                            </li>
                        </ul>
                    </div>

                    {/* Technical Indicators */}
                    <div>
                        <h3 className="text-xs font-bold text-accent-primary uppercase tracking-widest mb-3 flex items-center gap-2 border-b border-border-primary pb-2">
                            <BarChart2 className="h-3 w-3" />
                            Technical Indicators
                        </h3>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="p-3 border border-border-primary bg-bg-secondary rounded-sm">
                                <div className="text-[10px] text-text-secondary uppercase mb-1">RSI (14)</div>
                                <div className="font-bold text-accent-secondary">{recommendation.rsi}</div>
                            </div>
                            <div className="p-3 border border-border-primary bg-bg-secondary rounded-sm">
                                <div className="text-[10px] text-text-secondary uppercase mb-1">MACD</div>
                                <div className="font-bold text-terminal-green">BULLISH</div>
                            </div>
                            <div className="p-3 border border-border-primary bg-bg-secondary rounded-sm">
                                <div className="text-[10px] text-text-secondary uppercase mb-1">Beta</div>
                                <div className="font-bold text-text-primary">{recommendation.beta}</div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            {/* Toast Notification */}
            {copied && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-accent-primary text-bg-primary px-6 py-2 shadow-lg text-xs font-bold uppercase tracking-wider animate-in fade-in slide-in-from-bottom-4 border border-text-primary rounded-full">
                    Data copied to clipboard
                </div>
            )}
        </div>
    );
}
