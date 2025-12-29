/**
 * BACKFILL PROFITS SCRIPT
 * Calculates real LIFO profit for each historical trade and updates the state file
 * This makes the Transaction Log show accurate profit per trade
 */

const fs = require('fs');
const path = require('path');
const ccxt = require('ccxt');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ARGS = process.argv.slice(2);
const PAIR = ARGS[0] || 'SOL/USDT';
const PAIR_ID = PAIR.replace('/', '').toUpperCase();
const FEE = 0.001; // 0.1% per trade

console.log(`>> [BACKFILL] Starting LIFO Profit Backfill for ${PAIR}...`);

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
        // Fetch all trades from Binance
        let trades = [];
        let since = 1704067200000; // Jan 1, 2024

        while (true) {
            const batch = await binance.fetchMyTrades(PAIR, since, 1000);
            if (!batch || batch.length === 0) break;
            trades = trades.concat(batch);
            since = batch[batch.length - 1].timestamp + 1;
            if (batch.length < 1000) break;
            await new Promise(r => setTimeout(r, 200));
        }

        trades.sort((a, b) => a.timestamp - b.timestamp);
        console.log(`>> [API] Fetched ${trades.length} trades from Binance`);

        // Calculate LIFO profit for each sell
        let inventory = [];
        const tradeResults = new Map(); // id -> {profit, costBasis, spreadPct}

        for (const trade of trades) {
            const tradeId = trade.order || trade.orderId || trade.id; // Use ORDER ID, not trade ID"
            const price = parseFloat(trade.price);
            const amount = parseFloat(trade.amount);
            const feeCost = trade.fee ? parseFloat(trade.fee.cost) : (price * amount * FEE);

            if (trade.side === 'buy') {
                inventory.push({
                    price: price,
                    amount: amount,
                    remaining: amount,
                    fee: feeCost,
                    timestamp: trade.timestamp
                });
                tradeResults.set(tradeId, { profit: 0, costBasis: null, spreadPct: null });
            } else {
                // LIFO: consume from newest first
                let remainingToSell = amount;
                let costBasis = 0;
                let entryFees = 0;

                for (let i = inventory.length - 1; i >= 0; i--) {
                    const lot = inventory[i];
                    if (remainingToSell <= 0.00000001) break;
                    if (lot.remaining <= 0) continue;

                    const take = Math.min(remainingToSell, lot.remaining);
                    costBasis += (take * lot.price);
                    if (lot.amount > 0) {
                        entryFees += (take / lot.amount) * lot.fee;
                    }
                    lot.remaining -= take;
                    remainingToSell -= take;
                }

                // Clean up empty lots
                inventory = inventory.filter(l => l.remaining > 0.00000001);

                // Handle shortfall
                if (remainingToSell > 0.00000001) {
                    const estBuyPrice = price / 1.006;
                    costBasis += (remainingToSell * estBuyPrice);
                }

                const revenue = price * amount;
                const profit = revenue - costBasis - entryFees - feeCost;
                const avgCost = costBasis / amount;
                const spreadPct = ((price - avgCost) / avgCost * 100);

                tradeResults.set(tradeId, {
                    profit: profit,
                    costBasis: avgCost,
                    spreadPct: spreadPct
                });
            }
        }

        // Load state file
        const raw = fs.readFileSync(stateFile);
        let state = JSON.parse(raw);

        // Backup
        fs.copyFileSync(stateFile, stateFile + '.backfill.bak');

        // Update filledOrders with real profits
        let updatedCount = 0;
        if (state.filledOrders && state.filledOrders.length > 0) {
            for (const order of state.filledOrders) {
                const result = tradeResults.get(order.id);
                if (result) {
                    order.profit = result.profit;
                    order.costBasis = result.costBasis;
                    order.spreadPct = result.spreadPct;
                    order.isEstimated = false; // Now it's real LIFO data
                    updatedCount++;
                }
            }
        }

        // Save updated state
        fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));

        console.log('------------------------------------------------');
        console.log(`>> [SUCCESS] Backfill Complete!`);
        console.log(`>> Updated ${updatedCount} orders with real LIFO profits`);
        console.log(`>> Total Profit: $${state.totalProfit?.toFixed(4) || 'N/A'}`);
        console.log('------------------------------------------------');
        console.log('>> [IMPORTANT] Run: pm2 restart all');

    } catch (e) {
        console.error('>> [ERROR]', e.message);
    }
}

backfillProfits();
