/**
 * IBKR Trading Service
 * 
 * Handles connection to IB Gateway and order execution.
 */

import { IBApi, EventName, ErrorCode, Contract, Order, OrderAction, OrderType, SecType, TimeInForce } from "@stoqey/ib";

const PORT = 7496; // LIVE trading (7497 for paper)
const HOST = "127.0.0.1";
const CLIENT_ID = 1;
const ACCOUNT_ID = "U9444436"; // Live trading account

interface AccountSummary {
    accountId: string;
    availableFunds: number;
    netLiquidation: number;
    totalCashValue: number;
}

interface BracketOrderResult {
    parentOrderId: number;
    takeProfitOrderId: number;
    stopLossOrderId: number;
    success: boolean;
    error?: string;
}

export class IBKRService {
    private ib: IBApi;
    private connected: boolean = false;
    private nextOrderId: number = 0;
    private accountSummary: AccountSummary | null = null;

    constructor() {
        this.ib = new IBApi({
            host: HOST,
            port: PORT,
            clientId: CLIENT_ID,
        });
        this.setupEventHandlers();
        this.setupOrderStatusHandler();
    }

    private setupEventHandlers(): void {
        this.ib.on(EventName.connected, () => {
            console.log("✅ IBKR Service: Connected");
            this.connected = true;
        });

        this.ib.on(EventName.disconnected, () => {
            console.log("❌ IBKR Service: Disconnected");
            this.connected = false;
        });

        this.ib.on(EventName.error, (err: Error, code: ErrorCode, reqId: number) => {
            console.log(`⚠️  IBKR Error [${code}] reqId=${reqId}: ${err.message}`);
        });

        this.ib.on(EventName.nextValidId, (orderId: number) => {
            console.log(`📋 Next valid order ID: ${orderId}`);
            this.nextOrderId = orderId;
        });
    }

    async connect(): Promise<boolean> {
        return new Promise((resolve) => {
            if (this.connected) {
                resolve(true);
                return;
            }

            const timeout = setTimeout(() => {
                console.log("❌ Connection timeout");
                resolve(false);
            }, 10000);

            this.ib.once(EventName.connected, () => {
                clearTimeout(timeout);
                resolve(true);
            });

            console.log(`📡 Connecting to IBKR Gateway at ${HOST}:${PORT}...`);
            this.ib.connect();
        });
    }

    disconnect(): void {
        if (this.connected) {
            this.ib.disconnect();
        }
    }

    isConnected(): boolean {
        return this.connected;
    }

    async getAccountSummary(): Promise<AccountSummary | null> {
        return new Promise((resolve) => {
            if (!this.connected) {
                resolve(null);
                return;
            }

            const reqId = Math.floor(Math.random() * 10000);
            let summary: Partial<AccountSummary> = {};

            const handler = (id: number, account: string, tag: string, value: string, currency: string) => {
                if (id !== reqId) return;

                summary.accountId = account;
                if (tag === "AvailableFunds") summary.availableFunds = parseFloat(value);
                if (tag === "NetLiquidation") summary.netLiquidation = parseFloat(value);
                if (tag === "TotalCashValue") summary.totalCashValue = parseFloat(value);
            };

            const endHandler = (id: number) => {
                if (id !== reqId) return;
                this.ib.off(EventName.accountSummary, handler);
                this.ib.off(EventName.accountSummaryEnd, endHandler);
                this.accountSummary = summary as AccountSummary;
                resolve(this.accountSummary);
            };

            this.ib.on(EventName.accountSummary, handler);
            this.ib.on(EventName.accountSummaryEnd, endHandler);
            this.ib.reqAccountSummary(reqId, "All", "AvailableFunds,NetLiquidation,TotalCashValue");

            setTimeout(() => {
                resolve(summary.accountId ? summary as AccountSummary : null);
            }, 5000);
        });
    }

