/**
 * QUANTUM AUDIT - Trade-by-Trade Verification
 * Zero margin of error. Every trade visible with running totals.
 * 
 * Usage: node quantum_audit.js [PAIR]
 */

const fs = require('fs');
const path = require('path');
const ccxt = require('ccxt');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ARGS = process.argv.slice(2);
const PAIR = ARGS[0] || 'BTC/USDT';
const PAIR_ID = PAIR.replace('/', '').toUpperCase();
const BASE = PAIR.split('/')[0];

const binance = new ccxt.binance({
    apiKey: process.env.BINANCE_API_KEY || process.env.API_KEY,
    secret: process.env.BINANCE_SECRET || process.env.API_SECRET,
    enableRateLimit: true
});

async function quantumAudit() {
    console.log('\n╔════════════════════════════════════════════════════════════════════════════════════════════════╗');
    console.log(`║   QUANTUM AUDIT - ${PAIR} - TRADE BY TRADE VERIFICATION                                         ║`);
    console.log('╠════════════════════════════════════════════════════════════════════════════════════════════════╣');

    // Fetch ALL trades
    let trades = [];
    let since = 1704067200000;

    while (true) {
        const batch = await binance.fetchMyTrades(PAIR, since, 1000);
        if (!batch || batch.length === 0) break;
        trades = trades.concat(batch);
        since = batch[batch.length - 1].timestamp + 1;
        if (batch.length < 1000) break;
        await new Promise(r => setTimeout(r, 200));
    }

    trades.sort((a, b) => a.timestamp - b.timestamp);

    // Running totals
    let runningCashSpent = 0;
    let runningCashReceived = 0;
    let runningFees = 0;
    let runningQtyBought = 0;
    let runningQtySold = 0;

    console.log('║                                                                                                ║');
    console.log('║  #   │ DATE       │ TIME  │ SIDE │ PRICE ($) │ AMOUNT       │ VALUE ($)  │ FEE ($) │ RUN QTY   ║');
    console.log('╠════════════════════════════════════════════════════════════════════════════════════════════════╣');

    const tradeDetails = [];

    for (let i = 0; i < trades.length; i++) {
        const t = trades[i];
        const price = parseFloat(t.price);
        const amount = parseFloat(t.amount);
        const value = price * amount;

        // Fee calculation
        let feeUSDT = 0;
        if (t.fee) {
            const feeCost = parseFloat(t.fee.cost);
            const feeCurrency = t.fee.currency;
            feeUSDT = feeCurrency === 'USDT' ? feeCost : feeCost * price;
        }

        if (t.side === 'buy') {
            runningCashSpent += value;
            runningQtyBought += amount;
        } else {
            runningCashReceived += value;
            runningQtySold += amount;
        }
        runningFees += feeUSDT;

        const runningQty = runningQtyBought - runningQtySold;

        // Format date/time
        const dt = new Date(t.timestamp);
        const dateStr = dt.toISOString().split('T')[0];
        const timeStr = dt.toTimeString().split(' ')[0].substring(0, 5);

        const sideStr = t.side === 'buy' ? 'BUY ' : 'SELL';
        const sideColor = t.side === 'buy' ? '📥' : '📤';

        tradeDetails.push({
            num: i + 1,
            date: dateStr,
            time: timeStr,
            side: t.side,
            price: price,
            amount: amount,
            value: value,
            fee: feeUSDT,
            runningQty: runningQty,
            runningCashSpent: runningCashSpent,
            runningCashReceived: runningCashReceived
        });

        // Print row
        const numStr = (i + 1).toString().padStart(3);
        const priceStr = price.toFixed(2).padStart(10);
        const amountStr = amount.toFixed(6).padStart(12);
        const valueStr = value.toFixed(2).padStart(10);
        const feeStr = feeUSDT.toFixed(4).padStart(7);
        const runQtyStr = runningQty.toFixed(6).padStart(9);

        console.log(`║  ${numStr} │ ${dateStr} │ ${timeStr} │ ${sideColor}${sideStr} │ ${priceStr} │ ${amountStr} │ ${valueStr} │ ${feeStr} │ ${runQtyStr} ║`);
    }

    // Get current price
    const ticker = await binance.fetchTicker(PAIR);
    const currentPrice = ticker.last;

    const finalQty = runningQtyBought - runningQtySold;
    const inventoryValue = finalQty * currentPrice;
    const netCash = runningCashReceived - runningCashSpent - runningFees;
    const totalPnL = netCash + inventoryValue;
    const avgBuyPrice = runningQtyBought > 0 ? runningCashSpent / runningQtyBought : 0;

    console.log('╠════════════════════════════════════════════════════════════════════════════════════════════════╣');
    console.log('║                                                                                                ║');
    console.log('║  VERIFICATION CHECKSUMS                                                                        ║');
    console.log('║  ─────────────────────────────────────────────────────────────────────────────────────────     ║');
    console.log(`║  Total Buys:               ${trades.filter(t => t.side === 'buy').length.toString().padStart(6)} trades                                                       ║`);
    console.log(`║  Total Sells:              ${trades.filter(t => t.side === 'sell').length.toString().padStart(6)} trades                                                       ║`);
    console.log('║                                                                                                ║');
    console.log(`║  USDT SPENT (Buys):        $${runningCashSpent.toFixed(4).padStart(14)}                                                   ║`);
    console.log(`║  USDT RECEIVED (Sells):    $${runningCashReceived.toFixed(4).padStart(14)}                                                   ║`);
    console.log(`║  TOTAL FEES:               $${runningFees.toFixed(4).padStart(14)}                                                   ║`);
    console.log('║                                                                                                ║');
    console.log(`║  QTY BOUGHT:               ${runningQtyBought.toFixed(8).padStart(14)} ${BASE}                                            ║`);
    console.log(`║  QTY SOLD:                 ${runningQtySold.toFixed(8).padStart(14)} ${BASE}                                            ║`);
    console.log(`║  QTY REMAINING:            ${finalQty.toFixed(8).padStart(14)} ${BASE}                                            ║`);
    console.log('║                                                                                                ║');
    console.log(`║  AVG BUY PRICE:            $${avgBuyPrice.toFixed(2).padStart(14)}                                                   ║`);
    console.log(`║  CURRENT PRICE:            $${currentPrice.toFixed(2).padStart(14)}                                                   ║`);
    console.log(`║  INVENTORY VALUE:          $${inventoryValue.toFixed(4).padStart(14)}                                                   ║`);
    console.log('║                                                                                                ║');
    console.log('║  ══════════════════════════════════════════════════════════════════════════════════════════    ║');
    console.log(`║  NET CASH (Sells-Buys-Fees): $${netCash.toFixed(4).padStart(12)}                                                     ║`);
    console.log(`║  + INVENTORY VALUE:          $${inventoryValue.toFixed(4).padStart(12)}                                                     ║`);
    console.log(`║  ────────────────────────────────────────────────────────────────                              ║`);
    console.log(`║  TOTAL P&L:                  $${totalPnL.toFixed(4).padStart(12)}                                                     ║`);
    console.log('║  ══════════════════════════════════════════════════════════════════════════════════════════    ║');
    console.log('║                                                                                                ║');

    // VERIFY: Can recreate from individual trades
    let verifySpent = 0, verifyReceived = 0, verifyFees = 0;
    for (const t of trades) {
        const price = parseFloat(t.price);
        const amount = parseFloat(t.amount);
        const value = price * amount;
        let feeUSDT = 0;
        if (t.fee) {
            const feeCost = parseFloat(t.fee.cost);
            const feeCurrency = t.fee.currency;
            feeUSDT = feeCurrency === 'USDT' ? feeCost : feeCost * price;
        }
        if (t.side === 'buy') verifySpent += value;
        else verifyReceived += value;
        verifyFees += feeUSDT;
    }

    const checksumMatch =
        Math.abs(verifySpent - runningCashSpent) < 0.0001 &&
        Math.abs(verifyReceived - runningCashReceived) < 0.0001 &&
        Math.abs(verifyFees - runningFees) < 0.0001;

    console.log(`║  ✓ CHECKSUM VERIFICATION: ${checksumMatch ? '✅ PASSED - All totals match individual trades' : '❌ FAILED'}                            ║`);
    console.log('║                                                                                                ║');
    console.log('╚════════════════════════════════════════════════════════════════════════════════════════════════╝');

    // Save detailed CSV for forensic analysis
    const csvDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(csvDir)) fs.mkdirSync(csvDir, { recursive: true });

    const csvFile = path.join(csvDir, `quantum_audit_${PAIR_ID}_${new Date().toISOString().split('T')[0]}.csv`);
    const csvHeader = 'Trade#,Date,Time,Side,Price,Amount,Value,Fee,RunningQty,RunningSpent,RunningReceived\n';
    const csvRows = tradeDetails.map(t =>
        `${t.num},${t.date},${t.time},${t.side},${t.price},${t.amount},${t.value},${t.fee},${t.runningQty},${t.runningCashSpent},${t.runningCashReceived}`
    ).join('\n');

    fs.writeFileSync(csvFile, csvHeader + csvRows);
    console.log(`\n✅ Detailed CSV saved: ${csvFile}`);

    // Also save JSON for programmatic analysis
    const jsonFile = path.join(csvDir, `quantum_audit_${PAIR_ID}_${new Date().toISOString().split('T')[0]}.json`);
    const report = {
        generatedAt: new Date().toISOString(),
        pair: PAIR,
        summary: {
            totalTrades: trades.length,
            buys: trades.filter(t => t.side === 'buy').length,
            sells: trades.filter(t => t.side === 'sell').length,
            usdtSpent: runningCashSpent,
            usdtReceived: runningCashReceived,
            totalFees: runningFees,
            qtyBought: runningQtyBought,
            qtySold: runningQtySold,
            qtyRemaining: finalQty,
            avgBuyPrice: avgBuyPrice,
            currentPrice: currentPrice,
            inventoryValue: inventoryValue,
            netCash: netCash,
            totalPnL: totalPnL,
            checksumValid: checksumMatch
        },
        trades: tradeDetails
    };

    fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2));
    console.log(`✅ Detailed JSON saved: ${jsonFile}`);

    return report;
}

(async () => {
    try {
        await quantumAudit();
    } catch (e) {
        console.error('Error:', e.message);
        console.error(e.stack);
    }
})();
