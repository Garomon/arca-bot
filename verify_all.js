const fs = require('fs');
const ccxt = require('ccxt');

async function verifyAll() {
    const envContent = fs.readFileSync('/root/arca-bot/.env', 'utf8');
    const apiKey = envContent.match(/BINANCE_API_KEY=([^\n\r]+)/)?.[1];
    const secret = envContent.match(/BINANCE_SECRET=([^\n\r]+)/)?.[1];
    
    const binance = new ccxt.binance({ apiKey, secret });
    
    const pairs = [
        { name: 'BTCUSDT', asset: 'BTC' },
        { name: 'SOLUSDT', asset: 'SOL' },
        { name: 'DOGEUSDT', asset: 'DOGE' }
    ];
    
    for (const { name, asset } of pairs) {
        console.log('\n=== ' + name + ' ===');
        const state = JSON.parse(fs.readFileSync('/root/arca-bot/data/sessions/VANTAGE01_' + name + '_state.json'));
        const trades = await binance.fetchMyTrades(asset + '/USDT', undefined, 200);
        const binanceIds = new Set(trades.map(t => t.id));
        
        let valid = 0, invalid = 0;
        state.inventory.forEach(lot => {
            const baseId = lot.id.toString().replace('_recon', '');
            if (binanceIds.has(baseId)) valid++;
            else invalid++;
        });
        
        console.log('Total: ' + state.inventory.length + ' | Valid: ' + valid + ' | Invalid: ' + invalid);
        
        if (invalid > 0) {
            console.log('  -> ' + invalid + ' lotes con IDs que NO existen en Binance!');
        }
    }
}

verifyAll().catch(console.error);
