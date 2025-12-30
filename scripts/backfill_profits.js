/**
 * BACKFILL PROFITS SCRIPT v3 - SPREAD_MATCH
 * Recalculates all profits using SPREAD_MATCH method (correct for grid trading)
 * Also rebuilds inventory from exchange trades
 * 
 * Usage: node backfill_profits.js [PAIR]
 * Example: node backfill_profits.js BTC/USDT
 */

const fs = require('fs');
const path = require('path');
const ccxt = require('ccxt');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ARGS = process.argv.slice(2);
const PAIR = ARGS[0] || 'BTC/USDT';
const PAIR_ID = PAIR.replace('/', '').toUpperCase();
const BASE_ASSET = PAIR.split('/')[0];
const FEE_RATE = 0.001; // 0.1% per trade

// Grid spacing varies by pair (must match CONFIG in grid_bot.js)
const PAIR_PRESETS = {
    'BTC/USDT': { spacing: 0.006 },  // 0.6%
    'SOL/USDT': { spacing: 0.007 }   // 0.7%
};
const DEFAULT_SPACING = PAIR_PRESETS[PAIR]?.spacing || 0.007;

console.log(`\n╔══════════════════════════════════════════════════════════════════╗`);
console.log(`║   BACKFILL PROFITS v3 - ${PAIR.padEnd(10)} (SPREAD_MATCH)          ║`);
console.log(`╠══════════════════════════════════════════════════════════════════╣`);

// Find state file
const sessionsDir = path.join(__dirname, '..', 'data', 'sessions');
let stateFile = null;

if (fs.existsSync(sessionsDir)) {
    const files = fs.readdirSync(sessionsDir);
    const preferredFile = `VANTAGE01_${PAIR_ID}_state.json`;
    if (files.includes(preferredFile)) {
        stateFile = path.join(sessionsDir, preferredFile);
        console.log(`║  State File: ${preferredFile}                            ║`);
    }
}

if (!stateFile) {
    console.error(`║  ❌ ERROR: Could not find state file for ${PAIR_ID}                ║`);
    console.log(`╚══════════════════════════════════════════════════════════════════╝\n`);
    process.exit(1);
}

const binance = new ccxt.binance({
    apiKey: process.env.BINANCE_API_KEY || process.env.API_KEY,
    secret: process.env.BINANCE_SECRET || process.env.API_SECRET,
    enableRateLimit: true
});