    async getCurrentPrice(symbol: string): Promise<number | null> {
        return new Promise((resolve) => {
            if (!this.connected) {
                resolve(null);
                return;
            }

            const reqId = Math.floor(Math.random() * 10000);
            const contract: Contract = {
                symbol: symbol,
                secType: SecType.STK,
                exchange: "SMART",
                currency: "USD",
            };

            let lastPrice: number | null = null;

            const handler = (tickerId: number, field: number, value: number) => {
                if (tickerId !== reqId) return;
                // Field 4 = Last price, Field 9 = Close price
                if (field === 4 || field === 9) {
                    lastPrice = value;
                }
            };

            this.ib.on(EventName.tickPrice, handler);
            this.ib.reqMktData(reqId, contract, "", true, false);

            setTimeout(() => {
                this.ib.off(EventName.tickPrice, handler);
                this.ib.cancelMktData(reqId);
                resolve(lastPrice);
            }, 3000);
        });
    }

    getNextOrderId(): number {
        return this.nextOrderId++;
    }

    // Track order statuses
    private orderStatuses: Map<number, { status: string; filled: number; remaining: number }> = new Map();

    private setupOrderStatusHandler(): void {
        this.ib.on(EventName.orderStatus, (orderId: number, status: string, filled: number, remaining: number) => {
            this.orderStatuses.set(orderId, { status, filled, remaining });
            console.log(`📋 Order ${orderId}: ${status} (Filled: ${filled}, Remaining: ${remaining})`);
        });
    }

    /**
     * Check if an order is filled
     */
    isOrderFilled(orderId: number): boolean {
        const status = this.orderStatuses.get(orderId);
        if (!status) return false;
        return status.status === 'Filled' || status.remaining === 0;
    }

    /**
     * Get order status
     */
    getOrderStatus(orderId: number): { status: string; filled: number; remaining: number } | null {
        return this.orderStatuses.get(orderId) || null;
    }

    /**
     * Cancel an order
     */
    cancelOrder(orderId: number): void {
        console.log(`🚫 Cancelling order ${orderId}...`);
        this.ib.cancelOrder(orderId);
    }

    /**
     * Place a simple LIMIT BUY order (without bracket) for retry logic
     */
    async placeLimitBuyOrder(
        symbol: string,
        quantity: number,
        limitPrice: number
    ): Promise<{ orderId: number; success: boolean; error?: string }> {
        if (!this.connected) {
            return { orderId: 0, success: false, error: "Not connected" };
        }

        const contract: Contract = {
            symbol: symbol,
            secType: SecType.STK,
            exchange: "SMART",
            currency: "USD",
        };

        const orderId = this.getNextOrderId();

        const order: Order = {
            orderId: orderId,
            action: OrderAction.BUY,
            orderType: OrderType.LMT,
            totalQuantity: quantity,
            lmtPrice: limitPrice,
            tif: TimeInForce.DAY,
            transmit: true,
            account: ACCOUNT_ID,
        };

        try {
            console.log(`📊 Placing LIMIT BUY for ${symbol}: ${quantity} @ $${limitPrice.toFixed(2)}`);
            this.ib.placeOrder(orderId, contract, order);
            return { orderId, success: true };
        } catch (error: any) {
            return { orderId: 0, success: false, error: error.message };
        }
    }

