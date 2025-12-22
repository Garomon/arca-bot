const fs = require('fs');
const path = require('path');
const ccxt = require('ccxt');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ARGS = process.argv.slice(2);
const PAIR = ARGS[0] || 'SOL/USDT';
// ENGINEER FIX: Fallback logic for finding the correct file
// The bot defaults to "VANTAGE01" if BOT_ID env is not set in ecosystem.config.js
const POSSIBLE_BOT_IDS = ['VANTAGE01', 'bot-sol', 'bot-btc'];

const PAIR_ID = PAIR.replace('/', '').toUpperCase();

console.log(`>> [RECALCULATOR] Starting LIFO (Scalping) Audit for ${PAIR}...`);

// FIND STATE FILE
const sessionsDir = path.join(__dirname, '..', 'data', 'sessions');
let stateFile = null;

// Brute-force find the file
if (fs.existsSync(sessionsDir)) {
    const files = fs.readdirSync(sessionsDir);
    console.log(`>> [DEBUG] Found files in sessions dir:`, files);

    // Exact match search
    for (const file of files) {
        if (file.includes(PAIR_ID) && file.endsWith('_state.json')) {
            stateFile = path.join(sessionsDir, file);
            console.log(`>> [SUCCESS] Found target state file: ${file}`);
            break;
        }
    }
}

if (!stateFile) {
    console.error(`>> [ERROR] Could not find any state file for pair ${PAIR_ID} in ${sessionsDir}`);
    // Create one if forcing? No, safer to fail.
    process.exit(1);
}

const CONFIG = {
    pair: PAIR,
    tradingFee: 0.001,
    stateFile: stateFile
};


const binance = new ccxt.binance({
    apiKey: process.env.BINANCE_API_KEY || process.env.API_KEY,
    secret: process.env.BINANCE_SECRET || process.env.API_SECRET,
    enableRateLimit: true
});

async function runAudit() {
    try {
        console.log('>> [API] Fetching trades...');
        const trades = await binance.fetchMyTrades(CONFIG.pair, undefined, 500); // 500 enough if just recovering recent crash
        console.log(`>> [API] Fetched ${trades.length} trades.`);

        let inventory = [];
        let totalProfit = 0;
        let totalFees = 0;

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

                // LIFO
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

                inventory = inventory.filter(l => l.remaining > 0.00000001);

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

        const raw = fs.readFileSync(CONFIG.stateFile);
        let state = JSON.parse(raw);

        fs.copyFileSync(CONFIG.stateFile, CONFIG.stateFile + '.fix.bak');

        state.totalProfit = totalProfit;
        state.accumulatedProfit = 0;
        state.estimatedProfit = 0;

        fs.writeFileSync(CONFIG.stateFile, JSON.stringify(state, null, 2));
        console.log(`>> [SUCCESS] State file updated! Restart bot to see changes.`);

    } catch (e) {
        console.error('>> [ERROR]', e.message);
    }
}

runAudit();
