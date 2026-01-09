const fs = require('fs');
const path = require('path');

try {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/sessions/VANTAGE01_SOLUSDT_state.json'), 'utf8'));
    if (data.filledOrders) {
        const sellOrders = data.filledOrders.filter(o => o.side === 'sell');
        console.log(`Found ${sellOrders.length} SOL SELL orders.`);

        // Check for orders with missing matchedLots
        const missingLots = sellOrders.filter(o => !o.matchedLots || o.matchedLots.length === 0);
        console.log(`Orders without matchedLots: ${missingLots.length}`);

        if (missingLots.length > 0) {
            console.log("Example order without matchedLots:");
            console.log(JSON.stringify(missingLots[0], null, 2));
        } else {
            console.log("All orders have matchedLots. Showing first order:");
            console.log(JSON.stringify(sellOrders[0], null, 2));
        }
    }
} catch (e) {
    console.error(e);
}
