const fs = require('fs');
const ccxt = require('ccxt');

async function fixDoge() {
    const envContent = fs.readFileSync('/root/arca-bot/.env', 'utf8');
    const apiKey = envContent.match(/BINANCE_API_KEY=([^\n\r]+)/)?.[1];
    const secret = envContent.match(/BINANCE_SECRET=([^\n\r]+)/)?.[1];
    
    const binance = new ccxt.binance({ apiKey, secret });
    const balance = await binance.fetchBalance();
    const binanceTotal = parseFloat(balance['DOGE']?.total || 0);
    
    // Get all DOGE trades
    const trades = await binance.fetchMyTrades('DOGE/USDT', undefined, 200);
    const buys = trades.filter(t => t.side === 'buy');
    
    console.log('Binance DOGE balance: ' + binanceTotal);
    console.log('Total buy trades: ' + buys.length);
    
    // Build fresh inventory from Binance buys
    const stateFile = '/root/arca-bot/data/sessions/VANTAGE01_DOGEUSDT_state.json';
    const state = JSON.parse(fs.readFileSync(stateFile));
    
    console.log('\nCurrent inventory: ' + state.inventory.length + ' lots');
    console.log('Current remaining: ' + state.inventory.reduce((s,l) => s + l.remaining, 0));
    
    // Create new inventory - one entry per trade
    const newInventory = [];
    const seenIds = new Set();
    
    let needed = binanceTotal;
    
    // Sort buys by date (newest first) and add until we match balance
    const sortedBuys = buys.sort((a,b) => b.timestamp - a.timestamp);
    
    for (const trade of sortedBuys) {
        if (needed <= 0.5) break; // Close enough
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
            reconciled: true
        });
        
        needed -= toAdd;
        console.log('Added: ' + trade.id + ' | ' + toAdd.toFixed(0) + ' DOGE @ $' + trade.price.toFixed(5));
    }
    
    state.inventory = newInventory;
    
    const finalTotal = newInventory.reduce((s,l) => s + l.remaining, 0);
    console.log('\nNew inventory: ' + newInventory.length + ' lots');
    console.log('New remaining: ' + finalTotal);
    console.log('Binance: ' + binanceTotal);
    console.log('Diff: ' + Math.abs(binanceTotal - finalTotal).toFixed(8));
    
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    console.log('\nSaved!');
}

fixDoge().catch(console.error);
