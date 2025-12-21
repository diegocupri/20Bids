import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface User {
    id: string;
    email: string;
    name?: string;
    avatarUrl?: string;
    settings?: {
        theme?: string;
        mvsoThreshold?: number;
        [key: string]: any;
    };
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (token: string, user: User) => void;
    logout: () => void;
    updateUser: (user: Partial<User>) => void;
    isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const storedToken = localStorage.getItem('token');
        const storedUser = localStorage.getItem('user');

        if (storedToken && storedUser) {
            setToken(storedToken);
            setUser(JSON.parse(storedUser));
        }
        setIsLoading(false);
    }, []);

    const login = (newToken: string, newUser: User) => {
        setToken(newToken);
        setUser(newUser);
        localStorage.setItem('token', newToken);
        localStorage.setItem('user', JSON.stringify(newUser));

        // Apply settings immediately on login
        if (newUser.settings?.theme) {
            document.documentElement.setAttribute('data-theme', newUser.settings.theme);
            localStorage.setItem('theme', newUser.settings.theme);
        }
    };

    const logout = () => {
        setToken(null);
        setUser(null);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
    };

    const updateUser = async (updates: Partial<User>) => {
        if (!user || !token) return;

        // Optimistic UI update
        const updatedUser = { ...user, ...updates };
        if (updates.settings) {
            updatedUser.settings = { ...(user.settings || {}), ...updates.settings };
        }

        setUser(updatedUser);
        localStorage.setItem('user', JSON.stringify(updatedUser));

        // Sync with backend if not just local updates?
        // Actually ProfileModal calls API directly then calls this.
        // But for things like Theme/Filters, we might want this function to call API.
        // Let's make this function handle the API call if it's a settings update, 
        // to simplify standard usage.

        if (updates.settings) {
            try {
                await fetch(`${API_URL}/auth/profile`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ settings: updatedUser.settings })
                });
            } catch (err) {
                console.error("Failed to sync settings:", err);
                // Revert? Nah, keep local for now.
            }
        }
    };

    if (isLoading) {
        return <div className="min-h-screen flex items-center justify-center bg-bg-primary">Loading...</div>;
    }

    return (
        <AuthContext.Provider value={{ user, token, login, logout, updateUser, isAuthenticated: !!token }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
