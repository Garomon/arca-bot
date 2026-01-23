const fs = require('fs');
const ccxt = require('ccxt');

async function adjust() {
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
        console.log('\n=== Adjusting ' + name + ' ===');
        
        const stateFile = '/root/arca-bot/data/sessions/VANTAGE01_' + name + '_state.json';
        const state = JSON.parse(fs.readFileSync(stateFile));
        
        const binanceTotal = parseFloat(balance[asset].total);
        const invTotal = state.inventory.reduce((s, l) => s + l.remaining, 0);
        const diff = invTotal - binanceTotal;
        
        console.log('Inventory: ' + invTotal.toFixed(8));
        console.log('Binance: ' + binanceTotal.toFixed(8));
        console.log('Diff: ' + diff.toFixed(8));
        
        if (Math.abs(diff) > 0.00000001) {
            // Adjust the last partial lot
            const partials = state.inventory.filter(l => l.remaining < l.amount);
            if (partials.length > 0) {
                const lastPartial = partials[partials.length - 1];
                lastPartial.remaining -= diff;
                
                // If remaining goes negative or too small, remove the lot
                if (lastPartial.remaining < 0.00000001) {
                    const idx = state.inventory.indexOf(lastPartial);
                    state.inventory.splice(idx, 1);
                    console.log('Removed lot ' + lastPartial.id);
                } else {
                    console.log('Adjusted lot ' + lastPartial.id + ' by ' + (-diff).toFixed(8));
                }
            }
            
            fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
            
            const newTotal = state.inventory.reduce((s, l) => s + l.remaining, 0);
            console.log('New total: ' + newTotal.toFixed(8) + ' (match: ' + (Math.abs(newTotal - binanceTotal) < 0.00000001) + ')');
        } else {
            console.log('Already matches!');
        }
    }
}

adjust().catch(console.error);
