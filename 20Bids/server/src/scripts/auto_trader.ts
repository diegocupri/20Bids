/**
 * Auto Trader Script - Enhanced Version
 * 
 * Executes automated trading based on 20Bids recommendations.
 * 
 * Features:
 * - Retry every minute until recommendations are available
 * - Skip stocks that have already gained >X%
 * - Prioritize stocks below refPrice1020
 * - Execute at configurable time (default: 10:25 ET = 16:25 Spain)
 * 
 * Run manually: npx ts-node server/src/scripts/auto_trader.ts [--dry-run] [--force]
 */

import { PrismaClient } from "@prisma/client";
import { getIBKRService } from "../services/ibkr_service";
import { fetchRealTimePrices } from "../services/polygon";

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

interface StockWithPrices {
    symbol: string;
    probability: number;
    currentPrice: number;
    refPrice1020: number | null;
    volume: number;
    gainPercent: number; // Current gain from refPrice1020
    isBelowRef: boolean;
}

async function getConfig(): Promise<TradingConfig> {
    const config = await prisma.tradingConfig.findFirst();
    if (!config) {
        return await prisma.tradingConfig.create({
            data: {
                takeProfit: 3.0,
                stopLoss: 5.0,
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

async function getTodaysRecommendations(): Promise<StockWithPrices[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const recommendations = await prisma.recommendation.findMany({
        where: {
            date: {
                gte: today,
                lt: tomorrow,
            },
        },
        select: {
            symbol: true,
            probability: true,
            price: true,
            volume: true,
            refPrice1020: true,
        },
    });

    return recommendations.map((r) => {
        const refPrice = r.refPrice1020 || r.price;
        const gainPercent = refPrice > 0 ? ((r.price - refPrice) / refPrice) * 100 : 0;

        return {
            symbol: r.symbol,
            probability: parseInt(r.probability.replace("%", "")) || 0,
            currentPrice: r.price,
            refPrice1020: r.refPrice1020,
            volume: r.volume,
            gainPercent,
            isBelowRef: r.price < refPrice,
        };
    });
}

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function executeAutoTrading(dryRun: boolean = false, force: boolean = false): Promise<boolean> {
    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║              20Bids Auto Trader v2.0                          ║");
    console.log("╚══════════════════════════════════════════════════════════════╝\n");

    if (dryRun) {
        console.log("🧪 DRY RUN MODE - No orders will be placed\n");
    }

    // 1. Get trading config
    const config = await getConfig();
    console.log("📋 Trading Configuration:");
    console.log(`   Take Profit: ${config.takeProfit}%`);
    console.log(`   Stop Loss: ${config.stopLoss}%`);
    console.log(`   Max Stocks: ${config.maxStocks}`);
    console.log(`   Min Volume: $${config.minVolume.toLocaleString()}`);
    console.log(`   Min Price: $${config.minPrice}`);
    console.log(`   Max Gain Skip: ${config.maxGainSkip}%`);
    console.log(`   Prioritize Below Ref: ${config.prioritizeBelowRef}`);
    console.log(`   Retry Interval: ${config.retryIntervalMinutes} min`);
    console.log(`   Max Retries: ${config.maxRetries}`);
    console.log(`   Execution Time: ${config.executionHour}:${String(config.executionMinute).padStart(2, '0')} ET`);
    console.log(`   Enabled: ${config.enabled}`);

    if (!config.enabled && !dryRun && !force) {
        console.log("\n⚠️  Auto-trading is DISABLED. Enable in config or use --force to proceed.");
        return false;
    }

    // 2. Get today's recommendations
    let allRecs = await getTodaysRecommendations();
    console.log(`\n📊 Found ${allRecs.length} recommendations for today`);

    // 2b. Retry logic if no recommendations
    if (allRecs.length === 0 && !dryRun) {
        console.log(`\n🔄 No recommendations yet. Will retry every ${config.retryIntervalMinutes} minute(s)...`);

        for (let retry = 1; retry <= config.maxRetries; retry++) {
            console.log(`   Attempt ${retry}/${config.maxRetries} - waiting ${config.retryIntervalMinutes} minute(s)...`);
            await sleep(config.retryIntervalMinutes * 60 * 1000);

            allRecs = await getTodaysRecommendations();
            console.log(`   Found ${allRecs.length} recommendations`);

            if (allRecs.length > 0) {
                console.log("✅ Recommendations available! Proceeding...");
                break;
            }
        }

        if (allRecs.length === 0) {
            console.log("❌ No recommendations after max retries. Aborting.");
            return false;
        }
    }

    if (allRecs.length === 0) {
        console.log("❌ No recommendations found. Is it a trading day?");
        return false;
    }

    // 3. Apply filters
    let filtered = allRecs.filter(
        (r) => r.volume >= config.minVolume && r.currentPrice >= config.minPrice
    );
    console.log(`\n🔍 After basic filters (Vol > ${config.minVolume / 1000000}M, Price > $${config.minPrice}): ${filtered.length} stocks`);

    // 3b. Filter out stocks that gained too much (>maxGainSkip%)
    const beforeGainFilter = filtered.length;
    filtered = filtered.filter(r => r.gainPercent <= config.maxGainSkip);
    const skippedDueToGain = beforeGainFilter - filtered.length;
    if (skippedDueToGain > 0) {
        console.log(`   Skipped ${skippedDueToGain} stocks (already gained >${config.maxGainSkip}%)`);
    }

    if (filtered.length === 0) {
        console.log("❌ No stocks pass the filters.");
        return false;
    }

    // 4. Sort: First by isBelowRef (if prioritized), then by probability
    let sorted: StockWithPrices[];
    if (config.prioritizeBelowRef) {
        // Stocks below ref come first, then sort each group by probability
        const belowRef = filtered.filter(r => r.isBelowRef).sort((a, b) => b.probability - a.probability);
        const aboveRef = filtered.filter(r => !r.isBelowRef).sort((a, b) => b.probability - a.probability);
        sorted = [...belowRef, ...aboveRef];
        console.log(`   Prioritizing: ${belowRef.length} below ref, ${aboveRef.length} at/above ref`);
    } else {
        sorted = filtered.sort((a, b) => b.probability - a.probability);
    }

    const selected = sorted.slice(0, config.maxStocks);

    console.log(`\n🎯 Selected Top ${selected.length} stocks:`);
    selected.forEach((s, i) => {
        const refIndicator = s.isBelowRef ? "📉" : "📈";
        const gainStr = s.gainPercent >= 0 ? `+${s.gainPercent.toFixed(2)}%` : `${s.gainPercent.toFixed(2)}%`;
        console.log(`   ${i + 1}. ${s.symbol.padEnd(6)} | Prob: ${s.probability}% | Price: $${s.currentPrice.toFixed(2)} | Gain: ${gainStr} ${refIndicator}`);
    });

    // 5. Connect to IBKR
    const ibkr = getIBKRService();
    const connected = await ibkr.connect();

    if (!connected) {
        console.log("\n❌ Failed to connect to IBKR Gateway. Is it running?");
        return false;
    }

    // 6. Get available funds
    const account = await ibkr.getAccountSummary();
    if (!account) {
        console.log("❌ Failed to get account summary");
        ibkr.disconnect();
        return false;
    }

    console.log(`\n💰 Account: ${account.accountId}`);
    console.log(`   Net Liquidation: $${account.netLiquidation?.toLocaleString() || 'N/A'}`);
    console.log(`   Available Funds: $${account.availableFunds.toLocaleString()}`);

    // 7. Calculate position sizes based on FIXED percentage of portfolio
    // Use netLiquidation (total portfolio value) as the base, NOT available funds
    const portfolioValue = account.netLiquidation || account.availableFunds;
    const maxPerPosition = portfolioValue * (config.maxPositionPercent / 100);
    console.log(`   Max per position (${config.maxPositionPercent}%): $${maxPerPosition.toLocaleString()}`);

    // 8. Place orders
    console.log("\n📈 Placing bracket orders...\n");

    let successCount = 0;
    for (const stock of selected) {
        // Get current price from IBKR (more accurate than DB)
        const livePrice = await ibkr.getCurrentPrice(stock.symbol);
        const entryPrice = livePrice || stock.currentPrice;

        // Re-check gain with live price
        const refPrice = stock.refPrice1020 || stock.currentPrice;
        const liveGain = refPrice > 0 ? ((entryPrice - refPrice) / refPrice) * 100 : 0;

        if (liveGain > config.maxGainSkip) {
            console.log(`⚠️  ${stock.symbol}: Skipping - live gain ${liveGain.toFixed(2)}% > ${config.maxGainSkip}%`);
            continue;
        }

        // Calculate quantity based on max position size (fixed % of portfolio)
        const quantity = Math.floor(maxPerPosition / entryPrice);

        if (quantity < 1) {
            console.log(`⚠️  ${stock.symbol}: Skipping - not enough funds for 1 share at $${entryPrice.toFixed(2)}`);
            continue;
        }

        console.log(`\n📊 ${stock.symbol}:`);
        console.log(`   Quantity: ${quantity} shares`);
        console.log(`   Entry Price: $${entryPrice.toFixed(2)} (Ref: $${refPrice.toFixed(2)})`);
        console.log(`   Investment: $${(quantity * entryPrice).toFixed(2)}`);

        if (dryRun) {
            console.log(`   🧪 DRY RUN - Order would be placed`);
            successCount++;

            await prisma.tradeLog.create({
                data: {
                    symbol: stock.symbol,
                    quantity,
                    entryPrice,
                    takeProfitPrice: entryPrice * (1 + config.takeProfit / 100),
                    stopLossPrice: entryPrice * (1 - config.stopLoss / 100),
                    parentOrderId: 0,
                    tpOrderId: 0,
                    slOrderId: 0,
                    status: "DRY_RUN",
                },
            });
        } else {
            // RETRY LOGIC: Try to fill entry order up to 20 times with 10s wait
            // Progressive buffer: attempts 1-4 = 0%, 5-9 = +0.3%, 10-20 = +0.5%
            const MAX_RETRIES = 20;
            const WAIT_SECONDS = 10;
            let filled = false;
            let finalEntryPrice = entryPrice;
            let finalOrderId = 0;

            for (let attempt = 1; attempt <= MAX_RETRIES && !filled; attempt++) {
                // Get fresh price from Polygon API (we pay for this!)
                const polygonPrices = await fetchRealTimePrices([stock.symbol]);
                const rawPrice = polygonPrices[stock.symbol]?.price || entryPrice;

                // Progressive buffer based on attempt number
                let bufferPercent = 0;
                if (attempt >= 10) {
                    bufferPercent = 0.5;
                } else if (attempt >= 5) {
                    bufferPercent = 0.3;
                }

                const attemptPrice = Math.round(rawPrice * (1 + bufferPercent / 100) * 100) / 100;
                const bufferLabel = bufferPercent > 0 ? ` +${bufferPercent}%` : '';
                console.log(`\n   🔄 Attempt ${attempt}/${MAX_RETRIES} - LIMIT @ $${attemptPrice.toFixed(2)} (live: $${rawPrice.toFixed(2)}${bufferLabel})`);

                const orderResult = await ibkr.placeLimitBuyOrder(stock.symbol, quantity, attemptPrice);

                if (!orderResult.success) {
                    console.log(`   ❌ Order placement failed: ${orderResult.error}`);
                    break;
                }

                finalOrderId = orderResult.orderId;
                finalEntryPrice = attemptPrice;

                // Wait and check if filled
                console.log(`   ⏳ Waiting ${WAIT_SECONDS}s for fill...`);
                await sleep(WAIT_SECONDS * 1000);

                if (ibkr.isOrderFilled(orderResult.orderId)) {
                    console.log(`   ✅ ORDER FILLED at $${attemptPrice.toFixed(2)}!`);
                    filled = true;
                } else {
                    console.log(`   ⚠️  Not filled, cancelling...`);
                    ibkr.cancelOrder(orderResult.orderId);
                    await sleep(1000); // Brief wait for cancel to process
                }
            }

            if (filled) {
                // Place TP and SL orders now that entry is filled
                console.log(`   📊 Placing TP/SL orders...`);
                const tpslResult = await ibkr.placeTPandSLOrders(
                    stock.symbol,
                    quantity,
                    finalEntryPrice,
                    config.takeProfit,
                    config.stopLoss
                );

                await prisma.tradeLog.create({
                    data: {
                        symbol: stock.symbol,
                        quantity,
                        entryPrice: finalEntryPrice,
                        takeProfitPrice: finalEntryPrice * (1 + config.takeProfit / 100),
                        stopLossPrice: finalEntryPrice * (1 - config.stopLoss / 100),
                        parentOrderId: finalOrderId,
                        tpOrderId: tpslResult.tpOrderId,
                        slOrderId: tpslResult.slOrderId,
                        status: "FILLED",
                    },
                });

                successCount++;
            } else {
                console.log(`   ❌ ${stock.symbol}: Failed to fill after ${MAX_RETRIES} attempts`);

                await prisma.tradeLog.create({
                    data: {
                        symbol: stock.symbol,
                        quantity,
                        entryPrice: finalEntryPrice,
                        takeProfitPrice: finalEntryPrice * (1 + config.takeProfit / 100),
                        stopLossPrice: finalEntryPrice * (1 - config.stopLoss / 100),
                        parentOrderId: finalOrderId,
                        tpOrderId: 0,
                        slOrderId: 0,
                        status: "RETRY_FAILED",
                        errorMessage: `Failed to fill after ${MAX_RETRIES} attempts`,
                    },
                });
            }
        }
    }

    console.log(`\n✅ Trading session complete! ${successCount}/${selected.length} orders placed.`);

    // Disconnect
    setTimeout(() => {
        ibkr.disconnect();
    }, 2000);

    return true;
}

// Parse command line args
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run") || args.includes("-d");
const force = args.includes("--force") || args.includes("-f");

// Execute
executeAutoTrading(dryRun, force)
    .then((success) => {
        setTimeout(() => process.exit(success ? 0 : 1), 3000);
    })
    .catch((error) => {
        console.error("❌ Error:", error);
        process.exit(1);
    });
