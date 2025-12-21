import { useState, useCallback, useRef, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { RecommendationsTable } from './RecommendationsTable';
import { MarketContext } from './MarketContext';
import { SkeletonTable } from './SkeletonTable';

import { fetchDates } from '../api/client';

export function Dashboard() {
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [calculatorData, setCalculatorData] = useState<{ ticker: string, price: number, sector: string } | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [recommendations, setRecommendations] = useState<any[]>([]);
    const [mvsoThreshold, setMvsoThreshold] = useState<number>(() => {
        const saved = localStorage.getItem('mvsoThreshold');
        return saved ? parseFloat(saved) : 0.5;
    });

    // Initial Date Load
    useEffect(() => {
        const initDate = async () => {
            try {
                const dates = await fetchDates();
                if (dates.length > 0) {
                    // Dates are assumed sorted desc from backend
                    setSelectedDate(dates[0]);
                }
            } catch (err) {
                console.error("Failed to load dates for defaults", err);
            }
        };
        initDate();
    }, []);

    // Resizable Panel State
    const [panelHeight, setPanelHeight] = useState(30); // Percentage
    const isDragging = useRef(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleDateSelect = (date: Date) => {
        setIsLoading(true);
        setSelectedDate(date);
        setTimeout(() => setIsLoading(false), 500);
    };

    const handleDataLoaded = useCallback((data: any[]) => {
        setRecommendations(data);
    }, []);

    const handleRowClick = (rec: any) => {
        setCalculatorData({
            ticker: rec.symbol,
            price: rec.price || 0,
            sector: rec.sector
        });
    };

    // Resize Handlers
    const handleMouseDown = () => {
        isDragging.current = true;
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging.current || !containerRef.current) return;

        const containerHeight = containerRef.current.clientHeight;
        const newHeight = ((containerHeight - e.clientY) / containerHeight) * 100;

        // Clamp height between 10% and 80%
        if (newHeight >= 10 && newHeight <= 80) {
            setPanelHeight(newHeight);
        }
    }, []);

    const handleMouseUp = useCallback(() => {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }, []);

    useEffect(() => {
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleMouseMove, handleMouseUp]);

    return (
        <div className="flex h-screen bg-bg-primary overflow-hidden" ref={containerRef}>
            <Sidebar
                selectedDate={selectedDate}
                onDateSelect={handleDateSelect}
                mvsoThreshold={mvsoThreshold}
            />

            <div className="flex-1 flex flex-col min-w-0">
                <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex-1 flex flex-col min-w-0 border-r border-border-primary overflow-hidden">
                        {isLoading ? (
                            <SkeletonTable />
                        ) : (
                            <RecommendationsTable
                                selectedDate={selectedDate}
                                onRowClick={handleRowClick}
                                onDataLoaded={handleDataLoaded}
                                mvsoThreshold={mvsoThreshold}
                                onMvsoThresholdChange={setMvsoThreshold}
                            />
                        )}

                        {/* Resizable Handle */}
                        <div
                            className="h-1 bg-border-primary hover:bg-accent-primary cursor-row-resize transition-colors w-full"
                            onMouseDown={handleMouseDown}
                        />

                        {/* Bottom Panel */}
                        <div style={{ height: `${panelHeight}%` }} className="border-t border-border-primary transition-none">
                            <MarketContext
                                recommendations={recommendations}
                                selectedTicker={calculatorData?.ticker}
                                selectedPrice={calculatorData?.price}
                                selectedSector={calculatorData?.sector}
                                selectedDate={selectedDate}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
