/**
 * REBUILD INVENTORY FIXED
 * Reconstruye inventario preservando original/remaining correctamente
 * Usa SPREAD_MATCH para asociar sells a lotes
 */

const fs = require('fs');

const PAIR = process.argv[2] || 'BTCUSDT';
const DRY_RUN = process.argv.includes('--dry-run');
const MIN_SPREAD = 0.001; // 0.1% mínimo para match

const STATE_PATH = `/root/arca-bot/data/sessions/VANTAGE01_${PAIR}_state.json`;
const BACKUP_PATH = `/root/arca-bot/data/sessions/VANTAGE01_${PAIR}_state_backup_rebuild_${Date.now()}.json`;

let state;
try {
    state = JSON.parse(fs.readFileSync(STATE_PATH));
} catch (e) {
    console.error(`Error leyendo state: ${e.message}`);
    process.exit(1);
}

console.log('='.repeat(70));
console.log(`REBUILD INVENTORY - ${PAIR}`);
console.log('='.repeat(70));
console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

// Paso 1: Obtener todos los trades ordenados cronológicamente
const allTrades = [...(state.filledOrders || [])];
allTrades.sort((a, b) => a.timestamp - b.timestamp);

const buys = allTrades.filter(t => t.side === 'buy');
const sells = allTrades.filter(t => t.side === 'sell');

console.log(`Total trades: ${allTrades.length} (${buys.length} buys, ${sells.length} sells)`);
console.log(`Periodo: ${new Date(allTrades[0]?.timestamp).toISOString().slice(0,10)} - ${new Date(allTrades[allTrades.length-1]?.timestamp).toISOString().slice(0,10)}`);

// Paso 2: Crear inventario desde BUYs con campo 'original'
console.log('\n📦 Creando inventario desde BUYs...');
const inventory = new Map(); // id -> lot

for (const buy of buys) {
    const id = String(buy.orderId || buy.id);
    const price = buy.price || buy.fillPrice;
    const amount = buy.amount;

    // Fee
    let fee = 0;
    if (buy.fee?.cost) {
        if (buy.fee.currency === 'USDT') fee = buy.fee.cost;
        else if (buy.fee.currency === 'BNB') fee = buy.fee.cost * 700;
        else fee = buy.fee.cost * price;
    } else if (buy.fees) {
        fee = buy.fees;
    } else {
        fee = amount * price * 0.00075;
    }

    inventory.set(id, {
        id: id,
        price: price,
        amount: amount,
        original: amount,  // <-- IMPORTANTE: track original
        remaining: amount, // Será reducido por sells
        fee: fee,
        timestamp: buy.timestamp,
        spacing: buy.spacing || 0.005
    });
}

console.log(`   ${inventory.size} lotes creados desde BUYs`);

// Paso 3: Procesar SELLs con SPREAD_MATCH
console.log('\n🔄 Procesando SELLs con SPREAD_MATCH...');

let totalProfit = 0;
let sellsMatched = 0;
let sellsUnmatched = 0;

for (const sell of sells) {
    const sellId = String(sell.orderId || sell.id);
    const sellPrice = sell.price || sell.fillPrice;
    const sellAmount = sell.amount;
    const sellDate = new Date(sell.timestamp).toISOString().slice(0, 10);

    let remainingToSell = sellAmount;
    const matchedLots = [];
    let costBasis = 0;
    let entryFees = 0;

    // SPREAD_MATCH: lotes con profit, ordenados por precio bajo
    const available = Array.from(inventory.values())
        .filter(l => l.remaining > 0.00000001)
        .filter(l => {
            const spread = (sellPrice - l.price) / l.price;
            return spread >= MIN_SPREAD;
        })
        .sort((a, b) => a.price - b.price);

    for (const lot of available) {
        if (remainingToSell <= 0.00000001) break;

        const take = Math.min(remainingToSell, lot.remaining);
        costBasis += take * lot.price;
        entryFees += (take / lot.original) * (lot.fee || 0);

        const remainingAfter = Number((lot.remaining - take).toFixed(8));

        matchedLots.push({
            lotId: lot.id,
            buyPrice: lot.price,
            amountTaken: take,
            remainingBefore: lot.remaining,
            remainingAfter: remainingAfter
        });

        // ACTUALIZAR remaining del lote
        lot.remaining = remainingAfter;
        remainingToSell = Number((remainingToSell - take).toFixed(8));
    }

    // Calcular profit
    const amountSold = sellAmount - remainingToSell;
    if (amountSold > 0) {
        const sellValue = amountSold * sellPrice;
        let exitFee = 0;
        if (sell.fee?.cost) exitFee = sell.fee.cost;
        else if (sell.fees) exitFee = sell.fees;
        else exitFee = sellValue * 0.00075;

        const totalFees = entryFees + exitFee;
        const netProfit = sellValue - costBasis - totalFees;
        const avgCost = costBasis / amountSold;
        const spreadPct = ((sellPrice - avgCost) / avgCost) * 100;

        totalProfit += netProfit;
        sellsMatched++;

        // Actualizar el registro de la sell
        sell.matchedLots = matchedLots;
        sell.profit = netProfit;
        sell.costBasis = avgCost;
        sell.spreadPct = spreadPct;
        sell.fees = totalFees;
        sell.matchType = 'SPREAD_MATCH';
        sell.isNetProfit = true;
    } else {
        sellsUnmatched++;
        sell.matchedLots = [];
        sell.profit = 0;
        sell.matchType = 'UNMATCHED';
    }

    if (remainingToSell > 0.00000001) {
        console.log(`  ⚠️ ${sellDate} | $${sellPrice.toFixed(2)} | ${remainingToSell.toFixed(8)} UNMATCHED`);
    }
}

