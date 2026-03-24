'use strict';
const { get: getPrefs } = require('./preferences');
const { classifyTrade }  = require('./tradeClassifier');
const { normalizeExitReason } = require('./tradeMapper');

function normalise(str) {
  return (str || '').toLowerCase().replace(/[\s_\-]/g, '');
}

function isAllowed(trade) {
  const prefs = getPrefs();
  if (!trade.is_tv) return false;
  const channel  = normalise(trade.channel_username);
  const channels = (prefs.channels || []).map(normalise);
  if (!channels.some(a => channel.includes(a) || a.includes(channel))) return false;
  const type = classifyTrade(trade);
  if (prefs.tradeTypes && prefs.tradeTypes[type] === false) return false;

  // Only post closed trades (target hit / SL hit) if preference is enabled
  if (prefs.onlyClosedTrades) {
    if (!trade.exitReason) return false;
    const reason = normalizeExitReason(trade.exitReason);
    const erf = prefs.exitReasonFilter || {};
    if (reason === 'TARGET_HIT' && erf.targetHit === false) return false;
    if (reason === 'SL_HIT'     && erf.slHit     === false) return false;
    // Block other exits like "price mismatch", "period", "manual"
    if (reason !== 'TARGET_HIT' && reason !== 'SL_HIT') return false;
  }

  return true;
}

module.exports = { isAllowed };
