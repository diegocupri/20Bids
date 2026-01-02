/**
 * Trading Config Modal Component
 * 
 * Modal popup for managing automated trading configuration.
 * Light theme design matching the app.
 */

import { useState, useEffect } from 'react';
import { X, Settings, Save, AlertTriangle, Clock, DollarSign, TrendingUp, RefreshCw, Zap, ChevronDown, Info } from 'lucide-react';

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

interface TradingModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export default function TradingModal({ isOpen, onClose }: TradingModalProps) {
    const [config, setConfig] = useState<TradingConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [showDocs, setShowDocs] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchConfig();
        }
    }, [isOpen]);

    const fetchConfig = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/trading/config`);
            const data = await res.json();
            setConfig(data);
            setMessage(null);
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
                setTimeout(() => onClose(), 1500);
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

    if (!isOpen) return null;

    const spainHour = config ? (config.executionHour + 6) % 24 : 16;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto mx-4 border border-gray-200">
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-200">
                            <Settings className="text-white" size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">Trading Automation</h2>
                            <p className="text-sm text-gray-500">IBKR Auto-Trader Configuration</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {config && (
                            <button
                                onClick={() => updateField('enabled', !config.enabled)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm transition-all ${config.enabled
                                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                                        : 'bg-gray-100 text-gray-500 border border-gray-200'
                                    }`}
                            >
                                <Zap size={16} className={config.enabled ? 'animate-pulse' : ''} />
                                {config.enabled ? 'ACTIVE' : 'INACTIVE'}
                            </button>
                        )}
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6">
                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <RefreshCw className="animate-spin text-violet-500" size={40} />
                        </div>
                    ) : !config ? (
                        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl">
                            Failed to load configuration. Is the backend running?
                        </div>
                    ) : (
                        <>
                            {message && (
                                <div className={`mb-6 p-4 rounded-xl text-sm font-medium ${message.type === 'success'
                                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                                        : 'bg-rose-50 border border-rose-200 text-rose-700'
                                    }`}>
                                    {message.text}
                                </div>
                            )}

                            {/* Config Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                                {/* Order Settings */}
                                <div className="bg-violet-50/50 rounded-xl p-4 border border-violet-100">
                                    <h3 className="text-xs font-bold text-violet-600 uppercase tracking-wider flex items-center gap-2 mb-4">
                                        <TrendingUp size={14} />
                                        Orders
                                    </h3>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-xs text-gray-600 mb-1.5">Take Profit %</label>
                                            <input
                                                type="number"
                                                step="0.5"
                                                value={config.takeProfit}
                                                onChange={(e) => updateField('takeProfit', parseFloat(e.target.value) || 0)}
                                                className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs text-gray-600 mb-1.5">Stop Loss %</label>
                                            <input
                                                type="number"
                                                step="0.5"
                                                value={config.stopLoss}
                                                onChange={(e) => updateField('stopLoss', parseFloat(e.target.value) || 0)}
                                                className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs text-gray-600 mb-1.5">Max Stocks</label>
                                            <input
                                                type="number"
                                                value={config.maxStocks}
                                                onChange={(e) => updateField('maxStocks', parseInt(e.target.value) || 10)}
                                                className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Filter Settings */}
                                <div className="bg-emerald-50/50 rounded-xl p-4 border border-emerald-100">
                                    <h3 className="text-xs font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-2 mb-4">
                                        <DollarSign size={14} />
                                        Filters
                                    </h3>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-xs text-gray-600 mb-1.5">Min Volume ($)</label>
                                            <input
                                                type="number"
                                                step="100000"
                                                value={config.minVolume}
                                                onChange={(e) => updateField('minVolume', parseFloat(e.target.value) || 0)}
                                                className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                            />
                                            <span className="text-xs text-gray-400">{(config.minVolume / 1000000).toFixed(1)}M</span>
                                        </div>

                                        <div>
                                            <label className="block text-xs text-gray-600 mb-1.5">Min Price ($)</label>
                                            <input
                                                type="number"
                                                step="1"
                                                value={config.minPrice}
                                                onChange={(e) => updateField('minPrice', parseFloat(e.target.value) || 0)}
                                                className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs text-gray-600 mb-1.5">Skip if Gain &gt; %</label>
                                            <input
                                                type="number"
                                                step="0.5"
                                                value={config.maxGainSkip}
                                                onChange={(e) => updateField('maxGainSkip', parseFloat(e.target.value) || 0)}
                                                className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                            />
                                        </div>

                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={config.prioritizeBelowRef}
                                                onChange={(e) => updateField('prioritizeBelowRef', e.target.checked)}
                                                className="w-4 h-4 rounded border-gray-300 text-emerald-500 focus:ring-emerald-500"
                                            />
                                            <span className="text-xs text-gray-600">Prioritize below ref</span>
                                        </label>
                                    </div>
                                </div>

                                {/* Execution Settings */}
                                <div className="bg-amber-50/50 rounded-xl p-4 border border-amber-100">
                                    <h3 className="text-xs font-bold text-amber-600 uppercase tracking-wider flex items-center gap-2 mb-4">
                                        <Clock size={14} />
                                        Execution
                                    </h3>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-xs text-gray-600 mb-1.5">Time (ET)</label>
                                            <div className="flex gap-2 items-center">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="23"
                                                    value={config.executionHour}
                                                    onChange={(e) => updateField('executionHour', parseInt(e.target.value) || 0)}
                                                    className="w-16 px-2 py-2.5 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 text-center"
                                                />
                                                <span className="text-gray-400 font-bold">:</span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="59"
                                                    value={config.executionMinute}
                                                    onChange={(e) => updateField('executionMinute', parseInt(e.target.value) || 0)}
                                                    className="w-16 px-2 py-2.5 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 text-center"
                                                />
                                            </div>
                                            <span className="text-xs text-amber-600">= {spainHour}:{String(config.executionMinute).padStart(2, '0')} Spain</span>
                                        </div>

                                        <div>
                                            <label className="block text-xs text-gray-600 mb-1.5">Retry Interval (min)</label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={config.retryIntervalMinutes}
                                                onChange={(e) => updateField('retryIntervalMinutes', parseInt(e.target.value) || 1)}
                                                className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs text-gray-600 mb-1.5">Max Retries</label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={config.maxRetries}
                                                onChange={(e) => updateField('maxRetries', parseInt(e.target.value) || 10)}
                                                className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Documentation Section */}
                            <div className="bg-gradient-to-r from-gray-50 to-violet-50 rounded-xl border border-gray-200 mb-6 overflow-hidden">
                                <button
                                    onClick={() => setShowDocs(!showDocs)}
                                    className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-100/50 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <Info size={18} className="text-violet-500" />
                                        <span className="text-sm font-medium text-gray-700">Cómo funciona el Auto-Trader</span>
                                    </div>
                                    <ChevronDown size={18} className={`text-gray-400 transition-transform ${showDocs ? 'rotate-180' : ''}`} />
                                </button>

                                {showDocs && (
                                    <div className="px-4 pb-4 space-y-3 text-xs text-gray-600 border-t border-gray-200 pt-4">
                                        <div className="flex gap-3">
                                            <span className="text-violet-500 font-bold">1.</span>
                                            <div>
                                                <strong className="text-gray-800">Filtrado:</strong> Vol &gt; {(config.minVolume / 1e6).toFixed(1)}M, Price &gt; ${config.minPrice}, Gain ≤ {config.maxGainSkip}% (precio LIVE vs refPrice1020)
                                            </div>
                                        </div>
                                        <div className="flex gap-3">
                                            <span className="text-emerald-500 font-bold">2.</span>
                                            <div>
                                                <strong className="text-gray-800">Posición:</strong> Máx 20% del portfolio por stock (basado en Net Liquidation Value)
                                            </div>
                                        </div>
                                        <div className="flex gap-3">
                                            <span className="text-amber-500 font-bold">3.</span>
                                            <div>
                                                <strong className="text-gray-800">Órdenes:</strong> LIMIT BUY +0.1% del precio live. Si empieza a llenar → mantener. Si no → reintentar (+0.3% tras 5 intentos, +0.5% tras 8)
                                            </div>
                                        </div>
                                        <div className="flex gap-3">
                                            <span className="text-rose-500 font-bold">4.</span>
                                            <div>
                                                <strong className="text-gray-800">TP/SL:</strong> OCA (One-Cancels-All). TP: LIMIT SELL +{config.takeProfit}%, SL: STOP SELL -{config.stopLoss}%
                                            </div>
                                        </div>
                                        <div className="mt-3 pt-3 border-t border-gray-200 text-gray-500">
                                            ⏰ Ejecuta L-V a las {spainHour}:{String(config.executionMinute).padStart(2, '0')} España ({config.executionHour}:{String(config.executionMinute).padStart(2, '0')} ET) via LaunchAgent
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Warning */}
                            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                                <AlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={18} />
                                <div className="text-xs text-amber-700">
                                    <strong>Importante:</strong> Requiere IB Gateway corriendo en tu Mac. El script se ejecuta automáticamente vía LaunchAgent a la hora configurada (L-V).
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                {config && !loading && (
                    <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end gap-3 rounded-b-2xl">
                        <button
                            onClick={onClose}
                            className="px-5 py-2.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={saveConfig}
                            disabled={saving}
                            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50 shadow-lg shadow-violet-200"
                        >
                            {saving ? (
                                <RefreshCw className="animate-spin" size={16} />
                            ) : (
                                <Save size={16} />
                            )}
                            Save Config
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
