/**
 * QUANTUM PROFIT AUDIT - Zero Margin of Error
 * Trade-by-trade forensic verification with full transparency
 * 
 * This script shows EVERY trade and exactly how profit is calculated
 */

const fs = require('fs');
const path = require('path');
const ccxt = require('ccxt');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ARGS = process.argv.slice(2);
const PAIR = ARGS[0] || 'BTC/USDT';
const PAIR_ID = PAIR.replace('/', '').toUpperCase();
const BASE_ASSET = PAIR.split('/')[0];

const binance = new ccxt.binance({
    apiKey: process.env.BINANCE_API_KEY || process.env.API_KEY,
    secret: process.env.BINANCE_SECRET || process.env.API_SECRET,
    enableRateLimit: true
});

async function quantumAudit() {
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════════════════╗');
    console.log(`║   QUANTUM PROFIT AUDIT - ${PAIR} - ZERO MARGIN OF ERROR                                    ║`);
    console.log('╠══════════════════════════════════════════════════════════════════════════════════════════╣');
    console.log('║   METHODOLOGY: Track every buy as inventory lot, consume on sell, calculate exact profit ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════════════════╝\n');

    // Fetch ALL trades
    let trades = [];
    let since = 1704067200000;

    console.log('Fetching all trades from Binance...');
    while (true) {
        const batch = await binance.fetchMyTrades(PAIR, since, 1000);
        if (!batch || batch.length === 0) break;
        trades = trades.concat(batch);
        since = batch[batch.length - 1].timestamp + 1;
        if (batch.length < 1000) break;
        await new Promise(r => setTimeout(r, 200));
    }

    trades.sort((a, b) => a.timestamp - b.timestamp);
    console.log(`Found ${trades.length} trades\n`);

    // Inventory as queue (FIFO - oldest first) - simplest for grid trading
    let inventory = [];
    let runningProfit = 0;
    let totalBuyVolume = 0;
    let totalSellVolume = 0;
    let totalFees = 0;
    let sellCount = 0;
    let profitableSells = 0;
    let losingSells = 0;

    console.log('═══════════════════════════════════════════════════════════════════════════════════════════');
    console.log('   #  │ DATE       │ SIDE │   PRICE      │   AMOUNT    │     COST     │   PROFIT   │ INV QTY');
    console.log('═══════════════════════════════════════════════════════════════════════════════════════════');

    for (let i = 0; i < trades.length; i++) {
        const t = trades[i];
        const price = parseFloat(t.price);
        const amount = parseFloat(t.amount);
        const cost = price * amount;
        const date = new Date(t.timestamp).toISOString().split('T')[0];

        // Calculate fee in USDT
        let feeUSDT = 0;
        if (t.fee) {
            const feeCost = parseFloat(t.fee.cost);
            const feeCurrency = t.fee.currency;
            feeUSDT = feeCurrency === 'USDT' ? feeCost : feeCost * price;
        }
        totalFees += feeUSDT;

        if (t.side === 'buy') {
            // Add to inventory
            inventory.push({
                price,
                amount,
                remaining: amount,
                fee: feeUSDT,
                timestamp: t.timestamp,
                date
            });
            totalBuyVolume += cost;

            const invQty = inventory.reduce((s, l) => s + l.remaining, 0);
            console.log(`${(i + 1).toString().padStart(4)} │ ${date} │ BUY  │ $${price.toFixed(2).padStart(11)} │ ${amount.toFixed(6).padStart(11)} │ $${cost.toFixed(2).padStart(11)} │     -      │ ${invQty.toFixed(6)}`);

        } else {
            // SELL - Consume inventory (FIFO - oldest first)
            let remainingToSell = amount;
            let totalCostBasis = 0;
            let totalEntryFees = 0;
            const lotsUsed = [];

            // Process FIFO (from beginning of array)
            for (let j = 0; j < inventory.length && remainingToSell > 0.00000001; j++) {
                const lot = inventory[j];
                if (lot.remaining <= 0.00000001) continue;

                const take = Math.min(remainingToSell, lot.remaining);
                totalCostBasis += (take * lot.price);

                // Proportional fee
                if (lot.amount > 0) {
                    totalEntryFees += (take / lot.amount) * lot.fee;
                }

                lotsUsed.push({
                    buyPrice: lot.price,
                    buyDate: lot.date,
                    qty: take
                });

                lot.remaining = Number((lot.remaining - take).toFixed(8));
                remainingToSell = Number((remainingToSell - take).toFixed(8));
            }

            // Clean consumed lots
            inventory = inventory.filter(l => l.remaining > 0.00000001);

            // Calculate profit
            const revenue = price * amount;
            const sellFee = feeUSDT; // Already calculated above
            const profit = revenue - totalCostBasis - totalEntryFees - sellFee;

            runningProfit += profit;
            totalSellVolume += revenue;
            sellCount++;

            if (profit > 0) profitableSells++;
            else losingSells++;

            const invQty = inventory.reduce((s, l) => s + l.remaining, 0);
            const profitStr = profit >= 0 ? `+$${profit.toFixed(4).padStart(8)}` : `-$${Math.abs(profit).toFixed(4).padStart(8)}`;
            const avgCost = totalCostBasis / amount;

            console.log(`${(i + 1).toString().padStart(4)} │ ${date} │ SELL │ $${price.toFixed(2).padStart(11)} │ ${amount.toFixed(6).padStart(11)} │ $${revenue.toFixed(2).padStart(11)} │ ${profitStr} │ ${invQty.toFixed(6)}`);
            console.log(`      │            │      │ Cost Basis: $${avgCost.toFixed(2)} from ${lotsUsed.length} lot(s)`);

            // Show lot details for verification
            for (const lot of lotsUsed) {
                console.log(`      │            │      │   └─ ${lot.qty.toFixed(6)} @ $${lot.buyPrice.toFixed(2)} (${lot.buyDate})`);
            }
        }
    }

    // Final inventory and summary
    console.log('═══════════════════════════════════════════════════════════════════════════════════════════');

    // Get current price
    const ticker = await binance.fetchTicker(PAIR);
    const currentPrice = ticker.last;

    const remainingQty = inventory.reduce((s, l) => s + l.remaining, 0);
    const avgInvCost = inventory.length > 0
        ? inventory.reduce((s, l) => s + (l.remaining * l.price), 0) / remainingQty
        : 0;
    const inventoryValue = remainingQty * currentPrice;
    const unrealizedPnL = remainingQty * (currentPrice - avgInvCost);

    console.log('\n╔══════════════════════════════════════════════════════════════════════════════════════════╗');
    console.log('║   FINAL AUDIT RESULTS                                                                    ║');
    console.log('╠══════════════════════════════════════════════════════════════════════════════════════════╣');
    console.log(`║   Total Trades:              ${trades.length.toString().padStart(6)} (${trades.filter(t => t.side === 'buy').length} buys, ${trades.filter(t => t.side === 'sell').length} sells)                                   ║`);
    console.log(`║   Profitable Sells:          ${profitableSells.toString().padStart(6)} (${((profitableSells / sellCount) * 100).toFixed(1)}%)                                                    ║`);
    console.log(`║   Losing Sells:              ${losingSells.toString().padStart(6)} (${((losingSells / sellCount) * 100).toFixed(1)}%)                                                    ║`);
    console.log('╠══════════════════════════════════════════════════════════════════════════════════════════╣');
    console.log(`║   Total Buy Volume:          $${totalBuyVolume.toFixed(2).padStart(12)}                                                ║`);
    console.log(`║   Total Sell Volume:         $${totalSellVolume.toFixed(2).padStart(12)}                                                ║`);
    console.log(`║   Total Fees Paid:           $${totalFees.toFixed(4).padStart(12)}                                                ║`);
    console.log('╠══════════════════════════════════════════════════════════════════════════════════════════╣');
    console.log(`║   REALIZED PROFIT (FIFO):    $${runningProfit.toFixed(4).padStart(12)}    ← From ${sellCount} completed sells              ║`);
    console.log('╠══════════════════════════════════════════════════════════════════════════════════════════╣');
    console.log(`║   Remaining Inventory:       ${remainingQty.toFixed(6).padStart(12)} ${BASE_ASSET}                                         ║`);
    console.log(`║   Avg Inventory Cost:        $${avgInvCost.toFixed(2).padStart(12)}                                                ║`);
    console.log(`║   Current Market Price:      $${currentPrice.toFixed(2).padStart(12)}                                                ║`);
    console.log(`║   Inventory Value:           $${inventoryValue.toFixed(2).padStart(12)}                                                ║`);
    console.log(`║   Unrealized P&L:            $${unrealizedPnL.toFixed(2).padStart(12)}                                                ║`);
    console.log('╠══════════════════════════════════════════════════════════════════════════════════════════╣');
    console.log(`║   TOTAL P&L (Realized + Unrealized): $${(runningProfit + unrealizedPnL).toFixed(2).padStart(12)}                                    ║`);
    console.log('╠══════════════════════════════════════════════════════════════════════════════════════════╣');
    console.log('║   VERIFICATION (Cash Flow):                                                              ║');
    const netCash = totalSellVolume - totalBuyVolume - totalFees;
    const totalPnL = netCash + inventoryValue;
    console.log(`║     Sells - Buys - Fees:     $${netCash.toFixed(2).padStart(12)}                                                ║`);
    console.log(`║     + Inventory Value:       $${inventoryValue.toFixed(2).padStart(12)}                                                ║`);
    console.log(`║     = TOTAL P&L:             $${totalPnL.toFixed(2).padStart(12)}                                                ║`);
    console.log('╚══════════════════════════════════════════════════════════════════════════════════════════╝');

    // Save detailed report
    const reportDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

    const report = {
        generatedAt: new Date().toISOString(),
        pair: PAIR,
        method: 'QUANTUM_FIFO',
        trades: trades.length,
        buys: trades.filter(t => t.side === 'buy').length,
        sells: trades.filter(t => t.side === 'sell').length,
        profitableSells,
        losingSells,
        totalBuyVolume,
        totalSellVolume,
        totalFees,
        realizedProfit: runningProfit,
        inventory: {
            quantity: remainingQty,
            avgCost: avgInvCost,
            currentPrice,
            value: inventoryValue,
            unrealizedPnL
        },
        totalPnL: runningProfit + unrealizedPnL,
        verification: {
            cashFlow: netCash,
            inventoryValue,
            totalPnL
        }
    };

    const reportFile = path.join(reportDir, `quantum_audit_${PAIR_ID}_${new Date().toISOString().split('T')[0]}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(`\n✅ Detailed report saved to: ${reportFile}`);
}

quantumAudit().catch(e => {
    console.error('Error:', e.message);
    console.error(e.stack);
});
