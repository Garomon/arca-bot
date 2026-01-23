/**
 * REBUILD LOCAL - Usa los datos ya guardados en filledOrders
 * Con lógica SPREAD_MATCH
 */

const fs = require('fs');

const PAIR = process.argv[2] || 'SOLUSDT';
const DRY_RUN = process.argv.includes('--dry-run');
const MIN_SPREAD = 0.001; // 0.1% mínimo

const STATE_PATH = `/root/arca-bot/data/sessions/VANTAGE01_${PAIR}_state.json`;
const BACKUP_PATH = `/root/arca-bot/data/sessions/VANTAGE01_${PAIR}_state_backup_${Date.now()}.json`;

let state;
try {
    state = JSON.parse(fs.readFileSync(STATE_PATH));
} catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
}

console.log('='.repeat(70));
console.log(`REBUILD LOCAL (SPREAD_MATCH) - ${PAIR}`);
console.log('='.repeat(70));
console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

// Usar filledOrders existentes
const allTrades = [...(state.filledOrders || [])];
allTrades.sort((a, b) => a.timestamp - b.timestamp);

const buys = allTrades.filter(t => t.side === 'buy');
const sells = allTrades.filter(t => t.side === 'sell');

console.log(`✓ Trades en estado: ${allTrades.length} (${buys.length} buys, ${sells.length} sells)`);
console.log(`  Desde: ${new Date(allTrades[0]?.timestamp).toISOString().slice(0,10) || 'N/A'}`);
console.log(`  Hasta: ${new Date(allTrades[allTrades.length-1]?.timestamp).toISOString().slice(0,10) || 'N/A'}`);

// Procesar con SPREAD_MATCH
console.log('\n' + '─'.repeat(70));
console.log('PROCESANDO CON SPREAD_MATCH...');
console.log('─'.repeat(70));

const inventory = [];
const processedOrders = [];
let totalProfit = 0;
let profitableSells = 0;
let unmatchedSells = 0;

for (const trade of allTrades) {
    const tradeId = trade.orderId || trade.id;
    const amount = trade.amount;
    const price = trade.price || trade.fillPrice;
    const date = new Date(trade.timestamp).toISOString().slice(0, 16);

    // Fee
    let feeUSDT = 0;
    if (trade.fee?.cost) {
        if (trade.fee.currency === 'USDT') feeUSDT = trade.fee.cost;
        else if (trade.fee.currency === 'BNB') feeUSDT = trade.fee.cost * 700;
        else feeUSDT = trade.fee.cost * price;
    } else if (trade.fees) {
        feeUSDT = trade.fees;
    }

    if (trade.side === 'buy') {
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
            ...trade,
            id: tradeId,
            orderId: tradeId
        });

    } else {
        // SPREAD_MATCH
        let remainingToSell = amount;
        const matchedLots = [];
        let costBasis = 0;
        let entryFees = 0;

        // Ordenar por precio (más bajo = mejor spread)
        const availableLots = inventory
            .filter(l => l.remaining > 0.00000001)
            .filter(l => {
                const spread = (price - l.price) / l.price;
                return spread >= MIN_SPREAD;
            })
            .sort((a, b) => a.price - b.price);

        for (const lot of availableLots) {
            if (remainingToSell <= 0.00000001) break;

            const take = Math.min(remainingToSell, lot.remaining);
            costBasis += take * lot.price;
            entryFees += (take / lot.amount) * (lot.fee || 0);

            matchedLots.push({
                lotId: lot.id,
                buyPrice: lot.price,
                amountTaken: take,
                remainingBefore: lot.remaining,
                remainingAfter: Number((lot.remaining - take).toFixed(8))
            });

            lot.remaining = Number((lot.remaining - take).toFixed(8));
            remainingToSell = Number((remainingToSell - take).toFixed(8));
        }

        // Limpiar agotados
        for (let i = inventory.length - 1; i >= 0; i--) {
            if (inventory[i].remaining <= 0.00000001) inventory.splice(i, 1);
        }

        const amountMatched = amount - remainingToSell;
        const sellValue = amountMatched * price;
        const totalFees = entryFees + (feeUSDT * (amountMatched / amount || 0));
        const netProfit = sellValue - costBasis - totalFees;
        const avgCost = amountMatched > 0 ? costBasis / amountMatched : price;
        const spreadPct = avgCost > 0 ? ((price - avgCost) / avgCost) * 100 : 0;

        if (matchedLots.length > 0) {
            totalProfit += netProfit;
            profitableSells++;
        }
        if (remainingToSell > 0.00000001) {
            unmatchedSells++;
            console.log(`  ⚠️ ${date} | SELL $${price.toFixed(2)} | ${remainingToSell.toFixed(6)} UNMATCHED`);
        }

        processedOrders.push({
            ...trade,
            id: tradeId,
            orderId: tradeId,
            matchedLots: matchedLots,
            costBasis: avgCost,
            spreadPct: spreadPct,
            fees: totalFees,
            profit: matchedLots.length > 0 ? netProfit : 0,
            matchType: matchedLots.length > 0 ? 'SPREAD_MATCH' : 'UNMATCHED',
            isNetProfit: true,
            unmatchedAmount: remainingToSell > 0.00000001 ? remainingToSell : 0
        });
    }
}

