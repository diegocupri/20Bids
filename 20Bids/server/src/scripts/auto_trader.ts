/**
 * Auto Trader Script v3 - Production Version
 * 
 * LOGIC:
 * 1. Filter stocks: volume > minVolume, price > minPrice
 * 2. Get LIVE prices from Polygon, calculate gain vs refPrice1020
 * 3. Only buy if gain <= maxGainSkip% (stock hasn't risen too much)
 * 4. Position size: max 20% of portfolio per stock
 * 5. Place orders in PARALLEL (one per stock)
 * 6. If order starts filling (filled > 0), KEEP IT OPEN
 * 7. Only retry if filled = 0 after timeout
 * 8. Progressive buffer: +0.1% base, +0.3% at attempt 5, +0.5% at attempt 8
 * 
 * Run manually: npx ts-node server/src/scripts/auto_trader.ts [--dry-run] [--force]
 */

import { PrismaClient } from "@prisma/client";
import { getIBKRService } from "../services/ibkr_service";
import { fetchRealTimePrices } from "../services/polygon";
import { Contract, Order, OrderAction, OrderType, SecType, TimeInForce } from "@stoqey/ib";

const prisma = new PrismaClient();

interface TradingConfig {
    takeProfit: number;
    stopLoss: number;
    maxStocks: number;
    maxPositionPercent: number;
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

// Configuration
const MAX_ORDER_RETRIES = 10;
const WAIT_SECONDS = 10;

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getConfig(): Promise<TradingConfig> {
    const config = await prisma.tradingConfig.findFirst();
    if (!config) {
        return await prisma.tradingConfig.create({
            data: {
                takeProfit: 1.0,
                stopLoss: 3.0,
                maxStocks: 10,
                maxPositionPercent: 20.0,
                minVolume: 1000000,
                minPrice: 5.0,
                maxGainSkip: 1.0,
                prioritizeBelowRef: true,
                retryIntervalMinutes: 1,
                maxRetries: 10,
                executionHour: 10,
                executionMinute: 25,
                enabled: false,
            },
        });
    }
    return config;
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

async function placeAndWaitForOrder(
    ibkr: ReturnType<typeof getIBKRService>,
    symbol: string,
    quantity: number,
    initialPrice: number,
    config: { takeProfit: number; stopLoss: number }
): Promise<boolean> {
    console.log(`\n🔵 [${symbol}] Starting order process...`);

    for (let attempt = 1; attempt <= MAX_ORDER_RETRIES; attempt++) {
        // Get fresh price from Polygon
        const polygonPrices = await fetchRealTimePrices([symbol]);
        const rawPrice = polygonPrices[symbol]?.price || initialPrice;

        // Progressive buffer: 0.1% base, +0.3% at attempt 5, +0.5% at attempt 8
        let bufferPercent = 0.1;
        if (attempt >= 8) bufferPercent = 0.5;
        else if (attempt >= 5) bufferPercent = 0.3;

        const limitPrice = Math.round(rawPrice * (1 + bufferPercent / 100) * 100) / 100;

        console.log(`   [${symbol}] Attempt ${attempt}/${MAX_ORDER_RETRIES} - LIMIT @ $${limitPrice.toFixed(2)} (+${bufferPercent}%)`);

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

            // Log to database
            await prisma.tradeLog.create({
                data: {
                    symbol,
                    quantity,
                    entryPrice: limitPrice,
                    takeProfitPrice: limitPrice * (1 + config.takeProfit / 100),
                    stopLossPrice: limitPrice * (1 - config.stopLoss / 100),
                    parentOrderId: orderId,
                    tpOrderId: 0,
                    slOrderId: 0,
                    status: "FILLING",
                }
            });

            return true; // SUCCESS - order is active and filling
        } else {
            // NO FILLS - cancel and retry with higher price
            console.log(`   [${symbol}] No fills yet. Cancelling and retrying...`);
            ibkr.cancelOrder(orderId);
            await sleep(1000);
        }
    }

    console.log(`   [${symbol}] ❌ Failed after ${MAX_ORDER_RETRIES} attempts with 0 fills.`);
    return false;
}

async function main() {
    const args = process.argv.slice(2);
    const isDryRun = args.includes("--dry-run");
    const isForce = args.includes("--force");

    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║              20Bids Auto Trader v3.0                          ║");
    console.log("╚══════════════════════════════════════════════════════════════╝\n");

    // 1. Load config
    const config = await getConfig();

    console.log("📋 Trading Configuration:");
    console.log(`   Take Profit: ${config.takeProfit}%`);
    console.log(`   Stop Loss: ${config.stopLoss}%`);
    console.log(`   Max Stocks: ${config.maxStocks}`);
    console.log(`   Max Position: ${config.maxPositionPercent}%`);
    console.log(`   Min Volume: $${config.minVolume.toLocaleString()}`);
    console.log(`   Min Price: $${config.minPrice}`);
    console.log(`   Max Gain Skip: ${config.maxGainSkip}%`);
    console.log(`   Execution Time: ${config.executionHour}:${config.executionMinute.toString().padStart(2, '0')} ET`);
    console.log(`   Enabled: ${config.enabled}`);
    console.log(`   Dry Run: ${isDryRun}`);

    // 2. Check if enabled
    if (!config.enabled && !isForce) {
        console.log("\n⚠️  Auto-trading is disabled. Use --force to run anyway.");
        process.exit(0);
    }

    // 3. Connect to IBKR
    const ibkr = getIBKRService();
    const connected = await ibkr.connect();

    if (!connected) {
        console.log("❌ Failed to connect to IBKR");
        process.exit(1);
    }

    // 4. Cancel any existing open orders
    await cancelAllOpenOrders(ibkr);

    // 5. Get account info
    const account = await ibkr.getAccountSummary();
    if (!account) {
        console.log("❌ Failed to get account summary");
        ibkr.disconnect();
        process.exit(1);
    }

    const portfolioValue = account.netLiquidation || account.availableFunds;
    const maxPerPosition = portfolioValue * (config.maxPositionPercent / 100);

    console.log(`\n💰 Portfolio Value: $${portfolioValue.toLocaleString()}`);
    console.log(`   Max per position (${config.maxPositionPercent}%): $${maxPerPosition.toLocaleString()}`);

    // 6. Get today's recommendations (basic filters only)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const recommendations = await prisma.recommendation.findMany({
        where: {
            date: { gte: today, lt: tomorrow },
            volume: { gte: config.minVolume },
            price: { gte: config.minPrice },
        },
        select: { symbol: true, price: true, refPrice1020: true, probability: true },
    });

    console.log(`\n📊 Found ${recommendations.length} recommendations with Vol > ${(config.minVolume / 1e6).toFixed(1)}M, Price > $${config.minPrice}`);

    if (recommendations.length === 0) {
        console.log("❌ No recommendations for today");
        ibkr.disconnect();
        process.exit(0);
    }

    // 7. Get LIVE prices from Polygon FIRST (before filtering by gain!)
    const allSymbols = recommendations.map(r => r.symbol);
    const livePrices = await fetchRealTimePrices(allSymbols);

    // 8. Filter by gain using LIVE prices
    console.log(`\n📈 Checking gain vs refPrice1020 (using LIVE prices):`);
    const filtered = recommendations.filter(r => {
        const refPrice = r.refPrice1020 || r.price;
        const livePrice = livePrices[r.symbol]?.price || r.price;
        const gain = refPrice > 0 ? ((livePrice - refPrice) / refPrice) * 100 : 0;
        const pass = gain <= config.maxGainSkip;
        console.log(`   ${r.symbol}: Live $${livePrice.toFixed(2)} vs Ref $${refPrice.toFixed(2)} = ${gain >= 0 ? '+' : ''}${gain.toFixed(2)}% ${pass ? '✅' : '❌ SKIP'}`);
        return pass;
    });

    // 9. Sort and limit to maxStocks
    const sorted = filtered
        .sort((a, b) => {
            // Prioritize stocks below ref
            const aLive = livePrices[a.symbol]?.price || a.price;
            const bLive = livePrices[b.symbol]?.price || b.price;
            const aGain = a.refPrice1020 ? (aLive - a.refPrice1020) / a.refPrice1020 : 0;
            const bGain = b.refPrice1020 ? (bLive - b.refPrice1020) / b.refPrice1020 : 0;
            return aGain - bGain; // Most negative (most below ref) first
        })
        .slice(0, config.maxStocks);

    console.log(`\n📊 ${sorted.length} stocks pass gain filter (<= ${config.maxGainSkip}%)\n`);

    if (sorted.length === 0) {
        console.log("❌ No stocks pass filters");
        ibkr.disconnect();
        process.exit(0);
    }

    // 10. Build order list with live prices
    const orders: { symbol: string; quantity: number; price: number }[] = [];
    for (const rec of sorted) {
        const livePrice = livePrices[rec.symbol]?.price || rec.price;
        const quantity = Math.floor(maxPerPosition / livePrice);

        if (quantity >= 1) {
            orders.push({ symbol: rec.symbol, quantity, price: livePrice });
            console.log(`   ${rec.symbol}: ${quantity} shares @ $${livePrice.toFixed(2)} = $${(quantity * livePrice).toFixed(0)}`);
        }
    }

    if (isDryRun) {
        console.log("\n🔶 DRY RUN - No orders will be placed.");
        ibkr.disconnect();
        process.exit(0);
    }

    // 11. Process stocks IN PARALLEL (but each one has only ONE order at a time)
    console.log("\n🚀 PLACING ORDERS IN PARALLEL (one per stock)...\n");

    const results = await Promise.all(
        orders.map(o => placeAndWaitForOrder(ibkr, o.symbol, o.quantity, o.price, {
            takeProfit: config.takeProfit,
            stopLoss: config.stopLoss
        }))
    );

    const successCount = results.filter(r => r).length;
    console.log(`\n✅ Completed: ${successCount}/${orders.length} orders active/filling`);

    // Cleanup
    setTimeout(() => {
        ibkr.disconnect();
        prisma.$disconnect();
        process.exit(0);
    }, 3000);
}

main().catch(err => {
    console.error("Error:", err);
    process.exit(1);
});
