const fs = require('fs');
const ccxt = require('ccxt');

async function simpleRebuild() {
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
        console.log('\n=== ' + name + ' ===');
        
        const stateFile = '/root/arca-bot/data/sessions/VANTAGE01_' + name + '_state.json';
        const state = JSON.parse(fs.readFileSync(stateFile));
        
        const binanceTotal = parseFloat(balance[asset].total);
        const trades = await binance.fetchMyTrades(asset + '/USDT', undefined, 500);
        const buys = trades.filter(t => t.side === 'buy').sort((a,b) => b.timestamp - a.timestamp);
        
        // Simple: take most recent buys until we match balance
        const newInventory = [];
        const seenIds = new Set();
        let needed = binanceTotal;
        
        for (const trade of buys) {
            if (needed <= 0.00000001) break;
            if (seenIds.has(trade.id)) continue;
            
            seenIds.add(trade.id);
            const toAdd = Math.min(trade.amount, needed);
            
            newInventory.push({
                id: trade.id.toString(),
                price: trade.price,
                amount: trade.amount,
                remaining: toAdd,
                fee: trade.fee?.cost || 0,
                timestamp: trade.timestamp,
                auditVerified: true
            });
            
            needed -= toAdd;
        }
        
        state.inventory = newInventory;
        state.paused = false;
        state.pauseReason = null;
        
        fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
        
        const finalTotal = newInventory.reduce((s,l) => s + l.remaining, 0);
        const fullLots = newInventory.filter(l => l.remaining === l.amount).length;
        const partialLots = newInventory.length - fullLots;
        
        console.log('Lotes: ' + newInventory.length + ' (completos: ' + fullLots + ', parcial: ' + partialLots + ')');
        console.log('Total: ' + finalTotal.toFixed(8) + ' ' + asset);
        console.log('Binance: ' + binanceTotal.toFixed(8) + ' ' + asset);
        console.log('Match: ' + (Math.abs(finalTotal - binanceTotal) < 0.00000001 ? 'YES' : 'NO'));
    }
}

simpleRebuild().catch(console.error);
