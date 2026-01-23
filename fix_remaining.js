/**
 * FIX REMAINING - Actualiza el remaining de los lotes basado en matchedLots de las SELLs
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
console.log(`FIX REMAINING - ${PAIR}`);
console.log('='.repeat(60));
console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

const inventory = state.inventory || [];
const sells = (state.filledOrders || []).filter(o => o.side === 'sell');

console.log(`Inventario: ${inventory.length} lotes`);
console.log(`Sells: ${sells.length}`);

// Crear mapa de lotes por ID
const lotMap = new Map();
inventory.forEach(lot => {
    // Asegurar que original existe
    if (!lot.original) lot.original = lot.amount;
    // Reset remaining a original para recalcular
    lot.remaining = lot.original;
    lotMap.set(String(lot.id), lot);
});

console.log('\n🔄 Procesando consumos de SELLs...\n');

let updatedLots = 0;
let consumptionErrors = 0;

// Ordenar sells por timestamp (más antiguas primero)
sells.sort((a, b) => a.timestamp - b.timestamp);

for (const sell of sells) {
    const matchedLots = sell.matchedLots || [];

    for (const match of matchedLots) {
        const lotId = String(match.lotId);
        const lot = lotMap.get(lotId);

        if (!lot) {
            // El lote puede haber sido completamente consumido y eliminado
            continue;
        }

        const amountTaken = match.amountTaken || match.amount || 0;

        if (amountTaken > 0) {
            const oldRemaining = lot.remaining;
            lot.remaining = Number((lot.remaining - amountTaken).toFixed(8));

            if (lot.remaining < 0) {
                console.log(`  ⚠️ Lote ${lotId}: over-consumed! ${oldRemaining} - ${amountTaken} = ${lot.remaining}`);
                lot.remaining = 0;
                consumptionErrors++;
            }

            updatedLots++;
        }
    }
}

// Filtrar lotes agotados
const activeLots = inventory.filter(l => l.remaining > 0.00000001);
const exhaustedLots = inventory.filter(l => l.remaining <= 0.00000001);

// Mostrar lotes parciales
const partialLots = activeLots.filter(l => l.remaining < l.original - 0.00000001);

console.log('\n' + '─'.repeat(60));
console.log('RESULTADO');
console.log('─'.repeat(60));

console.log(`\n📊 Consumos procesados: ${updatedLots}`);
console.log(`⚠️ Errores de consumo: ${consumptionErrors}`);

console.log(`\n📦 LOTES:`);
console.log(`   Activos: ${activeLots.length}`);
console.log(`   Agotados (a eliminar): ${exhaustedLots.length}`);
console.log(`   Parciales: ${partialLots.length}`);

if (partialLots.length > 0) {
    console.log(`\n🔄 LOTES PARCIALES:`);
    partialLots.slice(0, 10).forEach(lot => {
        const pct = ((lot.remaining / lot.original) * 100).toFixed(1);
        console.log(`   #${lot.id}: ${lot.remaining.toFixed(6)}/${lot.original.toFixed(6)} (${pct}%) @ $${lot.price.toFixed(2)}`);
    });
}

const totalRemaining = activeLots.reduce((s, l) => s + l.remaining, 0);
console.log(`\n📈 Total remaining: ${totalRemaining.toFixed(6)}`);

// Guardar
if (!DRY_RUN) {
    state.inventory = activeLots;
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
    console.log(`\n✓ Guardado: ${STATE_PATH}`);
} else {
    console.log(`\n⚠️  DRY RUN - Sin cambios`);
}
