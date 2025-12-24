import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';



export type ThemeId = 'polar' | 'midnight';

export function ThemeSelector() {
    const { user, updateUser } = useAuth();
    // Default to 'polar'
    const [theme, setTheme] = useState<ThemeId>('polar');

    useEffect(() => {
        // Force reset to Polar if not on v1
        const currentVersion = 'v1_polar_default';
        const storedVersion = localStorage.getItem('theme_version');

        if (storedVersion !== currentVersion) {
            // First time on new version: Force Polar
            setTheme('polar');
            localStorage.setItem('theme', 'polar');
            localStorage.setItem('theme_version', currentVersion);
        } else {
            // Restore saved preference
            const savedTheme = (user?.settings?.theme as ThemeId) || (localStorage.getItem('theme') as ThemeId);
            if (savedTheme === 'midnight' || savedTheme === 'polar') {
                setTheme(savedTheme);
            }
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

    const toggleTheme = () => {
        setTheme(prev => prev === 'polar' ? 'midnight' : 'polar');
    };

    return (
        <button
            onClick={toggleTheme}
            className="p-2 rounded-md hover:bg-bg-tertiary transition-colors text-text-secondary hover:text-accent-primary flex items-center gap-2"
            title={theme === 'polar' ? 'Switch to Midnight' : 'Switch to Polar'}
        >
            {theme === 'polar' ? (
                <>
                    <Moon className="h-4 w-4" />
                    <span className="text-xs font-medium hidden md:block">Midnight</span>
                </>
            ) : (
                <>
                    <Sun className="h-4 w-4" />
                    <span className="text-xs font-medium hidden md:block">Polar</span>
                </>
            )}
        </button>
    );
}
