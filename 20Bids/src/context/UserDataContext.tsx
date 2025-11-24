import React, { createContext, useContext, useEffect, useState } from 'react';

interface UserAnnotation {
    note: string;
    tag: string | null; // Hex color or null
    isWatched: boolean;
}

interface UserDataContextType {
    annotations: Record<string, UserAnnotation>;
    updateNote: (symbol: string, note: string) => void;
    updateTag: (symbol: string, color: string | null) => void;
    toggleWatchlist: (symbol: string) => void;
    getAnnotation: (symbol: string) => UserAnnotation;
}

const UserDataContext = createContext<UserDataContextType | undefined>(undefined);

const STORAGE_KEY = '20bids_user_data';

export function UserDataProvider({ children }: { children: React.ReactNode }) {
    const [annotations, setAnnotations] = useState<Record<string, UserAnnotation>>({});

    // Load from localStorage on mount
    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                setAnnotations(JSON.parse(stored));
            } catch (e) {
                console.error('Failed to parse user data', e);
            }
        }
    }, []);

    // Save to localStorage on change
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(annotations));
    }, [annotations]);

    const getAnnotation = (symbol: string): UserAnnotation => {
        return annotations[symbol] || { note: '', tag: null, isWatched: false };
    };

    const updateNote = (symbol: string, note: string) => {
        setAnnotations((prev) => ({
            ...prev,
            [symbol]: { ...getAnnotation(symbol), note },
        }));
    };

    const updateTag = (symbol: string, color: string | null) => {
        setAnnotations((prev) => ({
            ...prev,
            [symbol]: { ...getAnnotation(symbol), tag: color },
        }));
    };

    const toggleWatchlist = (symbol: string) => {
        setAnnotations((prev) => {
            const current = getAnnotation(symbol);
            return {
                ...prev,
                [symbol]: { ...current, isWatched: !current.isWatched },
            };
        });
    };

    return (
        <UserDataContext.Provider
            value={{ annotations, updateNote, updateTag, toggleWatchlist, getAnnotation }}
        >
            {children}
        </UserDataContext.Provider>
    );
}

export function useUserData() {
    const context = useContext(UserDataContext);
    if (context === undefined) {
        throw new Error('useUserData must be used within a UserDataProvider');
    }
    return context;
}
