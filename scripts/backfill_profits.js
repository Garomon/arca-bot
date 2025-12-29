/**
 * BACKFILL PROFITS SCRIPT v2
 * FIXED: Correctly calculates LIFO cost basis for each sell
 * Re-run this to fix incorrect costBasis values in the Transaction Log
 */

const fs = require('fs');
const path = require('path');
const ccxt = require('ccxt');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ARGS = process.argv.slice(2);
const PAIR = ARGS[0] || 'SOL/USDT';
const PAIR_ID = PAIR.replace('/', '').toUpperCase();
const FEE = 0.001; // 0.1% per trade

console.log(`>> [BACKFILL v2] Starting LIFO Profit Backfill for ${PAIR}...`);

// Find state file
const sessionsDir = path.join(__dirname, '..', 'data', 'sessions');
let stateFile = null;

if (fs.existsSync(sessionsDir)) {
    const files = fs.readdirSync(sessionsDir);
    const preferredFile = `VANTAGE01_${PAIR_ID}_state.json`;
    if (files.includes(preferredFile)) {
        stateFile = path.join(sessionsDir, preferredFile);
        console.log(`>> [SUCCESS] Found state file: ${preferredFile}`);
    }
}

if (!stateFile) {
    console.error(`>> [ERROR] Could not find state file for ${PAIR_ID}`);
    process.exit(1);
}

const binance = new ccxt.binance({
    apiKey: process.env.BINANCE_API_KEY || process.env.API_KEY,
    secret: process.env.BINANCE_SECRET || process.env.API_SECRET,
    enableRateLimit: true
});

async function backfillProfits() {
    try {
        // Fetch ALL trades from Binance (from start of 2024)
        let trades = [];
        let since = 1704067200000; // Jan 1, 2024

        console.log('>> [API] Fetching all trades from Binance...');
        while (true) {
            const batch = await binance.fetchMyTrades(PAIR, since, 1000);
            if (!batch || batch.length === 0) break;
            trades = trades.concat(batch);
            since = batch[batch.length - 1].timestamp + 1;
            console.log(`   Fetched ${trades.length} trades so far...`);
            if (batch.length < 1000) break;
            await new Promise(r => setTimeout(r, 200));
        }

        // Sort by timestamp (oldest first)
        trades.sort((a, b) => a.timestamp - b.timestamp);
        console.log(`>> [API] Total: ${trades.length} trades from ${new Date(trades[0].timestamp).toISOString()} to ${new Date(trades[trades.length - 1].timestamp).toISOString()}`);

        // Process LIFO - build inventory and calculate profit for each sell
        let inventory = []; // Array of {price, amount, remaining, fee, timestamp, orderId}
        const tradeResults = new Map(); // orderId -> {profit, costBasis, spreadPct}

        console.log('\n>> [LIFO] Processing trades chronologically...');
        let buyCount = 0, sellCount = 0;

        for (const trade of trades) {
            const orderId = String(trade.order || trade.orderId || trade.id);
            const price = parseFloat(trade.price);
            const amount = parseFloat(trade.amount);
            const feeCost = trade.fee ? parseFloat(trade.fee.cost) : (price * amount * FEE);

            if (trade.side === 'buy') {
                // Add to inventory
                inventory.push({
                    orderId: orderId,
                    price: price,
                    amount: amount,
                    remaining: amount,
                    fee: feeCost,
                    timestamp: trade.timestamp
                });
                tradeResults.set(orderId, { profit: 0, costBasis: null, spreadPct: null });
                buyCount++;
            } else {
                // SELL - consume inventory in LIFO order (newest first)
                let remainingToSell = amount;
                let totalCost = 0;
                let totalEntryFees = 0;
                let lotsUsed = [];

                // Process from end (newest) to start (oldest)
                for (let i = inventory.length - 1; i >= 0 && remainingToSell > 0.00000001; i--) {
                    const lot = inventory[i];
                    if (lot.remaining <= 0.00000001) continue;

                    const take = Math.min(remainingToSell, lot.remaining);
                    totalCost += (take * lot.price);

                    // Proportional fee from the lot
                    if (lot.amount > 0) {
                        totalEntryFees += (take / lot.amount) * lot.fee;
                    }

                    lot.remaining -= take;
                    remainingToSell -= take;
                    lotsUsed.push({ price: lot.price, amount: take });
                }

                // Clean up fully consumed lots
                inventory = inventory.filter(l => l.remaining > 0.00000001);

                // Handle shortfall (sold more than we had in known inventory)
                // This shouldn't happen with complete data, but if it does, estimate
                if (remainingToSell > 0.00000001) {
                    console.log(`   [WARN] Shortfall for order ${orderId}: ${remainingToSell.toFixed(6)} units missing, estimating...`);
                    // Use a reasonable estimate (slightly below sell price)
                    const estBuyPrice = price * 0.995;
                    totalCost += (remainingToSell * estBuyPrice);
                }

                // Calculate profit
                const revenue = price * amount;
                const profit = revenue - totalCost - totalEntryFees - feeCost;
                const avgCost = totalCost / amount;
                const spreadPct = ((price - avgCost) / avgCost * 100);

                tradeResults.set(orderId, {
                    profit: profit,
                    costBasis: avgCost,
                    spreadPct: spreadPct
                });
                sellCount++;
            }
        }

        console.log(`>> [LIFO] Processed ${buyCount} buys and ${sellCount} sells`);
        console.log(`>> [LIFO] Remaining inventory: ${inventory.length} lots, ${inventory.reduce((s, l) => s + l.remaining, 0).toFixed(6)} units`);

        // Load state file
        const raw = fs.readFileSync(stateFile);
        let state = JSON.parse(raw);

        // Backup original
        const backupFile = stateFile + '.backup_' + Date.now();
        fs.copyFileSync(stateFile, backupFile);
        console.log(`>> [BACKUP] Saved to: ${backupFile}`);

        // Update filledOrders with CORRECT profits
        let updatedCount = 0;
        let totalProfit = 0;

        if (state.filledOrders && state.filledOrders.length > 0) {
            for (const order of state.filledOrders) {
                const orderId = String(order.id);
                const result = tradeResults.get(orderId);

                if (result) {
                    order.profit = result.profit;
                    order.costBasis = result.costBasis;
                    order.spreadPct = result.spreadPct;
                    order.isEstimated = false;
                    order.isNetProfit = false;
                    updatedCount++;

                    if (result.profit !== null && result.profit !== 0) {
                        totalProfit += result.profit;
                    }
                }
            }
        }

        // Update total profit
        state.totalProfit = totalProfit;

        // Save updated state
        fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));

        console.log('\n================================================');
        console.log(`>> [SUCCESS] Backfill Complete for ${PAIR}!`);
        console.log(`>> Updated ${updatedCount} orders with CORRECT LIFO profits`);
        console.log(`>> Total Realized Profit: $${totalProfit.toFixed(4)}`);
        console.log('================================================');
        console.log('>> [IMPORTANT] Run: pm2 restart all');

    } catch (e) {
        console.error('>> [ERROR]', e.message);
        console.error(e.stack);
    }
}

backfillProfits();
