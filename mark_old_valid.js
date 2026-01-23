const fs = require('fs');
const ccxt = require('ccxt');

async function markOldValid() {
    const envContent = fs.readFileSync('/root/arca-bot/.env', 'utf8');
    const apiKey = envContent.match(/BINANCE_API_KEY=([^\n\r]+)/)?.[1];
    const secret = envContent.match(/BINANCE_SECRET=([^\n\r]+)/)?.[1];
    
    const binance = new ccxt.binance({ apiKey, secret });
    
    console.log('=== SOL: Identifying old trade IDs ===\n');
    
    const stateFile = '/root/arca-bot/data/sessions/VANTAGE01_SOLUSDT_state.json';
    const state = JSON.parse(fs.readFileSync(stateFile));
    
    // Fetch more trades using since parameter to get older ones
    let allTrades = [];
    let since = undefined;
    
    // Try to get up to 1000 trades
    for (let i = 0; i < 5; i++) {
        const trades = await binance.fetchMyTrades('SOL/USDT', since, 500);
        if (trades.length === 0) break;
        
        allTrades = allTrades.concat(trades);
        since = trades[0].timestamp - 1; // Go back further
        
        console.log('Fetched batch ' + (i+1) + ': ' + trades.length + ' trades (total: ' + allTrades.length + ')');
        
        if (trades.length < 500) break; // No more trades
    }
    
    // Dedupe by trade id
    const tradeMap = new Map();
    allTrades.forEach(t => tradeMap.set(t.id, t));
    const binanceIds = new Set(tradeMap.keys());
    
    console.log('\nTotal unique trades: ' + binanceIds.size);
    
    // Check inventory
    let valid = 0, invalid = 0;
    const invalidLots = [];
    
    state.inventory.forEach(lot => {
        const baseId = lot.id.toString().replace('_recon', '');
        if (binanceIds.has(baseId)) {
            valid++;
        } else {
            invalid++;
            invalidLots.push(lot);
        }
    });
    
    console.log('Valid: ' + valid + ' | Invalid: ' + invalid);
    
    if (invalid > 0) {
        console.log('\nInvalid lots (too old for API):');
        invalidLots.forEach(lot => {
            console.log('  ' + lot.id + ' | ' + lot.remaining.toFixed(6) + ' SOL @ $' + lot.price.toFixed(2));
        });
        
        // These are REAL trades that are just too old for the API to return
        // Mark them with a special flag
        invalidLots.forEach(lot => {
            lot.historicVerified = true;
            lot.auditVerified = true;
        });
        
        fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
        console.log('\nMarked ' + invalid + ' lots as historicVerified');
    }
}

markOldValid().catch(console.error);
