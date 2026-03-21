'use strict';
const INDICES = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX'];

function classifyTrade(trade) {
  const ticker = (trade.ticker || trade.stock || '').toUpperCase().trim();
  if (ticker.endsWith('CE') || ticker.endsWith('PE')) {
    return INDICES.some(i => ticker.startsWith(i)) ? 'indexOption' : 'stockOption';
  }
  if (ticker.endsWith('FUT')) {
    return INDICES.some(i => ticker.startsWith(i)) ? 'indexFuture' : 'stockFuture';
  }
  return 'equity';
}

const TYPE_LABELS = {
  equity:      'Equity Stock',
  indexOption: 'Index Option',
  stockOption: 'Stock Option',
  indexFuture: 'Index Future',
  stockFuture: 'Stock Future',
};

module.exports = { classifyTrade, TYPE_LABELS };
