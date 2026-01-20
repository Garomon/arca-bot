const fs = require('fs');
const path = require('path');

try {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/sessions/VANTAGE01_BTCUSDT_state.json'), 'utf8'));
    if (data.sellOrders && data.sellOrders.length > 0) {
        console.log(JSON.stringify(data.sellOrders[0], null, 2));
    } else {
        console.log("No sell orders found.");
    }
} catch (e) {
    console.error(e);
}
