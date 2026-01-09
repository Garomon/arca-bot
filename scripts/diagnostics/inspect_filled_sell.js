const fs = require('fs');
const path = require('path');

try {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/sessions/VANTAGE01_BTCUSDT_state.json'), 'utf8'));
    if (data.filledOrders) {
        const sellOrder = data.filledOrders.find(o => o.side === 'sell');
        if (sellOrder) {
            console.log("Found SELL Order:");
            console.log(JSON.stringify(sellOrder, null, 2));
        } else {
            console.log("No SELL orders found in filledOrders.");
        }
    }
} catch (e) {
    console.error(e);
}
