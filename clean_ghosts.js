const fs = require('fs');
const ccxt = require('ccxt');

async function cleanGhosts() {
    const envContent = fs.readFileSync('/root/arca-bot/.env', 'utf8');
    const apiKey = envContent.match(/BINANCE_API_KEY=([^\n\r]+)/)?.[1];
    const secret = envContent.match(/BINANCE_SECRET=([^\n\r]+)/)?.[1];
    
    const binance = new ccxt.binance({ apiKey, secret });
    const balance = await binance.fetchBalance();
    
    const pairs = [
        { name: 'BTCUSDT', asset: 'BTC' },
        { name: 'SOLUSDT', asset: 'SOL' },
        { name: 'DOGEUSDT', asset: 'DOGE' }
    ];
    
    for (const { name, asset } of pairs) {
        console.log('\n=== CLEANING ' + name + ' ===');
        
        const stateFile = '/root/arca-bot/data/sessions/VANTAGE01_' + name + '_state.json';
        const state = JSON.parse(fs.readFileSync(stateFile));
        
        // Get Binance trades
        const trades = await binance.fetchMyTrades(asset + '/USDT', undefined, 200);
        const binanceTradeIds = new Set(trades.map(t => t.id));
        
        const before = state.inventory.length;
        const beforeRemaining = state.inventory.reduce((s,l) => s + l.remaining, 0);
        
        // Keep only lots that exist in Binance
        state.inventory = state.inventory.filter(lot => {
            const baseId = lot.id.toString().replace('_recon', '');
            const exists = binanceTradeIds.has(baseId);
            if (!exists) {
                console.log('  REMOVING: ' + lot.id + ' ($' + lot.price.toFixed(2) + ', rem: ' + lot.remaining.toFixed(8) + ')');
            }
            return exists;
        });
        
        const after = state.inventory.length;
        const afterRemaining = state.inventory.reduce((s,l) => s + l.remaining, 0);
        const binanceTotal = parseFloat(balance[asset]?.total || 0);
        
        console.log('\nBefore: ' + before + ' lots (' + beforeRemaining.toFixed(8) + ' ' + asset + ')');
        console.log('After:  ' + after + ' lots (' + afterRemaining.toFixed(8) + ' ' + asset + ')');
        console.log('Binance: ' + binanceTotal.toFixed(8) + ' ' + asset);
        
        const shortage = binanceTotal - afterRemaining;
        if (shortage > 0.00000001) {
            console.log('\n  -> SHORTAGE: ' + shortage.toFixed(8) + ' - Need to add reconcile lots');
            
            // Find buys not in inventory
            const inventoryIds = new Set(state.inventory.map(l => l.id.toString().replace('_recon', '')));
            const buys = trades.filter(t => t.side === 'buy').sort((a,b) => b.timestamp - a.timestamp);
            
            let remaining = shortage;
            for (const trade of buys) {
                if (remaining <= 0.00000001) break;
                if (inventoryIds.has(trade.id)) continue;
                
                const toAdd = Math.min(trade.amount, remaining);
                state.inventory.push({
                    id: trade.id + '_recon',
                    price: trade.price,
                    amount: trade.amount,
                    remaining: toAdd,
                    fee: trade.fee?.cost || 0,
                    timestamp: trade.timestamp,
                    reconciled: true
                });
                remaining -= toAdd;
                console.log('  ADDED: ' + trade.id + '_recon ($' + trade.price.toFixed(2) + ', rem: ' + toAdd.toFixed(8) + ')');
            }
        }
        
        // Save
        fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
        
        const finalRemaining = state.inventory.reduce((s,l) => s + l.remaining, 0);
        const diff = Math.abs(binanceTotal - finalRemaining);
        const status = diff < 0.00000001 ? 'MATCH' : 'DIFF: ' + diff.toFixed(8);
        console.log('\nFinal: ' + state.inventory.length + ' lots | ' + finalRemaining.toFixed(8) + ' ' + asset + ' | ' + status);
    }
    
    console.log('\n=== DONE ===');
}

cleanGhosts().catch(console.error);
