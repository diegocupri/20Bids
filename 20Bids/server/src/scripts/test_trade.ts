/**
 * Test Trade Script v2
 * 
 * FIXED LOGIC:
 * - ONE order per stock (never multiple)
 * - If order starts filling (filled > 0), KEEP IT OPEN, no retries
 * - Only retry if filled = 0 after timeout
 * - Progressive buffer on retries
 */

import { PrismaClient } from "@prisma/client";
import { getIBKRService } from "../services/ibkr_service";
import { fetchRealTimePrices } from "../services/polygon";
import { Contract, Order, OrderAction, OrderType, SecType, TimeInForce } from "@stoqey/ib";

const prisma = new PrismaClient();

// Configuration
const MAX_RETRIES = 10;
const WAIT_SECONDS = 10;
const MAX_POSITION_PERCENT = 20;

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function cancelAllOpenOrders(ibkr: ReturnType<typeof getIBKRService>): Promise<void> {
    console.log("\n🚫 CANCELLING ALL OPEN ORDERS...");
    const orders = await ibkr.getOpenOrders();
    for (const order of orders) {
        if (order.status !== 'Cancelled' && order.status !== 'Filled') {
            ibkr.cancelOrder(order.orderId);
            console.log(`   Cancelled order ${order.orderId} for ${order.symbol}`);
        }
    }
    await sleep(2000);
}

async function sellAllPositions(ibkr: ReturnType<typeof getIBKRService>): Promise<void> {
    console.log("\n🔴 SELLING ALL POSITIONS AT MARKET...\n");

    const positions = await ibkr.getPositions();

    if (positions.length === 0) {
        console.log("   No positions to sell.");
        return;
    }

    for (const pos of positions) {
        if (pos.quantity === 0) continue;

        const action = pos.quantity > 0 ? OrderAction.SELL : OrderAction.BUY; // Cover short
        const qty = Math.abs(pos.quantity);

        console.log(`   ${action === OrderAction.SELL ? 'Selling' : 'Covering'} ${qty} ${pos.symbol} at MARKET...`);

        const contract: Contract = {
            symbol: pos.symbol,
            secType: SecType.STK,
            exchange: "SMART",
            currency: "USD",
        };

        const orderId = ibkr.getNextOrderId();
        const order: Order = {
            orderId: orderId,
            action: action,
            orderType: OrderType.MKT,
            totalQuantity: qty,
            tif: TimeInForce.DAY,
            transmit: true,
        };

        try {
            (ibkr as any).ib.placeOrder(orderId, contract, order);
            console.log(`   ✅ ${action === OrderAction.SELL ? 'Sell' : 'Cover'} order placed for ${pos.symbol}`);
        } catch (e: any) {
            console.log(`   ❌ Failed: ${e.message}`);
        }
    }

    // Wait longer for sells to complete
    console.log("\n   ⏳ Waiting 10s for sells to complete...");
    await sleep(10000);
}

async function placeAndWaitForOrder(
    ibkr: ReturnType<typeof getIBKRService>,
    symbol: string,
    quantity: number,
    initialPrice: number,
    config: { takeProfit: number; stopLoss: number }
): Promise<boolean> {
    console.log(`\n🔵 [${symbol}] Starting order process...`);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        // Get fresh price from Polygon
        const polygonPrices = await fetchRealTimePrices([symbol]);
        const rawPrice = polygonPrices[symbol]?.price || initialPrice;

        // Progressive buffer: 0.1% base, +0.3% at attempt 5, +0.5% at attempt 8
        let bufferPercent = 0.1;
        if (attempt >= 8) bufferPercent = 0.5;
        else if (attempt >= 5) bufferPercent = 0.3;

        const limitPrice = Math.round(rawPrice * (1 + bufferPercent / 100) * 100) / 100;

        console.log(`   [${symbol}] Attempt ${attempt}/${MAX_RETRIES} - LIMIT @ $${limitPrice.toFixed(2)} (+${bufferPercent}%)`);

        // Place the order
        const orderResult = await ibkr.placeLimitBuyOrder(symbol, quantity, limitPrice);

        if (!orderResult.success) {
            console.log(`   [${symbol}] ❌ Order placement failed: ${orderResult.error}`);
            return false;
        }

        const orderId = orderResult.orderId;

        // Wait and check status
        await sleep(WAIT_SECONDS * 1000);

        const status = ibkr.getOrderStatus(orderId);
        const filled = status?.filled || 0;

        if (filled > 0) {
            // ORDER IS FILLING - KEEP IT OPEN, DON'T CANCEL, DON'T RETRY
            console.log(`   [${symbol}] ✅ Order filling! ${filled}/${quantity} filled. KEEPING ORDER OPEN.`);

            // Place TP/SL based on limit price
            await ibkr.placeTPandSLOrders(symbol, quantity, limitPrice, config.takeProfit, config.stopLoss);

            return true; // SUCCESS - order is active and filling
        } else {
            // NO FILLS - cancel and retry with higher price
            console.log(`   [${symbol}] No fills yet. Cancelling and retrying...`);
            ibkr.cancelOrder(orderId);
            await sleep(1000);
        }
    }

    console.log(`   [${symbol}] ❌ Failed after ${MAX_RETRIES} attempts with 0 fills.`);
    return false;
}

