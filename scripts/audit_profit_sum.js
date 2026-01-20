
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '..', 'data', 'sessions', 'VANTAGE01_BTCUSDT_state.json');

if (!fs.existsSync(STATE_FILE)) {
    console.error("State file not found!");
    process.exit(1);
}

const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
const filledOrders = state.filledOrders || [];

console.log(`Title: Profit Audit`);
console.log(`Total Filled Orders: ${filledOrders.length}`);
console.log(`State.totalProfit: ${state.totalProfit}`);

let calculatedSum = 0;
const profitByDate = {}; // To help visualize where the profit is

filledOrders.forEach(o => {
    const p = parseFloat(o.profit || 0);
    calculatedSum += p;

    const date = new Date(o.timestamp).toISOString().split('T')[0];
    if (!profitByDate[date]) profitByDate[date] = 0;
    profitByDate[date] += p;
});

console.log(`Calculated Sum from History: ${calculatedSum.toFixed(4)}`);
console.log(`Discrepancy: ${(calculatedSum - (state.totalProfit || 0)).toFixed(4)}`);
console.log('--- Daily Breakdown ---');
Object.keys(profitByDate).sort().forEach(d => {
    console.log(`${d}: $${profitByDate[d].toFixed(4)}`);
});
