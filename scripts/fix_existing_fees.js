/**
 * Fix existing trades that have USD values stored as BNB
 * If fee > 0.001 and feeCurrency is BNB, it's probably USD value - convert back
 */
const fs = require('fs');
const path = require('path');

const pair = process.argv[2] || 'SOL';
const STATE_FILE = path.join(__dirname, '..', 'data', 'sessions', 'VANTAGE01_' + pair + 'USDT_state.json');

console.log('=== FIX EXISTING FEES for ' + pair + ' ===');
console.log('State: ' + STATE_FILE + '\n');

if (!fs.existsSync(STATE_FILE)) {
    console.error('State file not found');
    process.exit(1);
}

const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
let fixedCount = 0;

for (const order of state.filledOrders) {
    // If feeCurrency is BNB but fee value is suspiciously high (> 0.001 BNB = $0.70)
    // it's probably the USD value stored incorrectly
    if (order.feeCurrency && order.feeCurrency.includes('BNB') && order.fees > 0.001) {
        const oldFee = order.fees;
        // Convert back: USD value / 700 = BNB amount
        const realBNB = oldFee / 700;

        // Store corrected values
        order.feesUSD = oldFee; // Keep USD for profit calculation
        order.fees = realBNB;   // Real BNB amount for display

        fixedCount++;
        console.log('Fixed ' + order.side + ' #' + order.id + ': ' + oldFee.toFixed(6) + ' USD -> ' + realBNB.toFixed(8) + ' BNB');
    }
    // Also fix BNB- typo
    if (order.feeCurrency === 'BNB-') {
        order.feeCurrency = 'BNB';
    }
}

if (fixedCount > 0) {
    // Backup
    fs.copyFileSync(STATE_FILE, STATE_FILE + '.bak_fees_' + Date.now());
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    console.log('\nFixed ' + fixedCount + ' orders');
} else {
    console.log('No orders needed fixing');
}
