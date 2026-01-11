/**
 * Quick Order Script - Send a single order to IBKR
 */

import { getIBKRService } from "../services/ibkr_service";
import { Contract, Order, OrderAction, OrderType, SecType, TimeInForce } from "@stoqey/ib";

// === CONFIGURATION ===
const SYMBOL = "ERAS";
const AMOUNT_USD = 10; // €10 worth 
const ORDER_TYPE = "MKT"; // Market order

async function main() {
    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║              IBKR Quick Order - LIVE                          ║");
    console.log("╚══════════════════════════════════════════════════════════════╝\n");

    console.log(`📋 Order Details:`);
    console.log(`   Symbol: ${SYMBOL}`);
    console.log(`   Amount: ~$${AMOUNT_USD}`);
    console.log(`   Type: ${ORDER_TYPE} (Market)`);
    console.log(`   ⚠️  Will execute when market opens (Monday)\n`);

    const ibkr = getIBKRService();

    try {
        console.log("📡 Connecting to IBKR...");
        await ibkr.connect();
        console.log("✅ Connected!\n");

        // Wait for IBKR to send us a valid order ID
        console.log("⏳ Waiting for valid order ID from IBKR...");
        await new Promise(resolve => setTimeout(resolve, 3000));

        const orderId = ibkr.getNextOrderId();
        console.log(`   Got order ID: ${orderId}\n`);

        // For market order, we need to calculate shares based on approximate price
        // ERAS is around $6-8, so for $10 we buy 1-2 shares
        const quantity = 1; // Buy 1 share as minimum

        console.log(`📊 Sending order for ${quantity} share(s) of ${SYMBOL}...`);

        const contract: Contract = {
            symbol: SYMBOL,
            secType: SecType.STK,
            exchange: "SMART",
            currency: "USD",
        };

        const order: Order = {
            orderId: orderId,
            action: OrderAction.BUY,
            orderType: OrderType.MKT,
            totalQuantity: quantity,
            tif: TimeInForce.GTC, // Good Till Cancelled - stays open until Monday
            transmit: true,
            outsideRth: false, // Execute during regular trading hours
            account: "U11220991", // Specify account
        };

        (ibkr as any).ib.placeOrder(orderId, contract, order);

        console.log(`\n✅ ORDER SENT!`);
        console.log(`   Order ID: ${orderId}`);
        console.log(`   Action: BUY`);
        console.log(`   Symbol: ${SYMBOL}`);
        console.log(`   Quantity: ${quantity}`);
        console.log(`   Type: MARKET (GTC)`);
        console.log(`\n⏰ The order will execute when the market opens on Monday.`);
        console.log(`   Check your TWS/IBKR app to see the pending order.\n`);

        // Wait a bit for confirmation
        await new Promise(resolve => setTimeout(resolve, 3000));

    } catch (e: any) {
        console.error("❌ Error:", e.message);
    } finally {
        ibkr.disconnect();
    }
}

main();
