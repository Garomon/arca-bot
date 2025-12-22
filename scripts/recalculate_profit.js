const fs = require('fs');
const path = require('path');
const ccxt = require('ccxt');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ARGS = process.argv.slice(2);
const PAIR = ARGS[0] || 'SOL/USDT';
const BOT_ID = 'bot-sol';

// Configuration
// FIX: Match grid_bot.js PAIR_ID naming (SOL/USDT -> SOLUSDT)
const PAIR_ID = PAIR.replace('/', '').toUpperCase();
const CONFIG = {
    pair: PAIR,
    tradingFee: 0.001,
    stateFile: path.join(__dirname, '..', 'data', 'sessions', `${BOT_ID}_${PAIR_ID}_state.json`)
};

console.log(`>> [RECALCULATOR] Starting LIFO (Scalping) Audit for ${PAIR}...`);
console.log(`>> [STATE] Looking for state file: ${CONFIG.stateFile}`);

const binance = new ccxt.binance({
    apiKey: process.env.BINANCE_API_KEY || process.env.API_KEY,
    secret: process.env.BINANCE_API_SECRET || process.env.API_SECRET,
    enableRateLimit: true
});

async function runAudit() {
    try {
        console.log('>> [API] Fetching trades...');
        // Try to fetch more by iterating? For now just try limit 1000 again.
        const trades = await binance.fetchMyTrades(CONFIG.pair, undefined, 1000);
        console.log(`>> [API] Fetched ${trades.length} trades.`);

        // LIFO SIMULATION (Sort by Time ASC first to build sequence, but consume Newest)
        // Actually, to simulate properly:
        // 1. Process trades in chronological order.
        // 2. Buys add to end of inventory.
        // 3. Sells consume from END of inventory (LIFO).

        let inventory = [];
        let totalProfit = 0;
        let totalFees = 0;

        // Sort Ascending (Chronological Replay)
        trades.sort((a, b) => a.timestamp - b.timestamp);

        for (const trade of trades) {
            const price = parseFloat(trade.price);
            const amount = parseFloat(trade.amount);
            const side = trade.side;
            const feeCost = trade.fee ? parseFloat(trade.fee.cost) : (price * amount * CONFIG.tradingFee);

            if (side === 'buy') {
                inventory.push({
                    price: price,
                    amount: amount,
                    remaining: amount,
                    fee: feeCost,
                    timestamp: trade.timestamp
                });
            } else if (side === 'sell') {
                let remainingToSell = amount;
                let costBasis = 0;
                let entryFees = 0;

                // LIFO CONSUMPTION: Start from END of array (Newest)
                // We iterate backwards to find available lots
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

                // Clean empty lots? No, strictly keep them to preserve index order if needed, 
                // but for simple array iteration, filtering is safer to avoid leaks in logic.
                // Re-filtering might mess up LIFO if we just pop? 
                // Better to filter out fully consumed lots occasionally.
                inventory = inventory.filter(l => l.remaining > 0.00000001);

                // Handle Shortfall
                if (remainingToSell > 0.00000001) {
                    console.log(`>> [WARN] LIFO Shortfall @ ${price}. Using estimate.`);
                    const estBuyPrice = price / 1.006;
                    costBasis += (remainingToSell * estBuyPrice);
                    remainingToSell = 0;
                }

                const revenue = price * amount;
                const tradeProfit = revenue - costBasis - entryFees - feeCost;
                totalProfit += tradeProfit;
                totalFees += (entryFees + feeCost);
            }
        }

        console.log('------------------------------------------------');
        console.log(`>> [RESULTS] LIFO Audit Complete`);
        console.log(`>> Realized Profit: $${totalProfit.toFixed(4)}`);
        console.log('------------------------------------------------');

        if (fs.existsSync(CONFIG.stateFile)) {
            const raw = fs.readFileSync(CONFIG.stateFile);
            let state = JSON.parse(raw);

            // Backup
            fs.copyFileSync(CONFIG.stateFile, CONFIG.stateFile + '.fix.bak');

            // Update
            state.totalProfit = totalProfit;
            // Clear accumulation/estimation since we did a full audit
            state.accumulatedProfit = 0;
            state.estimatedProfit = 0;

            fs.writeFileSync(CONFIG.stateFile, JSON.stringify(state, null, 2));
            console.log(`>> [SUCCESS] State file updated! Restart bot to see changes.`);
        } else {
            console.error(`>> [ERROR] Still cannot find state file at ${CONFIG.stateFile}`);
        }

    } catch (e) {
        console.error('>> [ERROR]', e.message);
    }
}

runAudit();
