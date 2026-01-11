import { X, Info, TrendingUp, Shield, Clock, DollarSign, BarChart3, Target } from 'lucide-react';

interface TradingInfoModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function TradingInfoModal({ isOpen, onClose }: TradingInfoModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-2xl bg-bg-primary border border-border-primary/50 rounded-2xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-border-primary/30 bg-gradient-to-r from-accent-primary/10 to-transparent">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-accent-primary/20">
                            <Info className="w-5 h-5 text-accent-primary" />
                        </div>
                        <h2 className="text-xl font-bold text-text-primary">Trading Strategy</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-bg-secondary text-text-secondary hover:text-text-primary transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">

                    {/* Entry Logic */}
                    <section className="space-y-3">
                        <div className="flex items-center gap-2 text-accent-primary">
                            <TrendingUp className="w-4 h-4" />
                            <h3 className="font-bold uppercase text-sm tracking-wider">Entry Logic</h3>
                        </div>
                        <div className="bg-bg-secondary/50 rounded-xl p-4 space-y-2 text-sm">
                            <p className="text-text-secondary">
                                Orders are placed at <span className="text-accent-primary font-bold">20% below market price</span>.
                                This gives you full control — you manually adjust the price up when ready to execute.
                            </p>
                            <p className="text-text-secondary">
                                The system fetches real-time prices from <span className="text-text-primary font-medium">Polygon.io</span>
                                to ensure accurate limit order placement.
                            </p>
                        </div>
                    </section>

                    {/* Filters */}
                    <section className="space-y-3">
                        <div className="flex items-center gap-2 text-amber-500">
                            <BarChart3 className="w-4 h-4" />
                            <h3 className="font-bold uppercase text-sm tracking-wider">Selection Filters</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-bg-secondary/50 rounded-xl p-4">
                                <div className="text-xs text-text-secondary uppercase">Min Volume</div>
                                <div className="text-lg font-bold text-text-primary">$2M</div>
                            </div>
                            <div className="bg-bg-secondary/50 rounded-xl p-4">
                                <div className="text-xs text-text-secondary uppercase">Min Price</div>
                                <div className="text-lg font-bold text-text-primary">$5.00</div>
                            </div>
                            <div className="bg-bg-secondary/50 rounded-xl p-4">
                                <div className="text-xs text-text-secondary uppercase">Max Gain Skip</div>
                                <div className="text-lg font-bold text-text-primary">1%</div>
                                <div className="text-xs text-text-secondary">Skip if already rose &gt;1%</div>
                            </div>
                            <div className="bg-bg-secondary/50 rounded-xl p-4">
                                <div className="text-xs text-text-secondary uppercase">Prioritize</div>
                                <div className="text-lg font-bold text-text-primary">Below Ref</div>
                                <div className="text-xs text-text-secondary">Stocks under refPrice1020</div>
                            </div>
                        </div>
                    </section>

                    {/* Position Sizing */}
                    <section className="space-y-3">
                        <div className="flex items-center gap-2 text-emerald-500">
                            <DollarSign className="w-4 h-4" />
                            <h3 className="font-bold uppercase text-sm tracking-wider">Position Sizing</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-bg-secondary/50 rounded-xl p-4">
                                <div className="text-xs text-text-secondary uppercase">Max Daily Spend</div>
                                <div className="text-lg font-bold text-emerald-500">$32,500</div>
                                <div className="text-xs text-text-secondary">≈ €30,000</div>
                            </div>
                            <div className="bg-bg-secondary/50 rounded-xl p-4">
                                <div className="text-xs text-text-secondary uppercase">Max Per Position</div>
                                <div className="text-lg font-bold text-text-primary">20%</div>
                                <div className="text-xs text-text-secondary">of portfolio</div>
                            </div>
                            <div className="bg-bg-secondary/50 rounded-xl p-4 col-span-2">
                                <div className="text-xs text-text-secondary uppercase">Max Stocks Per Day</div>
                                <div className="text-lg font-bold text-text-primary">10 positions</div>
                            </div>
                        </div>
                    </section>

                    {/* Risk Management */}
                    <section className="space-y-3">
                        <div className="flex items-center gap-2 text-rose-500">
                            <Shield className="w-4 h-4" />
                            <h3 className="font-bold uppercase text-sm tracking-wider">Risk Management</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
                                <div className="text-xs text-emerald-400 uppercase">Take Profit</div>
                                <div className="text-lg font-bold text-emerald-500">+1%</div>
                                <div className="text-xs text-text-secondary">Auto-sell on gain</div>
                            </div>
                            <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4">
                                <div className="text-xs text-rose-400 uppercase">Stop Loss</div>
                                <div className="text-lg font-bold text-rose-500">-3%</div>
                                <div className="text-xs text-text-secondary">Auto-sell on loss</div>
                            </div>
                        </div>
                    </section>

                    {/* Execution Time */}
                    <section className="space-y-3">
                        <div className="flex items-center gap-2 text-blue-500">
                            <Clock className="w-4 h-4" />
                            <h3 className="font-bold uppercase text-sm tracking-wider">Execution Schedule</h3>
                        </div>
                        <div className="bg-bg-secondary/50 rounded-xl p-4 flex items-center justify-between">
                            <div>
                                <div className="text-xs text-text-secondary uppercase">Daily Execution</div>
                                <div className="text-lg font-bold text-text-primary">10:25 AM ET</div>
                                <div className="text-xs text-text-secondary">4:25 PM Spain • Market hours only</div>
                            </div>
                            <Target className="w-8 h-8 text-blue-500/50" />
                        </div>
                    </section>

                    {/* Account Info */}
                    <section className="bg-gradient-to-r from-accent-primary/10 to-purple-500/10 rounded-xl p-4 border border-accent-primary/20">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-xs text-text-secondary uppercase font-bold">Connected Account</span>
                        </div>
                        <div className="text-lg font-bold text-text-primary">IBKR U9444436</div>
                        <div className="text-xs text-text-secondary">Live Trading • Port 7496</div>
                    </section>

                </div>

                {/* Footer */}
                <div className="p-4 border-t border-border-primary/30 bg-bg-secondary/30">
                    <p className="text-xs text-text-secondary text-center">
                        ⚠️ Orders are placed with transmit=true. Review and adjust prices manually in TWS before market open.
                    </p>
                </div>
            </div>
        </div>
    );
}