async function backfillProfits() {
    try {
        // ==================== PHASE 1: FETCH ALL TRADES ====================
        console.log(`║  [1/5] Fetching trades from Binance...                           ║`);

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
        console.log(`║  >> Found ${trades.length} trades                                           ║`);

        // ==================== PHASE 2: PROCESS WITH SPREAD_MATCH ====================
        console.log(`║  [2/5] Processing with SPREAD_MATCH...                           ║`);

        let inventory = [];
        const tradeResults = new Map();
        let buyCount = 0, sellCount = 0;
        let exactMatches = 0, closeMatches = 0, fallbackMatches = 0;
        let totalProfit = 0;

        for (const trade of trades) {
            const orderId = String(trade.order || trade.orderId || trade.id);
            const price = parseFloat(trade.price);
            const amount = parseFloat(trade.amount);
            const timestamp = trade.timestamp;

            // Convert fee to USDT
            let feeCost = trade.fee ? parseFloat(trade.fee.cost) : (price * amount * FEE_RATE);
            const feeAsset = trade.fee ? trade.fee.currency : 'USDT';
            if (feeAsset === BASE_ASSET) {
                feeCost = feeCost * price;
            }

            if (trade.side === 'buy') {
                inventory.push({
                    orderId,
                    price,
                    amount,
                    remaining: amount,
                    fee: feeCost,
                    timestamp
                });
                tradeResults.set(orderId, {
                    profit: 0,
                    costBasis: null,
                    spreadPct: null,
                    matchType: 'BUY',
                    isNetProfit: true
                });
                buyCount++;
            } else {
                // SELL - Use SPREAD_MATCH to find corresponding buy lot
                const expectedBuyPrice = price / (1 + DEFAULT_SPACING);
                const tolerance = expectedBuyPrice * 0.005; // 0.5%

                // Sort candidates by proximity to expected buy price
                const candidates = inventory
                    .map((lot, idx) => ({ ...lot, originalIndex: idx }))
                    .filter(lot => lot.remaining > 0.00000001)
                    .sort((a, b) => {
                        const diffA = Math.abs(a.price - expectedBuyPrice);
                        const diffB = Math.abs(b.price - expectedBuyPrice);
                        return diffA - diffB;
                    });

                let remainingToSell = amount;
                let totalCostBasis = 0;
                let totalEntryFees = 0;
                let matchType = 'FALLBACK';
                const lotsUsed = [];

                // Determine match type
                if (candidates.length > 0) {
                    const bestMatch = candidates[0];
                    const priceDiff = Math.abs(bestMatch.price - expectedBuyPrice);
                    if (priceDiff <= tolerance) {
                        matchType = 'EXACT';
                        exactMatches++;
                    } else if (priceDiff <= expectedBuyPrice * 0.02) {
                        matchType = 'CLOSE';
                        closeMatches++;
                    } else {
                        fallbackMatches++;
                    }
                }

                // Consume from sorted candidates
                for (const candidate of candidates) {
                    if (remainingToSell <= 0.00000001) break;

                    const lot = inventory[candidate.originalIndex];
                    if (lot.remaining <= 0.00000001) continue;

                    const take = Math.min(remainingToSell, lot.remaining);
                    totalCostBasis += (take * lot.price);

                    if (lot.amount > 0) {
                        totalEntryFees += (take / lot.amount) * lot.fee;
                    }

                    lotsUsed.push({ price: lot.price, amount: take });
                    lot.remaining = Number((lot.remaining - take).toFixed(8));
                    remainingToSell = Number((remainingToSell - take).toFixed(8));
                }

                // Clean up consumed lots
                inventory = inventory.filter(l => l.remaining > 0.00000001);

                // Handle shortfall
                if (remainingToSell > 0.00000001) {
                    const estBuyPrice = price * 0.995;
                    totalCostBasis += (remainingToSell * estBuyPrice);
                }

                // Calculate profit
                const revenue = price * amount;
                const sellFee = revenue * FEE_RATE;
                const totalFees = totalEntryFees + sellFee; // FIX: Total fees for UI
                const profit = revenue - totalCostBasis - totalFees;
                const avgCostBasis = amount > 0 ? totalCostBasis / amount : 0;
                const spreadPct = avgCostBasis > 0 ? ((price - avgCostBasis) / avgCostBasis * 100) : 0;

                totalProfit += profit;

                tradeResults.set(orderId, {
                    profit,
                    costBasis: avgCostBasis,
                    spreadPct,
                    fees: totalFees, // FIX: Include fees for UI display
                    matchType,
                    lotsUsed,
                    isNetProfit: true
                });
                sellCount++;
            }
        }

        console.log(`║  >> ${buyCount} buys, ${sellCount} sells                                    ║`);
        console.log(`║  >> Matches: ${exactMatches} exact, ${closeMatches} close, ${fallbackMatches} fallback                   ║`);

        // ==================== PHASE 3: LOAD AND BACKUP STATE ====================
        console.log(`║  [3/5] Backing up state file...                                  ║`);

        const raw = fs.readFileSync(stateFile);
        let state = JSON.parse(raw);

        const backupFile = stateFile + '.backup_' + Date.now();
        fs.copyFileSync(stateFile, backupFile);
        console.log(`║  >> Backup: ${path.basename(backupFile)}                  ║`);

        // ==================== PHASE 4: UPDATE STATE ====================
        console.log(`║  [4/5] Updating state with correct data...                       ║`);

        // Update filledOrders with correct profits
        let updatedCount = 0;
        let profitSum = 0;

        if (state.filledOrders && state.filledOrders.length > 0) {
            for (const order of state.filledOrders) {
                const orderId = String(order.id);
                const result = tradeResults.get(orderId);

                if (result) {
                    order.profit = result.profit;
                    order.costBasis = result.costBasis;
                    order.spreadPct = result.spreadPct;
                    order.fees = result.fees; // FIX: Include fees for UI display
                    order.matchType = result.matchType;
                    order.isNetProfit = true;
                    order.accountingMethod = 'SPREAD_MATCH';
                    updatedCount++;

                    if (order.side === 'sell' && result.profit !== null) {
                        profitSum += result.profit;
                    }
                }
            }
        }

        // Update inventory
        state.inventory = inventory.map(lot => ({
            id: lot.orderId,
            price: lot.price,
            amount: lot.amount,
            remaining: lot.remaining,
            fee: lot.fee,
            timestamp: lot.timestamp,
            recovered: true
        }));

        // Update totals
        state.totalProfit = totalProfit;
        state.accumulatedProfit = totalProfit;
        state.accountingMethod = 'SPREAD_MATCH';
        state.lastBackfill = new Date().toISOString();

        console.log(`║  >> Updated ${updatedCount} orders                                        ║`);
        console.log(`║  >> Rebuilt inventory: ${inventory.length} lots                                ║`);

        // ==================== PHASE 5: SAVE ====================
        console.log(`║  [5/5] Saving state file...                                      ║`);

        fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));

        // Final Summary
        const remainingQty = inventory.reduce((s, l) => s + l.remaining, 0);
        const avgCost = inventory.length > 0
            ? inventory.reduce((s, l) => s + (l.remaining * l.price), 0) / remainingQty
            : 0;

        console.log('╠══════════════════════════════════════════════════════════════════╣');
        console.log(`║  ✅ BACKFILL COMPLETE                                             ║`);
        console.log('╠══════════════════════════════════════════════════════════════════╣');
        console.log(`║  Total Realized Profit:  $${totalProfit.toFixed(4).padStart(12)}                       ║`);
        console.log(`║  Inventory Remaining:    ${remainingQty.toFixed(6).padStart(12)} ${BASE_ASSET}                  ║`);
        console.log(`║  Avg Inventory Cost:     $${avgCost.toFixed(2).padStart(12)}                       ║`);
        console.log('╠══════════════════════════════════════════════════════════════════╣');
        console.log(`║  ⚠️  Run: pm2 restart all                                         ║`);
        console.log('╚══════════════════════════════════════════════════════════════════╝\n');

    } catch (e) {
        console.error('\n❌ ERROR:', e.message);
        console.error(e.stack);
    }
}

backfillProfits();
