/**
 * Trading Config Panel Component
 * 
 * UI for managing automated trading configuration.
 */

import { useState, useEffect } from 'react';
import { Settings, Save, AlertTriangle, Clock, DollarSign, TrendingUp, RefreshCw } from 'lucide-react';

interface TradingConfig {
    id: number;
    takeProfit: number;
    stopLoss: number;
    maxStocks: number;
    minVolume: number;
    minPrice: number;
    maxGainSkip: number;
    prioritizeBelowRef: boolean;
    retryIntervalMinutes: number;
    maxRetries: number;
    executionHour: number;
    executionMinute: number;
    enabled: boolean;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export default function TradingConfigPanel() {
    const [config, setConfig] = useState<TradingConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        fetchConfig();
    }, []);

    const fetchConfig = async () => {
        try {
            const res = await fetch(`${API_URL}/trading/config`);
            const data = await res.json();
            setConfig(data);
        } catch (error) {
            console.error('Failed to fetch trading config:', error);
            setMessage({ type: 'error', text: 'Failed to load configuration' });
        } finally {
            setLoading(false);
        }
    };

    const saveConfig = async () => {
        if (!config) return;

        setSaving(true);
        setMessage(null);

        try {
            const res = await fetch(`${API_URL}/trading/config`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config),
            });

            if (res.ok) {
                const data = await res.json();
                setConfig(data);
                setMessage({ type: 'success', text: 'Configuration saved!' });
            } else {
                setMessage({ type: 'error', text: 'Failed to save configuration' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to save configuration' });
        } finally {
            setSaving(false);
        }
    };

    const updateField = (field: keyof TradingConfig, value: any) => {
        if (!config) return;
        setConfig({ ...config, [field]: value });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <RefreshCw className="animate-spin text-gray-400" size={24} />
            </div>
        );
    }

    if (!config) {
        return (
            <div className="p-4 bg-rose-50 text-rose-600 rounded-lg">
                Failed to load trading configuration.
            </div>
        );
    }

    // Convert ET time to Spain time (ET + 6h)
    const spainHour = (config.executionHour + 6) % 24;

    return (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                        <Settings className="text-white" size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">Trading Automation</h2>
                        <p className="text-sm text-gray-500">Configure auto-trading with IBKR</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <span className={`text-sm font-medium ${config.enabled ? 'text-emerald-600' : 'text-gray-500'}`}>
                            {config.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                        <button
                            onClick={() => updateField('enabled', !config.enabled)}
                            className={`relative w-12 h-6 rounded-full transition-colors ${config.enabled ? 'bg-emerald-500' : 'bg-gray-300'
                                }`}
                        >
                            <span
                                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${config.enabled ? 'translate-x-6' : ''
                                    }`}
                            />
                        </button>
                    </label>
                </div>
            </div>

            {message && (
                <div className={`mb-4 p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                    }`}>
                    {message.text}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Order Settings */}
                <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
                        <TrendingUp size={16} />
                        Order Settings
                    </h3>

                    <div>
                        <label className="block text-sm text-gray-600 mb-1">Take Profit (%)</label>
                        <input
                            type="number"
                            step="0.5"
                            value={config.takeProfit}
                            onChange={(e) => updateField('takeProfit', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-gray-600 mb-1">Stop Loss (%)</label>
                        <input
                            type="number"
                            step="0.5"
                            value={config.stopLoss}
                            onChange={(e) => updateField('stopLoss', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-gray-600 mb-1">Max Stocks</label>
                        <input
                            type="number"
                            value={config.maxStocks}
                            onChange={(e) => updateField('maxStocks', parseInt(e.target.value) || 10)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                </div>

                {/* Filter Settings */}
                <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
                        <DollarSign size={16} />
                        Filters
                    </h3>

                    <div>
                        <label className="block text-sm text-gray-600 mb-1">Min Volume ($)</label>
                        <input
                            type="number"
                            step="100000"
                            value={config.minVolume}
                            onChange={(e) => updateField('minVolume', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <span className="text-xs text-gray-400">{(config.minVolume / 1000000).toFixed(1)}M</span>
                    </div>

                    <div>
                        <label className="block text-sm text-gray-600 mb-1">Min Price ($)</label>
                        <input
                            type="number"
                            step="1"
                            value={config.minPrice}
                            onChange={(e) => updateField('minPrice', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-gray-600 mb-1">Skip if gained more than (%)</label>
                        <input
                            type="number"
                            step="0.5"
                            value={config.maxGainSkip}
                            onChange={(e) => updateField('maxGainSkip', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={config.prioritizeBelowRef}
                            onChange={(e) => updateField('prioritizeBelowRef', e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-600">Prioritize stocks below ref price</span>
                    </label>
                </div>

                {/* Execution Settings */}
                <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
                        <Clock size={16} />
                        Execution
                    </h3>

                    <div>
                        <label className="block text-sm text-gray-600 mb-1">Execution Time (ET)</label>
                        <div className="flex gap-2">
                            <input
                                type="number"
                                min="0"
                                max="23"
                                value={config.executionHour}
                                onChange={(e) => updateField('executionHour', parseInt(e.target.value) || 0)}
                                className="w-20 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                            <span className="text-gray-400 self-center">:</span>
                            <input
                                type="number"
                                min="0"
                                max="59"
                                value={config.executionMinute}
                                onChange={(e) => updateField('executionMinute', parseInt(e.target.value) || 0)}
                                className="w-20 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                        <span className="text-xs text-gray-400">= {spainHour}:{String(config.executionMinute).padStart(2, '0')} Spain</span>
                    </div>

                    <div>
                        <label className="block text-sm text-gray-600 mb-1">Retry Interval (min)</label>
                        <input
                            type="number"
                            min="1"
                            value={config.retryIntervalMinutes}
                            onChange={(e) => updateField('retryIntervalMinutes', parseInt(e.target.value) || 1)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-gray-600 mb-1">Max Retries</label>
                        <input
                            type="number"
                            min="1"
                            value={config.maxRetries}
                            onChange={(e) => updateField('maxRetries', parseInt(e.target.value) || 10)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                </div>
            </div>

            {/* Auto-Trader Logic Documentation */}
            <details className="mt-6 bg-gradient-to-r from-slate-50 to-blue-50 border border-slate-200 rounded-lg">
                <summary className="px-4 py-3 cursor-pointer text-sm font-semibold text-slate-700 hover:text-slate-900 flex items-center gap-2">
                    <span className="text-lg">📖</span>
                    <span>Lógica del Auto-Trader (click para expandir)</span>
                </summary>
                <div className="px-4 pb-4 text-sm text-slate-600 space-y-3">
                    <div className="border-l-4 border-blue-400 pl-3">
                        <strong className="text-slate-800">1️⃣ Filtrado de Stocks</strong>
                        <ul className="mt-1 ml-4 list-disc">
                            <li>Volumen &gt; {config.minVolume.toLocaleString()}$</li>
                            <li>Precio &gt; ${config.minPrice}</li>
                            <li>Obtiene precios LIVE de Polygon</li>
                            <li>Calcula gain: (precioActual - refPrice1020) / refPrice1020</li>
                            <li>Solo compra si gain ≤ {config.maxGainSkip}% (stock no ha subido mucho)</li>
                        </ul>
                    </div>

                    <div className="border-l-4 border-emerald-400 pl-3">
                        <strong className="text-slate-800">2️⃣ Tamaño de Posición</strong>
                        <ul className="mt-1 ml-4 list-disc">
                            <li>Máximo 20% del portfolio por stock</li>
                            <li>Basado en Net Liquidation Value</li>
                            <li>quantity = maxPerPosition / precioLive</li>
                        </ul>
                    </div>

                    <div className="border-l-4 border-amber-400 pl-3">
                        <strong className="text-slate-800">3️⃣ Colocación de Órdenes (en paralelo)</strong>
                        <ul className="mt-1 ml-4 list-disc">
                            <li>Orden LIMIT BUY al precio live +0.1%</li>
                            <li>Si empieza a llenar (filled &gt; 0) → mantener abierta</li>
                            <li>Si filled = 0 tras 10s → cancelar y reintentar</li>
                            <li>Buffer progresivo: +0.3% tras intento 5, +0.5% tras intento 8</li>
                            <li>Una sola orden activa por stock</li>
                        </ul>
                    </div>

                    <div className="border-l-4 border-purple-400 pl-3">
                        <strong className="text-slate-800">4️⃣ Take Profit & Stop Loss</strong>
                        <ul className="mt-1 ml-4 list-disc">
                            <li>Se colocan como OCA (One-Cancels-All)</li>
                            <li>TP: LIMIT SELL @ entryPrice × (1 + {config.takeProfit}%)</li>
                            <li>SL: STOP SELL @ entryPrice × (1 - {config.stopLoss}%)</li>
                            <li>Cuando uno ejecuta, el otro se cancela automáticamente</li>
                        </ul>
                    </div>

                    <div className="mt-3 text-xs text-slate-500 italic">
                        Ejecución automática: {spainHour.toString().padStart(2, '0')}:{config.executionMinute.toString().padStart(2, '0')} hora España ({config.executionHour}:{config.executionMinute.toString().padStart(2, '0')} ET)
                    </div>
                </div>
            </details>

            {/* Warning */}
            <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
                <AlertTriangle className="text-amber-500 flex-shrink-0" size={20} />
                <div className="text-sm text-amber-700">
                    <strong>Important:</strong> Auto-trading requires IB Gateway running on your machine.
                    Make sure the gateway is connected before enabling.
                </div>
            </div>

            {/* Save Button */}
            <div className="mt-6 flex justify-end">
                <button
                    onClick={saveConfig}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                    {saving ? (
                        <RefreshCw className="animate-spin" size={18} />
                    ) : (
                        <Save size={18} />
                    )}
                    Save Configuration
                </button>
            </div>
        </div>
    );
}
