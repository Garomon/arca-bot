/**
 * ANALYZE SELLS - Ver cada sell con su profit real
 */

const ccxt = require('ccxt');
const fs = require('fs');

const PAIR = process.argv[2] || 'SOL/USDT';

require('dotenv').config({ path: '/root/arca-bot/.env' });
const config = {
    apiKey: process.env.BINANCE_API_KEY,
    apiSecret: process.env.BINANCE_SECRET
};

async function main() {
    console.log('='.repeat(70));
    console.log(`ANÁLISIS DETALLADO DE SELLS - ${PAIR}`);
    console.log('='.repeat(70));

    const exchange = new ccxt.binance({
        apiKey: config.apiKey,
        secret: config.apiSecret,
        enableRateLimit: true,
        options: { defaultType: 'spot' }
    });

    // Obtener todos los trades
    let allTrades = [];
    let since = undefined;
    while (true) {
        const trades = await exchange.fetchMyTrades(PAIR, since, 1000);
        if (trades.length === 0) break;
        allTrades = allTrades.concat(trades);
        since = trades[trades.length - 1].timestamp + 1;
        if (allTrades.length > 10000) break;
        await new Promise(r => setTimeout(r, 100));
    }

    allTrades.sort((a, b) => a.timestamp - b.timestamp);
    console.log(`Total trades: ${allTrades.length}\n`);

    // Procesar FIFO
    const inventory = [];
    const sellResults = [];
    let totalProfit = 0;
    let profitableSells = 0;
    let lossSells = 0;

    for (const trade of allTrades) {
        const tradeId = trade.order || trade.id;
        const amount = trade.amount;
        const price = trade.price;
        const date = new Date(trade.timestamp).toISOString().slice(0, 10);

        // Fee
        let feeUSDT = 0;
        if (trade.fee) {
            if (trade.fee.currency === 'USDT') feeUSDT = trade.fee.cost;
            else if (trade.fee.currency === 'BNB') feeUSDT = trade.fee.cost * 700;
            else feeUSDT = trade.fee.cost * price;
        }

        if (trade.side === 'buy') {
            inventory.push({
                id: tradeId,
                price: price,
                amount: amount,
                remaining: amount,
                fee: feeUSDT,
                timestamp: trade.timestamp
            });
        } else {
            // SELL - consumir FIFO
            let remainingToSell = amount;
            let costBasis = 0;
            let entryFees = 0;
            const matches = [];

            inventory.sort((a, b) => a.timestamp - b.timestamp);

            for (const lot of inventory) {
                if (remainingToSell <= 0.00000001) break;
                if (lot.remaining <= 0.00000001) continue;

                const take = Math.min(remainingToSell, lot.remaining);
                costBasis += take * lot.price;
                entryFees += (take / lot.amount) * (lot.fee || 0);

                matches.push({
                    lotId: lot.id,
                    buyPrice: lot.price,
                    taken: take
                });

                lot.remaining -= take;
                remainingToSell -= take;
            }

            // Limpiar lotes agotados
            for (let i = inventory.length - 1; i >= 0; i--) {
                if (inventory[i].remaining <= 0.00000001) inventory.splice(i, 1);
            }

            const sellValue = amount * price;
            const totalFees = entryFees + feeUSDT;
            const grossProfit = sellValue - costBasis;
            const netProfit = grossProfit - totalFees;
            const avgBuyPrice = amount > 0 ? costBasis / amount : 0;
            const spreadPct = avgBuyPrice > 0 ? ((price - avgBuyPrice) / avgBuyPrice * 100) : 0;

            totalProfit += netProfit;
            if (netProfit > 0) profitableSells++;
            else lossSells++;

            sellResults.push({
                date,
                sellPrice: price,
                avgBuyPrice,
                amount,
                spreadPct,
                grossProfit,
                fees: totalFees,
                netProfit,
                matches
            });
        }
    }

    // Mostrar sells
    console.log('─'.repeat(70));
    console.log('DETALLE DE CADA SELL (ordenado por fecha)');
    console.log('─'.repeat(70));
    console.log('Fecha      | Sell $    | Buy $     | Spread | Gross    | Fees   | NET');
    console.log('─'.repeat(70));

    sellResults.forEach(s => {
        const spreadStr = s.spreadPct >= 0 ? `+${s.spreadPct.toFixed(2)}%` : `${s.spreadPct.toFixed(2)}%`;
        const grossStr = s.grossProfit >= 0 ? `+$${s.grossProfit.toFixed(3)}` : `-$${Math.abs(s.grossProfit).toFixed(3)}`;
        const netStr = s.netProfit >= 0 ? `+$${s.netProfit.toFixed(3)}` : `-$${Math.abs(s.netProfit).toFixed(3)}`;
        const indicator = s.netProfit >= 0 ? '✅' : '❌';

        console.log(`${s.date} | $${s.sellPrice.toFixed(2).padStart(7)} | $${s.avgBuyPrice.toFixed(2).padStart(7)} | ${spreadStr.padStart(6)} | ${grossStr.padStart(8)} | $${s.fees.toFixed(3).padStart(5)} | ${netStr.padStart(8)} ${indicator}`);
    });

    console.log('─'.repeat(70));
    console.log('\nRESUMEN:');
    console.log(`  Sells con profit: ${profitableSells} ✅`);
    console.log(`  Sells con pérdida: ${lossSells} ❌`);
    console.log(`  Total profit: $${totalProfit.toFixed(4)}`);

    // Top 5 mejores y peores
    const sorted = [...sellResults].sort((a, b) => b.netProfit - a.netProfit);

    console.log('\n📈 TOP 5 MEJORES SELLS:');
    sorted.slice(0, 5).forEach((s, i) => {
        console.log(`  ${i+1}. ${s.date} | $${s.sellPrice.toFixed(2)} (buy $${s.avgBuyPrice.toFixed(2)}) → +$${s.netProfit.toFixed(4)}`);
    });

    console.log('\n📉 TOP 5 PEORES SELLS:');
    sorted.slice(-5).reverse().forEach((s, i) => {
        console.log(`  ${i+1}. ${s.date} | $${s.sellPrice.toFixed(2)} (buy $${s.avgBuyPrice.toFixed(2)}) → $${s.netProfit.toFixed(4)}`);
    });

    // Inventario restante
    console.log(`\n📦 INVENTARIO RESTANTE: ${inventory.length} lotes`);
    const invValue = inventory.reduce((s, l) => s + l.remaining * l.price, 0);
    const invRemaining = inventory.reduce((s, l) => s + l.remaining, 0);
    console.log(`   Total: ${invRemaining.toFixed(6)} | Valor: $${invValue.toFixed(2)}`);
}

main().catch(e => console.error('Error:', e.message));