async function main() {
    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║         TEST TRADE v2 - ONE ORDER PER STOCK                   ║");
    console.log("╚══════════════════════════════════════════════════════════════╝\n");

    const ibkr = getIBKRService();
    const connected = await ibkr.connect();

    if (!connected) {
        console.log("❌ Failed to connect to IBKR");
        process.exit(1);
    }

    // Get config
    const config = await prisma.tradingConfig.findFirst();
    const takeProfit = config?.takeProfit || 1;
    const stopLoss = config?.stopLoss || 3;

    console.log(`📋 TP: ${takeProfit}% | SL: ${stopLoss}%`);

    // Step 0: Cancel all open orders first
    await cancelAllOpenOrders(ibkr);

    // Step 1: Sell/Cover all positions
    await sellAllPositions(ibkr);

    // Step 2: Get fresh account info
    const account = await ibkr.getAccountSummary();
    if (!account) {
        console.log("❌ Failed to get account summary");
        ibkr.disconnect();
        process.exit(1);
    }

    const portfolioValue = account.netLiquidation || account.availableFunds;
    const maxPerPosition = portfolioValue * (MAX_POSITION_PERCENT / 100);

    console.log(`\n💰 Portfolio Value: $${portfolioValue.toLocaleString()}`);
    console.log(`   Max per position (${MAX_POSITION_PERCENT}%): $${maxPerPosition.toLocaleString()}`);

    // Step 3: Get today's recommendations (basic filters only - no gain filter yet)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const recommendations = await prisma.recommendation.findMany({
        where: {
            date: { gte: today, lt: tomorrow },
            volume: { gte: 1000000 },
            price: { gte: 5 },
        },
        select: { symbol: true, price: true, refPrice1020: true },
    });

    console.log(`\n📊 Found ${recommendations.length} recommendations with Vol > 1M, Price > $5`);

    // Get LIVE prices from Polygon FIRST (before filtering by gain!)
    const allSymbols = recommendations.map(r => r.symbol);
    const livePrices = await fetchRealTimePrices(allSymbols);

    // Now filter by gain using LIVE prices
    console.log(`\n📈 Checking gain vs refPrice1020 (using LIVE prices):`);
    const filtered = recommendations.filter(r => {
        const refPrice = r.refPrice1020 || r.price;
        const livePrice = livePrices[r.symbol]?.price || r.price;
        const gain = refPrice > 0 ? ((livePrice - refPrice) / refPrice) * 100 : 0;
        const pass = gain <= 1;
        console.log(`   ${r.symbol}: Live $${livePrice.toFixed(2)} vs Ref $${refPrice.toFixed(2)} = ${gain >= 0 ? '+' : ''}${gain.toFixed(2)}% ${pass ? '✅' : '❌ SKIP'}`);
        return pass;
    });

    console.log(`\n📊 ${filtered.length} stocks pass gain filter (<= 1%)\n`);

    if (filtered.length === 0) {
        console.log("❌ No stocks pass filters");
        ibkr.disconnect();
        process.exit(0);
    }

    // Build order list with live prices
    const orders: { symbol: string; quantity: number; price: number }[] = [];
    for (const rec of filtered) {
        const livePrice = livePrices[rec.symbol]?.price || rec.price;
        const quantity = Math.floor(maxPerPosition / livePrice);

        if (quantity >= 1) {
            orders.push({ symbol: rec.symbol, quantity, price: livePrice });
            console.log(`   ${rec.symbol}: ${quantity} shares @ $${livePrice.toFixed(2)} = $${(quantity * livePrice).toFixed(0)}`);
        }
    }

    // Step 4: Process stocks IN PARALLEL (but each one has only ONE order at a time)
    console.log("\n🚀 PLACING ORDERS IN PARALLEL (one per stock)...\n");

    const results = await Promise.all(
        orders.map(o => placeAndWaitForOrder(ibkr, o.symbol, o.quantity, o.price, { takeProfit, stopLoss }))
    );

    const successCount = results.filter(r => r).length;
    console.log(`\n✅ Completed: ${successCount}/${orders.length} orders active/filling`);

    // Cleanup
    setTimeout(() => {
        ibkr.disconnect();
        process.exit(0);
    }, 3000);
}

main().catch(err => {
    console.error("Error:", err);
    process.exit(1);
});
