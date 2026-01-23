/**
 * REBUILD WITH SPREAD_MATCH
 *
 * Reconstruye usando SPREAD_MATCH: cada sell busca el lote con mejor spread
 * (el lote con precio más bajo que aún tenga remaining y dé profit)
 */

const ccxt = require('ccxt');
const fs = require('fs');

const PAIR = process.argv[2] || 'SOL/USDT';
const DRY_RUN = process.argv.includes('--dry-run');
const MIN_SPREAD = 0.001; // 0.1% mínimo para considerar un match válido

require('dotenv').config({ path: '/root/arca-bot/.env' });
const config = {
    apiKey: process.env.BINANCE_API_KEY,
    apiSecret: process.env.BINANCE_SECRET
};

const PAIR_NORMALIZED = PAIR.replace('/', '');
const STATE_PATH = `/root/arca-bot/data/sessions/VANTAGE01_${PAIR_NORMALIZED}_state.json`;
const BACKUP_PATH = `/root/arca-bot/data/sessions/VANTAGE01_${PAIR_NORMALIZED}_state_backup_${Date.now()}.json`;

let state;
try {
    state = JSON.parse(fs.readFileSync(STATE_PATH));
} catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
}

async function main() {
    console.log('='.repeat(70));
    console.log(`REBUILD WITH SPREAD_MATCH - ${PAIR}`);
    console.log('='.repeat(70));
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

    const exchange = new ccxt.binance({
        apiKey: config.apiKey,
        secret: config.apiSecret,
        enableRateLimit: true,
        options: { defaultType: 'spot' }
    });

    // Obtener todos los trades de Binance
    console.log('Conectando a Binance...');
    let allTrades = [];
    let since = undefined;
    while (true) {
        const trades = await exchange.fetchMyTrades(PAIR, since, 1000);
        if (trades.length === 0) break;
        allTrades = allTrades.concat(trades);
        console.log(`  Obtenidos ${allTrades.length} trades...`);
        since = trades[trades.length - 1].timestamp + 1;
        if (allTrades.length > 10000) break;
        await new Promise(r => setTimeout(r, 100));
    }

    allTrades.sort((a, b) => a.timestamp - b.timestamp);

    const buys = allTrades.filter(t => t.side === 'buy');
    const sells = allTrades.filter(t => t.side === 'sell');

    console.log(`\n✓ Total trades: ${allTrades.length} (${buys.length} buys, ${sells.length} sells)`);

    // Procesar con SPREAD_MATCH
    console.log('\n' + '─'.repeat(70));
    console.log('PROCESANDO CON SPREAD_MATCH...');
    console.log('─'.repeat(70));

    const inventory = []; // Lotes disponibles
    const processedOrders = [];
    let totalProfit = 0;
    let profitableSells = 0;
    let lossSells = 0;
    let unmatchedSells = 0;

    for (const trade of allTrades) {
        const tradeId = trade.order || trade.id;
        const amount = trade.amount;
        const price = trade.price;
        const date = new Date(trade.timestamp).toISOString().slice(0, 16);

        // Fee
        let feeUSDT = 0;
        if (trade.fee) {
            if (trade.fee.currency === 'USDT') feeUSDT = trade.fee.cost;
            else if (trade.fee.currency === 'BNB') feeUSDT = trade.fee.cost * 700;
            else feeUSDT = trade.fee.cost * price;
        }

        if (trade.side === 'buy') {
            // Agregar lote al inventario
            inventory.push({
                id: tradeId,
                price: price,
                amount: amount,
                original: amount,
                remaining: amount,
                fee: feeUSDT,
                timestamp: trade.timestamp
            });

            processedOrders.push({
                id: tradeId,
                orderId: tradeId,
                side: 'buy',
                price: price,
                amount: amount,
                timestamp: trade.timestamp,
                fillPrice: price,
                status: 'filled',
                fee: trade.fee,
                isFromBinance: true
            });

        } else {
            // SPREAD_MATCH: buscar lotes que den profit
            let remainingToSell = amount;
            const matchedLots = [];
            let costBasis = 0;
            let entryFees = 0;

            // Ordenar por precio (más bajo primero = mejor spread)
            const availableLots = inventory
                .filter(l => l.remaining > 0.00000001)
                .filter(l => {
                    const spread = (price - l.price) / l.price;
                    return spread >= MIN_SPREAD; // Solo lotes que den profit mínimo
                })
                .sort((a, b) => a.price - b.price); // Más barato primero

            for (const lot of availableLots) {
                if (remainingToSell <= 0.00000001) break;

                const take = Math.min(remainingToSell, lot.remaining);
                const lotCost = take * lot.price;
                const lotFee = (take / lot.amount) * (lot.fee || 0);
                const spread = ((price - lot.price) / lot.price * 100).toFixed(2);

                costBasis += lotCost;
                entryFees += lotFee;

                matchedLots.push({
                    lotId: lot.id,
                    buyPrice: lot.price,
                    amountTaken: take,
                    remainingBefore: lot.remaining,
                    remainingAfter: Number((lot.remaining - take).toFixed(8)),
                    spread: parseFloat(spread)
                });

                // Actualizar remaining
                lot.remaining = Number((lot.remaining - take).toFixed(8));
                remainingToSell = Number((remainingToSell - take).toFixed(8));
            }

            // Eliminar lotes agotados
            for (let i = inventory.length - 1; i >= 0; i--) {
                if (inventory[i].remaining <= 0.00000001) {
                    inventory.splice(i, 1);
                }
            }

            // Calcular profit
            const amountMatched = amount - remainingToSell;
            const sellValue = amountMatched * price;
            const totalFees = entryFees + (feeUSDT * (amountMatched / amount));
            const grossProfit = sellValue - costBasis;
            const netProfit = grossProfit - totalFees;

            const avgCost = amountMatched > 0 ? costBasis / amountMatched : price;
            const spreadPct = avgCost > 0 ? ((price - avgCost) / avgCost) * 100 : 0;

            if (matchedLots.length > 0) {
                totalProfit += netProfit;
                if (netProfit > 0) profitableSells++;
                else lossSells++;
            } else {
                unmatchedSells++;
            }

            // Log si hay unmatched
            if (remainingToSell > 0.00000001) {
                console.log(`  ⚠️ ${date} | SELL $${price.toFixed(2)} | ${(remainingToSell).toFixed(6)} UNMATCHED (no profit lots)`);
            }

            processedOrders.push({
                id: tradeId,
                orderId: tradeId,
                side: 'sell',
                price: price,
                amount: amount,
                timestamp: trade.timestamp,
                fillPrice: price,
                status: 'filled',
                fee: trade.fee,
                matchedLots: matchedLots,
                costBasis: avgCost,
                spreadPct: spreadPct,
                fees: totalFees,
                profit: matchedLots.length > 0 ? netProfit : 0,
                matchType: matchedLots.length > 0 ? 'SPREAD_MATCH' : 'UNMATCHED',
                isNetProfit: true,
                isFromBinance: true,
                unmatchedAmount: remainingToSell > 0.00000001 ? remainingToSell : 0
            });
        }
    }

    // Resultados
    console.log('\n' + '─'.repeat(70));
    console.log('RESULTADO CON SPREAD_MATCH');
    console.log('─'.repeat(70));

    const totalRemaining = inventory.reduce((sum, lot) => sum + lot.remaining, 0);
    const inventoryValue = inventory.reduce((sum, lot) => sum + (lot.remaining * lot.price), 0);

    console.log(`\n📦 INVENTARIO FINAL:`);
    console.log(`   Lotes: ${inventory.length}`);
    console.log(`   Remaining: ${totalRemaining.toFixed(6)}`);
    console.log(`   Valor: $${inventoryValue.toFixed(2)}`);

    console.log(`\n📊 SELLS ANÁLISIS:`);
    console.log(`   Con profit: ${profitableSells} ✅`);
    console.log(`   Sin profit: ${lossSells} ❌`);
    console.log(`   Sin match (precio muy alto): ${unmatchedSells} ⚠️`);

    console.log(`\n💰 PROFIT:`);
    console.log(`   SPREAD_MATCH calculado: $${totalProfit.toFixed(4)}`);
    console.log(`   State anterior: $${(state.totalProfit || 0).toFixed(4)}`);
    console.log(`   Diferencia: $${(totalProfit - (state.totalProfit || 0)).toFixed(4)}`);

    // Mostrar lotes parciales
    const partialLots = inventory.filter(l => l.remaining < l.original - 0.00001);
    console.log(`\n🔄 LOTES PARCIALES: ${partialLots.length}`);
    partialLots.forEach(lot => {
        const pct = ((lot.remaining / lot.original) * 100).toFixed(1);
        console.log(`   #${lot.id}: ${lot.remaining.toFixed(6)}/${lot.original.toFixed(6)} (${pct}%) @ $${lot.price.toFixed(2)}`);
    });

    // Top 5 lotes (ordenados por precio)
    const sortedInv = [...inventory].sort((a, b) => a.price - b.price);
    console.log(`\n📋 LOTES EN INVENTARIO (por precio):`);
    sortedInv.slice(0, 8).forEach((lot, i) => {
        const pct = ((lot.remaining / lot.original) * 100).toFixed(0);
        console.log(`   ${i + 1}. $${lot.price.toFixed(2)} | ${lot.remaining.toFixed(6)} (${pct}% del orig)`);
    });

    // Guardar
    if (!DRY_RUN) {
        fs.writeFileSync(BACKUP_PATH, JSON.stringify(state, null, 2));
        console.log(`\n✓ Backup: ${BACKUP_PATH}`);

        state.inventory = inventory;
        state.totalProfit = totalProfit;
        state.filledOrders = processedOrders.sort((a, b) => b.timestamp - a.timestamp);

        fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
        console.log(`✓ Estado guardado: ${STATE_PATH}`);
        console.log(`\n🎉 RECONSTRUCCIÓN SPREAD_MATCH COMPLETA`);
    } else {
        console.log(`\n⚠️  DRY RUN - Sin cambios`);
    }
}

main().catch(e => console.error('Error:', e.message));
