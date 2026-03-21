'use strict';
require('dotenv').config();

const io = require('socket.io-client');
const fetch = require('node-fetch');
const { tradeToRec, closedTradeToRec } = require('./tradeMapper');
const { classifyTrade } = require('./tradeClassifier');

const VERCEL_URL = (process.env.VERCEL_URL || '').replace(/\/$/, '');
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const WS_URL = process.env.WEBSOCKET_URL || 'https://terminal.finosauras.com';
const WS_TOKEN = process.env.SOCKET_TOKEN;

let cachedPrefs = null;
let prefsLastFetched = 0;

async function getPrefs() {
  const now = Date.now();
  if (cachedPrefs && now - prefsLastFetched < 30_000) return cachedPrefs;
  try {
    const r = await fetch(`${VERCEL_URL}/api/preferences`, { timeout: 5000 });
    cachedPrefs = await r.json();
    prefsLastFetched = now;
  } catch {
    cachedPrefs = cachedPrefs || {
      channels: ['zeebusiness', 'cnbcawaaz', 'ndtvprofit'],
      tradeTypes: {},
    };
  }
  return cachedPrefs;
}

function normalise(str) {
  return (str || '').toLowerCase().replace(/[\s_-]/g, '');
}

async function isAllowed(trade) {
  if (!trade.is_tv) return false;
  const prefs = await getPrefs();
  const channel = normalise(trade.channel_username);
  const channels = (prefs.channels || []).map(normalise);
  if (!channels.some(a => channel.includes(a) || a.includes(channel))) return false;
  const type = classifyTrade(trade);
  if (prefs.tradeTypes && prefs.tradeTypes[type] === false) return false;
  return true;
}

async function post(path, body) {
  try {
    const res = await fetch(`${VERCEL_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': WEBHOOK_SECRET,
      },
      body: JSON.stringify(body),
      timeout: 10000,
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[worker] POST ${path} failed ${res.status}: ${text}`);
    }
  } catch (err) {
    console.error(`[worker] POST ${path} error: ${err.message}`);
  }
}

function connect() {
  console.log(`[worker] Connecting to ${WS_URL}`);

  const socket = io(WS_URL, {
    auth: WS_TOKEN ? { token: WS_TOKEN } : undefined,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 5000,
    reconnectionDelayMax: 30000,
  });

  socket.on('connect', () => {
    console.log(`[worker] Connected (id: ${socket.id})`);
    post('/api/webhook/heartbeat', { connected: true, id: socket.id, url: WS_URL });
  });

  socket.on('disconnect', (reason) => {
    console.log(`[worker] Disconnected: ${reason}`);
    post('/api/webhook/heartbeat', { connected: false, reason });
  });

  socket.on('trade_insert', async (data) => {
    try {
      const trade = data?.newValue || data;
      if (!trade?.ticker) return;
      if (!(await isAllowed(trade))) return;
      console.log(`[worker] trade_insert: ${trade.ticker} (${trade.channel_username}) frame_url=${trade.frame_url || 'none'}`);
      const rec = tradeToRec(trade);
      await post('/api/webhook/trade', { type: 'insert', rec });
    } catch (err) {
      console.error(`[worker] trade_insert error: ${err.message}`);
    }
  });

  socket.on('trade_update', async (data) => {
    try {
      const trade = data?.fullUpdatedDocument || data;
      const updatedFields = data?.updatedFields || {};
      if (!trade?.ticker) return;
      if (!updatedFields.exitReason) return;
      if (!(await isAllowed(trade))) return;
      console.log(`[worker] trade_update (closed): ${trade.ticker} reason=${trade.exitReason}`);
      const rec = closedTradeToRec(trade);
      await post('/api/webhook/trade', { type: 'update', rec });
    } catch (err) {
      console.error(`[worker] trade_update error: ${err.message}`);
    }
  });
}

// Heartbeat every 60s so Vercel knows the worker is alive
setInterval(() => {
  post('/api/webhook/heartbeat', { connected: true, url: WS_URL, ping: true });
}, 60_000);

connect();
