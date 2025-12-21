import { useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

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

    useEffect(() => {
        // Load TradingView Script
        const script = document.createElement('script');
        script.src = 'https://s3.tradingview.com/tv.js';
        script.async = true;
        script.onload = () => {
            symbols.forEach((symbol, index) => {
                const containerId = `tradingview_${index}`;
                if (window.TradingView) {
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
            });
        };
        document.body.appendChild(script);

        return () => {
            if (document.body.contains(script)) {
                document.body.removeChild(script);
            }
        };
    }, [symbols]);

    // Determine grid columns based on count
    const getGridClass = (count: number) => {
        if (count === 1) return 'grid-cols-1';
        if (count === 2) return 'grid-cols-2';
        if (count <= 4) return 'grid-cols-2';
        if (count <= 6) return 'grid-cols-3';
        return 'grid-cols-4'; // Fallback for many
    };

    return (
        <div className="min-h-screen bg-bg-primary flex flex-col">
            {/* Header */}
            <div className="h-14 border-b border-border-primary flex items-center px-4 bg-bg-secondary sticky top-0 z-50">
                <button
                    onClick={() => navigate('/')}
                    className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors text-sm font-medium pr-4 border-r border-border-primary mr-4"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                </button>
                <h1 className="text-sm font-bold text-text-primary">
                    Multi-Chart Grid <span className="text-text-secondary font-normal ml-2">({symbols.length} Symbols)</span>
                </h1>
            </div>

            {/* Grid */}
            <div className={`grid ${getGridClass(symbols.length)} gap-0.5 flex-1 bg-border-primary/20`}>
                {symbols.map((symbol, index) => (
                    <div key={symbol} className="relative bg-bg-primary w-full h-full min-h-[400px]">
                        <div id={`tradingview_${index}`} className="w-full h-full" />
                    </div>
                ))}
            </div>
        </div>
    );
}
