const fs = require('fs');
const ccxt = require('ccxt');

async function consolidate() {
    const envContent = fs.readFileSync('/root/arca-bot/.env', 'utf8');
    const apiKey = envContent.match(/BINANCE_API_KEY=([^\n\r]+)/)?.[1];
    const secret = envContent.match(/BINANCE_SECRET=([^\n\r]+)/)?.[1];
    
    const binance = new ccxt.binance({ apiKey, secret });
    const balance = await binance.fetchBalance();
    
    const pairs = [
        { name: 'BTCUSDT', asset: 'BTC', minPct: 0.20 }, // Keep lots with >20% remaining
        { name: 'SOLUSDT', asset: 'SOL', minPct: 0.20 },
        { name: 'DOGEUSDT', asset: 'DOGE', minPct: 0.20 }
    ];
    
    for (const { name, asset, minPct } of pairs) {
        console.log('\n=== ' + name + ' ===');
        
        const stateFile = '/root/arca-bot/data/sessions/VANTAGE01_' + name + '_state.json';
        const state = JSON.parse(fs.readFileSync(stateFile));
        const binanceTotal = parseFloat(balance[asset].total);
        
        const before = state.inventory.length;
        
        // Keep lots with significant remaining (>20% of original)
        // OR lots that are mostly full (>80% remaining)
        const significantLots = state.inventory.filter(lot => {
            const pctRemaining = lot.remaining / lot.amount;
            return pctRemaining > minPct || lot.remaining > 0.00001;
        });
        
        // Sort by timestamp (newest first) and take only what we need
        significantLots.sort((a, b) => b.timestamp - a.timestamp);
        
        let currentTotal = 0;
        const finalLots = [];
        
        for (const lot of significantLots) {
            if (currentTotal >= binanceTotal) break;
            
            const take = Math.min(lot.remaining, binanceTotal - currentTotal);
            if (take > 0.00000001) {
                finalLots.push({
                    ...lot,
                    remaining: take
                });
                currentTotal += take;
            }
        }
        
        state.inventory = finalLots;
        fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
        
        const after = finalLots.length;
        const finalTotal = finalLots.reduce((s, l) => s + l.remaining, 0);
        
        console.log('Antes: ' + before + ' lotes');
        console.log('Después: ' + after + ' lotes');
        console.log('Total: ' + finalTotal.toFixed(8) + ' ' + asset);
        console.log('Binance: ' + binanceTotal.toFixed(8) + ' ' + asset);
        console.log('Match: ' + (Math.abs(finalTotal - binanceTotal) < 0.00000001 ? 'YES' : 'NO'));
    }
}

consolidate().catch(console.error);
