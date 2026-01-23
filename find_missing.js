const fs = require('fs');
const ccxt = require('ccxt');

async function findMissing() {
    const envContent = fs.readFileSync('/root/arca-bot/.env', 'utf8');
    const apiKey = envContent.match(/BINANCE_API_KEY=([^\n\r]+)/)?.[1];
    const secret = envContent.match(/BINANCE_SECRET=([^\n\r]+)/)?.[1];
    
    const binance = new ccxt.binance({ apiKey, secret });
    const balance = await binance.fetchBalance();
    
    // Check BTC
    console.log('=== BTC ANALYSIS ===');
    const btcState = JSON.parse(fs.readFileSync('/root/arca-bot/data/sessions/VANTAGE01_BTCUSDT_state.json'));
    const btcTrades = await binance.fetchMyTrades('BTC/USDT', undefined, 100);
    const btcBuys = btcTrades.filter(t => t.side === 'buy');
    
    const btcInventoryIds = new Set(btcState.inventory.map(l => l.id.replace('_recon', '')));
    
    let missingBtc = 0;
    const missingBtcTrades = [];
    for (const trade of btcBuys) {
        if (!btcInventoryIds.has(trade.id)) {
            missingBtc += trade.amount;
            missingBtcTrades.push({ id: trade.id, amount: trade.amount, price: trade.price });
        }
    }
    
    console.log('Binance balance: ' + balance['BTC'].total);
    console.log('Inventory total: ' + btcState.inventory.reduce((s,l) => s + l.remaining, 0).toFixed(8));
    console.log('Missing trades: ' + missingBtcTrades.length);
    if (missingBtcTrades.length > 0) {
        console.log('Missing BTC amount: ' + missingBtc.toFixed(8));
        console.log('Missing trades:');
        missingBtcTrades.slice(0,5).forEach(t => console.log('  ' + t.id + ': ' + t.amount + ' @ $' + t.price));
    }
    
    // Check SOL
    console.log('\n=== SOL ANALYSIS ===');
    const solState = JSON.parse(fs.readFileSync('/root/arca-bot/data/sessions/VANTAGE01_SOLUSDT_state.json'));
    const solTrades = await binance.fetchMyTrades('SOL/USDT', undefined, 100);
    const solBuys = solTrades.filter(t => t.side === 'buy');
    
    const solInventoryIds = new Set(solState.inventory.map(l => l.id.replace('_recon', '')));
    
    let missingSol = 0;
    const missingSolTrades = [];
    for (const trade of solBuys) {
        if (!solInventoryIds.has(trade.id)) {
            missingSol += trade.amount;
            missingSolTrades.push({ id: trade.id, amount: trade.amount, price: trade.price });
        }
    }
    
    console.log('Binance balance: ' + balance['SOL'].total);
    console.log('Inventory total: ' + solState.inventory.reduce((s,l) => s + l.remaining, 0).toFixed(8));
    console.log('Missing trades: ' + missingSolTrades.length);
    if (missingSolTrades.length > 0) {
        console.log('Missing SOL amount: ' + missingSol.toFixed(8));
        console.log('Missing trades:');
        missingSolTrades.slice(0,5).forEach(t => console.log('  ' + t.id + ': ' + t.amount + ' @ $' + t.price));
    }
}

findMissing().catch(console.error);
