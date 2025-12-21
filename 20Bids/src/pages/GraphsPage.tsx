import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Grid3X3, Square, LayoutGrid, Maximize2 } from 'lucide-react';
import { cn } from '../lib/utils';

declare global {
    interface Window {
        TradingView: any;
    }
}

export function GraphsPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const symbols = useMemo(() => {
        const s = searchParams.get('symbols');
        return s ? s.split(',') : [];
    }, [searchParams]);

    const [gridCols, setGridCols] = useState<number | 'auto'>('auto');

    useEffect(() => {
        // Load TradingView Script (Simple cache check)
        const existingScript = document.getElementById('tv-widget-script');
        if (!existingScript) {
            const script = document.createElement('script');
            script.id = 'tv-widget-script';
            script.src = 'https://s3.tradingview.com/tv.js';
            script.async = true;
            script.onload = initWidgets;
            document.body.appendChild(script);
        } else {
            if (window.TradingView) initWidgets();
        }

        function initWidgets() {
            symbols.forEach((symbol, index) => {
                const containerId = `tradingview_${index}`;
                // Small delay to ensure container exists in DOM if re-rendering
                setTimeout(() => {
                    if (window.TradingView && document.getElementById(containerId)) {
                        new window.TradingView.widget({
                            "width": "100%",
                            "height": "100%",
                            "symbol": symbol,
                            "interval": "D",
                            "timezone": "Etc/UTC",
                            "theme": "light",
                            "style": "1",
                            "locale": "en",
                            "toolbar_bg": "#f1f3f6",
                            "enable_publishing": false,
                            "allow_symbol_change": true,
                            "container_id": containerId,
                            "hide_side_toolbar": false
                        });
                    }
                }, 100);
            });
        }
    }, [symbols, gridCols]); // Re-init on layout change might be needed if iframes are destroyed

    // Determine grid columns based on count or override
    const currentGridClass = useMemo(() => {
        if (typeof gridCols === 'number') {
            switch (gridCols) {
                case 1: return 'grid-cols-1';
                case 2: return 'grid-cols-2';
                case 3: return 'grid-cols-3';
                default: return 'grid-cols-4';
            }
        }
        // Auto logic
        const count = symbols.length;
        if (count === 1) return 'grid-cols-1';
        if (count === 2) return 'grid-cols-2';
        if (count <= 4) return 'grid-cols-2';
        if (count <= 6) return 'grid-cols-3';
        return 'grid-cols-4';
    }, [gridCols, symbols.length]);

    return (
        <div className="min-h-screen bg-bg-primary flex flex-col font-sans">
            {/* Header */}
            <div className="h-14 border-b border-border-primary flex items-center justify-between px-4 bg-bg-secondary/50 backdrop-blur sticky top-0 z-50">
                <div className="flex items-center">
                    <button
                        onClick={() => navigate('/')}
                        className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors text-sm font-bold pr-4 border-r border-border-primary mr-4"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back
                    </button>

                    <div className="flex items-center gap-2 mr-4">
                        <div className="w-6 h-6 bg-accent-primary rounded-md shadow-sm flex items-center justify-center">
                            <span className="text-white font-bold text-xs tracking-tighter">20</span>
                        </div>
                        <span className="text-lg font-bold text-text-primary tracking-tight">Bids</span>
                    </div>

                    <h1 className="text-sm font-medium text-text-secondary hidden md:block">
                        Multi-Chart Grid <span className="text-text-secondary/50 ml-2">({symbols.length} Symbols)</span>
                    </h1>
                </div>

                {/* Layout Controls */}
                <div className="flex items-center gap-1 bg-bg-primary border border-border-primary/50  p-1 rounded-lg">
                    <button
                        onClick={() => setGridCols('auto')}
                        className={cn(
                            "p-1.5 rounded-md transition-all",
                            gridCols === 'auto' ? "bg-accent-primary text-white shadow-sm" : "text-text-secondary hover:bg-bg-secondary"
                        )}
                        title="Auto Grid"
                    >
                        <LayoutGrid className="w-4 h-4" />
                    </button>
                    <div className="w-px h-4 bg-border-primary/50 mx-1" />
                    <button
                        onClick={() => setGridCols(1)}
                        className={cn(
                            "p-1.5 rounded-md transition-all",
                            gridCols === 1 ? "bg-accent-primary text-white shadow-sm" : "text-text-secondary hover:bg-bg-secondary"
                        )}
                        title="1 Column"
                    >
                        <Maximize2 className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setGridCols(2)}
                        className={cn(
                            "p-1.5 rounded-md transition-all",
                            gridCols === 2 ? "bg-accent-primary text-white shadow-sm" : "text-text-secondary hover:bg-bg-secondary"
                        )}
                        title="2 Columns"
                    >
                        <Square className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setGridCols(3)}
                        className={cn(
                            "p-1.5 rounded-md transition-all",
                            gridCols === 3 ? "bg-accent-primary text-white shadow-sm" : "text-text-secondary hover:bg-bg-secondary"
                        )}
                        title="3 Columns"
                    >
                        <Grid3X3 className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Grid */}
            <div className={cn("grid gap-0.5 flex-1 bg-border-primary/20", currentGridClass)}>
                {symbols.map((symbol, index) => (
                    <div key={symbol} className="relative bg-bg-primary w-full h-full min-h-[400px]">
                        <div id={`tradingview_${index}`} className="w-full h-full" />
                    </div>
                ))}
            </div>
        </div>
    );
}
