import { Palette } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';

const themes = [
    { id: 'midnight', name: 'Midnight', colors: ['#09090b', '#09090b', '#27272a'] },
    { id: 'polar', name: 'Polar', colors: ['#ffffff', '#f3f4f6', '#111827'] },
    { id: 'ocean', name: 'Ocean', colors: ['#0f172a', '#1e293b', '#94a3b8'] },
    { id: 'terminal', name: 'Terminal', colors: ['#000000', '#fbbf24', '#22c55e'] },
    { id: 'tradingview', name: 'TradingView', colors: ['#131722', '#2962ff', '#089981'] },
    { id: 'monochrome', name: 'Monochrome', colors: ['#ffffff', '#000000', '#525252'] },
] as const;

export type ThemeId = typeof themes[number]['id'];

export function ThemeSelector() {
    const { user, updateUser } = useAuth();
    const [theme, setTheme] = useState<ThemeId>('midnight');
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        // Priority: User Settings > Local Storage > Default
        const savedTheme = (user?.settings?.theme as ThemeId) || (localStorage.getItem('theme') as ThemeId);
        if (savedTheme && themes.some(t => t.id === savedTheme)) {
            setTheme(savedTheme);
        }
    }, [user]);

    useEffect(() => {
        const root = window.document.documentElement;
        root.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);

        // Sync with user profile if logged in and different
        if (user && user.settings?.theme !== theme) {
            updateUser({ settings: { ...user.settings, theme } });
        }
    }, [theme]);

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="p-2 rounded-md hover:bg-bg-tertiary transition-colors text-text-secondary hover:text-accent-primary flex items-center gap-2"
                title="Change Theme"
            >
                <Palette className="h-4 w-4" />
                <span className="text-xs font-medium hidden md:block">Theme</span>
            </button>

            {isOpen && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />
                    <div className="absolute bottom-full left-0 mb-2 w-48 bg-bg-secondary border border-border-primary rounded-lg shadow-xl p-2 z-50 grid grid-cols-2 gap-2 animate-in fade-in zoom-in-95 duration-200">
                        {themes.map((t) => (
                            <button
                                key={t.id}
                                onClick={() => {
                                    setTheme(t.id);
                                    setIsOpen(false);
                                }}
                                className={cn(
                                    "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                                    theme === t.id
                                        ? "bg-accent-primary text-white"
                                        : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
                                )}
                            >
                                <div
                                    className="w-3 h-3 rounded-full border border-border-primary"
                                    style={{
                                        background: `linear-gradient(135deg, ${t.colors[0]} 50%, ${t.colors[1]} 50%)`
                                    }}
                                />
                                {t.name}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
