require('dotenv').config();
const ccxt = require('ccxt');
const fs = require('fs');

async function reconcile() {
    const binance = new ccxt.binance({
        apiKey: process.env.BINANCE_API_KEY,
        secret: process.env.BINANCE_SECRET
    });
    
    const configs = [
        {name: 'BTC', symbol: 'BTC/USDT', file: './data/sessions/VANTAGE01_BTCUSDT_state.json'},
        {name: 'SOL', symbol: 'SOL/USDT', file: './data/sessions/VANTAGE01_SOLUSDT_state.json'},
        {name: 'DOGE', symbol: 'DOGE/USDT', file: './data/sessions/VANTAGE01_DOGEUSDT_state.json'}
    ];
    
    const balance = await binance.fetchBalance();
    
    for (const cfg of configs) {
        console.log('\n=== ' + cfg.name + ' ===');
        
        // Read current state
        const stateRaw = fs.readFileSync(cfg.file, 'utf8');
        const state = JSON.parse(stateRaw);
        
        // Calculate diff
        const binQty = parseFloat(balance[cfg.name]?.total || 0);
        const invQty = (state.inventory || []).reduce((a,b) => a + b.remaining, 0);
        const missing = binQty - invQty;
        
        console.log('Binance: ' + binQty.toFixed(8));
        console.log('Inventory: ' + invQty.toFixed(8));
        console.log('Missing: ' + missing.toFixed(8));
        
        if (missing < 0.00001) {
            console.log('No reconcile needed');
            continue;
        }
        
        // Fetch recent trades to get real prices
        const trades = await binance.fetchMyTrades(cfg.symbol, undefined, 100);
        const buys = trades.filter(t => t.side === 'buy').reverse();
        
        // Find buys that could cover the missing amount
        let remainingToAdd = missing;
        const newLots = [];
        
        for (const trade of buys) {
            if (remainingToAdd <= 0.00001) break;
            
            // Check if this trade ID already exists
            const existing = state.inventory.find(lot => lot.id === trade.id);
            if (existing) continue;
            
            const qty = Math.min(trade.amount, remainingToAdd);
            newLots.push({
                id: trade.id + '_recon',
                price: trade.price,
                amount: qty,
                original: qty,
                remaining: qty,
                fee: qty * trade.price * 0.00075,
                timestamp: trade.timestamp,
                reconciled: true,
                reconciledAt: Date.now()
            });
            remainingToAdd -= qty;
        }
        
        if (newLots.length === 0 && remainingToAdd > 0.00001) {
            // Use current price as fallback
            const ticker = await binance.fetchTicker(cfg.symbol);
            newLots.push({
                id: 'estimated_' + Date.now(),
                price: ticker.last * 0.99,
                amount: remainingToAdd,
                original: remainingToAdd,
                remaining: remainingToAdd,
                fee: remainingToAdd * ticker.last * 0.00075,
                timestamp: Date.now(),
                reconciled: true,
                estimated: true,
                reconciledAt: Date.now()
            });
        }
        
        console.log('Adding ' + newLots.length + ' lots');
        
        // Add to inventory
        state.inventory = state.inventory || [];
        state.inventory.push(...newLots);
        
        // Also update inventoryLots if it exists
        if (state.inventoryLots) {
            state.inventoryLots.push(...newLots);
        }
        
        // Write back
        fs.writeFileSync(cfg.file, JSON.stringify(state, null, 2));
        
        // Verify
        const verify = JSON.parse(fs.readFileSync(cfg.file, 'utf8'));
        const newTotal = verify.inventory.reduce((a,b) => a + b.remaining, 0);
        const reconciledCount = verify.inventory.filter(x => x.reconciled).length;
        console.log('NEW Total: ' + newTotal.toFixed(8));
        console.log('Reconciled lots: ' + reconciledCount);
    }
    
    console.log('\n=== DONE ===');
}

reconcile().catch(e => console.error(e));
