require('dotenv').config();
const ccxt = require('ccxt');
const fs = require('fs');

async function fixRealPrices() {
    const binance = new ccxt.binance({
        apiKey: process.env.BINANCE_API_KEY,
        secret: process.env.BINANCE_SECRET
    });
    
    const configs = [
        {name: 'BTC', symbol: 'BTC/USDT', file: './data/sessions/VANTAGE01_BTCUSDT_state.json'},
        {name: 'SOL', symbol: 'SOL/USDT', file: './data/sessions/VANTAGE01_SOLUSDT_state.json'},
        {name: 'DOGE', symbol: 'DOGE/USDT', file: './data/sessions/VANTAGE01_DOGEUSDT_state.json'}
    ];
    
    console.log('=== CORRIGIENDO PRECIOS REALES EN TODOS LOS BOTS ===\n');
    
    for (const cfg of configs) {
        console.log('--- ' + cfg.name + ' ---');
        
        const state = JSON.parse(fs.readFileSync(cfg.file, 'utf8'));
        const trades = await binance.fetchMyTrades(cfg.symbol, undefined, 500);
        
        // Create map of trade ID -> real price
        const tradeMap = new Map();
        for (const t of trades) {
            tradeMap.set(t.id, t.price);
        }
        
        let fixed = 0;
        for (const lot of state.inventory) {
            if (lot.reconciled) {
                // Extract original ID (remove _recon suffix)
                const originalId = lot.id.replace('_recon', '');
                const realPrice = tradeMap.get(originalId);
                
                if (realPrice && Math.abs(realPrice - lot.price) > 0.0001) {
                    console.log('  ' + lot.id.slice(0,20) + '...: $' + lot.price.toFixed(4) + ' -> $' + realPrice.toFixed(4));
                    lot.price = realPrice;
                    lot.priceFixedToReal = true;
                    fixed++;
                }
            }
        }
        
        // Also fix inventoryLots if exists
        if (state.inventoryLots) {
            for (const lot of state.inventoryLots) {
                if (lot.reconciled) {
                    const originalId = lot.id.replace('_recon', '');
                    const realPrice = tradeMap.get(originalId);
                    if (realPrice) {
                        lot.price = realPrice;
                    }
                }
            }
        }
        
        fs.writeFileSync(cfg.file, JSON.stringify(state, null, 2));
        console.log('  Corregidos: ' + fixed + ' lotes\n');
    }
    
    console.log('=== VERIFICACION ===\n');
    
    for (const cfg of configs) {
        const state = JSON.parse(fs.readFileSync(cfg.file, 'utf8'));
        const reconLots = state.inventory.filter(l => l.reconciled);
        
        if (reconLots.length > 0) {
            console.log(cfg.name + ' lotes _recon:');
            reconLots.forEach(l => {
                console.log('  ' + l.id.slice(0,20) + '... @ $' + l.price.toFixed(4));
            });
            console.log('');
        }
    }
}

fixRealPrices().catch(e => console.error(e));
