import { useEffect, useRef, useState } from 'react';

let tvScriptLoadingPromise: Promise<void> | null = null;

export function TradingViewWidget({ symbol }: { symbol: string }) {
    const onLoadScriptRef = useRef<(() => void) | null>(null);
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');

    useEffect(() => {
        // Initial theme check
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const isLight = currentTheme === 'polar';
        setTheme(isLight ? 'light' : 'dark');

        // Observer for theme changes
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
                    const currentTheme = document.documentElement.getAttribute('data-theme');
                    // Map 'polar' to 'light', everything else to 'dark'
                    const newTheme = currentTheme === 'polar' ? 'light' : 'dark';
                    setTheme(newTheme);
                }
            });
        });

        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme'],
        });

        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        onLoadScriptRef.current = createWidget;

        if (!tvScriptLoadingPromise) {
            tvScriptLoadingPromise = new Promise((resolve) => {
                const script = document.createElement('script');
                script.id = 'tradingview-widget-loading-script';
                script.src = 'https://s3.tradingview.com/tv.js';
                script.type = 'text/javascript';
                script.onload = resolve as any;
                document.head.appendChild(script);
            });
        }

        tvScriptLoadingPromise.then(() => onLoadScriptRef.current && onLoadScriptRef.current());

        return () => {
            onLoadScriptRef.current = null;
        };

        function createWidget() {
            if (document.getElementById('tradingview_widget') && 'TradingView' in window) {
                new (window as any).TradingView.widget({
                    autosize: true,
                    symbol: symbol,
                    interval: "D",
                    timezone: "Etc/UTC",
                    theme: theme,
                    style: "1",
                    locale: "en",
                    enable_publishing: false,
                    allow_symbol_change: true,
                    container_id: "tradingview_widget"
                });
            }
        }
    }, [symbol, theme]); // Re-run when symbol or theme changes

    return (
        <div className='tradingview-widget-container' style={{ height: "100%", width: "100%" }}>
            <div id='tradingview_widget' style={{ height: "100%", width: "100%" }} />
        </div>
    );
}
