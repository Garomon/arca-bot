const fs = require('fs');
const pairs = ['SOL', 'DOGE'];

pairs.forEach(coin => {
    try {
        const path = `/root/arca-bot/data/sessions/VANTAGE01_${coin}USDT_state.json`;
        if (!fs.existsSync(path)) return;

        const state = JSON.parse(fs.readFileSync(path, 'utf8'));
        const all = state.filledOrders;

        // Use the same composite key as our fix: timestamp + side + price
        // Normalize price to 8 decimals to avoid float jitter
        const uniqueKeys = new Set();
        let uniqueCount = 0;
        let uniqueProfit = 0;

        console.log(`--- ${coin}/USDT ---`);
        console.log(`Total Rows: ${all.length}`);

        all.forEach(o => {
            const key = `${o.timestamp}_${o.side}_${o.price}`;
            if (!uniqueKeys.has(key)) {
                uniqueKeys.add(key);
                uniqueCount++;
                uniqueProfit += (o.profit || 0);
            }
        });

        console.log(`Unique Rows: ${uniqueCount}`);
        console.log(`Duplicates: ${all.length - uniqueCount}`);
        console.log(`State Total Profit: $${(state.totalProfit || 0).toFixed(4)}`);
        console.log(`Unique History Sum: $${uniqueProfit.toFixed(4)}`);
        console.log(`Difference: $${(uniqueProfit - (state.totalProfit || 0)).toFixed(4)}`);
        console.log('');
    } catch (e) {
        console.error(`Error checking ${coin}:`, e.message);
    }
});
