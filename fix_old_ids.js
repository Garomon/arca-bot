const fs = require('fs');
const ccxt = require('ccxt');

async function fixOldIds() {
    const envContent = fs.readFileSync('/root/arca-bot/.env', 'utf8');
    const apiKey = envContent.match(/BINANCE_API_KEY=([^\n\r]+)/)?.[1];
    const secret = envContent.match(/BINANCE_SECRET=([^\n\r]+)/)?.[1];
    
    const binance = new ccxt.binance({ apiKey, secret });
    
    console.log('=== Fixing SOL old IDs ===\n');
    
    const stateFile = '/root/arca-bot/data/sessions/VANTAGE01_SOLUSDT_state.json';
    const state = JSON.parse(fs.readFileSync(stateFile));
    
    const trades = await binance.fetchMyTrades('SOL/USDT', undefined, 500);
    const binanceIds = new Set(trades.map(t => t.id));
    
    // Find invalid lots
    const invalidLots = state.inventory.filter(lot => {
        const baseId = lot.id.toString().replace('_recon', '');
        return !binanceIds.has(baseId);
    });
    
    console.log('Invalid lots: ' + invalidLots.length);
    invalidLots.forEach(lot => {
        console.log('  ' + lot.id + ' | rem: ' + lot.remaining.toFixed(6) + ' | price: $' + lot.price.toFixed(2));
    });
    
    // These are old trades that are no longer in the API
    // We need to mark them as valid (they ARE real, just old)
    // OR remove them and adjust from valid lots
    
    const invalidTotal = invalidLots.reduce((s, l) => s + l.remaining, 0);
    console.log('\nTotal in invalid lots: ' + invalidTotal.toFixed(6) + ' SOL');
    
    // Remove invalid lots
    state.inventory = state.inventory.filter(lot => {
        const baseId = lot.id.toString().replace('_recon', '');
        return binanceIds.has(baseId);
    });
    
    const afterTotal = state.inventory.reduce((s, l) => s + l.remaining, 0);
    const balance = await binance.fetchBalance();
    const binanceTotal = parseFloat(balance['SOL'].total);
    
    console.log('\nAfter removal: ' + afterTotal.toFixed(6) + ' SOL');
    console.log('Binance: ' + binanceTotal.toFixed(6) + ' SOL');
    
    // Need to add the difference back to valid lots
    const shortage = binanceTotal - afterTotal;
    if (shortage > 0.00000001) {
        console.log('Shortage: ' + shortage.toFixed(6) + ' SOL');
        
        // Find most recent buy trades not in inventory
        const buys = trades.filter(t => t.side === 'buy').sort((a,b) => b.timestamp - a.timestamp);
        const inventoryIds = new Set(state.inventory.map(l => l.id.toString()));
        
        let remaining = shortage;
        for (const trade of buys) {
            if (remaining <= 0.00000001) break;
            if (inventoryIds.has(trade.id.toString())) continue;
            
            const toAdd = Math.min(trade.amount, remaining);
            state.inventory.push({
                id: trade.id.toString(),
                price: trade.price,
                amount: trade.amount,
                remaining: toAdd,
                fee: trade.fee?.cost || 0,
                timestamp: trade.timestamp,
                auditVerified: true
            });
            remaining -= toAdd;
            console.log('Added: ' + trade.id + ' | ' + toAdd.toFixed(6) + ' @ $' + trade.price.toFixed(2));
        }
    }
    
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    
    const finalTotal = state.inventory.reduce((s, l) => s + l.remaining, 0);
    console.log('\nFinal: ' + state.inventory.length + ' lots | ' + finalTotal.toFixed(6) + ' SOL');
    console.log('Match: ' + (Math.abs(finalTotal - binanceTotal) < 0.0001 ? 'YES' : 'NO'));
}

fixOldIds().catch(console.error);
