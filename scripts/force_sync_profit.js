const fs = require('fs');
const path = require('path');

const sessionsDir = path.join(__dirname, '..', 'data', 'sessions');

if (!fs.existsSync(sessionsDir)) {
    console.error('No sessions directory found.');
    process.exit(1);
}

const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('_state.json'));

console.log(`Found ${files.length} state files. Checking for profit discrepancies...`);

files.forEach(file => {
    const filePath = path.join(sessionsDir, file);
    try {
        const raw = fs.readFileSync(filePath);
        const state = JSON.parse(raw);

        if (!state.filledOrders || !Array.isArray(state.filledOrders)) {
            console.log(`[SKIP] ${file}: No filledOrders`);
            return;
        }

        let calculatedProfit = 0;
        state.filledOrders.forEach(order => {
            if (order.profit && !isNaN(parseFloat(order.profit))) {
                calculatedProfit += parseFloat(order.profit);
            }
        });

        const currentTotal = parseFloat(state.totalProfit || 0);

        console.log(`[CHECK] ${file}`);
        console.log(`    Current Total: $${currentTotal.toFixed(4)}`);
        console.log(`    Sum of Trades: $${calculatedProfit.toFixed(4)}`);
        console.log(`    Difference:    $${(calculatedProfit - currentTotal).toFixed(4)}`);

        if (Math.abs(currentTotal - calculatedProfit) > 0.001) {
            console.log(`    >> FIXING DISCREPANCY...`);
            // Create backup
            fs.copyFileSync(filePath, filePath + '.bak_sync');

            // Update
            state.totalProfit = calculatedProfit;
            // Also update accumulatedProfit if it exists/is used
            if (typeof state.accumulatedProfit !== 'undefined') {
                state.accumulatedProfit = calculatedProfit;
            }

            fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
            console.log(`    >> UPDATED.`);
        } else {
            console.log(`    >> OK.`);
        }

    } catch (e) {
        console.error(`Error processing ${file}:`, e.message);
    }
});
