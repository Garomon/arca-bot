/**
 * REBUILD INVENTORY REAL
 *
 * Reconstruye el inventario desde cero basándose en los trades reales.
 * - Cada BUY crea un lote con original y remaining
 * - Cada SELL consume del remaining de lotes (FIFO)
 * - Si remaining llega a 0, el lote desaparece
 */

const fs = require('fs');
const path = require('path');

// Obtener el par desde argumentos o usar default
const PAIR = process.argv[2] || 'SOLUSDT';
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

const STATE_PATH = `/root/arca-bot/data/sessions/VANTAGE01_${PAIR}_state.json`;
const BACKUP_PATH = `/root/arca-bot/data/sessions/VANTAGE01_${PAIR}_state_backup_${Date.now()}.json`;

console.log('='.repeat(60));
console.log(`REBUILD INVENTORY REAL - ${PAIR}`);
console.log('='.repeat(60));
console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (will save changes)'}`);
console.log('');

// Cargar estado
let state;
try {
    state = JSON.parse(fs.readFileSync(STATE_PATH));
    console.log(`✓ Estado cargado: ${STATE_PATH}`);
} catch (e) {
    console.error(`✗ Error cargando estado: ${e.message}`);
    process.exit(1);
}

// Obtener todos los trades y ordenar cronológicamente
const allTrades = (state.filledOrders || []).slice();
allTrades.sort((a, b) => a.timestamp - b.timestamp);

console.log(`✓ Total trades en historial: ${allTrades.length}`);

const buys = allTrades.filter(t => t.side === 'buy');
const sells = allTrades.filter(t => t.side === 'sell');
console.log(`  - BUYs: ${buys.length}`);
console.log(`  - SELLs: ${sells.length}`);
console.log('');

// Reconstruir inventario desde cero
const inventory = []; // Array de lotes activos
const processedSells = []; // Sells con matchedLots reconstruidos

let totalBought = 0;
let totalSold = 0;
let totalProfit = 0;

console.log('─'.repeat(60));
console.log('PROCESANDO TRADES CRONOLÓGICAMENTE...');
console.log('─'.repeat(60));

