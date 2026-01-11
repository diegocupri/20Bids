/**
 * Trading Config Modal - Minimalist Design
 */

import { useState, useEffect } from 'react';
import { X, Save, RefreshCw, ChevronDown, AlertCircle } from 'lucide-react';

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
        if (isOpen) fetchConfig();
    }, [isOpen]);

    const fetchConfig = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/trading/config`);
            setConfig(await res.json());
            setMessage(null);
        } catch {
            setMessage({ type: 'error', text: 'Failed to load' });
        } finally {
            setLoading(false);
        }
    };

    const saveConfig = async () => {
        if (!config) return;
        setSaving(true);
        try {
            const res = await fetch(`${API_URL}/trading/config`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config),
            });
            if (res.ok) {
                setConfig(await res.json());
                setMessage({ type: 'success', text: 'Saved!' });
                setTimeout(onClose, 1000);
            }
        } catch {
            setMessage({ type: 'error', text: 'Error saving' });
        } finally {
            setSaving(false);
        }
    };

    const update = (field: keyof TradingConfig, value: any) => {
        if (config) setConfig({ ...config, [field]: value });
    };

    if (!isOpen) return null;

    const spainHour = config ? (config.executionHour + 6) % 24 : 16;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/20" onClick={onClose} />

            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] overflow-y-auto">
                {/* Header */}
                <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">Trading Automation</h2>
                        <p className="text-xs text-gray-400 mt-0.5">IBKR Paper Trading</p>
                    </div>
                    <div className="flex items-center gap-4">
                        {config && (
                            <button
                                onClick={() => update('enabled', !config.enabled)}
                                className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${config.enabled
                                    ? 'bg-emerald-50 text-emerald-600'
                                    : 'bg-gray-100 text-gray-400'
                                    }`}
                            >
                                {config.enabled ? 'ON' : 'OFF'}
                            </button>
                        )}
                        <button onClick={onClose} className="text-gray-300 hover:text-gray-500">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center py-16">
                        <RefreshCw className="animate-spin text-gray-300" size={28} />
                    </div>
                ) : config && (
                    <div className="p-6">
                        {message && (
                            <div className={`mb-5 text-xs font-medium ${message.type === 'success' ? 'text-emerald-600' : 'text-rose-500'}`}>
                                {message.text}
                            </div>
                        )}

                        {/* Grid */}
                        <div className="grid grid-cols-3 gap-8">
                            {/* Orders */}
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-3">Orders</p>
                                <div className="space-y-3">
                                    <Field label="Take Profit %" value={config.takeProfit} onChange={v => update('takeProfit', v)} />
                                    <Field label="Stop Loss %" value={config.stopLoss} onChange={v => update('stopLoss', v)} />
                                    <Field label="Max Stocks" value={config.maxStocks} onChange={v => update('maxStocks', v)} type="int" />
                                </div>
                            </div>

                            {/* Filters */}
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-3">Filters</p>
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-[11px] text-gray-500">Min Volume</label>
                                        <input
                                            type="number"
                                            value={config.minVolume}
                                            onChange={e => update('minVolume', parseFloat(e.target.value) || 0)}
                                            className="w-full mt-1 px-2.5 py-1.5 text-sm border-0 border-b border-gray-200 focus:border-blue-500 focus:ring-0 bg-transparent"
                                        />
                                        <span className="text-[10px] text-gray-400">{(config.minVolume / 1e6).toFixed(1)}M</span>
                                    </div>
                                    <Field label="Min Price $" value={config.minPrice} onChange={v => update('minPrice', v)} />
                                    <Field label="Skip if +%" value={config.maxGainSkip} onChange={v => update('maxGainSkip', v)} />
                                </div>
                            </div>

                            {/* Execution */}
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-3">Execution</p>
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-[11px] text-gray-500">Time (ET)</label>
                                        <div className="flex items-center gap-1 mt-1">
                                            <input
                                                type="number"
                                                value={config.executionHour}
                                                onChange={e => update('executionHour', parseInt(e.target.value) || 0)}
                                                className="w-12 px-2 py-1.5 text-sm border-0 border-b border-gray-200 focus:border-blue-500 focus:ring-0 bg-transparent text-center"
                                            />
                                            <span className="text-gray-300">:</span>
                                            <input
                                                type="number"
                                                value={config.executionMinute}
                                                onChange={e => update('executionMinute', parseInt(e.target.value) || 0)}
                                                className="w-12 px-2 py-1.5 text-sm border-0 border-b border-gray-200 focus:border-blue-500 focus:ring-0 bg-transparent text-center"
                                            />
                                        </div>
                                        <span className="text-[10px] text-gray-400">= {spainHour}:{String(config.executionMinute).padStart(2, '0')} Spain</span>
                                    </div>
                                    <Field label="Max Retries" value={config.maxRetries} onChange={v => update('maxRetries', v)} type="int" />
                                </div>
                            </div>
                        </div>

                        {/* Docs */}
                        <button
                            onClick={() => setShowDocs(!showDocs)}
                            className="mt-6 flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600"
                        >
                            <ChevronDown size={14} className={`transition-transform ${showDocs ? 'rotate-180' : ''}`} />
                            Cómo funciona
                        </button>

                        {showDocs && (
                            <div className="mt-3 text-[11px] text-gray-500 space-y-1.5 pl-5">
                                <p><b>Entrada:</b> LIMIT -20% bajo mercado (tú ajustas en IBKR)</p>
                                <p><b>Límite:</b> Máx €30K/día, 20% portfolio por posición</p>
                                <p><b>Filtros:</b> Vol ≥2M, Precio ≥$5, Skip si +1%</p>
                                <p><b>TP/SL:</b> Automáticos como OCA (uno cancela otro)</p>
                                <p><b>Cuenta:</b> IBKR U9444436 • Puerto 7496 (Live)</p>
                                <p className="text-gray-400 pt-1">Ejecución: L-V a las 16:25 España</p>
                            </div>
                        )}

                        {/* Warning */}
                        <div className="mt-6 flex items-center gap-2 text-[11px] text-amber-600">
                            <AlertCircle size={14} />
                            Requiere IB Gateway corriendo en tu Mac
                        </div>
                    </div>
                )}

                {/* Footer */}
                {config && !loading && (
                    <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
                        <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600">
                            Cancel
                        </button>
                        <button
                            onClick={saveConfig}
                            disabled={saving}
                            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-md disabled:opacity-50"
                        >
                            {saving ? <RefreshCw className="animate-spin" size={12} /> : <Save size={12} />}
                            Save
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

function Field({ label, value, onChange, type = 'float' }: {
    label: string;
    value: number;
    onChange: (v: number) => void;
    type?: 'float' | 'int';
}) {
    return (
        <div>
            <label className="text-[11px] text-gray-500">{label}</label>
            <input
                type="number"
                step={type === 'float' ? 0.5 : 1}
                value={value}
                onChange={e => onChange(type === 'int' ? parseInt(e.target.value) || 0 : parseFloat(e.target.value) || 0)}
                className="w-full mt-1 px-2.5 py-1.5 text-sm border-0 border-b border-gray-200 focus:border-blue-500 focus:ring-0 bg-transparent"
            />
        </div>
    );
}