    /**
     * Place TP and SL orders after entry is filled
     */
    async placeTPandSLOrders(
        symbol: string,
        quantity: number,
        entryPrice: number,
        takeProfitPercent: number,
        stopLossPercent: number
    ): Promise<{ tpOrderId: number; slOrderId: number; success: boolean }> {
        if (!this.connected) {
            return { tpOrderId: 0, slOrderId: 0, success: false };
        }

        const contract: Contract = {
            symbol: symbol,
            secType: SecType.STK,
            exchange: "SMART",
            currency: "USD",
        };

        const takeProfitPrice = Math.round(entryPrice * (1 + takeProfitPercent / 100) * 100) / 100;
        const stopLossPrice = Math.round(entryPrice * (1 - stopLossPercent / 100) * 100) / 100;

        const tpOrderId = this.getNextOrderId();
        const slOrderId = this.getNextOrderId();

        // Take Profit: LIMIT SELL
        const tpOrder: Order = {
            orderId: tpOrderId,
            action: OrderAction.SELL,
            orderType: OrderType.LMT,
            totalQuantity: quantity,
            lmtPrice: takeProfitPrice,
            tif: TimeInForce.GTC,
            transmit: true,
            account: ACCOUNT_ID,
            ocaGroup: `${symbol}_TP_SL_${Date.now()}`,
            ocaType: 1, // Cancel on fill
        };

        // Stop Loss: STOP SELL
        const slOrder: Order = {
            orderId: slOrderId,
            action: OrderAction.SELL,
            orderType: OrderType.STP,
            totalQuantity: quantity,
            auxPrice: stopLossPrice,
            tif: TimeInForce.GTC,
            transmit: true,
            account: ACCOUNT_ID,
            ocaGroup: `${symbol}_TP_SL_${Date.now()}`,
            ocaType: 1,
        };

        try {
            console.log(`   📈 TP: LIMIT SELL @ $${takeProfitPrice.toFixed(2)}`);
            console.log(`   📉 SL: STOP SELL @ $${stopLossPrice.toFixed(2)}`);
            this.ib.placeOrder(tpOrderId, contract, tpOrder);
            this.ib.placeOrder(slOrderId, contract, slOrder);
            return { tpOrderId, slOrderId, success: true };
        } catch (error: any) {
            console.error(`Failed to place TP/SL: ${error.message}`);
            return { tpOrderId: 0, slOrderId: 0, success: false };
        }
    }

    /**
     * Place a bracket order: LIMIT entry + Take Profit + Stop Loss
     */
    async placeBracketOrder(
        symbol: string,
        quantity: number,
        limitPrice: number,
        takeProfitPercent: number,
        stopLossPercent: number
    ): Promise<BracketOrderResult> {
        if (!this.connected) {
            return { parentOrderId: 0, takeProfitOrderId: 0, stopLossOrderId: 0, success: false, error: "Not connected" };
        }

        const contract: Contract = {
            symbol: symbol,
            secType: SecType.STK,
            exchange: "SMART",
            currency: "USD",
        };

        // Calculate prices
        const takeProfitPrice = Math.round(limitPrice * (1 + takeProfitPercent / 100) * 100) / 100;
        const stopLossPrice = Math.round(limitPrice * (1 - stopLossPercent / 100) * 100) / 100;

        // Get order IDs
        const parentOrderId = this.getNextOrderId();
        const takeProfitOrderId = this.getNextOrderId();
        const stopLossOrderId = this.getNextOrderId();

        console.log(`\n📊 Placing bracket order for ${symbol}:`);
        console.log(`   Entry: LIMIT @ $${limitPrice.toFixed(2)} x ${quantity} shares`);
        console.log(`   Take Profit: LIMIT @ $${takeProfitPrice.toFixed(2)} (+${takeProfitPercent}%)`);
        console.log(`   Stop Loss: STOP @ $${stopLossPrice.toFixed(2)} (-${stopLossPercent}%)`);

        // Parent Order: LIMIT BUY
        const parentOrder: Order = {
            orderId: parentOrderId,
            action: OrderAction.BUY,
            orderType: OrderType.LMT,
            totalQuantity: quantity,
            lmtPrice: limitPrice,
            tif: TimeInForce.DAY,
            transmit: false, // Don't transmit yet - wait for children
            account: ACCOUNT_ID,
        };

        // Take Profit Order: LIMIT SELL
        const takeProfitOrder: Order = {
            orderId: takeProfitOrderId,
            action: OrderAction.SELL,
            orderType: OrderType.LMT,
            totalQuantity: quantity,
            lmtPrice: takeProfitPrice,
            tif: TimeInForce.GTC,
            parentId: parentOrderId,
            transmit: false,
            account: ACCOUNT_ID,
        };

        // Stop Loss Order: STOP SELL
        const stopLossOrder: Order = {
            orderId: stopLossOrderId,
            action: OrderAction.SELL,
            orderType: OrderType.STP,
            totalQuantity: quantity,
            auxPrice: stopLossPrice, // Stop price
            tif: TimeInForce.GTC,
            parentId: parentOrderId,
            transmit: true, // Transmit all orders now
            account: ACCOUNT_ID,
        };

        try {
            this.ib.placeOrder(parentOrderId, contract, parentOrder);
            this.ib.placeOrder(takeProfitOrderId, contract, takeProfitOrder);
            this.ib.placeOrder(stopLossOrderId, contract, stopLossOrder);

            console.log(`   ✅ Orders submitted: Parent=${parentOrderId}, TP=${takeProfitOrderId}, SL=${stopLossOrderId}`);

            return {
                parentOrderId,
                takeProfitOrderId,
                stopLossOrderId,
                success: true,
            };
        } catch (error: any) {
            console.log(`   ❌ Order failed: ${error.message}`);
            return {
                parentOrderId: 0,
                takeProfitOrderId: 0,
                stopLossOrderId: 0,
                success: false,
                error: error.message,
            };
        }
    }

