/**
 * FIX IDS - Corrige la inconsistencia de IDs entre inventory y filledOrders
 *
 * Flujo:
 * 1. Lee todos los BUYs del historial
 * 2. Para cada BUY, crea un lote con el ID correcto
 * 3. Procesa los SELLs en orden cronológico
 * 4. Cada SELL consume del remaining de lotes (SPREAD_MATCH)
 * 5. Actualiza matchedLots de cada SELL con los IDs correctos
 * 6. Guarda el estado corregido
 */

const fs = require('fs');

const PAIR = process.argv[2] || 'SOLUSDT';
const DRY_RUN = process.argv.includes('--dry-run');

const STATE_PATH = `/root/arca-bot/data/sessions/VANTAGE01_${PAIR}_state.json`;
const BACKUP_PATH = `/root/arca-bot/data/sessions/VANTAGE01_${PAIR}_state_backup_fixids_${Date.now()}.json`;

let state;
try {
    state = JSON.parse(fs.readFileSync(STATE_PATH));
} catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
}

console.log('='.repeat(60));
console.log(`FIX IDS - ${PAIR}`);
console.log('='.repeat(60));
console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

// Paso 1: Obtener todos los trades ordenados cronológicamente
const allTrades = [...(state.filledOrders || [])];
allTrades.sort((a, b) => a.timestamp - b.timestamp);

const buys = allTrades.filter(t => t.side === 'buy');
const sells = allTrades.filter(t => t.side === 'sell');

console.log(`Total: ${allTrades.length} trades (${buys.length} buys, ${sells.length} sells)`);

// Paso 2: Crear inventario desde BUYs
console.log('\n📦 Creando inventario desde BUYs...');
const inventory = new Map(); // id -> lot

for (const buy of buys) {
    const id = String(buy.orderId || buy.id);
    const price = buy.price || buy.fillPrice;
    const amount = buy.amount;

    let fee = 0;
    if (buy.fee?.cost) fee = buy.fee.cost;
    else if (buy.fees) fee = buy.fees;
    else fee = amount * price * 0.00075;

    inventory.set(id, {
        id: id,
        price: price,
        amount: amount,
        original: amount,
        remaining: amount,
        fee: fee,
        timestamp: buy.timestamp
    });
}

console.log(`   ${inventory.size} lotes creados`);

// Paso 3: Procesar SELLs con SPREAD_MATCH
console.log('\n🔄 Procesando SELLs...');

let totalProfit = 0;
let sellsMatched = 0;
let sellsUnmatched = 0;

for (const sell of sells) {
    const sellPrice = sell.price || sell.fillPrice;
    let remainingToSell = sell.amount;
    const matchedLots = [];
    let costBasis = 0;
    let entryFees = 0;

    // SPREAD_MATCH: lotes con profit, ordenados por precio bajo
    const available = Array.from(inventory.values())
        .filter(l => l.remaining > 0.00000001)
        .filter(l => (sellPrice - l.price) / l.price >= 0.001)
        .sort((a, b) => a.price - b.price);

    for (const lot of available) {
        if (remainingToSell <= 0.00000001) break;

        const take = Math.min(remainingToSell, lot.remaining);
        costBasis += take * lot.price;
        entryFees += (take / lot.original) * (lot.fee || 0);

        matchedLots.push({
            lotId: lot.id,
            buyPrice: lot.price,
            amountTaken: take,
            remainingBefore: lot.remaining,
            remainingAfter: Number((lot.remaining - take).toFixed(8))
        });

        // IMPORTANTE: Actualizar remaining del lote
        lot.remaining = Number((lot.remaining - take).toFixed(8));
        remainingToSell = Number((remainingToSell - take).toFixed(8));
    }

    // Calcular profit
    const amountSold = sell.amount - remainingToSell;
    if (amountSold > 0) {
        const sellValue = amountSold * sellPrice;
        let exitFee = sell.fee?.cost || sell.fees || sellValue * 0.00075;
        const netProfit = sellValue - costBasis - entryFees - exitFee;

        totalProfit += netProfit;
        sellsMatched++;

        // Actualizar el sell
        sell.matchedLots = matchedLots;
        sell.profit = netProfit;
        sell.costBasis = costBasis / amountSold;
        sell.spreadPct = ((sellPrice - sell.costBasis) / sell.costBasis) * 100;
        sell.matchType = 'SPREAD_MATCH';
        sell.isNetProfit = true;
    } else {
        sellsUnmatched++;
        sell.matchedLots = [];
        sell.profit = 0;
        sell.matchType = 'UNMATCHED';
    }

    if (remainingToSell > 0.00000001) {
        const date = new Date(sell.timestamp).toISOString().slice(0, 10);
        console.log(`  ⚠️ ${date} | $${sellPrice.toFixed(2)} | ${remainingToSell.toFixed(6)} UNMATCHED`);
    }
}

// Paso 4: Filtrar lotes con remaining > 0
const activeInventory = Array.from(inventory.values())
    .filter(l => l.remaining > 0.00000001);

// Resultados
console.log('\n' + '─'.repeat(60));
console.log('RESULTADO');
console.log('─'.repeat(60));

console.log(`\n📊 SELLS:`);
console.log(`   Matched: ${sellsMatched}`);
console.log(`   Unmatched: ${sellsUnmatched}`);

console.log(`\n💰 PROFIT:`);
console.log(`   Nuevo: $${totalProfit.toFixed(4)}`);
console.log(`   Anterior: $${(state.totalProfit || 0).toFixed(4)}`);

const totalRemaining = activeInventory.reduce((s, l) => s + l.remaining, 0);
console.log(`\n📦 INVENTARIO:`);
console.log(`   Lotes activos: ${activeInventory.length}`);
console.log(`   Total remaining: ${totalRemaining.toFixed(6)}`);

// Verificar parciales
const partials = activeInventory.filter(l => l.remaining < l.original - 0.00001);
console.log(`\n🔄 LOTES PARCIALES: ${partials.length}`);
partials.slice(0, 5).forEach(l => {
    const pct = ((l.remaining / l.original) * 100).toFixed(1);
    console.log(`   #${l.id}: ${l.remaining.toFixed(6)}/${l.original.toFixed(6)} (${pct}%)`);
});

// Verificar consistencia de IDs
const invIds = new Set(activeInventory.map(l => l.id));
const buyIds = new Set(buys.map(b => String(b.orderId || b.id)));
const consistent = [...invIds].every(id => buyIds.has(id));
console.log(`\n✓ IDs consistentes: ${consistent ? 'SI' : 'NO'}`);

// Guardar
if (!DRY_RUN) {
    fs.writeFileSync(BACKUP_PATH, JSON.stringify(state, null, 2));
    console.log(`\n✓ Backup: ${BACKUP_PATH}`);

    state.inventory = activeInventory;
    state.totalProfit = totalProfit;
    state.filledOrders = allTrades.sort((a, b) => b.timestamp - a.timestamp);

    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
    console.log(`✓ Guardado: ${STATE_PATH}`);
} else {
    console.log(`\n⚠️  DRY RUN`);
}