for (const trade of allTrades) {
    const tradeId = trade.orderId || trade.id;
    const amount = trade.amount;
    const price = trade.price;
    const timestamp = trade.timestamp;
    const date = new Date(timestamp).toISOString().slice(0, 16);

    if (trade.side === 'buy') {
        // Crear nuevo lote
        const lot = {
            id: tradeId,
            price: price,
            amount: amount,      // Original
            original: amount,    // Guardar original explícitamente
            remaining: amount,   // Remaining empieza igual al original
            fee: trade.fee?.cost || (amount * price * 0.00075),
            timestamp: timestamp
        };
        inventory.push(lot);
        totalBought += amount;

        if (VERBOSE) {
            console.log(`[BUY] ${date} | Lot #${tradeId} | ${amount.toFixed(6)} @ $${price.toFixed(2)} | Inventory: ${inventory.length} lots`);
        }

    } else if (trade.side === 'sell') {
        // Consumir de lotes existentes (FIFO)
        let remainingToSell = amount;
        const matchedLots = [];
        let costBasis = 0;
        let entryFees = 0;

        // Ordenar inventory por timestamp (FIFO - más antiguo primero)
        inventory.sort((a, b) => a.timestamp - b.timestamp);

        for (const lot of inventory) {
            if (remainingToSell <= 0.00000001) break;
            if (lot.remaining <= 0.00000001) continue;

            const take = Math.min(remainingToSell, lot.remaining);
            const lotCost = take * lot.price;
            const lotFee = (take / lot.amount) * (lot.fee || 0);

            costBasis += lotCost;
            entryFees += lotFee;

            // Registrar el match
            matchedLots.push({
                lotId: lot.id,
                buyPrice: lot.price,
                amountTaken: take,
                remainingBefore: lot.remaining,
                remainingAfter: Number((lot.remaining - take).toFixed(8))
            });

            // Actualizar remaining del lote
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
        const sellValue = amount * price;
        const exitFee = trade.fee?.cost || (sellValue * 0.00075);
        const totalFees = entryFees + exitFee;
        const grossProfit = sellValue - costBasis;
        const netProfit = grossProfit - totalFees;

        // Calcular spread
        const avgCost = costBasis / amount;
        const spreadPct = ((price - avgCost) / avgCost) * 100;

        totalSold += amount;
        totalProfit += netProfit;

        // Crear registro de sell actualizado
        const updatedSell = {
            ...trade,
            matchedLots: matchedLots,
            costBasis: avgCost,
            spreadPct: spreadPct,
            fees: totalFees,
            profit: matchedLots.length > 0 ? netProfit : 0, // 0 si no hubo match
            matchType: matchedLots.length > 0 ? 'REBUILD_MATCHED' : 'UNMATCHED',
            isNetProfit: true
        };
        processedSells.push(updatedSell);

        if (VERBOSE) {
            const matchInfo = matchedLots.map(l => `#${l.lotId}(${l.amountTaken.toFixed(6)})`).join('+');
            console.log(`[SELL] ${date} | ${amount.toFixed(6)} @ $${price.toFixed(2)} | Match: ${matchInfo || 'NONE'} | Profit: $${netProfit.toFixed(4)} | Inv: ${inventory.length}`);
        }

        if (matchedLots.length === 0) {
            console.log(`  ⚠️  SELL sin match: ${date} | ${amount.toFixed(6)} @ $${price.toFixed(2)} (no había lotes disponibles)`);
        }
    }
}

console.log('');
console.log('─'.repeat(60));
console.log('RESULTADO DE RECONSTRUCCIÓN');
console.log('─'.repeat(60));

console.log(`\nInventario Final:`);
console.log(`  Lotes activos: ${inventory.length}`);

const totalRemaining = inventory.reduce((sum, lot) => sum + lot.remaining, 0);
const totalOriginal = inventory.reduce((sum, lot) => sum + lot.original, 0);
console.log(`  Total remaining: ${totalRemaining.toFixed(6)}`);
console.log(`  Total original: ${totalOriginal.toFixed(6)}`);

console.log(`\nBalance:`);
console.log(`  Total comprado: ${totalBought.toFixed(6)}`);
console.log(`  Total vendido: ${totalSold.toFixed(6)}`);
console.log(`  Diferencia: ${(totalBought - totalSold).toFixed(6)} (debe ≈ remaining)`);

console.log(`\nProfit:`);
console.log(`  Total recalculado: $${totalProfit.toFixed(4)}`);
console.log(`  Original en state: $${(state.totalProfit || 0).toFixed(4)}`);
console.log(`  Diferencia: $${(totalProfit - (state.totalProfit || 0)).toFixed(4)}`);

// Mostrar lotes actuales
console.log(`\nLotes activos (top 5):`);
inventory.slice(0, 5).forEach((lot, i) => {
    const pctRemaining = ((lot.remaining / lot.original) * 100).toFixed(1);
    console.log(`  ${i + 1}. #${lot.id} | Orig: ${lot.original.toFixed(6)} | Rem: ${lot.remaining.toFixed(6)} (${pctRemaining}%) @ $${lot.price.toFixed(2)}`);
});

// Verificar integridad
const unmatchedSells = processedSells.filter(s => s.matchedLots.length === 0);
console.log(`\nIntegridad:`);
console.log(`  Sells sin match: ${unmatchedSells.length}`);
console.log(`  Sells con match: ${processedSells.length - unmatchedSells.length}`);

// Guardar si no es dry run
if (!DRY_RUN) {
    // Backup
    fs.writeFileSync(BACKUP_PATH, JSON.stringify(state, null, 2));
    console.log(`\n✓ Backup guardado: ${BACKUP_PATH}`);

    // Actualizar estado
    state.inventory = inventory;
    state.totalProfit = totalProfit;

    // Reemplazar sells en filledOrders con los reconstruidos
    const buyOrders = state.filledOrders.filter(o => o.side === 'buy');
    state.filledOrders = [...buyOrders, ...processedSells];
    state.filledOrders.sort((a, b) => b.timestamp - a.timestamp); // Desc por fecha

    // Guardar
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
    console.log(`✓ Estado actualizado: ${STATE_PATH}`);
    console.log(`\n🎉 RECONSTRUCCIÓN COMPLETA`);
} else {
    console.log(`\n⚠️  DRY RUN - No se guardaron cambios`);
    console.log(`   Ejecuta sin --dry-run para aplicar cambios`);
}
