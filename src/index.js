'use strict';

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const async = require('async');
const logger = require('./logger');
const { createWebSocketClient } = require('./websocket');
const { processRecommendation } = require('./pipeline');
const imageServer = require('./imageServer');
const appEvents = require('./appEvents');
const dashboard = require('./dashboard');
const { tradeToRec, closedTradeToRec } = require('./tradeMapper');
const { isAllowed } = require('./tradeFilter');

// ---------------------------------------------------------------------------
// Ensure required directories exist
// ---------------------------------------------------------------------------
const TEMP_DIR = path.join(__dirname, '../output/temp');
[TEMP_DIR, path.join(__dirname, '../output')].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ---------------------------------------------------------------------------
// Validate required env vars (skip in dry-run)
// ---------------------------------------------------------------------------
const DRY_RUN = process.argv.includes('--dry-run');

function validateEnv() {
  if (DRY_RUN) return;
  const required = ['INSTAGRAM_ACCOUNT_ID', 'META_ACCESS_TOKEN', 'IMAGE_SERVER_PUBLIC_URL'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    logger.error(`Missing required environment variables: ${missing.join(', ')}`);
    logger.error('Copy .env.example to .env and fill in the values.');
    process.exit(1);
  }
}

validateEnv();

// ---------------------------------------------------------------------------
// Async queue — serialize pipeline runs (prevent concurrent uploads flooding IG)
// ---------------------------------------------------------------------------
const queue = async.queue(async (rec) => {
  await processRecommendation(rec);
}, 1 /* concurrency = 1 */);

queue.error((err, rec) => {
  logger.error(`Queue error for ${rec?.stock}: ${err.message}`);
});

// ---------------------------------------------------------------------------
// Start the local image server (only needed when not using S3 / external URL)
// ---------------------------------------------------------------------------
async function startImageServer() {
  if (DRY_RUN) return;
  const hostType = process.env.IMAGE_HOST_TYPE || 'local';
  if (hostType === 'local') {
    const port = parseInt(process.env.IMAGE_SERVER_PORT || '3500', 10);
    await imageServer.start(port);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  logger.info('===== TV Trade Poster starting =====');
  if (DRY_RUN) logger.warn('DRY RUN mode active — no Instagram posts will be made');

  await startImageServer();

  const dashPort = parseInt(process.env.DASHBOARD_PORT || '3501', 10);
  dashboard.start(dashPort);

  const wsUrl = process.env.WEBSOCKET_URL || 'https://terminal.finosauras.com';

  const client = createWebSocketClient(wsUrl, {

    // ── New trade ──────────────────────────────────────────────────────────
    onInsert: async (trade, advisorAccuracy, advisorData) => {
      if (!isAllowed(trade)) {
        logger.debug(`Skipping trade from ${trade.channel_username} (not an allowed TV channel)`);
        return;
      }
      const rec = tradeToRec(trade, advisorAccuracy, advisorData);
      if (!rec.stock || !rec.action) {
        logger.warn(`trade_insert: skipping (missing ticker/position) — id: ${trade._id}`);
        return;
      }
      logger.info(`New trade: ${rec.channel} → ${rec.stock} ${rec.action} @ ₹${rec.entry}`);
      appEvents.emit('recommendation', { rec });
      queue.push(rec);
    },

    // ── Trade updated ──────────────────────────────────────────────────────
    onUpdate: async (trade, updatedFields, advisorAccuracy, advisorData) => {
      if (!isAllowed(trade)) return;

      // Only act when exitReason was just set (trade just closed)
      const justClosed = updatedFields && 'exitReason' in updatedFields && trade.exitReason;
      if (!justClosed) return;

      const rec = closedTradeToRec(trade, advisorAccuracy, advisorData);
      logger.info(`Trade closed [${rec.exitReason}]: ${rec.stock} exit @ ₹${rec.exitPrice}`);
      appEvents.emit('recommendation', { rec });
      queue.push(rec);
    },

    // ── Trade deleted ──────────────────────────────────────────────────────
    onDelete: (tradeId) => {
      logger.info(`Trade deleted: ${tradeId}`);
    },

  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    logger.info('Shutting down…');
    client.close();
    imageServer.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down…');
    client.close();
    imageServer.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error(`Fatal startup error: ${err.message}`, err);
  process.exit(1);
});
