import { useState } from 'react';
import { X, Check, TrendingUp, Activity, Star, Edit3, Info, Share2 } from 'lucide-react';
import type { Recommendation } from '../data/mockData';
import { TradingViewWidget } from './TradingViewWidget';
import { cn } from '../lib/utils';

interface RecommendationDetailProps {
    recommendation: Recommendation;
    onClose: () => void;
}

export function RecommendationDetail({ recommendation, onClose }: RecommendationDetailProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        const text = `
Ticker: ${recommendation.ticker}
Price: $${recommendation.price}
Change: ${recommendation.change}%
Type: ${recommendation.type}
Probability: ${recommendation.probability}
Sector: ${recommendation.sector}
`.trim();

        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="h-full flex flex-col bg-bg-primary text-text-primary font-mono border-l border-border-primary transition-colors duration-300">
            {/* Header */}
            <div className="px-6 py-4 border-b border-border-primary flex justify-between items-center bg-bg-secondary sticky top-0 z-20 shadow-sm">
                <div>
                    <div className="flex items-center gap-3">
                        <h2 className="font-bold text-2xl text-accent-primary tracking-tight font-sans">
                            {recommendation.ticker}
                        </h2>
                        <span className={cn(
                            "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border",
                            recommendation.type === 'Intraday'
                                ? "border-blue-500/30 text-blue-500 bg-blue-500/10"
                                : "border-purple-500/30 text-purple-500 bg-purple-500/10"
                        )}>
                            {recommendation.type}
                        </span>
                    </div>
                    <p className="text-xs text-text-secondary uppercase tracking-wider mt-1 font-bold flex items-center gap-2">
                        {recommendation.name}
                        <span className="w-1 h-1 rounded-full bg-text-secondary/50" />
                        {recommendation.sector}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleCopy}
                        className="p-2 hover:bg-bg-tertiary transition-colors text-text-secondary hover:text-accent-primary rounded-md"
                        title="Copy Data"
                    >
                        {copied ? <Check className="h-4 w-4 text-terminal-green" /> : <Share2 className="h-4 w-4" />}
                    </button>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-bg-tertiary transition-colors text-text-secondary hover:text-red-500 rounded-md"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {/* Chart Section */}
                <div className="h-[400px] w-full border-b border-border-primary bg-bg-primary relative">
                    <TradingViewWidget symbol={(recommendation as any).symbol || recommendation.ticker} />
                </div>

                {/* Content Section */}
                <div className="p-6 space-y-8">

                    {/* Key Metrics Grid */}
                    <div>
                        <h3 className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Activity className="h-3 w-3" />
                            Market Data
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 bg-bg-secondary/50 border border-border-primary rounded-sm hover:border-accent-primary/30 transition-colors">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-[10px] text-text-secondary uppercase tracking-wider">Price</span>
                                    <TrendingUp className={cn("h-3 w-3", recommendation.change >= 0 ? "text-terminal-green" : "text-red-500")} />
                                </div>
                                <div className="text-3xl font-bold text-text-primary font-sans">
                                    ${recommendation.price.toFixed(2)}
                                </div>
                                <div className={cn(
                                    "text-xs font-bold mt-1",
                                    recommendation.change >= 0 ? "text-terminal-green" : "text-red-500"
                                )}>
                                    {recommendation.change >= 0 ? '+' : ''}{recommendation.change}%
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div className="p-3 bg-bg-secondary/30 border border-border-primary rounded-sm">
                                    <div className="text-[10px] text-text-secondary uppercase mb-1">Volume</div>
                                    <div className="font-bold text-text-primary">{recommendation.volume}M</div>
                                </div>
                                <div className="p-3 bg-bg-secondary/30 border border-border-primary rounded-sm">
                                    <div className="text-[10px] text-text-secondary uppercase mb-1">Rel Vol</div>
                                    <div className="font-bold text-accent-secondary">{recommendation.relativeVol}x</div>
                                </div>
                                <div className="p-3 bg-bg-secondary/30 border border-border-primary rounded-sm">
                                    <div className="text-[10px] text-text-secondary uppercase mb-1">RSI (14)</div>
                                    <div className={cn(
                                        "font-bold",
                                        recommendation.rsi > 70 ? "text-red-500" : recommendation.rsi < 30 ? "text-terminal-green" : "text-text-primary"
                                    )}>{recommendation.rsi}</div>
                                </div>
                                <div className="p-3 bg-bg-secondary/30 border border-border-primary rounded-sm">
                                    <div className="text-[10px] text-text-secondary uppercase mb-1">Beta</div>
                                    <div className="font-bold text-text-primary">{recommendation.beta}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Analyst Tools */}
                    <div className="p-5 bg-bg-secondary border border-border-primary rounded-sm shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-1 h-full bg-accent-primary/50" />
                        <h3 className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Edit3 className="h-3 w-3" />
                            Analyst Notes
                        </h3>

                        <div className="flex items-center gap-6 mb-4 pb-4 border-b border-border-primary/50">
                            <div className="flex items-center gap-3">
                                <span className="text-[10px] uppercase text-text-secondary font-bold">Priority Tag:</span>
                                <div className="flex gap-1.5">
                                    {['#ef4444', '#3b82f6', '#10b981', '#f59e0b'].map(color => (
                                        <button
                                            key={color}
                                            className={cn(
                                                "w-3 h-3 rounded-full transition-all hover:scale-125",
                                                recommendation.userTag === color ? "ring-2 ring-offset-2 ring-offset-bg-secondary ring-text-primary scale-110" : "opacity-40 hover:opacity-100"
                                            )}
                                            style={{ backgroundColor: color }}
                                        />
                                    ))}
                                </div>
                            </div>
                            <div className="h-4 w-px bg-border-primary/50" />
                            <button className="flex items-center gap-2 text-[10px] uppercase font-bold text-text-secondary hover:text-accent-primary transition-colors">
                                <Star className={cn("h-3 w-3", recommendation.isWatched && "fill-accent-primary text-accent-primary")} />
                                {recommendation.isWatched ? 'Watched' : 'Add to Watchlist'}
                            </button>
                        </div>

                        <textarea
                            className="w-full bg-bg-primary/50 border border-border-primary text-text-primary text-xs p-3 focus:outline-none focus:border-accent-primary resize-none h-24 font-sans rounded-sm placeholder:text-text-secondary/30"
                            placeholder="Enter your analysis notes here..."
                            defaultValue={recommendation.userNotes}
                        />
                    </div>

                    {/* Thesis */}
                    <div>
                        <h3 className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Info className="h-3 w-3" />
                            Investment Thesis
                        </h3>
                        <div className="bg-bg-secondary/20 border border-border-primary rounded-sm p-4">
                            <ul className="space-y-4">
                                <li className="flex gap-3 text-xs text-text-primary leading-relaxed font-sans group">
                                    <span className="text-accent-primary font-bold mt-0.5 opacity-50 group-hover:opacity-100 transition-opacity">01</span>
                                    <span className="text-text-secondary group-hover:text-text-primary transition-colors">
                                        Strong breakout above key resistance level at <span className="text-text-primary font-bold">${Math.floor(recommendation.price * 0.95)}</span>. Volume confirmation suggests institutional accumulation.
                                    </span>
                                </li>
                                <li className="flex gap-3 text-xs text-text-primary leading-relaxed font-sans group">
                                    <span className="text-accent-primary font-bold mt-0.5 opacity-50 group-hover:opacity-100 transition-opacity">02</span>
                                    <span className="text-text-secondary group-hover:text-text-primary transition-colors">
                                        Sector rotation favoring <span className="text-text-primary font-bold">{recommendation.sector}</span> stocks this week due to macroeconomic tailwinds.
                                    </span>
                                </li>
                                <li className="flex gap-3 text-xs text-text-primary leading-relaxed font-sans group">
                                    <span className="text-accent-primary font-bold mt-0.5 opacity-50 group-hover:opacity-100 transition-opacity">03</span>
                                    <span className="text-text-secondary group-hover:text-text-primary transition-colors">
                                        RSI divergence on the 4H chart indicates potential for continued upside momentum in the short term.
                                    </span>
                                </li>
                            </ul>
                        </div>
                    </div>

                </div>
            </div>

            {/* Toast Notification */}
            {copied && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-accent-primary text-bg-primary px-6 py-2 shadow-lg text-xs font-bold uppercase tracking-wider animate-in fade-in slide-in-from-bottom-4 border border-text-primary rounded-full z-50">
                    Data copied
                </div>
            )}
        </div>
    );
}
