/**
 * QUICK RECALCULATE PROFIT - SPREAD_MATCH
 * Lightweight script to recalculate total profit using SPREAD_MATCH
 * For full backfill with transaction log updates, use backfill_profits.js
 * 
 * Usage: node recalculate_profit.js [PAIR]
 */

const fs = require('fs');
const path = require('path');
const ccxt = require('ccxt');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ARGS = process.argv.slice(2);
const PAIR = ARGS[0] || 'BTC/USDT';
const PAIR_ID = PAIR.replace('/', '').toUpperCase();
const BASE_ASSET = PAIR.split('/')[0];

// Grid spacing by pair
const PAIR_PRESETS = {
    'BTC/USDT': { spacing: 0.006 },
    'SOL/USDT': { spacing: 0.007 }
};
const DEFAULT_SPACING = PAIR_PRESETS[PAIR]?.spacing || 0.007;
const FEE_RATE = 0.001;

console.log(`>> [RECALCULATE] SPREAD_MATCH Profit Calculation for ${PAIR}...`);

const sessionsDir = path.join(__dirname, '..', 'data', 'sessions');
let stateFile = null;

if (fs.existsSync(sessionsDir)) {
    const files = fs.readdirSync(sessionsDir);
    const preferredFile = `VANTAGE01_${PAIR_ID}_state.json`;
    if (files.includes(preferredFile)) {
        stateFile = path.join(sessionsDir, preferredFile);
        console.log(`>> Found state file: ${preferredFile}`);
    }
}

if (!stateFile) {
    console.error(`>> ERROR: Could not find state file for ${PAIR_ID}`);
    process.exit(1);
}

const binance = new ccxt.binance({
    apiKey: process.env.BINANCE_API_KEY || process.env.API_KEY,
    secret: process.env.BINANCE_SECRET || process.env.API_SECRET,
    enableRateLimit: true
});

async function runRecalculate() {
    try {
        // Fetch all trades
        let trades = [];
        let since = 1704067200000; // Jan 1, 2024

        console.log('>> Fetching trades from Binance...');
        while (true) {
            const batch = await binance.fetchMyTrades(PAIR, since, 1000);
            if (!batch || batch.length === 0) break;
            trades = trades.concat(batch);
            since = batch[batch.length - 1].timestamp + 1;
            if (batch.length < 1000) break;
            await new Promise(r => setTimeout(r, 200));
        }

        trades.sort((a, b) => a.timestamp - b.timestamp);
        console.log(`>> Found ${trades.length} trades`);

        // Process with SPREAD_MATCH
        let inventory = [];
        let totalProfit = 0;
        let totalFees = 0;

        for (const trade of trades) {
            const price = parseFloat(trade.price);
            const amount = parseFloat(trade.amount);
            const side = trade.side;

            let feeCost = trade.fee ? parseFloat(trade.fee.cost) : (price * amount * FEE_RATE);
            const feeAsset = trade.fee ? trade.fee.currency : 'USDT';
            if (feeAsset === BASE_ASSET) {
                feeCost = feeCost * price;
            }

            if (side === 'buy') {
                inventory.push({
                    price,
                    amount,
                    remaining: amount,
                    fee: feeCost,
                    timestamp: trade.timestamp
                });
            } else if (side === 'sell') {
                // SPREAD_MATCH: Find lot where buyPrice * (1+spacing) ≈ sellPrice
                const expectedBuyPrice = price / (1 + DEFAULT_SPACING);

                // Sort by proximity to expected buy price
                const candidates = inventory
                    .map((lot, idx) => ({ ...lot, originalIndex: idx }))
                    .filter(lot => lot.remaining > 0.00000001)
                    .sort((a, b) => {
                        const diffA = Math.abs(a.price - expectedBuyPrice);
                        const diffB = Math.abs(b.price - expectedBuyPrice);
                        return diffA - diffB;
                    });

                let remainingToSell = amount;
                let costBasis = 0;
                let entryFees = 0;

                for (const candidate of candidates) {
                    if (remainingToSell <= 0.00000001) break;

                    const lot = inventory[candidate.originalIndex];
                    if (lot.remaining <= 0.00000001) continue;

                    const take = Math.min(remainingToSell, lot.remaining);
                    costBasis += (take * lot.price);

                    if (lot.amount > 0) {
                        entryFees += (take / lot.amount) * lot.fee;
                    }

                    lot.remaining = Number((lot.remaining - take).toFixed(8));
                    remainingToSell = Number((remainingToSell - take).toFixed(8));
                }

                inventory = inventory.filter(l => l.remaining > 0.00000001);

                // Shortfall handling
                if (remainingToSell > 0.00000001) {
                    const estBuyPrice = price * 0.995;
                    costBasis += (remainingToSell * estBuyPrice);
                }

                const revenue = price * amount;
                const sellFee = revenue * FEE_RATE;
                const tradeProfit = revenue - costBasis - entryFees - sellFee;
                totalProfit += tradeProfit;
                totalFees += (entryFees + sellFee);
            }
        }

        console.log('------------------------------------------------');
        console.log(`>> [RESULTS] SPREAD_MATCH Calculation Complete`);
        console.log(`>> Realized Profit: $${totalProfit.toFixed(4)}`);
        console.log(`>> Total Fees: $${totalFees.toFixed(4)}`);
        console.log(`>> Remaining Inventory: ${inventory.reduce((s, l) => s + l.remaining, 0).toFixed(6)} ${BASE_ASSET}`);
        console.log('------------------------------------------------');

        // Update state file
        const raw = fs.readFileSync(stateFile);
        let state = JSON.parse(raw);

        fs.copyFileSync(stateFile, stateFile + '.recalc.bak');

        state.totalProfit = totalProfit;
        state.accumulatedProfit = totalProfit;
        state.accountingMethod = 'SPREAD_MATCH';

        fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
        console.log(`>> State file updated with $${totalProfit.toFixed(4)} total profit`);
        console.log(`>> Run: pm2 restart all`);

    } catch (e) {
        console.error('>> ERROR:', e.message);
        console.error(e.stack);
    }
}

runRecalculate();
