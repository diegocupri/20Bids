import { useState, useEffect } from 'react';
import type { Recommendation } from '../data/mockData';
import { marketService } from '../services/MarketDataService';

export function useMarketSimulator(initialData: Recommendation[]) {
    const [data, setData] = useState<Recommendation[]>(initialData);
    const [indices, setIndices] = useState([
        { name: 'S&P 500', value: 4785.20, change: 0.45 },
        { name: 'NASDAQ', value: 15120.50, change: 0.82 },
        { name: 'DOW', value: 37450.10, change: 0.12 },
        { name: 'VIX', value: 13.45, change: -2.10 },
        { name: 'US 10Y', value: 4.05, change: 0.05 },
    ]);

    // Update Tickers
    useEffect(() => {
        const interval = setInterval(() => {
            setData(currentData =>
                currentData.map(item => {
                    const quote = marketService.getLiveQuote(item.ticker, item.price);

                    // Update volume cumulatively
                    const newVolume = item.volume + quote.volume;

                    return {
                        ...item,
                        price: quote.price,
                        change: parseFloat(quote.changePercent.toFixed(2)),
                        changePercent: parseFloat(quote.changePercent.toFixed(2)),
                        volume: newVolume
                    };
                })
            );
        }, 1000); // Update every second for "live" feel

        return () => clearInterval(interval);
    }, []);

    // Update Indices (Simulated separately for now, could also use service)
    useEffect(() => {
        const interval = setInterval(() => {
            setIndices(currentIndices =>
                currentIndices.map(index => {
                    const volatility = index.name === 'VIX' ? 0.05 : 0.005;
                    const change = (Math.random() - 0.45) * volatility * index.value;
                    const newValue = index.value + change;

                    return {
                        ...index,
                        value: newValue,
                        change: parseFloat((index.change + (Math.random() - 0.5) * 0.1).toFixed(2))
                    };
                })
            );
        }, 3000);

        return () => clearInterval(interval);
    }, []);

    return { data, indices };
}
