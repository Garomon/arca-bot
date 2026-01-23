const fs = require('fs');
const ccxt = require('ccxt');

async function analyze() {
    const envContent = fs.readFileSync('/root/arca-bot/.env', 'utf8');
    const apiKey = envContent.match(/BINANCE_API_KEY=([^\n\r]+)/)?.[1];
    const secret = envContent.match(/BINANCE_SECRET=([^\n\r]+)/)?.[1];
    
    const binance = new ccxt.binance({ apiKey, secret });
    
    // Analizar SOL como ejemplo
    console.log('=== ANÁLISIS DE CONSUMO SOL ===\n');
    
    const trades = await binance.fetchMyTrades('SOL/USDT', undefined, 500);
    const buys = trades.filter(t => t.side === 'buy');
    const sells = trades.filter(t => t.side === 'sell');
    
    const totalBought = buys.reduce((s, t) => s + t.amount, 0);
    const totalSold = sells.reduce((s, t) => s + t.amount, 0);
    const shouldRemain = totalBought - totalSold;
    
    console.log('Total comprado: ' + totalBought.toFixed(8) + ' SOL');
    console.log('Total vendido:  ' + totalSold.toFixed(8) + ' SOL');
    console.log('Debería quedar: ' + shouldRemain.toFixed(8) + ' SOL');
    
    const balance = await binance.fetchBalance();
    console.log('Balance Binance: ' + balance['SOL'].total + ' SOL');
    
    // Ahora ver el inventario actual
    const state = JSON.parse(fs.readFileSync('/root/arca-bot/data/sessions/VANTAGE01_SOLUSDT_state.json'));
    const invTotal = state.inventory.reduce((s, l) => s + l.remaining, 0);
    console.log('Inventario state: ' + invTotal.toFixed(8) + ' SOL');
    
    // El problema: reconstruimos el inventario solo con los buys más recientes
    // pero no simulamos qué lotes fueron consumidos por los sells
    
    console.log('\n--- El problema ---');
    console.log('Cuando reconstruimos el inventario, tomamos los buys más recientes');
    console.log('y les ponemos remaining = amount (completos).');
    console.log('Pero NO simulamos cuáles fueron parcialmente consumidos por sells.');
    
    // Mostrar ejemplo de lotes actuales
    console.log('\n--- Lotes actuales (primeros 5) ---');
    state.inventory.slice(0, 5).forEach(lot => {
        const consumed = lot.amount - lot.remaining;
        console.log('ID: ' + lot.id + ' | amount: ' + lot.amount.toFixed(4) + ' | remaining: ' + lot.remaining.toFixed(4) + ' | consumed: ' + consumed.toFixed(4));
    });
}

analyze().catch(console.error);
