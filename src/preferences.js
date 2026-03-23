'use strict';
const fs   = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../preferences.json');

const DEFAULTS = {
  tradeTypes: {
    equity:      true,
    indexOption: true,
    stockOption: true,
    indexFuture: true,
    stockFuture: true,
  },
  postToFeed:    true,
  postToStory:   false,
  channels:      ['zeebusiness', 'cnbcawaaz', 'ndtvprofit'],

  // Only post closed trades (target hit / stop loss hit) — never open trades
  onlyClosedTrades: true,

  // Which exit reasons to post
  exitReasonFilter: {
    targetHit: true,
    slHit:     true,
  },

  // Posting frequency cap (for feed posts)
  postingFrequency: {
    enabled:  false,
    maxPosts: 1,
    perUnit:  'hour',   // 'minute' | 'hour' | 'day'
  },

  // Max Instagram Stories per calendar day
  maxStoriesPerDay: 20,
};

function load() {
  try {
    if (fs.existsSync(FILE)) return deepMerge(DEFAULTS, JSON.parse(fs.readFileSync(FILE, 'utf8')));
  } catch (_) {}
  return JSON.parse(JSON.stringify(DEFAULTS));
}

function save(p) { fs.writeFileSync(FILE, JSON.stringify(p, null, 2), 'utf8'); }

function get()         { return load(); }
function set(updates)  { const m = deepMerge(load(), updates); save(m); return m; }

function deepMerge(base, upd) {
  const r = { ...base };
  for (const k of Object.keys(upd)) {
    if (upd[k] !== null && typeof upd[k] === 'object' && !Array.isArray(upd[k]))
      r[k] = deepMerge(base[k] || {}, upd[k]);
    else r[k] = upd[k];
  }
  return r;
}

module.exports = { get, set, DEFAULTS };
