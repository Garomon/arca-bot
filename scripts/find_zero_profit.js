const fs = require('fs');
const file = '/root/arca-bot/data/sessions/VANTAGE01_DOGEUSDT_state.json';
const state = JSON.parse(fs.readFileSync(file));

console.log(`Checking ${state.filledOrders.length} orders...`);

const zeroProfitSells = state.filledOrders.filter(o => {
    return o.side === 'sell' && (!o.profit || o.profit === 0);
});

console.log(`Found ${zeroProfitSells.length} sell orders with 0 profit:`);
zeroProfitSells.forEach(o => {
    console.log(`- ID: ${o.id}, Date: ${new Date(o.timestamp).toISOString()}, Price: ${o.price}, Amount: ${o.amount}`);
});
