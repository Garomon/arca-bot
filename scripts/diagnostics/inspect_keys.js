const fs = require('fs');
const path = require('path');

try {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/sessions/VANTAGE01_BTCUSDT_state.json'), 'utf8'));
    console.log("KEYS:", Object.keys(data));
    if (data.sellOrders) console.log("sellOrders length:", data.sellOrders.length);
    if (data.tradeHistory) console.log("tradeHistory length:", data.tradeHistory.length);
    if (data.history) console.log("history length:", data.history.length);
    if (data.archivedOrders) console.log("archivedOrders length:", data.archivedOrders.length);
} catch (e) {
    console.error(e);
}
