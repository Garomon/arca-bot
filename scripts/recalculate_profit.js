const fs = require('fs');
const path = require('path');
const ccxt = require('ccxt');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ARGS = process.argv.slice(2);
const PAIR = ARGS[0] || 'SOL/USDT';
const PAIR_ID = PAIR.replace('/', '').toUpperCase();

console.log(`>> [RECALCULATOR] Starting LIFO (Scalping) Audit for ${PAIR}...`);

// FIND STATE FILE - PREFER VANTAGE01 PREFIXED FILES (Active Bot Files)
const sessionsDir = path.join(__dirname, '..', 'data', 'sessions');
let stateFile = null;

if (fs.existsSync(sessionsDir)) {
    const files = fs.readdirSync(sessionsDir);
    console.log(`>> [DEBUG] Found files in sessions dir:`, files);

    // PRIORITY 1: Look for VANTAGE01_<PAIR_ID>_state.json (Active Bot File)
    const preferredFile = `VANTAGE01_${PAIR_ID}_state.json`;
    if (files.includes(preferredFile)) {
        stateFile = path.join(sessionsDir, preferredFile);
        console.log(`>> [SUCCESS] Found PREFERRED state file: ${preferredFile}`);
    } else {
        // PRIORITY 2: Fallback to any matching file (legacy)
        for (const file of files) {
            if (file.includes(PAIR_ID) && file.endsWith('_state.json') && !file.includes('.bak') && !file.includes('CRASH')) {
                stateFile = path.join(sessionsDir, file);
                console.log(`>> [FALLBACK] Found alternate state file: ${file}`);
                break;
            }
        }
    }
}

if (!stateFile) {
    console.error(`>> [ERROR] Could not find any state file for pair ${PAIR_ID} in ${sessionsDir}`);
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
        // FIX: Set explicit start time to ensure we get FULL history (Binance defaults to recent if undefined)
        // Using Jan 1, 2024 as a safe "beginning of time" for this bot
        let since = 1704067200000;
        let lastId = 0;

        while (true) {
            // Fetch 1000 at a time (Binance max)
            const batch = await binance.fetchMyTrades(CONFIG.pair, since, 1000, { fromId: lastId ? lastId + 1 : undefined });
            if (!batch || batch.length === 0) break;

            trades = trades.concat(batch);
            lastId = batch[batch.length - 1].info.id; // Use raw IO ID for robust pagination
            console.log(`>> [API] Fetched batch: ${batch.length} trades (Total: ${trades.length})`);

            if (batch.length < 1000) break; // End of history

            // Rate limit safety
            await new Promise(r => setTimeout(r, 200));
        }

        console.log(`>> [API] Audit Base: ${trades.length} historical trades.`);

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

        // P0 FIX: Push ALL calculated profit to "accumulated" and clear the list.
        state.accumulatedProfit = totalProfit;
        state.filledOrders = [];
        state.totalProfit = totalProfit;
        state.estimatedProfit = 0;

        fs.writeFileSync(CONFIG.stateFile, JSON.stringify(state, null, 2));
        console.log(`>> [SUCCESS] State file updated! Total Profit set to $${totalProfit.toFixed(4)}.`);
        console.log(`>> [IMPORTANT] Now run: pm2 restart all`);

    } catch (e) {
        console.error('>> [ERROR]', e.message);
    }
}

runAudit();
