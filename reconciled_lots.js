require('dotenv').config();
const ccxt = require('ccxt');
const fs = require('fs');

async function checkReconciled() {
    const binance = new ccxt.binance({
        apiKey: process.env.BINANCE_API_KEY,
        secret: process.env.BINANCE_SECRET
    });
    
    const tickers = await binance.fetchTickers(['BTC/USDT', 'SOL/USDT', 'DOGE/USDT']);
    
    const configs = [
        {name: 'BTC', symbol: 'BTC/USDT', file: './data/sessions/VANTAGE01_BTCUSDT_state.json'},
        {name: 'SOL', symbol: 'SOL/USDT', file: './data/sessions/VANTAGE01_SOLUSDT_state.json'},
        {name: 'DOGE', symbol: 'DOGE/USDT', file: './data/sessions/VANTAGE01_DOGEUSDT_state.json'}
    ];
    
    let totalReconciledCost = 0;
    let totalReconciledValue = 0;
    
    for (const cfg of configs) {
        const s = JSON.parse(fs.readFileSync(cfg.file, 'utf8'));
        const price = tickers[cfg.symbol].last;
        
        const reconciled = (s.inventory || []).filter(lot => lot.reconciled);
        
        let cost = 0;
        let qty = 0;
        for (const lot of reconciled) {
            cost += lot.remaining * lot.price;
            qty += lot.remaining;
        }
        
        const value = qty * price;
        const unrealized = value - cost;
        
        console.log(cfg.name + ':');
        console.log('  Reconciled lots: ' + reconciled.length);
        console.log('  Qty: ' + qty.toFixed(8));
        console.log('  Cost basis: $' + cost.toFixed(2));
        console.log('  Current value: $' + value.toFixed(2));
        console.log('  Unrealized P&L: $' + unrealized.toFixed(2));
        
        if (reconciled.length > 0) {
            console.log('  Avg buy price: $' + (cost/qty).toFixed(2) + ' vs current $' + price.toFixed(2));
        }
        console.log('');
        
        totalReconciledCost += cost;
        totalReconciledValue += value;
    }
    
    console.log('=== TOTAL RECONCILED ===');
    console.log('Cost basis: $' + totalReconciledCost.toFixed(2));
    console.log('Current value: $' + totalReconciledValue.toFixed(2));
    console.log('Unrealized P&L: $' + (totalReconciledValue - totalReconciledCost).toFixed(2));
}
checkReconciled();
