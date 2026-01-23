/**
 * REBUILD FROM BINANCE
 *
 * Reconstruye el inventario usando los trades REALES de Binance.
 * - Obtiene historial completo de trades del exchange
 * - Cada BUY crea un lote con original y remaining
 * - Cada SELL consume del remaining de lotes (FIFO)
 */

const ccxt = require('ccxt');
const fs = require('fs');

// Configuración
const PAIR = process.argv[2] || 'SOL/USDT';
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

// Normalizar par
const PAIR_NORMALIZED = PAIR.replace('/', '');
const STATE_PATH = `/root/arca-bot/data/sessions/VANTAGE01_${PAIR_NORMALIZED}_state.json`;
const BACKUP_PATH = `/root/arca-bot/data/sessions/VANTAGE01_${PAIR_NORMALIZED}_state_backup_${Date.now()}.json`;

// Credenciales desde estado existente
let state;
try {
    state = JSON.parse(fs.readFileSync(STATE_PATH));
} catch (e) {
    console.error(`Error cargando estado: ${e.message}`);
    process.exit(1);
}

// Cargar credenciales desde .env
require('dotenv').config({ path: '/root/arca-bot/.env' });
const config = {
    apiKey: process.env.BINANCE_API_KEY,
    apiSecret: process.env.BINANCE_SECRET
};

if (!config.apiKey || !config.apiSecret) {
    console.error('Error: No se encontraron credenciales de Binance en .env');
    process.exit(1);
}

