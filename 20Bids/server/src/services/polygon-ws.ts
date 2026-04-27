// New file: server/src/services/polygon-ws.ts
//
// Polygon Stocks WebSocket subscriber (Advanced plan only).
// Maintains a single persistent connection to wss://socket.polygon.io/stocks,
// authenticates with POLYGON_API_KEY, and subscribes to T.{symbol} (trades)
// for the active set of tickers. Each trade tick:
//   - updates an in-memory price cache (read by /api/recommendations)
//   - is emitted as a `tick` event for the WS relay to forward to mobile clients
//
// Why: with Advanced plan, REST polling for current prices is wasteful — one WS
// feed keeps a hot cache that any number of clients can read for free, and we
// can stream sub-second updates to the app.
//
// HOW TO INSTALL:
//   1. Drop this file at server/src/services/polygon-ws.ts
//   2. npm i ws  (and: npm i -D @types/ws)
//   3. Wire it from server/src/index.ts (see server-ws-setup.md)

import WebSocket from 'ws';
import { EventEmitter } from 'events';

const API_KEY = process.env.POLYGON_API_KEY;
const WS_URL = 'wss://socket.polygon.io/stocks';
const RECONNECT_MAX_DELAY_MS = 30_000;

export interface PriceTick {
  symbol: string;
  price: number;
  size: number;
  /** Polygon-supplied epoch ms of the trade. */
  timestamp: number;
}

const cache = new Map<string, PriceTick>();
let ws: WebSocket | null = null;
let authed = false;
let subscribedSymbols = new Set<string>();
let pendingSubscribeAfterAuth: string[] | null = null;
let reconnectAttempt = 0;
let reconnectTimer: NodeJS.Timeout | null = null;

/** Event bus — subscribe with `priceEvents.on('tick', cb)` from the mobile WS
 * relay code (see server-ws-setup.md) to forward ticks to connected clients. */
export const priceEvents = new EventEmitter();

/** Read the latest cached price for a symbol (sync, in-memory). */
export function getLastPrice(symbol: string): PriceTick | undefined {
  return cache.get(symbol.toUpperCase());
}

/** Read a snapshot of all cached prices. */
export function getAllPrices(): PriceTick[] {
  return [...cache.values()];
}

/** Update the active symbol set. Diffs against the current subscription so
 * we only send subscribe/unsubscribe for what actually changed. Safe to call
 * many times (e.g. once per /api/recommendations request). */
export function setActiveSymbols(symbols: string[]): void {
  const want = new Set(symbols.map((s) => s.toUpperCase()));
  const have = subscribedSymbols;

  const toAdd = [...want].filter((s) => !have.has(s));
  const toRemove = [...have].filter((s) => !want.has(s));

  if (!toAdd.length && !toRemove.length) return;
  if (!ws || ws.readyState !== WebSocket.OPEN || !authed) {
    // Connection not ready — remember the desired set; we'll send on auth.
    pendingSubscribeAfterAuth = [...want];
    subscribedSymbols = want;
    return;
  }

  if (toAdd.length) {
    ws.send(JSON.stringify({ action: 'subscribe', params: toAdd.map((s) => `T.${s}`).join(',') }));
  }
  if (toRemove.length) {
    ws.send(JSON.stringify({ action: 'unsubscribe', params: toRemove.map((s) => `T.${s}`).join(',') }));
  }
  subscribedSymbols = want;
}

function handleEvent(ev: any) {
  if (ev.ev === 'status') {
    if (ev.status === 'auth_success') {
      console.log('[PolygonWS] auth ok');
      authed = true;
      // Re-subscribe after reconnect (or apply pending)
      const want = pendingSubscribeAfterAuth ?? [...subscribedSymbols];
      pendingSubscribeAfterAuth = null;
      subscribedSymbols = new Set();
      if (want.length) {
        setActiveSymbols(want);
      }
    } else if (ev.status === 'auth_failed') {
      console.error('[PolygonWS] auth failed — aborting');
      ws?.close();
    }
    return;
  }
  if (ev.ev === 'T' && typeof ev.sym === 'string' && typeof ev.p === 'number') {
    const tick: PriceTick = {
      symbol: ev.sym,
      price: ev.p,
      size: ev.s ?? 0,
      timestamp: ev.t || Date.now(),
    };
    cache.set(ev.sym, tick);
    priceEvents.emit('tick', tick);
  }
}

function connect() {
  if (!API_KEY) {
    console.error('[PolygonWS] POLYGON_API_KEY not set; cannot connect');
    return;
  }

  ws = new WebSocket(WS_URL);
  authed = false;

  ws.on('open', () => {
    console.log('[PolygonWS] connected, authenticating...');
    reconnectAttempt = 0;
    ws!.send(JSON.stringify({ action: 'auth', params: API_KEY }));
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      const events = Array.isArray(msg) ? msg : [msg];
      for (const ev of events) handleEvent(ev);
    } catch (err) {
      console.error('[PolygonWS] parse error:', err);
    }
  });

  ws.on('error', (err) => {
    console.error('[PolygonWS] error:', (err as any)?.message ?? err);
  });

  ws.on('close', () => {
    console.warn('[PolygonWS] closed; will reconnect');
    ws = null;
    authed = false;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectAttempt++;
    const delay = Math.min(RECONNECT_MAX_DELAY_MS, 1000 * Math.pow(2, reconnectAttempt));
    reconnectTimer = setTimeout(connect, delay);
  });
}

/** Idempotent — calling twice doesn't open two connections. */
export function startPolygonWS(): void {
  if (ws) return;
  console.log('[PolygonWS] starting...');
  connect();
}
