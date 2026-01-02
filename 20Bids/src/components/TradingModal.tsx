/**
 * Trading Config Modal Component
 * 
 * Modal popup for managing automated trading configuration.
 * Redesigned with improved aesthetics and documentation.
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

    // Convert ET time to Spain time (ET + 6h)
    const spainHour = config ? (config.executionHour + 6) % 24 : 16;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />

            {/* Modal */}
            <div className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto mx-4 border border-slate-700/50">
                {/* Header */}
                <div className="sticky top-0 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700/50 px-6 py-4 flex items-center justify-between rounded-t-2xl">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
                            <Settings className="text-white" size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Trading Automation</h2>
                            <p className="text-sm text-slate-400">IBKR Auto-Trader Configuration</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {config && (
                            <button
                                onClick={() => updateField('enabled', !config.enabled)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm transition-all ${config.enabled
                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                        : 'bg-slate-700/50 text-slate-400 border border-slate-600/50'
                                    }`}
                            >
                                <Zap size={16} className={config.enabled ? 'animate-pulse' : ''} />
                                {config.enabled ? 'ACTIVE' : 'INACTIVE'}
                            </button>
                        )}
                        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6">
                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <RefreshCw className="animate-spin text-violet-400" size={40} />
                        </div>
                    ) : !config ? (
                        <div className="p-4 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl">
                            Failed to load configuration. Is the backend running?
                        </div>
                    ) : (
                        <>
                            {message && (
                                <div className={`mb-6 p-4 rounded-xl text-sm font-medium ${message.type === 'success'
                                        ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                                        : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
                                    }`}>
                                    {message.text}
                                </div>
                            )}

                            {/* Config Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                                {/* Order Settings */}
                                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                                    <h3 className="text-xs font-bold text-violet-400 uppercase tracking-wider flex items-center gap-2 mb-4">
                                        <TrendingUp size={14} />
                                        Orders
                                    </h3>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-xs text-slate-400 mb-1.5">Take Profit %</label>
                                            <input
                                                type="number"
                                                step="0.5"
                                                value={config.takeProfit}
                                                onChange={(e) => updateField('takeProfit', parseFloat(e.target.value) || 0)}
                                                className="w-full px-3 py-2.5 text-sm bg-slate-900/50 border border-slate-600/50 rounded-lg text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs text-slate-400 mb-1.5">Stop Loss %</label>
                                            <input
                                                type="number"
                                                step="0.5"
                                                value={config.stopLoss}
                                                onChange={(e) => updateField('stopLoss', parseFloat(e.target.value) || 0)}
                                                className="w-full px-3 py-2.5 text-sm bg-slate-900/50 border border-slate-600/50 rounded-lg text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs text-slate-400 mb-1.5">Max Stocks</label>
                                            <input
                                                type="number"
                                                value={config.maxStocks}
                                                onChange={(e) => updateField('maxStocks', parseInt(e.target.value) || 10)}
                                                className="w-full px-3 py-2.5 text-sm bg-slate-900/50 border border-slate-600/50 rounded-lg text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Filter Settings */}
                                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                                    <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2 mb-4">
                                        <DollarSign size={14} />
                                        Filters
                                    </h3>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-xs text-slate-400 mb-1.5">Min Volume ($)</label>
                                            <input
                                                type="number"
                                                step="100000"
                                                value={config.minVolume}
                                                onChange={(e) => updateField('minVolume', parseFloat(e.target.value) || 0)}
                                                className="w-full px-3 py-2.5 text-sm bg-slate-900/50 border border-slate-600/50 rounded-lg text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                            />
                                            <span className="text-xs text-slate-500">{(config.minVolume / 1000000).toFixed(1)}M</span>
                                        </div>

                                        <div>
                                            <label className="block text-xs text-slate-400 mb-1.5">Min Price ($)</label>
                                            <input
                                                type="number"
                                                step="1"
                                                value={config.minPrice}
                                                onChange={(e) => updateField('minPrice', parseFloat(e.target.value) || 0)}
                                                className="w-full px-3 py-2.5 text-sm bg-slate-900/50 border border-slate-600/50 rounded-lg text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs text-slate-400 mb-1.5">Skip if Gain &gt; %</label>
                                            <input
                                                type="number"
                                                step="0.5"
                                                value={config.maxGainSkip}
                                                onChange={(e) => updateField('maxGainSkip', parseFloat(e.target.value) || 0)}
                                                className="w-full px-3 py-2.5 text-sm bg-slate-900/50 border border-slate-600/50 rounded-lg text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                            />
                                        </div>

                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={config.prioritizeBelowRef}
                                                onChange={(e) => updateField('prioritizeBelowRef', e.target.checked)}
                                                className="w-4 h-4 rounded border-slate-500 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                                            />
                                            <span className="text-xs text-slate-300">Prioritize below ref</span>
                                        </label>
                                    </div>
                                </div>

                                {/* Execution Settings */}
                                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                                    <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2 mb-4">
                                        <Clock size={14} />
                                        Execution
                                    </h3>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-xs text-slate-400 mb-1.5">Time (ET)</label>
                                            <div className="flex gap-2 items-center">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="23"
                                                    value={config.executionHour}
                                                    onChange={(e) => updateField('executionHour', parseInt(e.target.value) || 0)}
                                                    className="w-16 px-2 py-2.5 text-sm bg-slate-900/50 border border-slate-600/50 rounded-lg text-white text-center"
                                                />
                                                <span className="text-slate-500 font-bold">:</span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="59"
                                                    value={config.executionMinute}
                                                    onChange={(e) => updateField('executionMinute', parseInt(e.target.value) || 0)}
                                                    className="w-16 px-2 py-2.5 text-sm bg-slate-900/50 border border-slate-600/50 rounded-lg text-white text-center"
                                                />
                                            </div>
                                            <span className="text-xs text-amber-400/70">= {spainHour}:{String(config.executionMinute).padStart(2, '0')} Spain</span>
                                        </div>

                                        <div>
                                            <label className="block text-xs text-slate-400 mb-1.5">Retry Interval (min)</label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={config.retryIntervalMinutes}
                                                onChange={(e) => updateField('retryIntervalMinutes', parseInt(e.target.value) || 1)}
                                                className="w-full px-3 py-2.5 text-sm bg-slate-900/50 border border-slate-600/50 rounded-lg text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs text-slate-400 mb-1.5">Max Retries</label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={config.maxRetries}
                                                onChange={(e) => updateField('maxRetries', parseInt(e.target.value) || 10)}
                                                className="w-full px-3 py-2.5 text-sm bg-slate-900/50 border border-slate-600/50 rounded-lg text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Documentation Section */}
                            <div className="bg-gradient-to-r from-slate-800/80 to-violet-900/20 rounded-xl border border-slate-700/50 mb-6 overflow-hidden">
                                <button
                                    onClick={() => setShowDocs(!showDocs)}
                                    className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-700/30 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <Info size={18} className="text-violet-400" />
                                        <span className="text-sm font-medium text-slate-200">Cómo funciona el Auto-Trader</span>
                                    </div>
                                    <ChevronDown size={18} className={`text-slate-400 transition-transform ${showDocs ? 'rotate-180' : ''}`} />
                                </button>

                                {showDocs && (
                                    <div className="px-4 pb-4 space-y-3 text-xs text-slate-400 border-t border-slate-700/50 pt-4">
                                        <div className="flex gap-3">
                                            <span className="text-violet-400 font-bold">1.</span>
                                            <div>
                                                <strong className="text-slate-200">Filtrado:</strong> Vol &gt; {(config.minVolume / 1e6).toFixed(1)}M, Price &gt; ${config.minPrice}, Gain ≤ {config.maxGainSkip}% (precio LIVE vs refPrice1020)
                                            </div>
                                        </div>
                                        <div className="flex gap-3">
                                            <span className="text-emerald-400 font-bold">2.</span>
                                            <div>
                                                <strong className="text-slate-200">Posición:</strong> Máx 20% del portfolio por stock (basado en Net Liquidation Value)
                                            </div>
                                        </div>
                                        <div className="flex gap-3">
                                            <span className="text-amber-400 font-bold">3.</span>
                                            <div>
                                                <strong className="text-slate-200">Órdenes:</strong> LIMIT BUY +0.1% del precio live. Si empieza a llenar → mantener. Si no → reintentar (+0.3% tras 5 intentos, +0.5% tras 8)
                                            </div>
                                        </div>
                                        <div className="flex gap-3">
                                            <span className="text-rose-400 font-bold">4.</span>
                                            <div>
                                                <strong className="text-slate-200">TP/SL:</strong> OCA (One-Cancels-All). TP: LIMIT SELL +{config.takeProfit}%, SL: STOP SELL -{config.stopLoss}%
                                            </div>
                                        </div>
                                        <div className="mt-3 pt-3 border-t border-slate-700/50 text-slate-500">
                                            ⏰ Ejecuta L-V a las {spainHour}:{String(config.executionMinute).padStart(2, '0')} España ({config.executionHour}:{String(config.executionMinute).padStart(2, '0')} ET) via LaunchAgent
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Warning */}
                            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-3">
                                <AlertTriangle className="text-amber-400 flex-shrink-0 mt-0.5" size={18} />
                                <div className="text-xs text-amber-300/90">
                                    <strong>Importante:</strong> Requiere IB Gateway corriendo en tu Mac. El script se ejecuta automáticamente vía LaunchAgent a la hora configurada (L-V).
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                {config && !loading && (
                    <div className="sticky bottom-0 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700/50 px-6 py-4 flex justify-end gap-3 rounded-b-2xl">
                        <button
                            onClick={onClose}
                            className="px-5 py-2.5 text-sm text-slate-400 hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={saveConfig}
                            disabled={saving}
                            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50 shadow-lg shadow-violet-500/30"
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
