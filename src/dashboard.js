'use strict';

/**
 * Dashboard HTTP server + Socket.IO bridge.
 * Serves the frontend at /  and bridges app events to the browser in real time.
 * Default port: 3501 (configurable via DASHBOARD_PORT env var).
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const appEvents = require('./appEvents');
const logger = require('./logger');
const preferences       = require('./preferences');
const performanceTracker = require('./performanceTracker');

const PUBLIC_DIR = path.join(__dirname, '../public');
const TEMP_DIR = path.join(__dirname, '../output/temp');
const ENV_FILE = path.join(__dirname, '../.env');

// ── In-memory history ────────────────────────────────────────────────────────
const posts = [];      // { rec, status, postPath?, postImageUrl?, postId?, error?, time }
const logs = [];       // { level, message, time }
let wsStatus = { connected: false, url: '' };
let queueSize = 0;
let io_ref = null;

// ── Helpers ──────────────────────────────────────────────────────────────────
function isToday(isoTime) {
  const d = new Date(isoTime);
  const n = new Date();
  return d.getDate() === n.getDate() && d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
}

function jsonResponse(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function parseEnvFile(content) {
  const result = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const raw = trimmed.slice(idx + 1).trim();
    result[key] = raw.replace(/^["']|["']$/g, '');
  }
  return result;
}

function updateEnvFile(updates) {
  let content = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === null) continue;
    const regex = new RegExp(`^${key}=.*$`, 'm');
    const line = `${key}=${value}`;
    if (regex.test(content)) {
      content = content.replace(regex, line);
    } else {
      content += `\n${line}`;
    }
  }
  fs.writeFileSync(ENV_FILE, content, 'utf8');
}

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

// ── HTTP request handler ─────────────────────────────────────────────────────
function handleRequest(req, res) {
  const urlObj = new URL(req.url, 'http://localhost');
  const pathname = urlObj.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // ── API routes ──────────────────────────────────────────────────────────
  if (pathname === '/api/dashboard') {
    const rl = require('./rateLimiter').status();
    const today = new Date().toDateString();
    return jsonResponse(res, {
      wsStatus,
      queueSize,
      posts:      posts.slice(0, 50),
      logs:       logs.slice(0, 100),
      postsToday: posts.filter(p => p.status === 'posted' && new Date(p.time).toDateString() === today).length,
      totalPosts: posts.length,
      igLimit:    rl,
    });
  }

  if (pathname === '/api/status') {
    const rl = require('./rateLimiter').status();
    return jsonResponse(res, {
      wsStatus,
      queueSize,
      postsToday: posts.filter((p) => isToday(p.time) && p.status === 'posted').length,
      totalPosts: posts.length,
      igLimit: rl,
    });
  }

  if (pathname === '/api/posts') {
    return jsonResponse(res, posts.slice(0, 50));
  }

  if (pathname === '/api/logs') {
    return jsonResponse(res, logs.slice(0, 200));
  }

  if (pathname === '/api/config' && req.method === 'GET') {
    try {
      const raw = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
      const env = parseEnvFile(raw);
      return jsonResponse(res, {
        WEBSOCKET_URL: env.WEBSOCKET_URL || '',
        SOCKET_TOKEN: env.SOCKET_TOKEN || '',
        INSTAGRAM_ACCOUNT_ID: env.INSTAGRAM_ACCOUNT_ID || '',
        META_ACCESS_TOKEN: env.META_ACCESS_TOKEN || '',
        META_API_VERSION: env.META_API_VERSION || 'v19.0',
        IMAGE_HOST_TYPE: env.IMAGE_HOST_TYPE || 'local',
        IMAGE_SERVER_PORT: env.IMAGE_SERVER_PORT || '3500',
        IMAGE_SERVER_PUBLIC_URL: env.IMAGE_SERVER_PUBLIC_URL || '',
        WATERMARK_TEXT: env.WATERMARK_TEXT || '',
        LOG_LEVEL: env.LOG_LEVEL || 'info',
      });
    } catch (err) {
      return jsonResponse(res, { error: err.message }, 500);
    }
  }

  if (pathname === '/api/config' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const config = JSON.parse(body);
        updateEnvFile(config);
        jsonResponse(res, { success: true, message: 'Saved to .env — restart the server to apply changes.' });
      } catch (err) {
        jsonResponse(res, { error: err.message }, 400);
      }
    });
    return;
  }

  if (pathname === '/api/preferences' && req.method === 'GET') {
    return jsonResponse(res, preferences.get());
  }

  if (pathname === '/api/preferences' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const updated = preferences.set(JSON.parse(body));
        if (io_ref) io_ref.emit('preferences_updated', updated);
        jsonResponse(res, { success: true, preferences: updated });
      } catch (err) { jsonResponse(res, { error: err.message }, 400); }
    });
    return;
  }

  if (pathname === '/api/performance' && req.method === 'GET') {
    return jsonResponse(res, performanceTracker.getHistory());
  }

  if (pathname === '/api/performance/refresh' && req.method === 'POST') {
    performanceTracker.refreshMetrics()
      .then(h => {
        if (io_ref) io_ref.emit('metrics_updated', (h || []).slice(0, 100));
        jsonResponse(res, { success: true });
      })
      .catch(err => jsonResponse(res, { error: err.message }, 500));
    return;
  }

  // ── Image files ────────────────────────────────────────────────────────
  if (pathname.startsWith('/images/')) {
    const filename = path.basename(pathname);
    const filePath = path.join(TEMP_DIR, filename);
    if (!filePath.startsWith(TEMP_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end('Not found');
      }
      const ext = path.extname(filename).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
    return;
  }

  // ── Static files from public/ ──────────────────────────────────────────
  const relativePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(PUBLIC_DIR, relativePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
}

// ── Start ────────────────────────────────────────────────────────────────────
function start(port = 3501) {
  if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

  const server = http.createServer(handleRequest);
  const io = new Server(server, { cors: { origin: '*' } });
  io_ref = io;

  // Send current state to newly connected browser clients
  io.on('connection', (socket) => {
    socket.emit('init', {
      wsStatus,
      queueSize,
      posts:       posts.slice(0, 50),
      logs:        logs.slice(0, 100),
      performance: performanceTracker.getHistory().slice(0, 100),
    });
  });

  // ── Bridge app events → browser ────────────────────────────────────────
  appEvents.on('ws_connected', (data) => {
    wsStatus = { connected: true, url: data.url, id: data.id };
    io.emit('ws_status', wsStatus);
  });

  appEvents.on('ws_disconnected', (data) => {
    wsStatus = { connected: false, url: wsStatus.url, reason: data.reason };
    io.emit('ws_status', wsStatus);
  });

  appEvents.on('recommendation', ({ rec }) => {
    const entry = { rec, status: 'queued', time: new Date().toISOString() };
    posts.unshift(entry);
    if (posts.length > 100) posts.pop();
    queueSize = Math.max(0, queueSize + 1);
    io.emit('recommendation', entry);
    io.emit('queue_size', queueSize);
  });

  appEvents.on('caption_ready', ({ stock, caption }) => {
    const entry = posts.find((p) => p.rec?.stock === stock && p.status === 'queued');
    if (entry) {
      entry.caption = caption;
      io.emit('post_update', entry);
    }
  });

  appEvents.on('processing_start', ({ stock }) => {
    const entry = posts.find((p) => p.rec?.stock === stock && p.status === 'queued');
    if (entry) {
      entry.status = 'processing';
      io.emit('post_update', entry);
    }
    queueSize = Math.max(0, queueSize - 1);
    io.emit('queue_size', queueSize);
  });

  appEvents.on('images_generated', ({ stock, postPath, reelPath, caption }) => {
    const entry = posts.find((p) => p.rec?.stock === stock && p.status === 'processing');
    if (entry) {
      entry.postPath = postPath;
      entry.reelPath = reelPath;
      entry.postImageUrl = postPath.startsWith('http') ? postPath : `/images/${path.basename(postPath)}`;
      if (caption) entry.caption = caption;
      io.emit('post_update', entry);
    }
  });

  appEvents.on('post_success', ({ stock, postId, caption }) => {
    const entry = posts.find((p) => p.rec?.stock === stock && p.status === 'processing');
    if (entry) {
      entry.status = 'posted';
      entry.postId = postId;
      if (caption) entry.caption = caption;
      io.emit('post_update', entry);
    }
  });

  appEvents.on('post_failed', ({ stock, error }) => {
    const entry = posts.find((p) => p.rec?.stock === stock);
    if (entry) {
      entry.status = 'failed';
      entry.error = error;
      io.emit('post_update', entry);
    }
  });

  appEvents.on('dry_run', ({ stock, postPath, reelPath, caption }) => {
    const entry = posts.find((p) => p.rec?.stock === stock && p.status === 'processing');
    if (entry) {
      entry.status = 'dry_run';
      entry.postPath = postPath;
      entry.reelPath = reelPath;
      entry.postImageUrl = postPath.startsWith('http') ? postPath : `/images/${path.basename(postPath)}`;
      if (caption) entry.caption = caption;
      io.emit('post_update', entry);
    }
  });

  appEvents.on('story_success', ({ stock, storyId }) => {
    const entry = posts.find(p => p.rec?.stock === stock && p.status === 'processing');
    if (entry) { entry.storyId = storyId; io.emit('post_update', entry); }
  });

  appEvents.on('log', (data) => {
    logs.unshift(data);
    if (logs.length > 500) logs.pop();
    io.emit('log', data);
  });

  server.listen(port, () => {
    logger.info(`Dashboard available at http://localhost:${port}`);
    performanceTracker.startBackgroundRefresh(io);
  });

  return server;
}

module.exports = { start };