// Paso 4: Filtrar lotes activos (remaining > 0)
const activeInventory = Array.from(inventory.values())
    .filter(l => l.remaining > 0.00000001);

// Resultados
console.log('\n' + '─'.repeat(70));
console.log('RESULTADO');
console.log('─'.repeat(70));

console.log(`\n📊 SELLS:`);
console.log(`   Matched: ${sellsMatched}`);
console.log(`   Unmatched: ${sellsUnmatched}`);

console.log(`\n💰 PROFIT:`);
console.log(`   Calculado: $${totalProfit.toFixed(4)}`);
console.log(`   Anterior: $${(state.totalProfit || 0).toFixed(4)}`);
console.log(`   Diferencia: $${(totalProfit - (state.totalProfit || 0)).toFixed(4)}`);

const totalRemaining = activeInventory.reduce((s, l) => s + l.remaining, 0);
const totalOriginal = activeInventory.reduce((s, l) => s + l.original, 0);
const invValue = activeInventory.reduce((s, l) => s + l.remaining * l.price, 0);

console.log(`\n📦 INVENTARIO ACTIVO:`);
console.log(`   Lotes: ${activeInventory.length}`);
console.log(`   Total original: ${totalOriginal.toFixed(8)}`);
console.log(`   Total remaining: ${totalRemaining.toFixed(8)}`);
console.log(`   Valor: $${invValue.toFixed(2)}`);

// Lotes parciales (donde remaining < original)
const partialLots = activeInventory.filter(l => l.remaining < l.original - 0.00000001);
console.log(`\n🔄 LOTES PARCIALES: ${partialLots.length}`);
partialLots.slice(0, 10).forEach(lot => {
    const pct = ((lot.remaining / lot.original) * 100).toFixed(1);
    console.log(`   #${lot.id}: ${lot.remaining.toFixed(8)}/${lot.original.toFixed(8)} (${pct}%) @ $${lot.price.toFixed(2)}`);
});

// Top lotes por precio
console.log(`\n📋 INVENTARIO (top 8 por precio):`);
activeInventory.sort((a, b) => a.price - b.price).slice(0, 8).forEach((lot, i) => {
    const pct = ((lot.remaining / lot.original) * 100).toFixed(0);
    console.log(`   ${i + 1}. $${lot.price.toFixed(2)} | ${lot.remaining.toFixed(8)} (${pct}% del original)`);
});

// Guardar
if (!DRY_RUN) {
    // Backup
    fs.writeFileSync(BACKUP_PATH, JSON.stringify(state, null, 2));
    console.log(`\n✓ Backup: ${BACKUP_PATH}`);

    // Actualizar state
    state.inventory = activeInventory;
    state.totalProfit = totalProfit;
    state.filledOrders = allTrades.sort((a, b) => b.timestamp - a.timestamp);

    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
    console.log(`✓ Guardado: ${STATE_PATH}`);
    console.log(`\n🎉 REBUILD COMPLETO`);
} else {
    console.log(`\n⚠️  DRY RUN - Sin cambios`);
}
