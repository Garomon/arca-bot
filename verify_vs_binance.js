const fs = require('fs');
const ccxt = require('ccxt');

async function verify() {
    const envContent = fs.readFileSync('/root/arca-bot/.env', 'utf8');
    const apiKey = envContent.match(/BINANCE_API_KEY=([^\n\r]+)/)?.[1];
    const secret = envContent.match(/BINANCE_SECRET=([^\n\r]+)/)?.[1];
    
    const binance = new ccxt.binance({ apiKey, secret });
    
    // Check SOL specifically - the user mentioned duplicates
    console.log('=== VERIFICANDO SOL vs BINANCE ===\n');
    
    const solState = JSON.parse(fs.readFileSync('/root/arca-bot/data/sessions/VANTAGE01_SOLUSDT_state.json'));
    const solTrades = await binance.fetchMyTrades('SOL/USDT', undefined, 200);
    const binanceTradeIds = new Set(solTrades.map(t => t.id));
    
    // Check each inventory lot
    let invalidCount = 0;
    for (const lot of solState.inventory) {
        const baseId = lot.id.toString().replace('_recon', '');
        const existsInBinance = binanceTradeIds.has(baseId);
        
        if (!existsInBinance) {
            invalidCount++;
            console.log('NOT IN BINANCE: ' + lot.id + ' | $' + lot.price.toFixed(2) + ' | rem: ' + lot.remaining.toFixed(8));
        }
    }
    
    if (invalidCount === 0) {
        console.log('All ' + solState.inventory.length + ' lots exist in Binance trades');
    } else {
        console.log('\nFound ' + invalidCount + ' lots NOT in Binance');
    }
    
    // Show the suspicious pairs
    console.log('\n=== LOTES CON MISMO PRECIO 24.89 ===');
    solState.inventory.filter(l => l.price.toFixed(2) === '124.89').forEach(lot => {
        const exists = binanceTradeIds.has(lot.id.toString().replace('_recon', ''));
        console.log('  ' + lot.id + ' -> Binance: ' + (exists ? 'EXISTS' : 'NOT FOUND'));
    });
    
    console.log('\n=== LOTES CON MISMO PRECIO 25.87 ===');
    solState.inventory.filter(l => l.price.toFixed(2) === '125.87').forEach(lot => {
        const exists = binanceTradeIds.has(lot.id.toString().replace('_recon', ''));
        console.log('  ' + lot.id + ' -> Binance: ' + (exists ? 'EXISTS' : 'NOT FOUND'));
    });
}

verify().catch(console.error);
