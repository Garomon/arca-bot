/**
 * One-Time Repair Script for Missing SELL Data
 * Run this on the VPS to fix SELLs with profit=0 and missing costBasis
 * 
 * Usage: node scripts/repair_sells.js DOGE
 */

const fs = require('fs');
const path = require('path');

const pair = process.argv[2] || 'DOGE';
const symbol = `${pair}USDT`;
const stateFile = path.join(__dirname, '..', 'data', 'sessions', `VANTAGE01_${symbol}_state.json`);

console.log(`\n🔧 SELL Repair Script for ${symbol}`);
console.log(`   State file: ${stateFile}\n`);

if (!fs.existsSync(stateFile)) {
    console.error(`❌ State file not found: ${stateFile}`);
    process.exit(1);
}

// Load state
const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));

if (!state.filledOrders || state.filledOrders.length === 0) {
    console.log('No filled orders found.');
    process.exit(0);
}

// Grid spacing (default 1%)
const gridSpacing = 0.01;
const tradingFee = 0.001; // 0.1% Binance fee

let repairCount = 0;

for (const order of state.filledOrders) {
    // Only repair SELLs with profit=0 AND missing costBasis
    if (order.side === 'sell' && (order.profit === 0 || order.costBasis == null)) {
        const price = order.price;
        const amount = order.amount;

        // Estimate buy price using grid spacing
        const estimatedBuyPrice = price / (1 + gridSpacing);
        const spreadPct = ((price - estimatedBuyPrice) / estimatedBuyPrice) * 100;

        // Calculate profit with fee deduction
        const grossProfit = (price - estimatedBuyPrice) * amount;
        const estimatedEntryFee = estimatedBuyPrice * amount * tradingFee;
        const exitFee = order.fees || (price * amount * tradingFee);
        const netProfit = grossProfit - exitFee - estimatedEntryFee;

        // Apply repair
        order.costBasis = estimatedBuyPrice;
        order.spreadPct = spreadPct;
        order.profit = netProfit;
        order.isNetProfit = true;
        order.matchType = 'ESTIMATED';

        console.log(`✅ Repaired ID ${order.id}:`);
        console.log(`   Cost: $${estimatedBuyPrice.toFixed(6)} → Sell: $${price.toFixed(6)}`);
        console.log(`   Spread: ${spreadPct.toFixed(2)}% | Profit: $${netProfit.toFixed(4)}`);
        console.log('');

        repairCount++;
    }
}

if (repairCount > 0) {
    // Backup original
    const backupFile = stateFile.replace('.json', `_backup_${Date.now()}.json`);
    fs.copyFileSync(stateFile, backupFile);
    console.log(`📦 Backup saved: ${backupFile}`);

    // Save repaired state
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    console.log(`\n🎉 Repaired ${repairCount} SELL orders. State saved.`);
    console.log(`\n⚠️  Restart the bot to apply changes: pm2 restart bot-${pair.toLowerCase()}`);
} else {
    console.log('✅ No SELLs needed repair.');
}