async function main() {
    console.log('='.repeat(60));
    console.log(`REBUILD FROM BINANCE - ${PAIR}`);
    console.log('='.repeat(60));
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
    console.log('');

    // Conectar a Binance
    const exchange = new ccxt.binance({
        apiKey: config.apiKey,
        secret: config.apiSecret,
        enableRateLimit: true,
        options: { defaultType: 'spot' }
    });

    console.log('Conectando a Binance...');

    // Obtener todos los trades del par
    console.log(`Obteniendo trades de ${PAIR}...`);

    let allTrades = [];
    let since = undefined;

    // Fetch all trades (paginated)
    while (true) {
        const trades = await exchange.fetchMyTrades(PAIR, since, 1000);
        if (trades.length === 0) break;

        allTrades = allTrades.concat(trades);
        console.log(`  Obtenidos ${allTrades.length} trades...`);

        // Next page
        since = trades[trades.length - 1].timestamp + 1;

        // Safety limit
        if (allTrades.length > 10000) {
            console.log('  Límite de seguridad alcanzado (10000 trades)');
            break;
        }

        // Small delay to respect rate limits
        await new Promise(r => setTimeout(r, 100));
    }

    // Ordenar cronológicamente
    allTrades.sort((a, b) => a.timestamp - b.timestamp);

    const buys = allTrades.filter(t => t.side === 'buy');
    const sells = allTrades.filter(t => t.side === 'sell');

    console.log(`\n✓ Total trades de Binance: ${allTrades.length}`);
    console.log(`  - BUYs: ${buys.length}`);
    console.log(`  - SELLs: ${sells.length}`);
    console.log(`  - Desde: ${new Date(allTrades[0]?.timestamp).toISOString().slice(0,10) || 'N/A'}`);
    console.log(`  - Hasta: ${new Date(allTrades[allTrades.length-1]?.timestamp).toISOString().slice(0,10) || 'N/A'}`);

    // Reconstruir inventario
    console.log('\n' + '─'.repeat(60));
    console.log('PROCESANDO TRADES CRONOLÓGICAMENTE...');
    console.log('─'.repeat(60));

    const inventory = [];
    const processedOrders = [];
    let totalBought = 0;
    let totalSold = 0;
    let totalProfit = 0;
    let totalFeesPaid = 0;

    for (const trade of allTrades) {
        const tradeId = trade.order || trade.id;
        const amount = trade.amount;
        const price = trade.price;
        const timestamp = trade.timestamp;
        const date = new Date(timestamp).toISOString().slice(0, 16);

        // Calcular fee real
        let feeUSDT = 0;
        if (trade.fee) {
            if (trade.fee.currency === 'USDT') {
                feeUSDT = trade.fee.cost;
            } else if (trade.fee.currency === 'BNB') {
                feeUSDT = trade.fee.cost * 700; // Aproximado
            } else {
                feeUSDT = trade.fee.cost * price;
            }
        }
        totalFeesPaid += feeUSDT;

        if (trade.side === 'buy') {
            // Crear nuevo lote
            const lot = {
                id: tradeId,
                price: price,
                amount: amount,
                original: amount,
                remaining: amount,
                fee: feeUSDT,
                timestamp: timestamp
            };
            inventory.push(lot);
            totalBought += amount;

            // Agregar a historial
            processedOrders.push({
                id: tradeId,
                orderId: tradeId,
                side: 'buy',
                price: price,
                amount: amount,
                timestamp: timestamp,
                fillPrice: price,
                status: 'filled',
                fee: trade.fee,
                isFromBinance: true
            });

            if (VERBOSE) {
                console.log(`[BUY] ${date} | #${tradeId} | ${amount.toFixed(6)} @ $${price.toFixed(2)} | Inv: ${inventory.length}`);
            }

        } else if (trade.side === 'sell') {
            // Consumir de lotes (FIFO)
            let remainingToSell = amount;
            const matchedLots = [];
            let costBasis = 0;
            let entryFees = 0;

            // FIFO
            inventory.sort((a, b) => a.timestamp - b.timestamp);

            for (const lot of inventory) {
                if (remainingToSell <= 0.00000001) break;
                if (lot.remaining <= 0.00000001) continue;

                const take = Math.min(remainingToSell, lot.remaining);
                const lotCost = take * lot.price;
                const lotFee = (take / lot.amount) * (lot.fee || 0);

                costBasis += lotCost;
                entryFees += lotFee;

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

            // Eliminar lotes agotados
            for (let i = inventory.length - 1; i >= 0; i--) {
                if (inventory[i].remaining <= 0.00000001) {
                    inventory.splice(i, 1);
                }
            }

            // Calcular profit
            const sellValue = amount * price;
            const totalFees = entryFees + feeUSDT;
            const grossProfit = sellValue - costBasis;
            const netProfit = grossProfit - totalFees;

            const avgCost = amount > 0 ? costBasis / amount : 0;
            const spreadPct = avgCost > 0 ? ((price - avgCost) / avgCost) * 100 : 0;

            totalSold += amount;
            totalProfit += matchedLots.length > 0 ? netProfit : 0;

            processedOrders.push({
                id: tradeId,
                orderId: tradeId,
                side: 'sell',
                price: price,
                amount: amount,
                timestamp: timestamp,
                fillPrice: price,
                status: 'filled',
                fee: trade.fee,
                matchedLots: matchedLots,
                costBasis: avgCost,
                spreadPct: spreadPct,
                fees: totalFees,
                profit: matchedLots.length > 0 ? netProfit : 0,
                matchType: matchedLots.length > 0 ? 'BINANCE_MATCHED' : 'UNMATCHED',
                isNetProfit: true,
                isFromBinance: true
            });

            if (VERBOSE) {
                const matchInfo = matchedLots.map(l => `#${l.lotId}(${l.amountTaken.toFixed(6)})`).join('+');
                console.log(`[SELL] ${date} | ${amount.toFixed(6)} @ $${price.toFixed(2)} | ${matchInfo || 'NONE'} | $${netProfit.toFixed(4)}`);
            }

            if (matchedLots.length === 0) {
                console.log(`  ⚠️  SELL sin match: ${date} | ${amount.toFixed(6)} @ $${price.toFixed(2)}`);
            }
        }
    }

    // Resultados
    console.log('\n' + '─'.repeat(60));
    console.log('RESULTADO DE RECONSTRUCCIÓN');
    console.log('─'.repeat(60));

    const totalRemaining = inventory.reduce((sum, lot) => sum + lot.remaining, 0);
    const totalOriginal = inventory.reduce((sum, lot) => sum + lot.original, 0);
    const inventoryValue = inventory.reduce((sum, lot) => sum + (lot.remaining * lot.price), 0);

    console.log(`\nInventario Final:`);
    console.log(`  Lotes activos: ${inventory.length}`);
    console.log(`  Total remaining: ${totalRemaining.toFixed(6)}`);
    console.log(`  Valor inventario: $${inventoryValue.toFixed(2)}`);

    console.log(`\nBalance:`);
    console.log(`  Total comprado: ${totalBought.toFixed(6)}`);
    console.log(`  Total vendido: ${totalSold.toFixed(6)}`);
    console.log(`  Diferencia: ${(totalBought - totalSold).toFixed(6)}`);

    console.log(`\nProfit:`);
    console.log(`  Profit REAL (de Binance): $${totalProfit.toFixed(4)}`);
    console.log(`  Profit anterior (state): $${(state.totalProfit || 0).toFixed(4)}`);
    console.log(`  Diferencia: $${(totalProfit - (state.totalProfit || 0)).toFixed(4)}`);
    console.log(`  Fees totales pagados: $${totalFeesPaid.toFixed(4)}`);

    // Verificar lotes parciales
    const partialLots = inventory.filter(l => l.remaining < l.original - 0.00001);
    console.log(`\nLotes parciales: ${partialLots.length}`);
    partialLots.forEach(lot => {
        const pct = ((lot.remaining / lot.original) * 100).toFixed(1);
        console.log(`  #${lot.id}: ${lot.remaining.toFixed(6)}/${lot.original.toFixed(6)} (${pct}%) @ $${lot.price.toFixed(2)}`);
    });

    console.log(`\nLotes activos (primeros 5):`);
    inventory.slice(0, 5).forEach((lot, i) => {
        console.log(`  ${i + 1}. #${lot.id} | ${lot.remaining.toFixed(6)} @ $${lot.price.toFixed(2)}`);
    });

    // Guardar
    if (!DRY_RUN) {
        // Backup
        fs.writeFileSync(BACKUP_PATH, JSON.stringify(state, null, 2));
        console.log(`\n✓ Backup: ${BACKUP_PATH}`);

        // Actualizar estado
        state.inventory = inventory;
        state.totalProfit = totalProfit;
        state.filledOrders = processedOrders.sort((a, b) => b.timestamp - a.timestamp);

        fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
        console.log(`✓ Estado guardado: ${STATE_PATH}`);
        console.log(`\n🎉 RECONSTRUCCIÓN COMPLETA DESDE BINANCE`);
    } else {
        console.log(`\n⚠️  DRY RUN - Sin cambios`);
    }
}

main().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});
