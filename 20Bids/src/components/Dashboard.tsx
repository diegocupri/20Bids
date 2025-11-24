import { useState, useMemo } from 'react';
import { RecommendationsTable } from './RecommendationsTable';
import { RecommendationDetail } from './RecommendationDetail';
import { MarketContext } from './MarketContext';
import type { Recommendation } from '../data/mockData';
import { generateMockData } from '../data/mockData';

import { useMarketSimulator } from '../hooks/useMarketSimulator';

interface DashboardProps {
    selectedDate?: string;
    searchQuery?: string;
}

export function Dashboard({ selectedDate = new Date().toISOString().split('T')[0], searchQuery = '' }: DashboardProps) {
    const [selectedRec, setSelectedRec] = useState<Recommendation | null>(null);

    // Initial static data generation
    const initialData = useMemo(() => generateMockData(selectedDate), [selectedDate]);

    // Live simulation
    const { indices, data: liveData } = useMarketSimulator(initialData);

    // Filter logic applied to LIVE data
    const filteredData = useMemo(() => {
        return liveData.filter(rec =>
            rec.ticker.toLowerCase().includes(searchQuery.toLowerCase()) ||
            rec.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            rec.sector.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [liveData, searchQuery]);

    // Reset selection when date changes
    useMemo(() => {
        setSelectedRec(null);
    }, [selectedDate]);



    return (
        <div className="h-full flex flex-col gap-4 bg-[var(--bg-primary)] text-[var(--text-primary)] transition-colors duration-300">
            {/* Top Section: Table + Detail (70% height) */}
            <div className="flex-1 min-h-0 flex gap-4">
                <div className={`transition-all duration-300 ease-in-out ${selectedRec ? 'w-[65%]' : 'w-full'}`}>
                    <RecommendationsTable
                        data={filteredData}
                        onSelect={setSelectedRec}
                        selectedId={selectedRec?.id}
                    />
                </div>

                {selectedRec && (
                    <div className="w-[35%] min-w-[400px] animate-in slide-in-from-right-4 duration-300">
                        <RecommendationDetail
                            recommendation={selectedRec}
                            onClose={() => setSelectedRec(null)}
                        />
                    </div>
                )}
            </div>

            {/* Bottom Section: Market Context (30% height) */}
            <div className="h-[30%] min-h-[250px]">
                <MarketContext indices={indices} />
            </div>
        </div>
    );
}
