const fs = require('fs');
const ccxt = require('ccxt');

async function reconcile() {
    const envContent = fs.readFileSync('/root/arca-bot/.env', 'utf8');
    const apiKey = envContent.match(/BINANCE_API_KEY=([^\n\r]+)/)?.[1];
    const secret = envContent.match(/BINANCE_SECRET=([^\n\r]+)/)?.[1];
    
    const binance = new ccxt.binance({ apiKey, secret });
    const balance = await binance.fetchBalance();
    
    // === BTC ===
    console.log('=== RECONCILING BTC ===');
    const btcFile = '/root/arca-bot/data/sessions/VANTAGE01_BTCUSDT_state.json';
    const btcState = JSON.parse(fs.readFileSync(btcFile));
    
    const btcBinance = parseFloat(balance['BTC'].total);
    const btcInventory = btcState.inventory.reduce((s,l) => s + l.remaining, 0);
    const btcShortage = btcBinance - btcInventory;
    
    console.log('Binance: ' + btcBinance.toFixed(8));
    console.log('Inventory: ' + btcInventory.toFixed(8));
    console.log('Shortage: ' + btcShortage.toFixed(8));
    
    if (btcShortage > 0.00000001) {
        const btcTrades = await binance.fetchMyTrades('BTC/USDT', undefined, 100);
        const btcBuys = btcTrades.filter(t => t.side === 'buy').sort((a,b) => b.timestamp - a.timestamp);
        const existingIds = new Set(btcState.inventory.map(l => l.id.replace('_recon', '')));
        
        let remaining = btcShortage;
        const newLots = [];
        
        for (const trade of btcBuys) {
            if (remaining <= 0.00000001) break;
            if (existingIds.has(trade.id)) continue;
            
            const toAdd = Math.min(trade.amount, remaining);
            newLots.push({
                id: trade.id + '_recon',
                price: trade.price,
                amount: trade.amount,
                remaining: toAdd,
                fee: trade.fee?.cost || 0,
                timestamp: trade.timestamp,
                reconciled: true
            });
            remaining -= toAdd;
            console.log('  Added: ' + trade.id + ' -> ' + toAdd.toFixed(8) + ' @ $' + trade.price);
        }
        
        btcState.inventory.push(...newLots);
        fs.writeFileSync(btcFile, JSON.stringify(btcState, null, 2));
        console.log('Added ' + newLots.length + ' lots, total remaining to cover: ' + remaining.toFixed(8));
    }
    
    // === SOL ===
    console.log('\n=== RECONCILING SOL ===');
    const solFile = '/root/arca-bot/data/sessions/VANTAGE01_SOLUSDT_state.json';
    const solState = JSON.parse(fs.readFileSync(solFile));
    
    const solBinance = parseFloat(balance['SOL'].total);
    const solInventory = solState.inventory.reduce((s,l) => s + l.remaining, 0);
    const solShortage = solBinance - solInventory;
    
    console.log('Binance: ' + solBinance.toFixed(8));
    console.log('Inventory: ' + solInventory.toFixed(8));
    console.log('Shortage: ' + solShortage.toFixed(8));
    
    if (solShortage > 0.00000001) {
        const solTrades = await binance.fetchMyTrades('SOL/USDT', undefined, 100);
        const solBuys = solTrades.filter(t => t.side === 'buy').sort((a,b) => b.timestamp - a.timestamp);
        const existingIds = new Set(solState.inventory.map(l => l.id.replace('_recon', '')));
        
        let remaining = solShortage;
        const newLots = [];
        
        for (const trade of solBuys) {
            if (remaining <= 0.00000001) break;
            if (existingIds.has(trade.id)) continue;
            
            const toAdd = Math.min(trade.amount, remaining);
            newLots.push({
                id: trade.id + '_recon',
                price: trade.price,
                amount: trade.amount,
                remaining: toAdd,
                fee: trade.fee?.cost || 0,
                timestamp: trade.timestamp,
                reconciled: true
            });
            remaining -= toAdd;
            console.log('  Added: ' + trade.id + ' -> ' + toAdd.toFixed(8) + ' @ $' + trade.price);
        }
        
        solState.inventory.push(...newLots);
        fs.writeFileSync(solFile, JSON.stringify(solState, null, 2));
        console.log('Added ' + newLots.length + ' lots, total remaining to cover: ' + remaining.toFixed(8));
    }
    
    console.log('\n=== DONE ===');
}

reconcile().catch(console.error);
