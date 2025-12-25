import { format } from 'date-fns';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
console.log('[Client] Using API URL:', API_URL);

export async function fetchDates(): Promise<Date[]> {
    const res = await fetch(`${API_URL}/dates`);
    const dates = await res.json();
    return dates.map((d: string) => new Date(d));
}

export async function fetchRecommendations(date: Date) {
    const res = await fetch(`${API_URL}/recommendations?date=${date.toISOString()}`);
    return res.json();
}

export async function updateTag(symbol: string, color: string | null) {
    await fetch(`${API_URL}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, color })
    });
}

export async function fetchPrices() {
    const res = await fetch(`${API_URL}/prices`);
    return res.json();
}

export const fetchSectors = async (date?: Date) => {
    const dateStr = date ? format(date, 'yyyy-MM-dd') : '';
    const response = await fetch(`${API_URL}/sectors?date=${dateStr}`);
    if (!response.ok) throw new Error('Failed to fetch sectors');
    return response.json();
};

export const fetchIndices = async () => {
    const response = await fetch(`${API_URL}/indices`);
    if (!response.ok) throw new Error('Failed to fetch indices');
    return response.json();
};

export const fetchMvsoHistory = async (): Promise<Record<string, number[]>> => {
    const response = await fetch(`${API_URL}/stats/mvso-history`);
    if (!response.ok) throw new Error('Failed to fetch MVSO history');
    return response.json();
};

export const fetchAnalysis = async (
    tp: number = 100,
    sl: number = 100,
    minVol: number = 0,
    minPrice: number = 0,
    minProb: number = 0
) => {
    const params = new URLSearchParams({
        tp: tp.toString(),
        sl: sl.toString(),
        minVol: minVol.toString(),
        minPrice: minPrice.toString(),
        minProb: minProb.toString()
    });
    const response = await fetch(`${API_URL}/stats/analysis?${params}`);
    if (!response.ok) throw new Error('Failed to fetch analysis data');
    return response.json();
};

export const uploadRecommendations = async (formData: FormData) => {
    const response = await fetch(`${API_URL}/recommendations/upload`, {
        method: 'POST',
        headers: {
            'x-api-key': 'dev-api-key-change-in-production' // In a real app, this should be handled better, but keeping it simple for now as per current setup
        },
        body: formData
    });
    return response.json();
};

export const fetchTickerNews = async (ticker: string) => {
    const response = await fetch(`${API_URL}/external/news?ticker=${ticker}`);
    if (!response.ok) throw new Error('Failed to fetch news');
    return response.json();
};

export const fetchSocialSentiment = async (ticker: string) => {
    const response = await fetch(`${API_URL}/external/sentiment?ticker=${ticker}`);
    if (!response.ok) throw new Error('Failed to fetch sentiment');
    return response.json();
};

