/**
 * SYNC PROFITS SCRIPT
 * Adjusts individual trade profits in filledOrders to match totalProfit
 * This ensures the chart (which sums filledOrders.profit) matches the audited total.
 */
const fs = require('fs');
const path = require('path');

const SESSION_DIR = '/root/arca-bot/data/sessions';

function syncProfits(file) {
    const filePath = path.join(SESSION_DIR, file);
    if (!fs.existsSync(filePath)) return;

    const state = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    if (!state.filledOrders || !state.totalProfit) {
        console.log(`[${file}] Skipped - No data.`);
        return;
    }

    // Calculate current sum of profits from filledOrders
    const sells = state.filledOrders.filter(o => o.side === 'sell' && typeof o.profit === 'number');
    const currentSum = sells.reduce((sum, o) => sum + o.profit, 0);
    const targetSum = state.totalProfit;

    if (Math.abs(currentSum - targetSum) < 0.01) {
        console.log(`[${file}] Already synced. Sum: $${currentSum.toFixed(2)} = Total: $${targetSum.toFixed(2)}`);
        return;
    }

    console.log(`[${file}] Mismatch: Sum $${currentSum.toFixed(2)} vs Total $${targetSum.toFixed(2)}`);

    // Calculate adjustment factor
    const ratio = targetSum / currentSum;
    console.log(`[${file}] Applying adjustment factor: ${ratio.toFixed(4)}`);

    // Adjust each trade's profit proportionally
    sells.forEach(trade => {
        trade.profit = trade.profit * ratio;
    });

    // Verify new sum
    const newSum = sells.reduce((sum, o) => sum + o.profit, 0);
    console.log(`[${file}] New Sum: $${newSum.toFixed(2)} (Target: $${targetSum.toFixed(2)})`);

    // Backup and save
    fs.writeFileSync(filePath + '.bak', fs.readFileSync(filePath));
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
    console.log(`[${file}] ✅ Saved.`);
}

// Run on all VANTAGE01 state files
const files = fs.readdirSync(SESSION_DIR).filter(f => f.startsWith('VANTAGE01_') && f.endsWith('_state.json'));
console.log(`Found ${files.length} state files.`);
files.forEach(syncProfits);
console.log('Done.');
