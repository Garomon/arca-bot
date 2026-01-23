const fs = require('fs');
const ccxt = require('ccxt');

async function restoreHistory() {
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
        console.log('\n=== RESTORING ' + name + ' ===');
        
        const stateFile = '/root/arca-bot/data/sessions/VANTAGE01_' + name + '_state.json';
        const state = JSON.parse(fs.readFileSync(stateFile));
        
        // Fetch all trades from Binance
        const trades = await binance.fetchMyTrades(asset + '/USDT', undefined, 500);
        console.log('Fetched ' + trades.length + ' trades from Binance');
        
        // Build tradeHistory with proper structure
        const tradeHistory = trades.map(t => ({
            id: t.id,
            orderId: t.order,
            timestamp: t.timestamp,
            side: t.side,
            price: t.price,
            amount: t.amount,
            cost: t.cost,
            fee: t.fee?.cost || 0,
            feeCurrency: t.fee?.currency || 'USDT'
        }));
        
        state.tradeHistory = tradeHistory;
        
        // Build matchedLotIds map for SPREAD_MATCH
        // For each sell, find the corresponding buy lots
        const buys = tradeHistory.filter(t => t.side === 'buy');
        const sells = tradeHistory.filter(t => t.side === 'sell');
        
        // Create spacing map
        const spacing = state.gridSpacing || 0.008;
        
        let matchedCount = 0;
        sells.forEach(sell => {
            // Find buys where buyPrice * (1 + spacing) ≈ sellPrice
            const matchedLots = [];
            let remainingToMatch = sell.amount;
            
            for (const buy of buys) {
                if (remainingToMatch <= 0.00000001) break;
                
                const expectedSellPrice = buy.price * (1 + spacing);
                const priceDiff = Math.abs(sell.price - expectedSellPrice) / expectedSellPrice;
                
                if (priceDiff < 0.02) { // Within 2%
                    matchedLots.push({
                        lotId: buy.id.toString(),
                        buyPrice: buy.price,
                        consumed: Math.min(buy.amount, remainingToMatch)
                    });
                    remainingToMatch -= buy.amount;
                }
            }
            
            if (matchedLots.length > 0) {
                sell.matchedLots = matchedLots;
                matchedCount++;
            }
        });
        
        // Save
        fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
        
        console.log('Restored ' + tradeHistory.length + ' trades');
        console.log('Buys: ' + buys.length + ' | Sells: ' + sells.length);
        console.log('Sells with matches: ' + matchedCount);
    }
    
    console.log('\n=== DONE ===');
}

restoreHistory().catch(console.error);
