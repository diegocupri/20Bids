import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Sidebar } from './Sidebar';
import { RecommendationsTable } from './RecommendationsTable';
import { TickerDetailsPanel } from './TickerDetailsPanel';
import { SkeletonTable } from './SkeletonTable';

import { fetchDates } from '../api/client';

export function Dashboard() {
    const { user, updateUser } = useAuth();
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [calculatorData, setCalculatorData] = useState<{ ticker: string, price: number, sector: string } | null>(null);
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [recommendations, setRecommendations] = useState<any[]>([]);
    const [mvsoThreshold, setMvsoThreshold] = useState<number>(0.5);

    // Load initial settings
    useEffect(() => {
        const saved = user?.settings?.mvsoThreshold ?? localStorage.getItem('mvsoThreshold');
        if (saved !== undefined && saved !== null) {
            setMvsoThreshold(Number(saved));
        }
    }, [user]);

    // Save settings when changed
    const handleThresholdChange = (val: number) => {
        setMvsoThreshold(val);
        localStorage.setItem('mvsoThreshold', val.toString());
        if (user) {
            // Debounce could be good here, but for now direct update is fine for a infrequent action
            updateUser({ settings: { ...user.settings, mvsoThreshold: val } });
        }
    };

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

            <div className="flex-1 flex flex-col min-h-0 min-w-0 relative">
                <div className="flex-1 min-h-0 overflow-hidden">
                    {isLoading ? (
                        <SkeletonTable />
                    ) : (
                        <RecommendationsTable
                            selectedDate={selectedDate}
                            onRowClick={handleRowClick}
                            onDataLoaded={handleDataLoaded}
                            mvsoThreshold={mvsoThreshold}
                            onMvsoThresholdChange={handleThresholdChange}
                        />
                    )}
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
