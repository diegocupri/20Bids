import { useState, memo } from 'react';

interface TickerImageProps {
    symbol: string;
    className?: string;
}

// Memoized component to prevent re-renders when parent updates
export const TickerImage = memo(function TickerImage({ symbol, className = "w-full h-full object-contain" }: TickerImageProps) {
    const [hasError, setHasError] = useState(false);

    if (hasError) {
        // Show fallback letter
        return (
            <span className="text-xs font-bold text-text-primary">
                {symbol[0]}
            </span>
        );
    }

    return (
        <img
            src={`https://financialmodelingprep.com/image-stock/${symbol}.png`}
            alt={symbol}
            className={className}
            loading="lazy"
            onError={() => {
                setHasError(true);
            }}
        />
    );
});
