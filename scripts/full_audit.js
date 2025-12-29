/**
 * COMPREHENSIVE PROFIT AUDIT SCRIPT
 * Fetches ALL trades from Binance and produces detailed report
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
const PAIR = ARGS[0] || 'BTC/USDT';
const PAIR_ID = PAIR.replace('/', '').toUpperCase();
const BASE_ASSET = PAIR.split('/')[0];
const FEE_RATE = 0.001; // 0.1% per trade

console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log(`║   COMPREHENSIVE PROFIT AUDIT - ${PAIR.padEnd(12)}                    ║`);
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

        // ==================== PHASE 2: LIFO CALCULATION ====================
        console.log('╠══════════════════════════════════════════════════════════════════╣');
        console.log('║  [PHASE 2] LIFO Profit Calculation                               ║');
        console.log('╠══════════════════════════════════════════════════════════════════╣');

        let inventory = []; // Array of lots: {price, amount, remaining, fee, timestamp}
        let totalRealizedProfit = 0;
        let totalFeesPaid = 0;
        let totalBuyVolume = 0;
        let totalSellVolume = 0;
        let buyCount = 0;
        let sellCount = 0;
        let profitableSells = 0;
        let losingSells = 0;

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

            totalFeesPaid += feeCost;

            if (trade.side === 'buy') {
                // Add to inventory
                inventory.push({
                    orderId,
                    price,
                    amount,
                    remaining: amount,
                    fee: feeCost,
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
                    fee: feeCost,
                    profit: null,
                    spreadPct: null,
                    inventoryAfter: inventory.reduce((s, l) => s + l.remaining, 0)
                });

            } else if (trade.side === 'sell') {
                // LIFO: Consume from newest lots first
                let remainingToSell = amount;
                let totalCostBasis = 0;
                let totalEntryFees = 0;
                const lotsConsumed = [];

                // Process from end (newest) to start (oldest)
                for (let i = inventory.length - 1; i >= 0 && remainingToSell > 0.00000001; i--) {
                    const lot = inventory[i];
                    if (lot.remaining <= 0.00000001) continue;

                    const take = Math.min(remainingToSell, lot.remaining);
                    totalCostBasis += (take * lot.price);

                    if (lot.amount > 0) {
                        totalEntryFees += (take / lot.amount) * lot.fee;
                    }

                    lotsConsumed.push({
                        lotPrice: lot.price,
                        amount: take,
                        age: Math.round((timestamp - lot.timestamp) / (1000 * 60)) // minutes
                    });

                    lot.remaining -= take;
                    remainingToSell -= take;
                }

                // Clean up consumed lots
                inventory = inventory.filter(l => l.remaining > 0.00000001);

                // Handle shortfall (sold more than recorded buys)
                let shortfall = 0;
                if (remainingToSell > 0.00000001) {
                    shortfall = remainingToSell;
                    const estBuyPrice = price * 0.995; // Estimate 0.5% spread
                    totalCostBasis += (remainingToSell * estBuyPrice);
                }

                const revenue = price * amount;
                const profit = revenue - totalCostBasis - totalEntryFees - feeCost;
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
                    fee: feeCost,
                    costBasis: avgCostBasis,
                    profit,
                    spreadPct,
                    lotsConsumed,
                    shortfall: shortfall > 0 ? shortfall : null,
                    inventoryAfter: inventory.reduce((s, l) => s + l.remaining, 0)
                });
            }
        }

        // ==================== PHASE 3: GENERATE REPORT ====================
        const remainingInventory = inventory.reduce((s, l) => s + l.remaining, 0);
        const avgInvCost = inventory.length > 0
            ? inventory.reduce((s, l) => s + (l.remaining * l.price), 0) / remainingInventory
            : 0;

        // Get current price for unrealized PnL
        const ticker = await binance.fetchTicker(PAIR);
        const currentPrice = ticker.last;
        const unrealizedPnL = remainingInventory * (currentPrice - avgInvCost);
        const totalPnL = totalRealizedProfit + unrealizedPnL;

        console.log('╠══════════════════════════════════════════════════════════════════╣');
        console.log('║  [PHASE 3] AUDIT RESULTS                                         ║');
        console.log('╠══════════════════════════════════════════════════════════════════╣');
        console.log(`║  📊 TRADE STATISTICS                                              ║`);
        console.log(`║     Total Trades:        ${(buyCount + sellCount).toString().padStart(6)}                              ║`);
        console.log(`║     Buy Orders:          ${buyCount.toString().padStart(6)}                              ║`);
        console.log(`║     Sell Orders:         ${sellCount.toString().padStart(6)}                              ║`);
        console.log(`║     Profitable Sells:    ${profitableSells.toString().padStart(6)} (${((profitableSells / sellCount) * 100).toFixed(1)}%)                      ║`);
        console.log(`║     Losing Sells:        ${losingSells.toString().padStart(6)} (${((losingSells / sellCount) * 100).toFixed(1)}%)                       ║`);
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
        const sessionsDir = path.join(__dirname, '..', 'data', 'sessions');
        const stateFileName = `VANTAGE01_${PAIR_ID}_state.json`;
        const stateFilePath = path.join(sessionsDir, stateFileName);

        if (fs.existsSync(stateFilePath)) {
            console.log('\n╔══════════════════════════════════════════════════════════════════╗');
            console.log('║  [PHASE 4] STATE FILE COMPARISON                                 ║');
            console.log('╠══════════════════════════════════════════════════════════════════╣');

            const state = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
            const stateProfit = state.totalProfit || 0;
            const stateFilledCount = (state.filledOrders || []).length;
            const stateInventory = state.inventory || [];
            const stateInvTotal = stateInventory.reduce((s, l) => s + (l.remaining || l.amount || 0), 0);

            const profitDiff = totalRealizedProfit - stateProfit;
            const invDiff = remainingInventory - stateInvTotal;

            console.log(`║  State File Profit:      $${stateProfit.toFixed(4).padStart(12)}                       ║`);
            console.log(`║  Audit Profit:           $${totalRealizedProfit.toFixed(4).padStart(12)}                       ║`);
            console.log(`║  DIFFERENCE:             $${profitDiff.toFixed(4).padStart(12)} ${profitDiff > 0.01 || profitDiff < -0.01 ? '⚠️' : '✅'}                  ║`);
            console.log('╠══════════════════════════════════════════════════════════════════╣');
            console.log(`║  State Inventory:        ${stateInvTotal.toFixed(6).padStart(12)} ${BASE_ASSET}                  ║`);
            console.log(`║  Audit Inventory:        ${remainingInventory.toFixed(6).padStart(12)} ${BASE_ASSET}                  ║`);
            console.log(`║  DIFFERENCE:             ${invDiff.toFixed(6).padStart(12)} ${BASE_ASSET} ${Math.abs(invDiff) > 0.0001 ? '⚠️' : '✅'}             ║`);
            console.log('╚══════════════════════════════════════════════════════════════════╝');

            if (Math.abs(profitDiff) > 0.01 || Math.abs(invDiff) > 0.0001) {
                console.log('\n⚠️  DISCREPANCY DETECTED! Consider running:');
                console.log(`   node scripts/backfill_profits.js ${PAIR}`);
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
            pair: PAIR,
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
                winRate: ((profitableSells / sellCount) * 100).toFixed(2) + '%'
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
