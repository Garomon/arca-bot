require('dotenv').config();
const ccxt = require('ccxt');
const fs = require('fs');

async function compare() {
    const binance = new ccxt.binance({
        apiKey: process.env.BINANCE_API_KEY,
        secret: process.env.BINANCE_SECRET
    });
    
    const configs = [
        {name: 'BTC', symbol: 'BTC/USDT', file: './data/sessions/VANTAGE01_BTCUSDT_state.json'},
        {name: 'SOL', symbol: 'SOL/USDT', file: './data/sessions/VANTAGE01_SOLUSDT_state.json'},
        {name: 'DOGE', symbol: 'DOGE/USDT', file: './data/sessions/VANTAGE01_DOGEUSDT_state.json'}
    ];
    
    for (const cfg of configs) {
        console.log('=== ' + cfg.name + ' ===');
        
        const state = JSON.parse(fs.readFileSync(cfg.file, 'utf8'));
        const fills = state.filledOrders || [];
        
        // Get fill IDs
        const fillIds = new Set(fills.map(f => f.id || f.orderId));
        
        // Last fill timestamp
        const lastFillTime = Math.max(...fills.map(f => f.timestamp || 0));
        console.log('Último fill en state: ' + new Date(lastFillTime).toISOString());
        
        // Get Binance trades
        const trades = await binance.fetchMyTrades(cfg.symbol, undefined, 200);
        
        // Find trades NOT in filledOrders
        const missing = trades.filter(t => {
            // Check by ID or by timestamp > lastFillTime
            return t.timestamp > lastFillTime;
        });
        
        console.log('Trades en Binance después del último fill: ' + missing.length);
        
        if (missing.length > 0) {
            // Calculate profit from missing sells
            let missingSells = missing.filter(t => t.side === 'sell');
            console.log('Ventas no registradas: ' + missingSells.length);
            
            // Show them
            missingSells.slice(0, 5).forEach(t => {
                console.log('  ' + new Date(t.timestamp).toISOString().slice(0,16) + 
                    ' SELL ' + t.amount + ' @ $' + t.price.toFixed(2));
            });
        }
        console.log('');
    }
}
compare();
