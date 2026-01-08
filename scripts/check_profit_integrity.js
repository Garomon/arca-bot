const fs = require('fs');
const path = require('path');

const sessionsDir = '/root/arca-bot/data/sessions';
const files = ['VANTAGE01_BTCUSDT_state.json', 'VANTAGE01_SOLUSDT_state.json', 'VANTAGE01_DOGEUSDT_state.json'];

console.log('--- PROFIT INTEGRITY CHECK ---');
let totalSwarmProfit = 0;
let totalSwarmSum = 0;

files.forEach(f => {
    try {
        const filePath = path.join(sessionsDir, f);
        if (fs.existsSync(filePath)) {
            const data = JSON.parse(fs.readFileSync(filePath));
            const totalProfit = data.totalProfit || 0;
            const filledOrders = data.filledOrders || [];

            // Calculate sum from history
            const sumProfit = filledOrders.reduce((acc, order) => {
                // Only count realized profit (sells usually, or closed positions)
                // Assuming order.profit is the field
                return acc + (parseFloat(order.profit) || 0);
            }, 0);

            console.log(`\n📄 ${f}:`);
            console.log(`   Total Profit Field: $${totalProfit.toFixed(4)}`);
            console.log(`   Sum of Orders:      $${sumProfit.toFixed(4)}`);
            console.log(`   Difference:         $${(totalProfit - sumProfit).toFixed(4)}`);

            if (Math.abs(totalProfit - sumProfit) > 0.0001) {
                console.log(`   ⚠️ MISMATCH DETECTED`);
            } else {
                console.log(`   ✅ MATCHED`);
            }

            totalSwarmProfit += totalProfit;
            totalSwarmSum += sumProfit;
        }
    } catch (e) {
        console.log(`Error reading ${f}: ${e.message}`);
    }
});

console.log('\n--- SWARM TOTALS ---');
console.log(`Total Profit Field: $${totalSwarmProfit.toFixed(4)}`);
console.log(`Sum of Orders:      $${totalSwarmSum.toFixed(4)}`);
console.log(`Difference:         $${(totalSwarmProfit - totalSwarmSum).toFixed(4)}`);
