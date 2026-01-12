/**
 * repair_all_empty_trades.js
 *
 * Fixes existing trades that have empty Cost/Spread/Fees/Match columns
 * for ALL bots (BTC, SOL, DOGE).
 *
 * Run with: node scripts/repair_all_empty_trades.js
 *
 * NOTE: Stop the bots before running this script to avoid race conditions:
 *       pm2 stop all && node scripts/repair_all_empty_trades.js && pm2 start all
 */

const fs = require('fs');
const path = require('path');

// Detect environment: VPS uses /root/arca-bot, local uses relative paths
const isVPS = process.platform === 'linux' && require('fs').existsSync('/root/arca-bot');
const basePath = isVPS ? '/root/arca-bot' : path.join(__dirname, '..');

// Bot configurations with their specific spacings
const BOTS = [
    {
        name: 'BTC',
        stateFile: path.join(basePath, 'data/sessions/VANTAGE01_BTCUSDT_state.json'),
        gridSpacing: 0.007, // 0.7% for BTC
        tradingFee: 0.00075
    },
    {
        name: 'SOL',
        stateFile: path.join(basePath, 'data/sessions/VANTAGE01_SOLUSDT_state.json'),
        gridSpacing: 0.0077, // 0.77% for SOL
        tradingFee: 0.00075
    },
    {
        name: 'DOGE',
        stateFile: path.join(basePath, 'data/sessions/VANTAGE01_DOGEUSDT_state.json'),
        gridSpacing: 0.01, // 1% for DOGE
        tradingFee: 0.00075
    }
];

console.log('='.repeat(60));
console.log('   REPAIR ALL EMPTY TRADES - Universal Script');
console.log('='.repeat(60));

let totalRepaired = 0;
let totalSkipped = 0;

for (const bot of BOTS) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`   Processing ${bot.name}`);
    console.log(`${'='.repeat(50)}`);

    // Check if state file exists
    if (!fs.existsSync(bot.stateFile)) {
        console.log(`   State file not found, skipping...`);
        continue;
    }

    // Load state
    let state;
    try {
        state = JSON.parse(fs.readFileSync(bot.stateFile, 'utf-8'));
    } catch (e) {
        console.log(`   Error reading state file: ${e.message}`);
        continue;
    }

    const orders = state.filledOrders || [];
    console.log(`   Found ${orders.length} total orders`);

    let repaired = 0;
    let skipped = 0;

    // Repair SELL orders
    for (const order of orders) {
        if (order.side !== 'sell') continue;

        // Check if data is missing
        const needsRepair = !order.costBasis ||
            order.spreadPct === undefined ||
            order.spreadPct === null ||
            !order.matchedLots ||
            order.matchedLots.length === 0;

        if (!needsRepair) {
            skipped++;
            continue;
        }

        const fillPrice = order.fillPrice || order.price;
        const amount = order.amount;

        // Estimate buy price using grid spacing
        const estimatedBuyPrice = fillPrice / (1 + bot.gridSpacing);

        // Calculate cost basis
        const costBasis = estimatedBuyPrice * amount;

        // Calculate spread
        const spreadPct = ((fillPrice - estimatedBuyPrice) / estimatedBuyPrice * 100);

        // Estimate fees
        const sellFee = fillPrice * amount * bot.tradingFee;
        const buyFee = costBasis * bot.tradingFee;
        const totalFees = sellFee + buyFee;

        // Calculate profit if missing or zero
        const grossProfit = (fillPrice * amount) - costBasis;
        const netProfit = grossProfit - totalFees;

        // Apply repairs
        order.costBasis = estimatedBuyPrice;
        order.spreadPct = spreadPct;
        order.fees = totalFees;
        order.feeCurrency = 'USDT';
        order.matchedLots = [{
            lotId: 'REPAIRED',
            buyPrice: estimatedBuyPrice,
            amountTaken: amount,
            remainingAfter: 0,
            timestamp: order.timestamp
        }];
        order.matchType = 'REPAIRED';
        order.matchMethod = 'SPREAD_MATCH';

        // Fix profit if it was zero
        if (order.profit === 0 || !order.profit) {
            order.profit = netProfit;
            order.isNetProfit = true;
        }

        const date = new Date(order.timestamp).toLocaleDateString();
        console.log(`   [${date}] SELL @ $${fillPrice.toFixed(4)} | Spread: ${spreadPct.toFixed(2)}% | Profit: $${order.profit.toFixed(4)}`);

        repaired++;
    }

    // Repair BUY orders that are missing fee data
    for (const order of orders) {
        if (order.side !== 'buy') continue;

        // Add fee data if missing
        if (order.fees === undefined || order.fees === null) {
            const fillPrice = order.fillPrice || order.price;
            order.fees = fillPrice * order.amount * bot.tradingFee;
            order.feeCurrency = 'USDT';
            repaired++;
        }
    }

    console.log(`   Summary: ${repaired} repaired, ${skipped} already OK`);

    // Save state
    if (repaired > 0) {
        fs.writeFileSync(bot.stateFile, JSON.stringify(state, null, 2));
        console.log(`   State saved!`);
    }

    totalRepaired += repaired;
    totalSkipped += skipped;
}

console.log('\n' + '='.repeat(60));
console.log(`   TOTAL: ${totalRepaired} repaired across all bots`);
console.log('='.repeat(60));
console.log('\n   Remember to restart the bots: pm2 start all');
