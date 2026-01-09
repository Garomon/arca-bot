const fs = require('fs');
const coin = process.argv[2] || 'SOL';
const path = `/root/arca-bot/data/sessions/VANTAGE01_${coin}USDT_state.json`;

try {
    if (!fs.existsSync(path)) {
        console.log(`File not found: ${path}`);
        process.exit(1);
    }

    const state = JSON.parse(fs.readFileSync(path, 'utf8'));
    const all = state.filledOrders;

    // 1. Filter Unique Valid Trades
    const uniqueMap = new Map();
    all.forEach(o => {
        // Key: timestamp + price (ignore side in key to be stricter, or include if needed)
        // Using strict dedup key from before
        const key = `${o.timestamp}_${o.side}_${o.price}`;
        if (!uniqueMap.has(key)) {
            uniqueMap.set(key, o);
        }
    });

    const uniqueOrders = Array.from(uniqueMap.values());

    // 2. Group by Date
    const dailyStats = {};
    let calculatedTotal = 0;

    uniqueOrders.forEach(o => {
        if (!o.profit || o.profit < 0) return; // Only count positive profit events

        const date = new Date(o.timestamp).toISOString().split('T')[0];
        if (!dailyStats[date]) dailyStats[date] = { count: 0, profit: 0 };

        dailyStats[date].count++;
        dailyStats[date].profit += o.profit;
        calculatedTotal += o.profit;
    });

    console.log(`\n=== PROFIT BREAKDOWN: ${coin}/USDT ===`);
    console.log(`State Label Info: $${(state.totalProfit || 0).toFixed(4)}`);
    console.log(`Actual History Sum: $${calculatedTotal.toFixed(4)}`);
    console.log(`Discrepancy: $${(calculatedTotal - (state.totalProfit || 0)).toFixed(4)}`);
    console.log('\n--- Daily Ledger ---');
    console.log('Date       | Trades | Profit');
    console.log('-----------|--------|---------');

    // Sort by date descending
    Object.keys(dailyStats).sort().reverse().forEach(date => {
        const day = dailyStats[date];
        console.log(`${date} | ${day.count.toString().padEnd(6)} | $${day.profit.toFixed(4)}`);
    });
    console.log('------------------------------');

} catch (e) {
    console.error(e);
}
