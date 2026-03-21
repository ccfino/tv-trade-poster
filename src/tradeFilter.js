'use strict';
const { get: getPrefs } = require('./preferences');
const { classifyTrade }  = require('./tradeClassifier');

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
  return true;
}

module.exports = { isAllowed };
