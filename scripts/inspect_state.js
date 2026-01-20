const fs = require('fs');
const state = JSON.parse(fs.readFileSync('/root/arca-bot/data/sessions/VANTAGE01_BTCUSDT_state.json'));
const lastOrders = state.filledOrders.slice(-2);
console.log(JSON.stringify(lastOrders, null, 2));
