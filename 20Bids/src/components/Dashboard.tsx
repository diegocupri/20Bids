import { useState, useCallback, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { RecommendationsTable } from './RecommendationsTable';
import { TickerDetailsPanel } from './TickerDetailsPanel';
import { SkeletonTable } from './SkeletonTable';

import { fetchDates } from '../api/client';

export function Dashboard() {
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [calculatorData, setCalculatorData] = useState<{ ticker: string, price: number, sector: string } | null>(null);
    const [isPanelOpen, setIsPanelOpen] = useState(false);
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
        setIsPanelOpen(true);
    };

    return (
        <div className="flex h-screen bg-bg-primary overflow-hidden">
            <Sidebar
                selectedDate={selectedDate}
                onDateSelect={handleDateSelect}
                mvsoThreshold={mvsoThreshold}
            />

            <div className="flex-1 flex flex-col min-w-0 relative">
                <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
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
                    </div>
                </div>

                {/* Side Panel */}
                <TickerDetailsPanel
                    isOpen={isPanelOpen}
                    onClose={() => setIsPanelOpen(false)}
                    recommendations={recommendations}
                    selectedTicker={calculatorData?.ticker || null}
                    selectedPrice={calculatorData?.price || null}
                    selectedSector={calculatorData?.sector || null}
                />
            </div>
        </div>
    );
}

