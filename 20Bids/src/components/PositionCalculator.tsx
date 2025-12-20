import { useState, useEffect } from 'react';
import { Calculator, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';

interface PositionCalculatorProps {
    ticker: string;
    currentPrice: number;
}

export function PositionCalculator({ ticker, currentPrice }: PositionCalculatorProps) {
    const [buyPrice, setBuyPrice] = useState<string>(currentPrice.toString());
    const [stopPercent, setStopPercent] = useState<string>('5');
    const [takePercent, setTakePercent] = useState<string>('10');
    const [shares, setShares] = useState<string>('100');

    useEffect(() => {
        setBuyPrice(currentPrice.toString());
    }, [currentPrice, ticker]);

    // Calculations
    const entry = parseFloat(buyPrice) || 0;
    const slPct = parseFloat(stopPercent) || 0;
    const tpPct = parseFloat(takePercent) || 0;
    const shareCount = parseFloat(shares) || 0;

    const stopLossPrice = entry * (1 - slPct / 100);
    const takeProfitPrice = entry * (1 + tpPct / 100);

    const riskPerShare = entry - stopLossPrice;
    const rewardPerShare = takeProfitPrice - entry;
    const totalRisk = riskPerShare * shareCount;
    const totalReward = rewardPerShare * shareCount;
    const rrRatio = riskPerShare > 0 ? rewardPerShare / riskPerShare : 0;

    if (!ticker) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-text-secondary p-4 text-center">
                <Calculator className="w-8 h-8 mb-2 opacity-20" />
                <p className="text-xs">Select a ticker to calculate position</p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-bg-primary overflow-y-auto custom-scrollbar p-2">
            {/* Header */}
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border-primary">
                <Calculator className="w-3 h-3 text-accent-primary" />
                <h3 className="font-bold text-text-primary uppercase tracking-wide text-[10px]">Calculator <span className="text-text-secondary">| {ticker}</span></h3>
            </div>

            <div className="space-y-3">
                {/* Inputs */}
                <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-0.5">
                        <label className="text-[9px] uppercase text-text-secondary font-bold">Buy Price</label>
                        <div className="relative">
                            <span className="absolute left-1.5 top-1 text-text-secondary text-[10px]">$</span>
                            <input
                                type="number"
                                value={buyPrice}
                                onChange={(e) => setBuyPrice(e.target.value)}
                                className="w-full bg-bg-secondary border border-border-primary rounded px-1 py-0.5 pl-3 text-xs text-text-primary focus:border-accent-primary outline-none font-mono"
                            />
                        </div>
                    </div>
                    <div className="space-y-0.5">
                        <label className="text-[9px] uppercase text-text-secondary font-bold">Shares</label>
                        <input
                            type="number"
                            value={shares}
                            onChange={(e) => setShares(e.target.value)}
                            className="w-full bg-bg-secondary border border-border-primary rounded px-1 py-0.5 text-xs text-text-primary focus:border-accent-primary outline-none font-mono"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-0.5">
                        <label className="text-[9px] uppercase text-rose-500 font-bold flex items-center gap-1">
                            <TrendingDown className="w-2 h-2" /> Stop %
                        </label>
                        <div className="relative">
                            <span className="absolute left-1.5 top-1 text-text-secondary text-[10px]">%</span>
                            <input
                                type="number"
                                value={stopPercent}
                                onChange={(e) => setStopPercent(e.target.value)}
                                className="w-full bg-bg-secondary border border-rose-500/30 rounded px-1 py-0.5 pl-3 text-xs text-text-primary focus:border-rose-500 outline-none font-mono"
                            />
                        </div>
                        <div className="text-[9px] font-mono text-text-secondary text-right mt-0.5">
                            ${stopLossPrice.toFixed(2)}
                        </div>
                    </div>
                    <div className="space-y-0.5">
                        <label className="text-[9px] uppercase text-emerald-500 font-bold flex items-center gap-1">
                            <TrendingUp className="w-2 h-2" /> Target %
                        </label>
                        <div className="relative">
                            <span className="absolute left-1.5 top-1 text-text-secondary text-[10px]">%</span>
                            <input
                                type="number"
                                value={takePercent}
                                onChange={(e) => setTakePercent(e.target.value)}
                                className="w-full bg-bg-secondary border border-emerald-500/30 rounded px-1 py-0.5 pl-3 text-xs text-text-primary focus:border-emerald-500 outline-none font-mono"
                            />
                        </div>
                        <div className="text-[9px] font-mono text-text-secondary text-right mt-0.5">
                            ${takeProfitPrice.toFixed(2)}
                        </div>
                    </div>
                </div>

                {/* Results */}
                <div className="pt-2 border-t border-border-primary space-y-2">
                    <div className="flex justify-between items-center p-1.5 rounded bg-bg-secondary border border-border-primary">
                        <span className="text-[10px] text-text-secondary uppercase font-bold">R/R Ratio</span>
                        <span className={cn(
                            "text-sm font-bold font-mono",
                            rrRatio >= 2 ? "text-emerald-500" : rrRatio >= 1 ? "text-amber-500" : "text-rose-500"
                        )}>
                            1 : {rrRatio.toFixed(2)}
                        </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div className="p-1.5 rounded bg-rose-500/5 border border-rose-500/20">
                            <div className="text-[9px] uppercase text-rose-500 font-bold mb-0.5">Risk</div>
                            <div className="text-xs font-mono text-text-primary">-${totalRisk.toFixed(0)}</div>
                        </div>
                        <div className="p-1.5 rounded bg-emerald-500/5 border border-emerald-500/20">
                            <div className="text-[9px] uppercase text-emerald-500 font-bold mb-0.5">Reward</div>
                            <div className="text-xs font-mono text-text-primary">+${totalReward.toFixed(0)}</div>
                        </div>
                    </div>
                </div>
            </div>

            {rrRatio < 1 && (
                <div className="flex items-center gap-2 text-[10px] text-rose-500 bg-rose-500/10 p-2 rounded border border-rose-500/20 mt-3">
                    <AlertTriangle className="w-3 h-3" />
                    <span>Warning: Risk {'>'} Reward</span>
                </div>
            )}
        </div>
    );
}