// Resultados
console.log('\n' + '─'.repeat(70));
console.log('RESULTADO');
console.log('─'.repeat(70));

const totalRemaining = inventory.reduce((sum, l) => sum + l.remaining, 0);
const inventoryValue = inventory.reduce((sum, l) => sum + (l.remaining * l.price), 0);

console.log(`\n📦 INVENTARIO FINAL:`);
console.log(`   Lotes: ${inventory.length}`);
console.log(`   Remaining: ${totalRemaining.toFixed(6)}`);
console.log(`   Valor: $${inventoryValue.toFixed(2)}`);

console.log(`\n📊 SELLS:`);
console.log(`   Con profit: ${profitableSells} ✅`);
console.log(`   Sin match: ${unmatchedSells} ⚠️`);

console.log(`\n💰 PROFIT:`);
console.log(`   Calculado: $${totalProfit.toFixed(4)}`);
console.log(`   Anterior: $${(state.totalProfit || 0).toFixed(4)}`);
console.log(`   Diferencia: $${(totalProfit - (state.totalProfit || 0)).toFixed(4)}`);

// Lotes parciales
const partialLots = inventory.filter(l => l.remaining < l.original - 0.00001);
console.log(`\n🔄 LOTES PARCIALES: ${partialLots.length}`);
partialLots.forEach(lot => {
    const pct = ((lot.remaining / lot.original) * 100).toFixed(1);
    console.log(`   #${lot.id}: ${lot.remaining.toFixed(6)}/${lot.original.toFixed(6)} (${pct}%) @ $${lot.price.toFixed(2)}`);
});

// Top lotes
console.log(`\n📋 INVENTARIO (por precio, top 8):`);
inventory.sort((a, b) => a.price - b.price).slice(0, 8).forEach((lot, i) => {
    const pct = ((lot.remaining / lot.original) * 100).toFixed(0);
    console.log(`   ${i + 1}. $${lot.price.toFixed(2)} | ${lot.remaining.toFixed(6)} (${pct}%)`);
});

// Guardar
if (!DRY_RUN) {
    fs.writeFileSync(BACKUP_PATH, JSON.stringify(state, null, 2));
    console.log(`\n✓ Backup: ${BACKUP_PATH}`);

    state.inventory = inventory;
    state.totalProfit = totalProfit;
    state.filledOrders = processedOrders.sort((a, b) => b.timestamp - a.timestamp);

    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
    console.log(`✓ Guardado: ${STATE_PATH}`);
    console.log(`\n🎉 REBUILD COMPLETO`);
} else {
    console.log(`\n⚠️  DRY RUN - Sin cambios`);
}
