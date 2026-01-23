const fs = require('fs');
const ccxt = require('ccxt');

async function verify() {
    const envContent = fs.readFileSync('/root/arca-bot/.env', 'utf8');
    const apiKey = envContent.match(/BINANCE_API_KEY=([^\n\r]+)/)?.[1];
    const secret = envContent.match(/BINANCE_SECRET=([^\n\r]+)/)?.[1];
    
    const binance = new ccxt.binance({ apiKey, secret });
    const balance = await binance.fetchBalance();
    const bots = ['BTCUSDT', 'SOLUSDT', 'DOGEUSDT'];
    
    console.log('=== VERIFICACION POST-FIX ===\n');
    
    for (const pair of bots) {
        const asset = pair.replace('USDT', '');
        const stateFile = '/root/arca-bot/data/sessions/VANTAGE01_' + pair + '_state.json';
        const state = JSON.parse(fs.readFileSync(stateFile));
        
        const binanceTotal = parseFloat(balance[asset]?.total || 0);
        const inventoryTotal = (state.inventory || []).reduce((s, l) => s + l.remaining, 0);
        const diff = Math.abs(binanceTotal - inventoryTotal);
        const diffPct = binanceTotal > 0 ? (diff / binanceTotal * 100) : 0;
        
        const status = diffPct < 0.1 ? 'OK' : 'WARN';
        
        console.log(asset + ':');
        console.log('  Binance:    ' + binanceTotal.toFixed(8));
        console.log('  Inventario: ' + inventoryTotal.toFixed(8));
        console.log('  Diff:       ' + diff.toFixed(8) + ' (' + diffPct.toFixed(4) + '%)');
        console.log('  Estado: ' + status);
        console.log('  Lotes: ' + state.inventory.length);
        console.log('');
    }
}

verify().catch(console.error);
