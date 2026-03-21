const EQUITY_HASHTAGS = [
  '#stockmarket', '#stocks', '#equitytrading', '#NSE', '#BSE',
  '#investing', '#stocktips', '#sensex', '#nifty50', '#trading',
];

const FNO_HASHTAGS = [
  '#FnO', '#optionstrading', '#futuresandoptions', '#derivatives',
  '#optionbuyers', '#banknifty', '#niftyoptions', '#stockmarket', '#trading',
];

const COMMON_HASHTAGS = ['#recommendation', '#tvanalyst', '#StockAlert', '#IntraDay'];

const EXIT_REASON_LABELS = {
  TARGET_HIT: 'TARGET HIT',
  SL_HIT:     'STOP LOSS HIT',
  PERIOD:     'TIME PERIOD EXPIRED',
  MANUAL:     'MANUALLY CLOSED',
};

/**
 * Build an Instagram caption from a rec object.
 * Handles both open trades and closed trades (rec.isClosed === true).
 */
export function buildCaption(rec) {
  return rec.isClosed ? buildClosedCaption(rec) : buildOpenCaption(rec);
}

// ── Open trade ──────────────────────────────────────────────────────────────
function buildOpenCaption(rec) {
  const {
    channel  = '',
    type     = 'equity',
    stock    = '',
    action   = '',
    entry,
    target,
    stopLoss,
    analyst,
  } = rec;

  const actionEmoji = action.toUpperCase() === 'BUY' ? '🟢' : '🔴';
  const typeLabel   = type.toUpperCase().includes('F') ? 'F&O' : 'Equity';

  const targetsArr = Array.isArray(target) ? target : target ? [target] : [];
  const targetStr  = targetsArr.map((t) => `₹${t}`).join(', ');
  const entryStr   = entry != null ? `₹${entry}` : null;

  const lines = [];
  lines.push(`${actionEmoji} ${action.toUpperCase()} ${stock.toUpperCase()} [${typeLabel}]`);
  if (channel) lines.push(`📺 ${channel}${analyst ? ` | 👤 ${analyst}` : ''}`);
  lines.push('');
  if (entryStr)  lines.push(`🎯 Entry : ${entryStr}`);
  if (targetStr) lines.push(`🏹 Target: ${targetStr}`);
  if (stopLoss != null) lines.push(`🛑 SL    : ₹${stopLoss}`);
  lines.push('');
  lines.push('⚠️ For educational purposes only. Not SEBI advice.');
  lines.push('');
  lines.push(buildHashtags(type, stock));

  return lines.join('\n');
}

// ── Closed trade ────────────────────────────────────────────────────────────
function buildClosedCaption(rec) {
  const {
    channel     = '',
    type        = 'equity',
    stock       = '',
    action      = '',
    entry,
    exitPrice,
    exitReason  = '',
    returnPct,
  } = rec;

  const typeLabel      = type.toUpperCase().includes('F') ? 'F&O' : 'Equity';
  const exitLabel      = EXIT_REASON_LABELS[exitReason] || exitReason.replace(/_/g, ' ');
  const isProfit       = returnPct !== null && returnPct !== undefined && returnPct >= 0;
  const resultEmoji    = isProfit ? '✅' : '❌';
  const entryStr       = entry    != null ? `₹${entry}`     : null;
  const exitStr        = exitPrice != null ? `₹${exitPrice}` : null;

  let returnStr = null;
  if (returnPct !== null && returnPct !== undefined) {
    const sign = returnPct >= 0 ? '+' : '';
    returnStr = `${sign}${returnPct.toFixed(2)}%`;
  }

  const lines = [];
  lines.push(`${resultEmoji} ${exitLabel} — ${stock.toUpperCase()} [${typeLabel}]`);
  if (channel) lines.push(`📺 ${channel}`);
  lines.push('');
  if (entryStr)   lines.push(`🎯 Entry  : ${entryStr}`);
  if (exitStr)    lines.push(`🏁 Exit   : ${exitStr}`);
  if (returnStr)  lines.push(`📊 Return : ${returnStr}`);
  lines.push('');
  lines.push('⚠️ For educational purposes only. Not SEBI advice.');
  lines.push('');
  lines.push(buildHashtags(type, stock));

  return lines.join('\n');
}

// ── Shared ──────────────────────────────────────────────────────────────────
function buildHashtags(type, stock) {
  const typeHashtags = type.toUpperCase().includes('F') ? FNO_HASHTAGS : EQUITY_HASHTAGS;
  const tags = [...new Set([...typeHashtags, ...COMMON_HASHTAGS])].slice(0, 20);
  if (stock) {
    const stockTag = `#${stock.replace(/\s+/g, '').replace(/[^a-zA-Z0-9_]/g, '')}`;
    tags.push(stockTag);
  }
  return tags.join(' ');
}
