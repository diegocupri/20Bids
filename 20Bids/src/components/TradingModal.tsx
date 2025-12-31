/**
 * Trading Config Modal Component
 * 
 * Modal popup for managing automated trading configuration.
 */

import { useState, useEffect } from 'react';
import { X, Settings, Save, AlertTriangle, Clock, DollarSign, TrendingUp, RefreshCw } from 'lucide-react';

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
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto mx-4">
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                            <Settings className="text-white" size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">Trading Automation</h2>
                            <p className="text-sm text-gray-500">IBKR Paper Trading Config</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {config && (
                            <label className="flex items-center gap-2 cursor-pointer">
                                <span className={`text-sm font-medium ${config.enabled ? 'text-emerald-600' : 'text-gray-500'}`}>
                                    {config.enabled ? 'ON' : 'OFF'}
                                </span>
                                <button
                                    onClick={() => updateField('enabled', !config.enabled)}
                                    className={`relative w-11 h-6 rounded-full transition-colors ${config.enabled ? 'bg-emerald-500' : 'bg-gray-300'
                                        }`}
                                >
                                    <span
                                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${config.enabled ? 'translate-x-5' : ''
                                            }`}
                                    />
                                </button>
                            </label>
                        )}
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <RefreshCw className="animate-spin text-gray-400" size={32} />
                        </div>
                    ) : !config ? (
                        <div className="p-4 bg-rose-50 text-rose-600 rounded-lg">
                            Failed to load configuration. Is the backend running?
                        </div>
                    ) : (
                        <>
                            {message && (
                                <div className={`mb-4 p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                                    }`}>
                                    {message.text}
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* Order Settings */}
                                <div className="space-y-3">
                                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
                                        <TrendingUp size={14} />
                                        Orders
                                    </h3>

                                    <div>
                                        <label className="block text-xs text-gray-600 mb-1">Take Profit %</label>
                                        <input
                                            type="number"
                                            step="0.5"
                                            value={config.takeProfit}
                                            onChange={(e) => updateField('takeProfit', parseFloat(e.target.value) || 0)}
                                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs text-gray-600 mb-1">Stop Loss %</label>
                                        <input
                                            type="number"
                                            step="0.5"
                                            value={config.stopLoss}
                                            onChange={(e) => updateField('stopLoss', parseFloat(e.target.value) || 0)}
                                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs text-gray-600 mb-1">Max Stocks</label>
                                        <input
                                            type="number"
                                            value={config.maxStocks}
                                            onChange={(e) => updateField('maxStocks', parseInt(e.target.value) || 10)}
                                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>
                                </div>

                                {/* Filter Settings */}
                                <div className="space-y-3">
                                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
                                        <DollarSign size={14} />
                                        Filters
                                    </h3>

                                    <div>
                                        <label className="block text-xs text-gray-600 mb-1">Min Volume ($)</label>
                                        <input
                                            type="number"
                                            step="100000"
                                            value={config.minVolume}
                                            onChange={(e) => updateField('minVolume', parseFloat(e.target.value) || 0)}
                                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                        <span className="text-xs text-gray-400">{(config.minVolume / 1000000).toFixed(1)}M</span>
                                    </div>

                                    <div>
                                        <label className="block text-xs text-gray-600 mb-1">Min Price ($)</label>
                                        <input
                                            type="number"
                                            step="1"
                                            value={config.minPrice}
                                            onChange={(e) => updateField('minPrice', parseFloat(e.target.value) || 0)}
                                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs text-gray-600 mb-1">Skip if +%</label>
                                        <input
                                            type="number"
                                            step="0.5"
                                            value={config.maxGainSkip}
                                            onChange={(e) => updateField('maxGainSkip', parseFloat(e.target.value) || 0)}
                                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>

                                    <label className="flex items-center gap-2 cursor-pointer pt-1">
                                        <input
                                            type="checkbox"
                                            checked={config.prioritizeBelowRef}
                                            onChange={(e) => updateField('prioritizeBelowRef', e.target.checked)}
                                            className="w-4 h-4 rounded border-gray-300 text-blue-600"
                                        />
                                        <span className="text-xs text-gray-600">Prioritize below ref</span>
                                    </label>
                                </div>

                                {/* Execution Settings */}
                                <div className="space-y-3">
                                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
                                        <Clock size={14} />
                                        Execution
                                    </h3>

                                    <div>
                                        <label className="block text-xs text-gray-600 mb-1">Time (ET)</label>
                                        <div className="flex gap-1 items-center">
                                            <input
                                                type="number"
                                                min="0"
                                                max="23"
                                                value={config.executionHour}
                                                onChange={(e) => updateField('executionHour', parseInt(e.target.value) || 0)}
                                                className="w-14 px-2 py-2 text-sm border border-gray-200 rounded-lg"
                                            />
                                            <span className="text-gray-400">:</span>
                                            <input
                                                type="number"
                                                min="0"
                                                max="59"
                                                value={config.executionMinute}
                                                onChange={(e) => updateField('executionMinute', parseInt(e.target.value) || 0)}
                                                className="w-14 px-2 py-2 text-sm border border-gray-200 rounded-lg"
                                            />
                                        </div>
                                        <span className="text-xs text-gray-400">= {spainHour}:{String(config.executionMinute).padStart(2, '0')} Spain</span>
                                    </div>

                                    <div>
                                        <label className="block text-xs text-gray-600 mb-1">Retry Interval (min)</label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={config.retryIntervalMinutes}
                                            onChange={(e) => updateField('retryIntervalMinutes', parseInt(e.target.value) || 1)}
                                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs text-gray-600 mb-1">Max Retries</label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={config.maxRetries}
                                            onChange={(e) => updateField('maxRetries', parseInt(e.target.value) || 10)}
                                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Warning */}
                            <div className="mt-6 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                                <AlertTriangle className="text-amber-500 flex-shrink-0" size={18} />
                                <div className="text-xs text-amber-700">
                                    <strong>Note:</strong> Requires IB Gateway running locally. The script must be triggered manually or via cron job.
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
                            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={saveConfig}
                            disabled={saving}
                            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                        >
                            {saving ? (
                                <RefreshCw className="animate-spin" size={16} />
                            ) : (
                                <Save size={16} />
                            )}
                            Save
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
