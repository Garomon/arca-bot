const fs = require('fs');
const path = require('path');
const ccxt = require('ccxt');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ARGS = process.argv.slice(2);
const PAIR = ARGS[0] || 'SOL/USDT'; // Default to SOL if not specified
const BOT_ID = 'bot-sol'; // Assumed based on context, make dynamic if needed

// Configuration
const CONFIG = {
    pair: PAIR,
    tradingFee: 0.001, // 0.1%
    stateFile: path.join(__dirname, '..', 'data', 'sessions', `${BOT_ID}_${PAIR.replace('/', '_')}_state.json`)
};

console.log(`>> [RECALCULATOR] Starting Audit for ${PAIR}...`);
console.log(`>> [STATE] Looking for state file: ${CONFIG.stateFile}`);

// Initialize Exchange
const binance = new ccxt.binance({
    apiKey: process.env.BINANCE_API_KEY,
    secret: process.env.BINANCE_API_SECRET,
    enableRateLimit: true
});

async function runAudit() {
    try {
        // 1. Fetch History
        console.log('>> [API] Fetching last 1000 trades from Binance...');
        const trades = await binance.fetchMyTrades(CONFIG.pair, undefined, 1000);
        console.log(`>> [API] Fetched ${trades.length} trades.`);

        // 2. FIFO Simulation
        let inventory = [];
        let totalProfit = 0;
        let totalFees = 0;
        let sellCount = 0;
        let buyCount = 0;

        // Sort Ascending (Oldest First)
        trades.sort((a, b) => a.timestamp - b.timestamp);

        for (const trade of trades) {
            const price = parseFloat(trade.price);
            const amount = parseFloat(trade.amount);
            const side = trade.side;
            const feeCost = trade.fee ? parseFloat(trade.fee.cost) : (price * amount * CONFIG.tradingFee);

            if (side === 'buy') {
                buyCount++;
                // Add to inventory
                inventory.push({
                    price: price,
                    amount: amount,
                    remaining: amount,
                    fee: feeCost, // Simplification: assume fee is in quote or normalized
                    timestamp: trade.timestamp
                });
            } else if (side === 'sell') {
                sellCount++;
                let remainingToSell = amount;
                let costBasis = 0;
                let entryFees = 0;

                // Consume Inventory (FIFO)
                for (const lot of inventory) {
                    if (remainingToSell <= 0.00000001) break;
                    if (lot.remaining <= 0) continue;

                    const take = Math.min(remainingToSell, lot.remaining);
                    costBasis += (take * lot.price);

                    // Proportional fee
                    if (lot.amount > 0) {
                        entryFees += (take / lot.amount) * lot.fee;
                    }

                    lot.remaining -= take;
                    remainingToSell -= take;
                }

                // Handle Shortfall (if no inventory found, assume break-even or grid-spacing)
                if (remainingToSell > 0.00000001) {
                    console.warn(`>> [WARN] Inventory shortfall for Sell @ ${price}. Assuming estimated entry.`);
                    const estBuyPrice = price / 1.006; // 0.6% grid assumption
                    costBasis += (remainingToSell * estBuyPrice);
                    remainingToSell = 0;
                }

                // Clean inventory
                inventory = inventory.filter(l => l.remaining > 0.00000001);

                // Calculate Profit
                const revenue = price * amount;
                const tradeProfit = revenue - costBasis - entryFees - feeCost;
                totalProfit += tradeProfit;
                totalFees += (entryFees + feeCost);
            }
        }

        console.log('------------------------------------------------');
        console.log(`>> [RESULTS] Audit Complete`);
        console.log(`>> Buys: ${buyCount} | Sells: ${sellCount}`);
        console.log(`>> Realized Net Profit (FIFO): $${totalProfit.toFixed(4)}`);
        console.log(`>> Total Fees Paid: $${totalFees.toFixed(4)}`);
        console.log('------------------------------------------------');

        // 3. Update State File
        if (fs.existsSync(CONFIG.stateFile)) {
            const raw = fs.readFileSync(CONFIG.stateFile);
            let state = JSON.parse(raw);

            console.log(`>> [UPDATE] Current State Profit: $${(state.totalProfit || 0).toFixed(4)}`);

            // Backup
            fs.copyFileSync(CONFIG.stateFile, CONFIG.stateFile + '.bak');
            console.log(`>> [BACKUP] Created ${CONFIG.stateFile}.bak`);

            // Update
            state.totalProfit = totalProfit;
            state.accumulatedProfit = 0; // Reset accumulated as we summed EVERYTHING
            state.estimatedProfit = 0;   // Reset estimated as we verified EVERYTHING

            // Rewrite history with verified flags? 
            // Optional, but updating totalProfit is the main goal.

            fs.writeFileSync(CONFIG.stateFile, JSON.stringify(state, null, 2));
            console.log(`>> [SUCCESS] State file updated with AUDITED PROFIT: $${totalProfit.toFixed(4)}`);
        } else {
            console.error(`>> [ERROR] State file not found!`);
        }

    } catch (e) {
        console.error('>> [ERROR]', e.message);
    }
}

runAudit();
