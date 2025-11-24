import { Search } from 'lucide-react';
import { cn } from '../lib/utils';
import { format, parseISO } from 'date-fns';
import { ThemeToggle } from './ThemeToggle';

interface SidebarProps {
    dates: string[];
    selectedDate: string;
    onSelectDate: (date: string) => void;
    searchQuery: string;
    onSearch: (query: string) => void;
}

export function Sidebar({ dates, selectedDate, onSelectDate, searchQuery, onSearch }: SidebarProps) {
    return (
        <div className="w-64 bg-bg-primary border-r border-border-primary h-screen flex flex-col fixed left-0 top-0 font-mono text-sm transition-colors duration-300">
            <div className="p-4 border-b border-border-primary">
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-accent-primary" />
                    <input
                        type="text"
                        placeholder="SEARCH >>"
                        value={searchQuery}
                        onChange={(e) => onSearch(e.target.value)}
                        className="w-full bg-bg-secondary text-accent-primary placeholder:text-text-secondary pl-9 pr-4 py-2 border border-border-primary focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary uppercase tracking-wider text-xs rounded-none"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto py-2">
                <div className="px-3 mb-2 text-[10px] font-bold text-accent-secondary uppercase tracking-widest border-b border-border-primary pb-1 mx-2">
                    Daily Reports
                </div>
                <div className="space-y-0 px-0">
                    {dates.map((date) => {
                        const isSelected = date === selectedDate;
                        return (
                            <button
                                key={date}
                                onClick={() => onSelectDate(date)}
                                className={cn(
                                    "w-full text-left px-4 py-3 text-xs transition-colors flex items-center gap-3 border-l-2",
                                    isSelected
                                        ? "bg-bg-secondary text-accent-primary border-accent-primary font-bold"
                                        : "text-text-secondary border-transparent hover:bg-bg-secondary hover:text-text-primary"
                                )}
                            >
                                <span className="text-accent-secondary opacity-50">{format(parseISO(date), 'dd')}</span>
                                <div className="flex flex-col">
                                    <span className="uppercase tracking-wider">{format(parseISO(date), 'MMM yyyy')}</span>
                                    <span className="text-[10px] text-text-secondary font-normal uppercase">
                                        {format(parseISO(date), 'EEEE')}
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="p-4 border-t border-border-primary flex justify-between items-center bg-bg-secondary/30">
                <span className="text-[10px] text-text-secondary uppercase tracking-widest">v2.1.0</span>
                <ThemeToggle />
            </div>
        </div>
    );
}
