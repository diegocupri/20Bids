import React, { useState } from 'react';
import { Sidebar } from '../components/Sidebar';
import { getUniqueDates } from '../data/mockData';

interface MainLayoutProps {
    children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
    const dates = getUniqueDates();
    const [selectedDate, setSelectedDate] = useState(dates[0]);
    const [searchQuery, setSearchQuery] = useState('');

    return (
        <div className="min-h-screen bg-bloomberg-black text-gray-200 flex font-sans">
            <Sidebar
                dates={dates}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
                searchQuery={searchQuery}
                onSearch={setSearchQuery}
            />
            <main className="flex-1 ml-64 min-h-screen bg-bloomberg-black">
                {/* Pass selectedDate to children via context or props if needed, 
            but for now we'll just render children. 
            In a real app, we might use Context or specific props. */}
                {React.Children.map(children, child => {
                    if (React.isValidElement(child)) {
                        // @ts-ignore - injecting prop
                        return React.cloneElement(child, { selectedDate, searchQuery });
                    }
                    return child;
                })}
            </main>
        </div>
    );
}
