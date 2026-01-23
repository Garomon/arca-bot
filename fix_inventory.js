/**
 * FIX INVENTORY - Actualiza el remaining de los lotes existentes
 * sin reemplazar todo el inventario
 */

const fs = require('fs');

const PAIR = process.argv[2] || 'SOLUSDT';
const DRY_RUN = process.argv.includes('--dry-run');

const STATE_PATH = `/root/arca-bot/data/sessions/VANTAGE01_${PAIR}_state.json`;

let state;
try {
    state = JSON.parse(fs.readFileSync(STATE_PATH));
} catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
}

console.log('='.repeat(60));
console.log(`FIX INVENTORY - ${PAIR}`);
console.log('='.repeat(60));
console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

const inventory = state.inventory || [];
const sells = (state.filledOrders || []).filter(t => t.side === 'sell');

console.log(`Inventario actual: ${inventory.length} lotes`);
console.log(`Sells en historial: ${sells.length}`);

// Para cada lote, agregar campo 'original' si no existe
inventory.forEach(lot => {
    if (!lot.original) {
        lot.original = lot.amount;
    }
});

// Ordenar sells cronológicamente
sells.sort((a, b) => a.timestamp - b.timestamp);

// Resetear remaining a original para recalcular
inventory.forEach(lot => {
    lot.remaining = lot.original || lot.amount;
});

console.log('\nRecalculando remaining basado en sells...\n');

let totalProfit = 0;
let sellsProcessed = 0;

// Para cada sell, encontrar el mejor lote (SPREAD_MATCH) y reducir remaining
for (const sell of sells) {
    const sellPrice = sell.price || sell.fillPrice;
    const sellAmount = sell.amount;
    const sellDate = new Date(sell.timestamp).toISOString().slice(0, 10);

    let remainingToSell = sellAmount;
    const matchedLots = [];
    let costBasis = 0;

    // SPREAD_MATCH: buscar lotes con profit (precio < sellPrice)
    const availableLots = inventory
        .filter(l => l.remaining > 0.00000001)
        .filter(l => {
            const spread = (sellPrice - l.price) / l.price;
            return spread >= 0.001; // Min 0.1% spread
        })
        .sort((a, b) => a.price - b.price); // Más barato primero

    for (const lot of availableLots) {
        if (remainingToSell <= 0.00000001) break;

        const take = Math.min(remainingToSell, lot.remaining);
        costBasis += take * lot.price;

        matchedLots.push({
            lotId: lot.id,
            buyPrice: lot.price,
            amountTaken: take,
            remainingAfter: Number((lot.remaining - take).toFixed(8))
        });

        lot.remaining = Number((lot.remaining - take).toFixed(8));
        remainingToSell = Number((remainingToSell - take).toFixed(8));
    }

    // Calcular profit
    const amountSold = sellAmount - remainingToSell;
    const sellValue = amountSold * sellPrice;
    const fees = (sell.fees || sell.fee?.cost || sellValue * 0.00075);
    const netProfit = sellValue - costBasis - fees;

    if (matchedLots.length > 0) {
        totalProfit += netProfit;
        sellsProcessed++;

        // Actualizar el sell con los matchedLots correctos
        sell.matchedLots = matchedLots;
        sell.profit = netProfit;
        sell.costBasis = amountSold > 0 ? costBasis / amountSold : 0;
        sell.matchType = 'SPREAD_MATCH';
    }

    if (remainingToSell > 0.00000001) {
        console.log(`  ⚠️ ${sellDate} | $${sellPrice.toFixed(2)} | ${remainingToSell.toFixed(6)} UNMATCHED`);
    }
}

// Mostrar lotes parciales
const partialLots = inventory.filter(l => l.remaining < (l.original || l.amount) - 0.00001);

console.log('\n' + '─'.repeat(60));
console.log('RESULTADO');
console.log('─'.repeat(60));

console.log(`\n📊 Sells procesados: ${sellsProcessed}`);
console.log(`💰 Profit total: $${totalProfit.toFixed(4)}`);
console.log(`💰 Anterior: $${(state.totalProfit || 0).toFixed(4)}`);

console.log(`\n🔄 LOTES PARCIALES: ${partialLots.length}`);
partialLots.forEach(lot => {
    const orig = lot.original || lot.amount;
    const pct = ((lot.remaining / orig) * 100).toFixed(1);
    console.log(`   #${lot.id}: ${lot.remaining.toFixed(6)}/${orig.toFixed(6)} (${pct}%) @ $${lot.price.toFixed(2)}`);
});

// Guardar
if (!DRY_RUN) {
    state.totalProfit = totalProfit;
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
    console.log(`\n✓ Guardado: ${STATE_PATH}`);
} else {
    console.log(`\n⚠️  DRY RUN - Sin cambios`);
}
