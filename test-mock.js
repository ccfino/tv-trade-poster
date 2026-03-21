#!/usr/bin/env node
/**
 * Local test harness — starts a mock Socket.IO server that emits sample
 * recommendations every 5 seconds.  Use together with --dry-run:
 *
 *   node test-mock.js        ← in one terminal (starts mock server on http://localhost:8765)
 *   npm run dry-run          ← in another terminal (set WEBSOCKET_URL=http://localhost:8765 in .env)
 */

'use strict';

const http = require('http');
const { Server } = require('socket.io');

const PORT = 8765;
const server = http.createServer();
const io = new Server(server, { cors: { origin: '*' } });

const SAMPLES = [
  {
    channel: 'CNBC TV18',
    type: 'equity',
    stock: 'Reliance Industries',
    action: 'BUY',
    entry: 2640,
    target: [2800, 2950],
    stopLoss: 2580,
    analyst: 'Rajesh Palviya',
    timestamp: new Date().toISOString(),
  },
  {
    channel: 'Zee Business',
    type: 'F&O',
    stock: 'Bank Nifty',
    action: 'SELL',
    entry: '46800-46900',
    target: [46000, 45200],
    stopLoss: 47200,
    analyst: 'Anil Singhvi',
    timestamp: new Date().toISOString(),
  },
  {
    channel: 'ET Now',
    type: 'equity',
    stock: 'Infosys',
    action: 'BUY',
    entry: 1540,
    target: 1680,
    stopLoss: 1490,
    timestamp: new Date().toISOString(),
  },
  {
    channel: 'NDTV Profit',
    type: 'F&O',
    stock: 'Nifty 50',
    action: 'BUY',
    entry: 22100,
    target: [22400, 22700],
    stopLoss: 21900,
    analyst: 'Mitessh Thakkar',
    timestamp: new Date().toISOString(),
  },
];

let idx = 0;

io.on('connection', (socket) => {
  console.log('[mock-server] Client connected:', socket.id);

  const send = () => {
    const rec = { ...SAMPLES[idx % SAMPLES.length], timestamp: new Date().toISOString() };
    idx++;
    console.log(`[mock-server] Sending: ${rec.channel} → ${rec.stock} ${rec.action}`);
    socket.emit('recommendation', rec);
  };

  send(); // send immediately
  const timer = setInterval(send, 5000);

  socket.on('disconnect', () => {
    clearInterval(timer);
    console.log('[mock-server] Client disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`[mock-server] Mock Socket.IO server running on http://localhost:${PORT}`);
  console.log('[mock-server] Set WEBSOCKET_URL=http://localhost:8765 in your .env, then run: npm run dry-run');
});
