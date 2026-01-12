/**
 * repair_empty_trades.js
 * 
 * Fixes existing trades that have empty Cost/Spread/Fees/Match columns.
 * Uses grid spacing to estimate the missing data.
 * 
 * Run with: pm2 stop bot-sol && node scripts/repair_empty_trades.js && pm2 start bot-sol
 */

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '../data/sessions/VANTAGE01_SOLUSDT_state.json');
const GRID_SPACING = 0.0077; // 0.77% for SOL
const TRADING_FEE = 0.00075; // 0.075% Binance fee

console.log('🔧 REPAIR EMPTY TRADES - SOL');
console.log('='.repeat(50));

// Load state
const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
const orders = state.filledOrders || [];

console.log(`Found ${orders.length} total orders`);

let repaired = 0;
let skipped = 0;

for (const order of orders) {
    // Only repair SELL orders with missing data
    if (order.side !== 'sell') {
        continue;
    }

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
    const estimatedBuyPrice = fillPrice / (1 + GRID_SPACING);

    // Calculate cost basis
    const costBasis = estimatedBuyPrice * amount;

    // Calculate spread
    const spreadPct = ((fillPrice - estimatedBuyPrice) / estimatedBuyPrice * 100);

    // Estimate fees
    const sellFee = fillPrice * amount * TRADING_FEE;
    const buyFee = costBasis * TRADING_FEE;
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

    console.log(`✅ Repaired: ${order.id}`);
    console.log(`   Price: $${fillPrice.toFixed(2)} | Est Buy: $${estimatedBuyPrice.toFixed(2)} | Spread: ${spreadPct.toFixed(2)}%`);
    console.log(`   Fees: $${totalFees.toFixed(4)} | Profit: $${order.profit.toFixed(4)}`);

    repaired++;
}

// Also repair BUY orders that are missing fee data
for (const order of orders) {
    if (order.side !== 'buy') continue;

    // Add fee data if missing
    if (order.fees === undefined || order.fees === null) {
        const fillPrice = order.fillPrice || order.price;
        order.fees = fillPrice * order.amount * TRADING_FEE;
        order.feeCurrency = 'USDT';
        console.log(`✅ Repaired BUY fees: ${order.id} | $${order.fees.toFixed(4)}`);
        repaired++;
    }
}

console.log('='.repeat(50));
console.log(`📊 Summary: ${repaired} repaired, ${skipped} already OK`);

// Save state
fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
console.log('💾 State saved!');
console.log('\n⚠️  Remember to restart the bot: pm2 start bot-sol');
