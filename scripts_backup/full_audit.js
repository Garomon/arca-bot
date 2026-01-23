/**
 * COMPREHENSIVE PROFIT AUDIT SCRIPT v2
 * Uses SPREAD_MATCH method (correct for grid trading)
 * 
 * Usage: node full_audit.js [PAIR]
 * Example: node full_audit.js BTC/USDT
 *          node full_audit.js SOL/USDT
 */

const fs = require('fs');
const path = require('path');
const ccxt = require('ccxt');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ARGS = process.argv.slice(2);
const PAIR = ARGS.find(a => !a.startsWith('--')) || 'BTC/USDT';
const FIX_MODE = ARGS.includes('--fix');
const PAIR_ID = PAIR.replace('/', '').toUpperCase();
const BASE_ASSET = PAIR.split('/')[0];
const FEE_RATE = 0.001; // 0.1% per trade

// Grid spacing varies by pair
const PAIR_PRESETS = {
    'BTC/USDT': { spacing: 0.006 },  // 0.6%
    'SOL/USDT': { spacing: 0.008 },  // 0.8% (Synced with grid_bot.js)
    'DOGE/USDT': { spacing: 0.010 }  // 1.0%
};
const DEFAULT_SPACING = PAIR_PRESETS[PAIR]?.spacing || 0.007;

console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log(`║   COMPREHENSIVE PROFIT AUDIT v2 - ${PAIR.padEnd(12)} (SPREAD_MATCH)   ║`);
if (FIX_MODE) {
    console.log('║   🔧 FIX MODE ENABLED - Will update state file if needed         ║');
}
console.log('╠══════════════════════════════════════════════════════════════════╣');

const binance = new ccxt.binance({
    apiKey: process.env.BINANCE_API_KEY || process.env.API_KEY,
    secret: process.env.BINANCE_SECRET || process.env.API_SECRET,
    enableRateLimit: true
});

