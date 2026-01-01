
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

async function sendToCloud() {
    if (hasEnded) return;
    hasEnded = true;

    if (positions.length === 0) {
        console.log('No positions to sync.');
        process.exit(0);
    }

    try {
        console.log('Sending data to cloud...');
        const response = await axios.post(CLOUD_WEBHOOK_URL, {
            positions: positions
        });
        console.log('Success:', response.data);
    } catch (e: any) {
        console.error('Failed to sync to cloud:', e.message);
        if (e.response) console.error('Response:', e.response.data);
    } finally {
        ib.disconnect();
        process.exit(0);
    }
}

// Connect and Req Positions
ib.connect();
ib.reqPositions();

// Timeout safety
setTimeout(() => {
    if (!hasEnded) {
        console.log('Timeout waiting for positions. Sending what we have (if any)...');
        sendToCloud();
    }
}, 10000); // 10s timeout
