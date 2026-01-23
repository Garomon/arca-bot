const fs = require('fs');
const ccxt = require('ccxt');

async function rebuildWithConsumption(pairName) {
    const envContent = fs.readFileSync('/root/arca-bot/.env', 'utf8');
    const apiKey = envContent.match(/BINANCE_API_KEY=([^\n\r]+)/)?.[1];
    const secret = envContent.match(/BINANCE_SECRET=([^\n\r]+)/)?.[1];
    
    const binance = new ccxt.binance({ apiKey, secret });
    const asset = pairName.replace('USDT', '');
    const pair = asset + '/USDT';
    
    console.log('\n=== REBUILDING ' + pairName + ' WITH PROPER CONSUMPTION ===\n');
    
    // Get all trades sorted by time
    const trades = await binance.fetchMyTrades(pair, undefined, 500);
    trades.sort((a, b) => a.timestamp - b.timestamp); // Oldest first
    
    const buys = trades.filter(t => t.side === 'buy');
    const sells = trades.filter(t => t.side === 'sell');
    
    console.log('Total buys: ' + buys.length);
    console.log('Total sells: ' + sells.length);
    
    // Get grid spacing from state
    const stateFile = '/root/arca-bot/data/sessions/VANTAGE01_' + pairName + '_state.json';
    const state = JSON.parse(fs.readFileSync(stateFile));
    const spacing = state.gridSpacing || 0.008;
    
    console.log('Grid spacing: ' + (spacing * 100).toFixed(2) + '%');
    
    // Step 1: Create inventory from ALL buys
    const inventory = buys.map(buy => ({
        id: buy.id.toString(),
        price: buy.price,
        amount: buy.amount,
        remaining: buy.amount,
        fee: buy.fee?.cost || 0,
        timestamp: buy.timestamp,
        auditVerified: true
    }));
    
    console.log('Initial inventory: ' + inventory.length + ' lots');
    
    // Step 2: Process sells in order using SPREAD_MATCH
    let totalConsumed = 0;
    
    for (const sell of sells) {
        let remainingToSell = sell.amount;
        const sellPrice = sell.price;
        
        // Find matching lots using SPREAD_MATCH logic
        // Expected buy price = sellPrice / (1 + spacing)
        const expectedBuyPrice = sellPrice / (1 + spacing);
        
        // Sort lots by how close they are to expected buy price
        const availableLots = inventory
            .filter(lot => lot.remaining > 0.00000001)
            .map((lot, idx) => ({
                lot,
                idx,
                diff: Math.abs(lot.price - expectedBuyPrice)
            }))
            .sort((a, b) => a.diff - b.diff);
        
        // Consume from best matches first
        for (const { lot } of availableLots) {
            if (remainingToSell <= 0.00000001) break;
            
            const toConsume = Math.min(lot.remaining, remainingToSell);
            lot.remaining -= toConsume;
            remainingToSell -= toConsume;
            totalConsumed += toConsume;
        }
    }
    
    console.log('Total consumed by sells: ' + totalConsumed.toFixed(8));
    
    // Step 3: Filter out empty lots and verify
    const finalInventory = inventory.filter(lot => lot.remaining > 0.00000001);
    const finalTotal = finalInventory.reduce((s, l) => s + l.remaining, 0);
    
    const balance = await binance.fetchBalance();
    const binanceTotal = parseFloat(balance[asset]?.total || 0);
    
    console.log('\nFinal inventory: ' + finalInventory.length + ' lots');
    console.log('Final remaining: ' + finalTotal.toFixed(8) + ' ' + asset);
    console.log('Binance balance: ' + binanceTotal.toFixed(8) + ' ' + asset);
    console.log('Difference: ' + Math.abs(finalTotal - binanceTotal).toFixed(8));
    
    // Show consumption stats
    let fullLots = 0, partialLots = 0;
    finalInventory.forEach(lot => {
        if (Math.abs(lot.remaining - lot.amount) < 0.00000001) fullLots++;
        else partialLots++;
    });
    
    console.log('\nFull lots: ' + fullLots + ' | Partial lots: ' + partialLots);
    
    // Show some partial lots as examples
    const partials = finalInventory.filter(l => Math.abs(l.remaining - l.amount) > 0.00000001);
    if (partials.length > 0) {
        console.log('\nPartially consumed lots:');
        partials.slice(0, 5).forEach(lot => {
            const pct = ((lot.amount - lot.remaining) / lot.amount * 100).toFixed(1);
            console.log('  ' + lot.id + ': ' + lot.remaining.toFixed(6) + '/' + lot.amount.toFixed(6) + ' (' + pct + '% consumed)');
        });
    }
    
    // Save
    state.inventory = finalInventory;
    state.paused = false;
    state.pauseReason = null;
    
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    console.log('\n✅ Saved!');
    
    return { finalInventory, binanceTotal, finalTotal };
}

// Run for all pairs
async function main() {
    await rebuildWithConsumption('BTCUSDT');
    await rebuildWithConsumption('SOLUSDT');
    await rebuildWithConsumption('DOGEUSDT');
}

main().catch(console.error);
