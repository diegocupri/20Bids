/**
 * Trading Page
 * 
 * Page for configuring automated trading with IBKR.
 */

import { Sidebar } from '../components/Sidebar';
import TradingConfigPanel from '../components/TradingConfigPanel';

export function TradingPage() {
    return (
        <div className="flex h-screen bg-bg-primary">
            <Sidebar />
            <div className="flex-1 overflow-auto p-8">
                <div className="max-w-5xl mx-auto">
                    <h1 className="text-2xl font-bold text-gray-900 mb-6">Trading Automation</h1>
                    <TradingConfigPanel />
                </div>
            </div>
        </div>
    );
}