    /**
     * Get current positions in the account
     */
    async getPositions(): Promise<{ symbol: string; quantity: number; avgCost: number; marketPrice: number; unrealizedPnL: number }[]> {
        return new Promise((resolve) => {
            if (!this.connected) {
                resolve([]);
                return;
            }

            const positions: { symbol: string; quantity: number; avgCost: number; marketPrice: number; unrealizedPnL: number }[] = [];

            const handler = (account: any, contract: any, pos: any, avgCost: any) => {
                if (pos !== 0) {
                    positions.push({
                        symbol: contract.symbol || '',
                        quantity: pos,
                        avgCost: avgCost,
                        marketPrice: 0, // Will be filled later if needed
                        unrealizedPnL: 0,
                    });
                }
            };

            const endHandler = () => {
                this.ib.off(EventName.position, handler);
                this.ib.off(EventName.positionEnd, endHandler);
                resolve(positions);
            };

            this.ib.on(EventName.position, handler);
            this.ib.on(EventName.positionEnd, endHandler);
            this.ib.reqPositions();

            setTimeout(() => {
                this.ib.off(EventName.position, handler);
                this.ib.off(EventName.positionEnd, endHandler);
                resolve(positions);
            }, 5000);
        });
    }

    /**
     * Get open orders
     */
    async getOpenOrders(): Promise<{ orderId: number; symbol: string; action: string; quantity: number; orderType: string; price: number; status: string }[]> {
        return new Promise((resolve) => {
            if (!this.connected) {
                resolve([]);
                return;
            }

            const orders: { orderId: number; symbol: string; action: string; quantity: number; orderType: string; price: number; status: string }[] = [];

            const openOrderHandler = (orderId: any, contract: any, order: any, orderState: any) => {
                orders.push({
                    orderId: orderId,
                    symbol: contract.symbol || '',
                    action: order.action?.toString() || '',
                    quantity: Number(order.totalQuantity) || 0,
                    orderType: order.orderType?.toString() || '',
                    price: order.lmtPrice || order.auxPrice || 0,
                    status: orderState?.status || 'Unknown',
                });
            };

            const endHandler = () => {
                this.ib.off(EventName.openOrder, openOrderHandler);
                this.ib.off(EventName.openOrderEnd, endHandler);
                resolve(orders);
            };

            this.ib.on(EventName.openOrder, openOrderHandler);
            this.ib.on(EventName.openOrderEnd, endHandler);
            this.ib.reqOpenOrders();

            setTimeout(() => {
                this.ib.off(EventName.openOrder, openOrderHandler);
                this.ib.off(EventName.openOrderEnd, endHandler);
                resolve(orders);
            }, 5000);
        });
    }
}

// Singleton instance
let ibkrService: IBKRService | null = null;

export function getIBKRService(): IBKRService {
    if (!ibkrService) {
        ibkrService = new IBKRService();
    }
    return ibkrService;
}
