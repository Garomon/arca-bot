const fs = require('fs');
const path = require('path');

const stateFile = path.join(__dirname, '..', 'temp_btc_state.json');
const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));

const buys = state.filledOrders.filter(o => o.side && o.side.toLowerCase() === 'buy');
const sells = state.filledOrders.filter(o => o.side && o.side.toLowerCase() === 'sell');

console.log('=== BTC IDs Analysis ===');
console.log('\nBUY IDs (first 5):');
buys.slice(0, 5).forEach(b => console.log('  ' + b.id));

console.log('\nSELL matchedLots IDs (first 5 sells):');
sells.slice(0, 5).forEach(s => {
  if (s.matchedLots && s.matchedLots.length > 0) {
    console.log('  SELL #' + s.id + ' -> matchedLots: ' + s.matchedLots.map(m => m.lotId).join(', '));
  }
});

// Check how many matchedLots point to valid BUY IDs
const buyIds = new Set(buys.map(b => String(b.id)));
let validMatches = 0, totalMatches = 0;
sells.forEach(s => {
  (s.matchedLots || []).forEach(m => {
    totalMatches++;
    if (buyIds.has(String(m.lotId))) validMatches++;
  });
});

console.log('\n=== Trazability ===');
console.log('Valid matchedLots: ' + validMatches + '/' + totalMatches + ' (' + (totalMatches > 0 ? (validMatches/totalMatches*100).toFixed(0) : 0) + '%)');

// Check ID patterns
const syntheticBuys = buys.filter(b => String(b.id).startsWith('REC_') || String(b.id).startsWith('SYNC_'));
const numericBuys = buys.filter(b => /^\d+$/.test(String(b.id)));
console.log('\nBUY ID Types:');
console.log('  Synthetic (REC_/SYNC_): ' + syntheticBuys.length);
console.log('  Numeric (Real Binance): ' + numericBuys.length);

// Check inventory IDs
console.log('\n=== Inventory IDs ===');
(state.inventory || []).slice(0, 5).forEach(lot => {
  console.log('  ' + lot.id + ' @ ' + lot.price);
});
