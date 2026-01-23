const fs = require('fs');
const ccxt = require('ccxt');

async function rebuild() {
    const envContent = fs.readFileSync('/root/arca-bot/.env', 'utf8');
    const apiKey = envContent.match(/BINANCE_API_KEY=([^\n\r]+)/)?.[1];
    const secret = envContent.match(/BINANCE_SECRET=([^\n\r]+)/)?.[1];
    
    const binance = new ccxt.binance({ apiKey, secret });
    const balance = await binance.fetchBalance();
    
    const pairs = [
        { name: 'BTCUSDT', asset: 'BTC' },
        { name: 'SOLUSDT', asset: 'SOL' }
    ];
    
    for (const { name, asset } of pairs) {
        console.log('\n=== REBUILDING ' + name + ' ===');
        
        const stateFile = '/root/arca-bot/data/sessions/VANTAGE01_' + name + '_state.json';
        const state = JSON.parse(fs.readFileSync(stateFile));
        
        const binanceTotal = parseFloat(balance[asset]?.total || 0);
        const trades = await binance.fetchMyTrades(asset + '/USDT', undefined, 200);
        const buys = trades.filter(t => t.side === 'buy').sort((a,b) => b.timestamp - a.timestamp);
        
        console.log('Binance balance: ' + binanceTotal + ' ' + asset);
        console.log('Total buy trades: ' + buys.length);
        
        // Build fresh inventory
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
        console.log('New inventory: ' + newInventory.length + ' lots');
        console.log('Remaining: ' + finalTotal.toFixed(8) + ' ' + asset);
        console.log('Match: ' + (Math.abs(binanceTotal - finalTotal) < 0.00000001 ? 'YES' : 'NO'));
        
        // Show first few lots
        console.log('\nFirst 3 lots:');
        newInventory.slice(0,3).forEach(l => {
            console.log('  ' + l.id + ' | ' + l.remaining + ' @ $' + l.price);
        });
    }
    
    console.log('\n=== DONE ===');
}

rebuild().catch(console.error);
