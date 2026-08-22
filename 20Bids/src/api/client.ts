import { format } from 'date-fns';

export const API_URL = 'https://two0bids-api.onrender.com/api'; // Correct URL
// const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
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
    minProb: number = 0,
    startDate?: Date | null,
    endDate?: Date | null
) => {
    const params: Record<string, string> = {
        tp: tp.toString(),
        sl: sl.toString(),
        minVol: minVol.toString(),
        minPrice: minPrice.toString(),
        minProb: minProb.toString()
    };

    if (startDate) params.startDate = startDate.toISOString();
    if (endDate) params.endDate = endDate.toISOString();

    const queryParams = new URLSearchParams(params);
    const response = await fetch(`${API_URL}/stats/analysis?${queryParams}`);
    if (!response.ok) throw new Error('Failed to fetch analysis data');
    return response.json();
};

/** La cabecera x-api-key sale de VITE_UPLOAD_API_KEY, no del codigo.
 *
 *  Antes iba hardcodeada como 'dev-api-key-change-in-production', y funcionaba
 *  por el peor motivo posible: el endpoint no comprobaba la clave en absoluto,
 *  asi que cualquiera en internet podia inyectar recomendaciones. Ahora el
 *  servidor la valida (requireAdmin), asi que tiene que ser la real — y la real
 *  no se commitea. Ponla en `.env.local`, que ya esta cubierto por el
 *  .gitignore de este repo (patron *.local):
 *
 *      VITE_UPLOAD_API_KEY=<el mismo valor que UPLOAD_API_KEY en Render>
 *
 *  Esta es la via por la que entran los picks diarios: si la clave falla, la
 *  subida devuelve 401 y ese dia no hay picks. El throw de abajo lo dice en
 *  claro en vez de dejarte un JSON de error silencioso. */
export const uploadRecommendations = async (formData: FormData) => {
    const apiKey = import.meta.env.VITE_UPLOAD_API_KEY;
    if (!apiKey) {
        throw new Error(
            'Falta VITE_UPLOAD_API_KEY. Crea .env.local con VITE_UPLOAD_API_KEY=<UPLOAD_API_KEY de Render> y reinicia `npm run dev`.',
        );
    }
    const response = await fetch(`${API_URL}/recommendations/upload`, {
        method: 'POST',
        headers: { 'x-api-key': apiKey },
        body: formData
    });
    if (response.status === 401 || response.status === 403) {
        throw new Error('La API rechazo la clave de subida (401/403). VITE_UPLOAD_API_KEY no coincide con UPLOAD_API_KEY en Render.');
    }
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

export interface TradeLog {
    id: number;
    symbol: string;
    quantity: number;
    entryPrice: number;
    takeProfitPrice: number;
    stopLossPrice: number;
    parentOrderId: number;
    tpOrderId: number;
    slOrderId: number;
    status: string;
    errorMessage?: string;
    executedAt: string;
}

export const fetchTradeLogs = async (): Promise<TradeLog[]> => {
    try {
        const response = await fetch(`${API_URL}/trading/logs`);
        if (!response.ok) return [];
        return response.json();
    } catch (error) {
        console.error('Failed to fetch trade logs:', error);
        return [];
    }
};
