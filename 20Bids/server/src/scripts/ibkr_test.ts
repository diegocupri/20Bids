/**
 * IBKR Connection Test Script
 * 
 * Tests connection to IB Gateway and retrieves account info.
 * Run with: npx ts-node server/src/scripts/ibkr_test.ts
 */

import { IBApi, EventName, ErrorCode, Contract, Order, OrderAction, OrderType, SecType } from "@stoqey/ib";

const PORT = 7496; // LIVE trading port (use 7497 for paper)
const HOST = "127.0.0.1";
const CLIENT_ID = 1;

async function testConnection() {
    console.log("╔══════════════════════════════════════════════════════════════╗");
    console.log("║              IBKR Gateway Connection Test                     ║");
    console.log("╚══════════════════════════════════════════════════════════════╝\n");

    const ib = new IBApi({
        host: HOST,
        port: PORT,
        clientId: CLIENT_ID,
    });

    // Track connection state
    let connected = false;
    let accountId = "";

    // Event handlers
    ib.on(EventName.connected, () => {
        console.log("✅ Connected to IB Gateway!");
        connected = true;

        // Request account summary
        ib.reqAccountSummary(1, "All", "NetLiquidation,TotalCashValue,AvailableFunds");

        // Request current time from server
        ib.reqCurrentTime();
    });

    ib.on(EventName.disconnected, () => {
        console.log("❌ Disconnected from IB Gateway");
        connected = false;
    });

    ib.on(EventName.error, (err: Error, code: ErrorCode, reqId: number) => {
        if (code === ErrorCode.NOT_CONNECTED) {
            console.log("❌ Not connected to IB Gateway. Make sure it's running on port", PORT);
        } else {
            console.log(`⚠️  Error [${code}]: ${err.message}`);
        }
    });

    ib.on(EventName.currentTime, (time: number) => {
        console.log(`🕐 Server Time: ${new Date(time * 1000).toISOString()}`);
    });

    ib.on(EventName.accountSummary, (reqId: number, account: string, tag: string, value: string, currency: string) => {
        if (!accountId) {
            accountId = account;
            console.log(`\n📊 Account: ${account}`);
            console.log("─".repeat(40));
        }
        console.log(`   ${tag}: ${currency} ${parseFloat(value).toLocaleString()}`);
    });

    ib.on(EventName.accountSummaryEnd, () => {
        console.log("\n✅ Account summary received successfully!");
        console.log("\n🎉 Connection test PASSED! Ready for trading.\n");

        // Disconnect after test
        setTimeout(() => {
            ib.disconnect();
            process.exit(0);
        }, 1000);
    });

    // Connect
    console.log(`📡 Connecting to ${HOST}:${PORT}...`);
    ib.connect();

    // Timeout after 10 seconds
    setTimeout(() => {
        if (!connected) {
            console.log("\n❌ Connection timeout. Check that:");
            console.log("   1. IB Gateway is running");
            console.log("   2. API is enabled in Configuration → Settings");
            console.log("   3. Port is set to", PORT);
            console.log("   4. 'Allow connections from localhost' is checked");
            process.exit(1);
        }
    }, 10000);
}

testConnection();
