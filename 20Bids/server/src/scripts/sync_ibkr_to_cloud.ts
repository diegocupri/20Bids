
import { IBApi, EventName, ErrorCode, Contract } from '@stoqey/ib';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config(); // fallback

// CONFIG
const IBKR_HOST = process.env.IBKR_HOST || '127.0.0.1';
const IBKR_PORT = Number(process.env.IBKR_PORT) || 4002; // Gateway default
const CLOUD_WEBHOOK_URL = process.env.CLOUD_WEBHOOK_URL || 'https://20bids.onrender.com/api/webhooks/ibkr-sync';

console.log('=== IBKR CLOUD SYNC STARTED ===');
console.log(`IBKR: ${IBKR_HOST}:${IBKR_PORT}`);
console.log(`Cloud: ${CLOUD_WEBHOOK_URL}`);

const ib = new IBApi({
    host: IBKR_HOST,
    port: IBKR_PORT,
    clientId: Math.floor(Math.random() * 1000) + 100, // Random Client ID to avoid conflicts
});

let positions: any[] = [];
let hasEnded = false;

ib.on(EventName.error, (err: any, code: any, reqId: number) => {
    if (code === 2104 || code === 2106 || code === 2158) return; // Connectivity messages
    console.error(`IBKR Error: ${code} - ${err.message}`);
});

ib.on(EventName.position, (account, contract, pos, avgCost) => {
    // console.log(`Position: ${contract.symbol} x ${pos} @ ${avgCost}`);
    // Only track stocks
    if (contract.secType === 'STK') {
        // Check if we already have this symbol (sometimes duplicates come for multiple accounts)
        const content = {
            symbol: contract.symbol,
            position: pos,
            avgCost: avgCost,
            // PNL comes from positionEnd usually, or requires reqPnL. 
            // Standard 'position' event doesn't have Real Time PnL.
            // But we can approximate if we had live price, OR we can request PnL via reqPnL later.
            // For now, let's just sync Position & AvgCost which is the most critical.
            // UnRealized PnL is often better fetched via reqAccountUpdates or reqPnL.
            unrealizedPNL: 0
        };
        positions.push(content);
    }
});

ib.on(EventName.positionEnd, () => {
    console.log(`Received ${positions.length} positions.`);

    // Send to Cloud
    sendToCloud();
});

// Continuous Loop Implementation
const SYNC_INTERVAL_MS = 60000; // 1 minute
let isConnected = false;

// Connect once
ib.connect();
isConnected = true;

ib.on(EventName.connected, () => {
    console.log('Connected to IBKR.');
});

ib.on(EventName.disconnected, () => {
    console.log('Disconnected. Reconnecting...');
    isConnected = false;
    setTimeout(() => ib.connect(), 5000);
});

async function syncLoop() {
    const now = new Date();
    // Assuming local time is configured correctly or using UTC
    // Market Open is 15:30 CET (Spain/User Time) or 9:30 ET
    // User requested 16:25 (Spain?) -> Let's assume user knows when to run it.
    // But we can just log the time.

    console.log(`[${now.toLocaleTimeString()}] Fetching positions...`);
    positions = []; // Clear previous
    ib.reqPositions();

    // Give it 3 seconds to gather positions, then send
    setTimeout(sendToCloud, 3000);
}

// Start the loop
console.log('Starting Sync Loop (Every 60s)...');
syncLoop();
setInterval(syncLoop, SYNC_INTERVAL_MS);

// Modified sendToCloud to NOT exit process
async function sendToCloud() {
    if (positions.length === 0) {
        console.log('No positions to sync.');
        // Don't duplicate logic, just send empty array or skip
        // If we send empty, we might clear previous stale data in DB? 
        // Better to send empty so cloud knows we have 0 positions.
    }

    try {
        await axios.post(CLOUD_WEBHOOK_URL, {
            positions: positions
        });
        console.log(`Synced ${positions.length} positions to cloud.`);
    } catch (e: any) {
        console.error('Failed to sync to cloud:', e.message);
    }
}

