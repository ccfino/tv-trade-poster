'use strict';

const { io } = require('socket.io-client');
const logger = require('./logger');
const appEvents = require('./appEvents');

/**
 * Create a resilient Socket.IO client connected to the Finosauras terminal.
 *
 * @param {string} url          - Server URL (e.g. https://terminal.finosauras.com)
 * @param {object} handlers
 * @param {function} handlers.onInsert  - async (trade, advisorAccuracy, advisorData) => void
 * @param {function} handlers.onUpdate  - async (fullDoc, updatedFields, advisorAccuracy, advisorData) => void
 * @param {function} handlers.onDelete  - (tradeId) => void
 * @returns {{ close: function }}
 */
function createWebSocketClient(url, { onInsert, onUpdate, onDelete }) {
  const token = process.env.SOCKET_TOKEN;

  logger.info(`Connecting to Socket.IO: ${url}`);

  const socket = io(url, {
    auth:                  token ? { token } : undefined,
    transports:            ['websocket', 'polling'],
    reconnection:          true,
    reconnectionDelay:     2_000,
    reconnectionDelayMax:  60_000,
    reconnectionAttempts:  Infinity,
    timeout:               10_000,
  });

  // ── Connection lifecycle ────────────────────────────────────────────────
  socket.on('connect', () => {
    logger.info(`Socket.IO connected (id: ${socket.id})`);
    appEvents.emit('ws_connected', { url, id: socket.id });
  });

  socket.on('disconnect', (reason) => {
    logger.warn(`Socket.IO disconnected: ${reason}`);
    appEvents.emit('ws_disconnected', { reason });
  });

  socket.on('connect_error', (err) => {
    logger.error(`Socket.IO connection error: ${err.message}`);
    appEvents.emit('ws_error', { message: err.message });
  });

  // ── Trade events ────────────────────────────────────────────────────────
  socket.on('trade_insert', async (payload) => {
    logger.debug(`trade_insert received: ${JSON.stringify(payload).slice(0, 400)}`);
    try {
      const { newValue, advisorAccuracy = null, advisorData = null } = payload || {};
      if (newValue) logger.debug(`trade frame_url: ${newValue.frame_url || '(none)'}`);
      if (!newValue) {
        logger.warn('trade_insert payload missing newValue — skipping');
        return;
      }
      await onInsert(newValue, advisorAccuracy, advisorData);
    } catch (err) {
      logger.error(`trade_insert handler threw: ${err.message}`, err);
    }
  });

  socket.on('trade_update', async (payload) => {
    logger.debug(`trade_update received: ${JSON.stringify(payload).slice(0, 200)}`);
    try {
      const {
        fullUpdatedDocument,
        updatedFields     = {},
        advisorAccuracy   = null,
        advisorData       = null,
      } = payload || {};

      if (!fullUpdatedDocument) {
        logger.warn('trade_update payload missing fullUpdatedDocument — skipping');
        return;
      }
      await onUpdate(fullUpdatedDocument, updatedFields, advisorAccuracy, advisorData);
    } catch (err) {
      logger.error(`trade_update handler threw: ${err.message}`, err);
    }
  });

  socket.on('trade_delete', (payload) => {
    logger.debug(`trade_delete received: ${JSON.stringify(payload).slice(0, 200)}`);
    try {
      const tradeId = payload?.tradeId || payload?._id || '(unknown)';
      onDelete(tradeId);
    } catch (err) {
      logger.error(`trade_delete handler threw: ${err.message}`, err);
    }
  });

  return {
    close() {
      socket.disconnect();
    },
  };
}

module.exports = { createWebSocketClient };