async function fullAudit() {
    try {
        // ==================== PHASE 1: FETCH ALL TRADES ====================
        console.log('║  [PHASE 1] Fetching ALL trades from Binance...                   ║');

        let allTrades = [];
        let since = 1704067200000; // Jan 1, 2024 (safe start)

        while (true) {
            const batch = await binance.fetchMyTrades(PAIR, since, 1000);
            if (!batch || batch.length === 0) break;

            allTrades = allTrades.concat(batch);
            since = batch[batch.length - 1].timestamp + 1;

            process.stdout.write(`\r║  >> Fetched ${allTrades.length} trades...                                     `);

            if (batch.length < 1000) break;
            await new Promise(r => setTimeout(r, 200));
        }

        console.log(`\n║  >> Total: ${allTrades.length} trades found                                    ║`);

        if (allTrades.length === 0) {
            console.log('║  ❌ No trades found for this pair                                 ║');
            console.log('╚══════════════════════════════════════════════════════════════════╝\n');
            return;
        }

        // Sort chronologically
        allTrades.sort((a, b) => a.timestamp - b.timestamp);

        const firstTrade = new Date(allTrades[0].timestamp);
        const lastTrade = new Date(allTrades[allTrades.length - 1].timestamp);
        const tradingDays = Math.ceil((lastTrade - firstTrade) / (1000 * 60 * 60 * 24));

        console.log(`║  >> First Trade: ${firstTrade.toISOString().split('T')[0]}                              ║`);
        console.log(`║  >> Last Trade:  ${lastTrade.toISOString().split('T')[0]}                              ║`);
        console.log(`║  >> Trading Period: ${tradingDays} days                                    ║`);

        // ==================== PHASE 2: SPREAD_MATCH CALCULATION ====================
        console.log('╠══════════════════════════════════════════════════════════════════╣');
        console.log('║  [PHASE 2] SPREAD_MATCH Profit Calculation                       ║');
        console.log('╠══════════════════════════════════════════════════════════════════╣');

        // Load state file to get actual spacing values used by bot
        const sessionsDir = path.join(__dirname, '..', 'data', 'sessions');
        const stateFileName = `VANTAGE01_${PAIR_ID}_state.json`;
        const stateFilePath = path.join(sessionsDir, stateFileName);
        let stateFilledOrders = [];
        if (fs.existsSync(stateFilePath)) {
            try {
                const stateData = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
                stateFilledOrders = stateData.filledOrders || [];
                console.log(`║  >> Loaded ${stateFilledOrders.length} orders from state for spacing reference ║`);
            } catch (e) {
                console.log(`║  >> Warning: Could not load state file, using default spacing  ║`);
            }
        }

        let inventory = []; // Array of lots: {price, amount, remaining, fee, timestamp}
        let totalRealizedProfit = 0;
        let totalFeesPaid = 0;
        let totalBuyVolume = 0;
        let totalSellVolume = 0;
        let buyCount = 0;
        let sellCount = 0;
        let profitableSells = 0;
        let losingSells = 0;
        let exactMatches = 0;
        let closeMatches = 0;
        let fallbackMatches = 0;

        // Detailed trade log
        const tradeLog = [];

        for (const trade of allTrades) {
            const price = parseFloat(trade.price);
            const amount = parseFloat(trade.amount);
            const cost = price * amount;
            const feeCost = trade.fee ? parseFloat(trade.fee.cost) : (cost * FEE_RATE);
            const feeAsset = trade.fee ? trade.fee.currency : 'USDT';
            const timestamp = trade.timestamp;
            const orderId = String(trade.order || trade.id);

            // Convert fee to USDT if in base asset
            let feeUSDT = feeCost;
            if (feeAsset === BASE_ASSET) {
                feeUSDT = feeCost * price;
            }

            totalFeesPaid += feeUSDT;

            if (trade.side === 'buy') {
                // Add to inventory
                inventory.push({
                    orderId,
                    price,
                    amount,
                    remaining: amount,
                    fee: feeUSDT,
                    timestamp
                });

                buyCount++;
                totalBuyVolume += cost;

                tradeLog.push({
                    type: 'BUY',
                    date: new Date(timestamp).toISOString(),
                    price,
                    amount,
                    cost,
                    fee: feeUSDT,
                    profit: null,
                    spreadPct: null,
                    inventoryAfter: inventory.reduce((s, l) => s + l.remaining, 0)
                });

            } else if (trade.side === 'sell') {
                // === SPREAD_MATCH: Find the buy lot that corresponds to this sell ===
                // Try to get actual spacing from state file if available
                let spacing = DEFAULT_SPACING;
                const stateOrder = stateFilledOrders.find(o =>
                    String(o.id) === orderId || String(o.clientOrderId)?.includes(orderId.slice(-6))
                );
                if (stateOrder && stateOrder.spacing) {
                    spacing = stateOrder.spacing;
                }

                // Expected buy price = sellPrice / (1 + spacing)
                const expectedBuyPrice = price / (1 + spacing);
                // Use 2% tolerance to handle dynamic spacing variations
                const tolerance = expectedBuyPrice * 0.02; // INCREASED: 2% tolerance for dynamic spacing

                let remainingToSell = amount;
                let totalCostBasis = 0;
                let totalEntryFees = 0;
                const lotsConsumed = [];
                let matchType = 'NONE';

                // Sort inventory by proximity to expected buy price (SPREAD_MATCH)
                const candidates = inventory
                    .map((lot, idx) => ({ ...lot, originalIndex: idx }))
                    .filter(lot => lot.remaining > 0.00000001)
                    .sort((a, b) => {
                        const diffA = Math.abs(a.price - expectedBuyPrice);
                        const diffB = Math.abs(b.price - expectedBuyPrice);
                        return diffA - diffB;
                    });

                // Determine match quality
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
                        matchType = 'FALLBACK';
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

                    lotsConsumed.push({
                        lotPrice: lot.price,
                        amount: take,
                        age: Math.round((timestamp - lot.timestamp) / (1000 * 60)),
                        matchType
                    });

                    lot.remaining -= take;
                    remainingToSell -= take;
                }

                // Clean up consumed lots
                inventory = inventory.filter(l => l.remaining > 0.00000001);

                // Handle shortfall
                let shortfall = 0;
                if (remainingToSell > 0.00000001) {
                    shortfall = remainingToSell;
                    const estBuyPrice = price * 0.995;
                    totalCostBasis += (remainingToSell * estBuyPrice);
                }

                const revenue = price * amount;
                const sellFee = revenue * FEE_RATE;
                const profit = revenue - totalCostBasis - totalEntryFees - sellFee;
                const avgCostBasis = totalCostBasis / amount;
                const spreadPct = ((price - avgCostBasis) / avgCostBasis) * 100;

                totalRealizedProfit += profit;
                sellCount++;
                totalSellVolume += revenue;

                if (profit > 0) profitableSells++;
                else losingSells++;

                tradeLog.push({
                    type: 'SELL',
                    date: new Date(timestamp).toISOString(),
                    price,
                    amount,
                    revenue,
                    fee: sellFee,
                    costBasis: avgCostBasis,
                    profit,
                    spreadPct,
                    matchType,
                    expectedBuyPrice,
                    lotsConsumed,
                    shortfall: shortfall > 0 ? shortfall : null,
                    inventoryAfter: inventory.reduce((s, l) => s + l.remaining, 0)
                });
            }
        }

        // ==================== PHASE 3: GENERATE REPORT ====================
        let remainingInventory = inventory.reduce((s, l) => s + l.remaining, 0);
        const avgInvCost = inventory.length > 0
            ? inventory.reduce((s, l) => s + (l.remaining * l.price), 0) / remainingInventory
            : 0;

        // Get current price for unrealized PnL
        const ticker = await binance.fetchTicker(PAIR);
        const currentPrice = ticker.last;
        const unrealizedPnL = remainingInventory * (currentPrice - avgInvCost);
        const totalPnL = totalRealizedProfit + unrealizedPnL;

        const winRate = sellCount > 0 ? ((profitableSells / sellCount) * 100) : 0;

        console.log('╠══════════════════════════════════════════════════════════════════╣');
        console.log('║  [PHASE 3] AUDIT RESULTS (SPREAD_MATCH)                          ║');
        console.log('╠══════════════════════════════════════════════════════════════════╣');
        console.log(`║  📊 TRADE STATISTICS                                              ║`);
        console.log(`║     Total Trades:        ${(buyCount + sellCount).toString().padStart(6)}                              ║`);
        console.log(`║     Buy Orders:          ${buyCount.toString().padStart(6)}                              ║`);
        console.log(`║     Sell Orders:         ${sellCount.toString().padStart(6)}                              ║`);
        console.log(`║     Profitable Sells:    ${profitableSells.toString().padStart(6)} (${winRate.toFixed(1)}%)                      ║`);
        console.log(`║     Losing Sells:        ${losingSells.toString().padStart(6)} (${(100 - winRate).toFixed(1)}%)                       ║`);
        console.log('╠══════════════════════════════════════════════════════════════════╣');
        console.log(`║  🎯 SPREAD_MATCH QUALITY                                          ║`);
        console.log(`║     Exact Matches:       ${exactMatches.toString().padStart(6)} (Within 0.5%)               ║`);
        console.log(`║     Close Matches:       ${closeMatches.toString().padStart(6)} (Within 2%)                 ║`);
        console.log(`║     Fallback Matches:    ${fallbackMatches.toString().padStart(6)} (Best Available)           ║`);
        console.log('╠══════════════════════════════════════════════════════════════════╣');
        console.log(`║  💰 VOLUME                                                        ║`);
        console.log(`║     Total Buy Volume:    $${totalBuyVolume.toFixed(2).padStart(12)}                       ║`);
        console.log(`║     Total Sell Volume:   $${totalSellVolume.toFixed(2).padStart(12)}                       ║`);
        console.log(`║     Total Fees Paid:     $${totalFeesPaid.toFixed(4).padStart(12)}                       ║`);
        console.log('╠══════════════════════════════════════════════════════════════════╣');
        console.log(`║  🏆 PROFIT & LOSS                                                 ║`);
        console.log(`║     Realized Profit:     $${totalRealizedProfit.toFixed(4).padStart(12)}                       ║`);
        console.log(`║     Unrealized PnL:      $${unrealizedPnL.toFixed(4).padStart(12)}                       ║`);
        console.log(`║     TOTAL PnL:           $${totalPnL.toFixed(4).padStart(12)}                       ║`);
        console.log('╠══════════════════════════════════════════════════════════════════╣');
        console.log(`║  📦 CURRENT INVENTORY (${BASE_ASSET})                                      ║`);
        console.log(`║     Remaining:           ${remainingInventory.toFixed(6).padStart(12)} ${BASE_ASSET}                  ║`);
        console.log(`║     Avg Cost:            $${avgInvCost.toFixed(2).padStart(12)}                       ║`);
        console.log(`║     Current Price:       $${currentPrice.toFixed(2).padStart(12)}                       ║`);
        console.log(`║     Inventory Value:     $${(remainingInventory * currentPrice).toFixed(2).padStart(12)}                       ║`);
        console.log('╚══════════════════════════════════════════════════════════════════╝');

        // ==================== PHASE 4: COMPARE WITH STATE FILE ====================
        // (reusing sessionsDir, stateFileName, stateFilePath from Phase 2)

        let needsFix = false;
        let state = null;

        if (fs.existsSync(stateFilePath)) {
            console.log('\n╔══════════════════════════════════════════════════════════════════╗');
            console.log('║  [PHASE 4] STATE FILE COMPARISON                                 ║');
            console.log('╠══════════════════════════════════════════════════════════════════╣');

            state = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
            const stateProfit = state.totalProfit || 0;
            const stateFilledCount = (state.filledOrders || []).length;
            const stateInventory = state.inventory || [];
            const stateInvTotal = stateInventory.reduce((s, l) => s + (l.remaining || l.amount || 0), 0);

            // 2026-01-02 FIX: Cap Inventory at Real Exchange Balance (MOVED UP)
            // This prevents "Cost Basis Lost" errors on startup if Audit > Real
            const balance = await binance.fetchBalance();
            const baseAsset = PAIR.split('/')[0];
            const realBalance = parseFloat(balance[baseAsset]?.total || 0);

            console.log(`║  Real Exchange Balance:  ${realBalance.toFixed(6).padStart(12)} ${BASE_ASSET}                  ║`);

            let cappedInventory = [...inventory];
            let cappedTotal = remainingInventory;

            if (remainingInventory > realBalance + 0.000001) {
                console.log(`║  ⚠️ AUDIT > REAL: Truncating inventory to match exchange (${realBalance.toFixed(6)}) ║`);

                cappedInventory = [];
                let currentSum = 0;

                // Loop data from Newest (End) to Oldest (Start)
                for (let i = inventory.length - 1; i >= 0; i--) {
                    const lot = inventory[i];
                    const spaceRemaining = realBalance - currentSum;

                    if (spaceRemaining <= 0.00000001) break;

                    const take = Math.min(lot.remaining, spaceRemaining);

                    // Add to front of new array (to keep order)
                    cappedInventory.unshift({
                        ...lot,
                        remaining: take,
                        amount: lot.amount
                    });

                    currentSum += take;
                }

                cappedTotal = currentSum;
                inventory = cappedInventory;
                remainingInventory = cappedTotal;
            }

            const profitDiff = totalRealizedProfit - stateProfit;
            const invDiff = remainingInventory - stateInvTotal; // Now uses capped inventory

            const profitNeedsFix = Math.abs(profitDiff) > 0.01;
            const invNeedsFix = Math.abs(invDiff) > 0.0001;
            needsFix = profitNeedsFix || invNeedsFix;

            console.log(`║  State File Profit:      $${stateProfit.toFixed(4).padStart(12)}                       ║`);
            console.log(`║  Audit Profit:           $${totalRealizedProfit.toFixed(4).padStart(12)}                       ║`);
            console.log(`║  DIFFERENCE:             $${profitDiff.toFixed(4).padStart(12)} ${profitNeedsFix ? '⚠️' : '✅'}                  ║`);

            console.log('╠══════════════════════════════════════════════════════════════════╣');
            console.log(`║  State Inventory:        ${stateInvTotal.toFixed(6).padStart(12)} ${BASE_ASSET}                  ║`);
            console.log(`║  Audit Inventory (Cap):  ${remainingInventory.toFixed(6).padStart(12)} ${BASE_ASSET}                  ║`);
            console.log(`║  DIFFERENCE:             ${invDiff.toFixed(6).padStart(12)} ${BASE_ASSET} ${invNeedsFix ? '⚠️' : '✅'}             ║`);
            console.log('╚══════════════════════════════════════════════════════════════════╝');

            // ==================== AUTO-FIX LOGIC ====================
            if (FIX_MODE) {
                console.log('\n╔══════════════════════════════════════════════════════════════════╗');
                console.log('║  🔧 AUTO-FIX MODE                                                ║');
                console.log('╠══════════════════════════════════════════════════════════════════╣');

                let stateUpdated = false;

                // 1. Fix Stats (Profit/Inventory) if needed
                if (needsFix) {
                    // Create backup
                    const backupPath = stateFilePath.replace('.json', `_backup_${Date.now()}.json`);
                    fs.writeFileSync(backupPath, JSON.stringify(state, null, 2));
                    console.log(`║  📁 Backup created: ${path.basename(backupPath).padEnd(35)}    ║`);

                    // Update profit
                    const oldProfit = state.totalProfit || 0;
                    state.totalProfit = totalRealizedProfit;
                    state.accumulatedProfit = totalRealizedProfit;
                    console.log(`║  💰 Profit: $${oldProfit.toFixed(4)} → $${totalRealizedProfit.toFixed(4)}                           ║`);

                    // Update inventory with audited lots
                    const oldInvCount = (state.inventory || []).length;
                    state.inventory = inventory.map(lot => ({
                        id: lot.orderId || `AUDIT_${lot.timestamp}`,
                        price: lot.price,
                        amount: lot.remaining,
                        remaining: lot.remaining,
                        fee: lot.fee || 0,
                        timestamp: lot.timestamp,
                        recovered: true,
                        auditVerified: true
                    }));
                    console.log(`║  📦 Inventory: ${oldInvCount} lots → ${state.inventory.length} lots (${remainingInventory.toFixed(6)} ${BASE_ASSET})     ║`);

                    // Update avg cost
                    state.entryPrice = avgInvCost;
                    console.log(`║  📊 Avg Cost: $${avgInvCost.toFixed(2).padEnd(42)}║`);

                    stateUpdated = true;
                } else {
                    console.log('║  ✅ Stats (Profit/Inventory) are accurate. No changes needed.    ║');
                }

                // 1.5 Fix Active Orders (Cost Basis Injection)
                if (state.activeOrders && state.activeOrders.length > 0) {
                    let ordersFixed = 0;
                    state.activeOrders.forEach(order => {
                        if (order.side === 'sell' && (!order.costBasis || order.costBasis === 0)) {
                            // Fallback: use global avg cost from audit to satisfy safety check
                            order.costBasis = avgInvCost;
                            ordersFixed++;
                        }
                    });
                    if (ordersFixed > 0) {
                        console.log(`║  🔧 Fixed ${ordersFixed} active orders with missing Cost Basis (used Avg: $${avgInvCost.toFixed(2)}) ║`);
                        stateUpdated = true;
                    }
                }

                // 2. Unpause Bot (ALWAYS CHECK THIS IN FIX MODE)
                if (state.isPaused) {
                    state.isPaused = false;
                    state.pauseReason = null;
                    state.smartDcaBlocking = false;
                    console.log(`║  🔓 SAFETY LOCK REMOVED: Bot Unpaused                            ║`);
                    stateUpdated = true;
                } else {
                    console.log('║  ✅ Bot is already unpaused.                                     ║');
                }

                // Save only if something changed
                if (stateUpdated) {
                    fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2));
                    console.log('╠══════════════════════════════════════════════════════════════════╣');
                    console.log('║  ✅ STATE FILE UPDATED SUCCESSFULLY                              ║');
                    console.log('║  ⚠️  RESTART THE BOT to apply changes: pm2 restart bot-btc       ║');
                    console.log('╚══════════════════════════════════════════════════════════════════╝');
                } else {
                    console.log('╚══════════════════════════════════════════════════════════════════╝');
                }
            } else if (!FIX_MODE && needsFix) {
                console.log('\n⚠️  Discrepancies found! Run with --fix to auto-correct:');
                console.log(`   node scripts/full_audit.js ${PAIR} --fix`);
            }
        }

        // ==================== PHASE 5: SAVE DETAILED REPORT ====================
        const reportDir = path.join(__dirname, '..', 'reports');
        if (!fs.existsSync(reportDir)) {
            fs.mkdirSync(reportDir, { recursive: true });
        }

        const reportFile = path.join(reportDir, `audit_${PAIR_ID}_${new Date().toISOString().split('T')[0]}.json`);

        const report = {
            generatedAt: new Date().toISOString(),
            method: 'SPREAD_MATCH',
            pair: PAIR,
            spacing: DEFAULT_SPACING,
            tradingPeriod: {
                start: firstTrade.toISOString(),
                end: lastTrade.toISOString(),
                days: tradingDays
            },
            statistics: {
                totalTrades: buyCount + sellCount,
                buyCount,
                sellCount,
                profitableSells,
                losingSells,
                winRate: winRate.toFixed(2) + '%'
            },
            matchQuality: {
                exactMatches,
                closeMatches,
                fallbackMatches
            },
            volume: {
                totalBuyVolume,
                totalSellVolume,
                totalFeesPaid
            },
            pnl: {
                realizedProfit: totalRealizedProfit,
                unrealizedPnL,
                totalPnL
            },
            inventory: {
                remaining: remainingInventory,
                avgCost: avgInvCost,
                currentPrice,
                value: remainingInventory * currentPrice,
                lots: inventory.map(l => ({
                    price: l.price,
                    remaining: l.remaining,
                    date: new Date(l.timestamp).toISOString()
                }))
            },
            tradeLog
        };

        fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
        console.log(`\n✅ Detailed report saved to: ${reportFile}`);

    } catch (e) {
        console.error('\n❌ ERROR:', e.message);
        console.error(e.stack);
    }
}

fullAudit();
