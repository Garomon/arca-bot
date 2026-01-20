const fs = require('fs');
const path = require('path');

try {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/sessions/VANTAGE01_BTCUSDT_state.json'), 'utf8'));
    if (data.filledOrders && data.filledOrders.length > 0) {
        console.log("Found filledOrders:", data.filledOrders.length);
        console.log(JSON.stringify(data.filledOrders[0], null, 2));
    } else {
        console.log("No filledOrders found.");
    }
} catch (e) {
    console.error(e);
}
