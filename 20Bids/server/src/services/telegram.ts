/**
 * Telegram Notification Service
 * 
 * Sends notifications to Telegram when orders are placed.
 * 
 * Setup:
 * 1. Create a bot via @BotFather on Telegram
 * 2. Get the bot token
 * 3. Send a message to your bot
 * 4. Get your chat ID from: https://api.telegram.org/bot<TOKEN>/getUpdates
 * 5. Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to environment
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

interface OrderInfo {
    symbol: string;
    quantity: number;
    limitPrice: number;
    marketPrice: number;
}

export async function sendTelegramNotification(message: string): Promise<boolean> {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.log('⚠️  Telegram not configured (missing token or chat ID)');
        return false;
    }

    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'HTML',
                disable_web_page_preview: true,
            }),
        });

        if (response.ok) {
            console.log('✅ Telegram notification sent');
            return true;
        } else {
            const error = await response.text();
            console.error('❌ Telegram error:', error);
            return false;
        }
    } catch (error) {
        console.error('❌ Telegram error:', error);
        return false;
    }
}

export async function sendOrdersNotification(orders: OrderInfo[]): Promise<boolean> {
    if (orders.length === 0) return false;

    const now = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });

    let message = `🚀 <b>20Bids Auto-Trader</b>\n`;
    message += `📅 ${now}\n\n`;
    message += `<b>${orders.length} órdenes enviadas:</b>\n\n`;

    for (const order of orders) {
        const discount = ((1 - order.limitPrice / order.marketPrice) * 100).toFixed(1);
        message += `<b>${order.symbol}</b>\n`;
        message += `  📊 ${order.quantity} acciones\n`;
        message += `  💰 Límite: $${order.limitPrice.toFixed(2)} (-${discount}%)\n`;
        message += `  📈 Mercado: $${order.marketPrice.toFixed(2)}\n\n`;
    }

    message += `\n⚠️ Revisa y ajusta precios en IBKR`;

    return sendTelegramNotification(message);
}

export async function sendTradeExecutedNotification(
    symbol: string,
    quantity: number,
    price: number,
    type: 'BUY' | 'SELL' | 'TP' | 'SL'
): Promise<boolean> {
    const emoji = type === 'BUY' ? '🟢' : type === 'SELL' ? '🔴' : type === 'TP' ? '🎯' : '🛑';
    const label = type === 'TP' ? 'Take Profit' : type === 'SL' ? 'Stop Loss' : type;

    const message = `${emoji} <b>${label}</b>: ${symbol}\n` +
        `📊 ${quantity} @ $${price.toFixed(2)}`;

    return sendTelegramNotification(message);
}
