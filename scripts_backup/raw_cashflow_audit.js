/**
 * RAW CASH FLOW AUDIT - Pure Math, No Matching
 * Simply calculates: Sells - Buys - Fees + Inventory Value
 */

const ccxt = require('ccxt');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const binance = new ccxt.binance({
    apiKey: process.env.BINANCE_API_KEY || process.env.API_KEY,
    secret: process.env.BINANCE_SECRET || process.env.API_SECRET,
    enableRateLimit: true
});

async function rawCashFlowAudit(pair) {
    console.log('\n╔══════════════════════════════════════════════════════════════════╗');
    console.log(`║   RAW CASH FLOW AUDIT - ${pair.padEnd(12)}                         ║`);
    console.log('╠══════════════════════════════════════════════════════════════════╣');

    let trades = [];
    let since = 1704067200000; // Jan 1, 2024

    while (true) {
        const batch = await binance.fetchMyTrades(pair, since, 1000);
        if (!batch || batch.length === 0) break;
        trades = trades.concat(batch);
        since = batch[batch.length - 1].timestamp + 1;
        if (batch.length < 1000) break;
        await new Promise(r => setTimeout(r, 200));
    }

    const BASE = pair.split('/')[0];

    let totalBuySpent = 0;      // USDT spent on buying
    let totalBuyQty = 0;        // Base asset bought
    let totalSellReceived = 0;  // USDT received from selling
    let totalSellQty = 0;       // Base asset sold
    let totalFees = 0;          // All fees in USDT

    // Detailed trade log for verification
    console.log('║  [PROCESSING TRADES...]                                          ║');

    for (const t of trades) {
        const price = parseFloat(t.price);
        const amount = parseFloat(t.amount);
        const cost = price * amount;

        // Calculate fee in USDT
        let feeUSDT = 0;
        if (t.fee) {
            const feeCost = parseFloat(t.fee.cost);
            const feeCurrency = t.fee.currency;
            feeUSDT = feeCurrency === 'USDT' ? feeCost : feeCost * price;
        }
        totalFees += feeUSDT;

        if (t.side === 'buy') {
            totalBuySpent += cost;
            totalBuyQty += amount;
        } else {
            totalSellReceived += cost;
            totalSellQty += amount;
        }
    }

    // Get current price
    const ticker = await binance.fetchTicker(pair);
    const currentPrice = ticker.last;

    // Remaining inventory
    const remainingQty = totalBuyQty - totalSellQty;
    const inventoryValue = remainingQty * currentPrice;

    // Calculate average buy price
    const avgBuyPrice = totalBuyQty > 0 ? totalBuySpent / totalBuyQty : 0;

    // CASH FLOW P&L (pure cash in/out)
    const netCash = totalSellReceived - totalBuySpent;
    const netCashAfterFees = netCash - totalFees;

    // TOTAL P&L including inventory value
    const totalPnL = netCashAfterFees + inventoryValue;

    // Realized P&L (only from completed cycles)
    // This is trickier - we need to estimate what portion was cycled
    const cycledQty = totalSellQty; // All sells came from previous buys
    const cycledBuyCost = cycledQty * avgBuyPrice; // Cost to acquire what was sold
    const realizedPnL = totalSellReceived - cycledBuyCost - totalFees;

    console.log('╠══════════════════════════════════════════════════════════════════╣');
    console.log(`║  📊 TRADE COUNT                                                   ║`);
    console.log(`║     Total Trades:        ${trades.length.toString().padStart(6)}                              ║`);
    console.log(`║     Buys:                ${trades.filter(t => t.side === 'buy').length.toString().padStart(6)}                              ║`);
    console.log(`║     Sells:               ${trades.filter(t => t.side === 'sell').length.toString().padStart(6)}                              ║`);
    console.log('╠══════════════════════════════════════════════════════════════════╣');
    console.log(`║  💵 CASH FLOWS                                                    ║`);
    console.log(`║     USDT Spent (Buys):   $${totalBuySpent.toFixed(2).padStart(12)}                       ║`);
    console.log(`║     USDT Received (Sells):$${totalSellReceived.toFixed(2).padStart(12)}                       ║`);
    console.log(`║     Total Fees:          $${totalFees.toFixed(4).padStart(12)}                       ║`);
    console.log('╠══════════════════════════════════════════════════════════════════╣');
    console.log(`║  📦 INVENTORY                                                     ║`);
    console.log(`║     Bought:              ${totalBuyQty.toFixed(6).padStart(12)} ${BASE}                  ║`);
    console.log(`║     Sold:                ${totalSellQty.toFixed(6).padStart(12)} ${BASE}                  ║`);
    console.log(`║     Remaining:           ${remainingQty.toFixed(6).padStart(12)} ${BASE}                  ║`);
    console.log(`║     Avg Buy Price:       $${avgBuyPrice.toFixed(2).padStart(12)}                       ║`);
    console.log(`║     Current Price:       $${currentPrice.toFixed(2).padStart(12)}                       ║`);
    console.log(`║     Inventory Value:     $${inventoryValue.toFixed(2).padStart(12)}                       ║`);
    console.log('╠══════════════════════════════════════════════════════════════════╣');
    console.log(`║  🏆 PROFIT & LOSS                                                 ║`);
    console.log(`║     Net Cash (no inv):   $${netCashAfterFees.toFixed(2).padStart(12)}                       ║`);
    console.log(`║     + Inventory Value:   $${inventoryValue.toFixed(2).padStart(12)}                       ║`);
    console.log(`║     ─────────────────────────────────────────────────            ║`);
    console.log(`║     TOTAL P&L:           $${totalPnL.toFixed(2).padStart(12)}                       ║`);
    console.log('╠══════════════════════════════════════════════════════════════════╣');
    console.log(`║  💡 ESTIMATED REALIZED (from cycles):                            ║`);
    console.log(`║     Cycled Quantity:     ${cycledQty.toFixed(6).padStart(12)} ${BASE}                  ║`);
    console.log(`║     Realized P&L:        $${realizedPnL.toFixed(2).padStart(12)}                       ║`);
    console.log('╚══════════════════════════════════════════════════════════════════╝');

    return { totalPnL, realizedPnL, inventoryValue, remainingQty };
}

(async () => {
    try {
        await rawCashFlowAudit('BTC/USDT');
        await rawCashFlowAudit('SOL/USDT');
        await rawCashFlowAudit('DOGE/USDT');
    } catch (e) {
        console.error('Error:', e.message);
    }
})();
