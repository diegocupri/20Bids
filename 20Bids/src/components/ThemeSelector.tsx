import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export function ThemeSelector() {
    const { user, updateUser } = useAuth();

    useEffect(() => {
        // Enforce Polar theme always
        const root = window.document.documentElement;
        root.setAttribute('data-theme', 'polar');
        localStorage.setItem('theme', 'polar');
        if (user && user.settings?.theme !== 'polar') {
            updateUser({ settings: { ...user.settings, theme: 'polar' } });
        }
    }, [user]);

    // No render, or just a static Sun icon if desired. User said "deja como único tema disponible el polar"
    // implies no choice needed. I will render nothing or a static indicator if strictly needed, 
    // but the prompt implies removing the *choice*.
    return null;
}
