'use strict';

const { classifyTrade } = require('./tradeClassifier');

/**
 * Maps a Finosauras trade document (from trade_insert / trade_update events)
 * to the internal `rec` format consumed by the image generator, caption
 * builder, and pipeline.
 *
 * Trade doc fields of interest:
 *   _id, ticker, position (BUY|SELL), initPrice, stoploss, target,
 *   exitReason, exitPrice, createdOn, channel_username,
 *   is_tv, is_pdf, twitter_data
 *
 * advisorAccuracy: { totalTrades, positiveTrades, negativeTrades, accuracy, returns }
 */

/**
 * Normalize the raw exitReason string from the websocket into a known constant.
 * The server sends lowercase free-form strings like "target", "stoploss",
 * "price mismatch", etc. We map them to: TARGET_HIT, SL_HIT, or keep as-is.
 */
function normalizeExitReason(raw) {
  if (!raw) return null;
  const r = raw.toLowerCase().trim();
  if (r === 'target' || r === 'target_hit' || r === 'target hit') return 'TARGET_HIT';
  if (r === 'stoploss' || r === 'sl' || r === 'sl_hit' || r === 'sl hit' || r === 'stop loss') return 'SL_HIT';
  return raw;   // "price mismatch", "period", "manual", etc. — pass through as-is
}

function normalizeTargets(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean).map(Number);
  if (typeof raw === 'number') return [raw];
  if (typeof raw === 'string') {
    if (raw.includes('-')) {
      const parts = raw.split('-').map((s) => Number(s.trim())).filter((n) => !isNaN(n));
      return parts;
    }
    const n = Number(raw);
    return isNaN(n) ? [] : [n];
  }
  return [];
}

/**
 * Map an open (newly inserted) trade to a rec object.
 */
function tradeToRec(trade, advisorAccuracy = null, advisorData = null) {
  return {
    channel:   trade.channel_username || 'Finosauras',
    type:      'equity',
    tradeType: classifyTrade(trade),
    stock:     trade.ticker || '',
    action:    (trade.position || '').toUpperCase(),   // BUY | SELL
    entry:     trade.initPrice,
    target:    normalizeTargets(trade.target),
    stopLoss:  trade.stoploss,
    timestamp: trade.createdOn || new Date().toISOString(),

    // TV frame image — used directly as the Instagram post image when present
    tvFrameImageUrl:  trade.frame_url   || null,

    // Metadata — used by caption builder / dashboard but not image generator
    tradeId:          String(trade._id || ''),
    advisorAccuracy,
    advisorData,
    is_tv:            trade.is_tv        || false,
    is_pdf:           trade.is_pdf       || false,
    twitter_data:     trade.twitter_data || null,
  };
}

/**
 * Map a closed trade to a rec object.
 * Used when trade_update fires with an exitReason.
 *
 * The image uses exitPrice as the "target" slot so the card clearly
 * shows the exit level; the caption conveys the full context.
 */
function closedTradeToRec(trade, advisorAccuracy = null, advisorData = null) {
  const base = tradeToRec(trade, advisorAccuracy, advisorData);

  // Calculate return % so the caption builder can display it
  const entry = trade.initPrice;
  const exit  = trade.exitPrice;
  let returnPct = null;
  if (entry && exit) {
    const isBuy = (trade.position || '').toUpperCase() === 'BUY';
    returnPct = isBuy
      ? ((exit - entry) / entry) * 100
      : ((entry - exit) / entry) * 100;
  }

  return {
    ...base,
    // Override target to show exit price on the image card
    target:     exit ? [exit] : base.target,
    exitPrice:  exit,
    exitReason: normalizeExitReason(trade.exitReason),
    returnPct,
    isClosed:   true,
  };
}

module.exports = { tradeToRec, closedTradeToRec, normalizeExitReason };
