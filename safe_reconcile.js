require('dotenv').config();
const ccxt = require('ccxt');
const fs = require('fs');
const path = require('path');

const sessionsDir = './data/sessions';

async function safeReconcile() {
    const binance = new ccxt.binance({
        apiKey: process.env.BINANCE_API_KEY,
        secret: process.env.BINANCE_SECRET,
        options: { adjustForTimeDifference: true }
    });

    console.log('=== RECONCILE SEGURO ===');
    console.log('Este script SOLO agrega lotes faltantes, NO borra nada.');
    console.log('');

    const balance = await binance.fetchBalance();
    const tickers = await binance.fetchTickers(['BTC/USDT', 'SOL/USDT', 'DOGE/USDT']);

    const bots = [
        { file: 'VANTAGE01_BTCUSDT_state.json', asset: 'BTC', symbol: 'BTC/USDT' },
        { file: 'VANTAGE01_SOLUSDT_state.json', asset: 'SOL', symbol: 'SOL/USDT' },
        { file: 'VANTAGE01_DOGEUSDT_state.json', asset: 'DOGE', symbol: 'DOGE/USDT' }
    ];

    for (const bot of bots) {
        const filePath = path.join(sessionsDir, bot.file);
        if (!fs.existsSync(filePath)) continue;

        const state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const inv = state.inventory || state.inventoryLots || [];
        
        const binanceQty = balance[bot.asset]?.total || 0;
        const botQty = inv.reduce((s, l) => s + (l.remaining > 0 ? l.remaining : 0), 0);
        const missing = binanceQty - botQty;

        console.log('[' + bot.asset + ']');
        console.log('  Binance: ' + binanceQty.toFixed(8));
        console.log('  Bot: ' + botQty.toFixed(8));
        console.log('  Faltante: ' + missing.toFixed(8));

        if (missing > 0.00001) {
            // Buscar trades de compra recientes para obtener precio real
            const since = Date.now() - (60 * 24 * 60 * 60 * 1000); // 60 dias
            const trades = await binance.fetchMyTrades(bot.symbol, since, 500);
            const buys = trades.filter(t => t.side === 'buy').sort((a, b) => b.timestamp - a.timestamp);

            // Obtener IDs de lotes existentes
            const existingIds = new Set(inv.map(l => l.id));

            let remainingToAdd = missing;
            let addedCount = 0;

            for (const buy of buys) {
                if (remainingToAdd <= 0.00000001) break;
                
                const buyId = buy.orderId || buy.order || buy.id;
                
                // Solo agregar si no existe ya
                if (!existingIds.has(buyId) && !existingIds.has(String(buyId))) {
                    const addQty = Math.min(remainingToAdd, buy.amount);
                    
                    const newLot = {
                        id: String(buyId),
                        price: buy.price,
                        amount: addQty,
                        remaining: addQty,
                        fee: buy.fee ? buy.fee.cost : 0,
                        timestamp: buy.timestamp,
                        reconciled: true // Marcar como agregado por reconcile
                    };

                    inv.push(newLot);
                    remainingToAdd -= addQty;
                    addedCount++;
                    console.log('  + Agregado lote #' + buyId + ' @ $' + buy.price.toFixed(2) + ' | Qty: ' + addQty.toFixed(6));
                }
            }

            // Si aun falta, usar precio promedio actual
            if (remainingToAdd > 0.00001) {
                const currentPrice = tickers[bot.symbol].last;
                const newLot = {
                    id: 'RECONCILE_' + Date.now(),
                    price: currentPrice,
                    amount: remainingToAdd,
                    remaining: remainingToAdd,
                    fee: 0,
                    timestamp: Date.now(),
                    reconciled: true,
                    estimated: true
                };
                inv.push(newLot);
                console.log('  + Agregado lote estimado @ $' + currentPrice.toFixed(2) + ' | Qty: ' + remainingToAdd.toFixed(6));
                addedCount++;
            }

            if (addedCount > 0) {
                state.inventory = inv;
                state.inventoryLots = inv;
                fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
                console.log('  ✅ Guardado ' + addedCount + ' lotes nuevos');
            }
        } else {
            console.log('  ✓ Inventario OK');
        }
        console.log('');
    }

    console.log('=== RECONCILE COMPLETADO ===');
}

safeReconcile().catch(e => console.error('Error:', e.message));
