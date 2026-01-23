const fs = require('fs');
const ccxt = require('ccxt');

async function deepVerify() {
    const envContent = fs.readFileSync('/root/arca-bot/.env', 'utf8');
    const apiKey = envContent.match(/BINANCE_API_KEY=([^\n\r]+)/)?.[1];
    const secret = envContent.match(/BINANCE_SECRET=([^\n\r]+)/)?.[1];
    
    const binance = new ccxt.binance({ apiKey, secret });
    
    const pairs = ['SOLUSDT', 'BTCUSDT', 'DOGEUSDT'];
    
    for (const pair of pairs) {
        const asset = pair.replace('USDT', '');
        console.log('\n========== ' + pair + ' ==========');
        
        const state = JSON.parse(fs.readFileSync('/root/arca-bot/data/sessions/VANTAGE01_' + pair + '_state.json'));
        const trades = await binance.fetchMyTrades(asset + '/USDT', undefined, 200);
        
        // Build map of Binance trade IDs
        const binanceIds = new Set(trades.map(t => t.id));
        
        // 1. Check inventory IDs
        console.log('\n1. INVENTORY CHECK:');
        let invValid = 0, invInvalid = 0;
        state.inventory.forEach(lot => {
            const baseId = lot.id.toString().replace('_recon', '');
            if (binanceIds.has(baseId)) invValid++;
            else invInvalid++;
        });
        console.log('   Valid: ' + invValid + '/' + state.inventory.length);
        if (invInvalid > 0) console.log('   INVALID: ' + invInvalid + ' lots with bad IDs!');
        
        // 2. Check tradeHistory
        console.log('\n2. TRADE HISTORY:');
        const history = state.tradeHistory || [];
        console.log('   Total records: ' + history.length);
        const sells = history.filter(t => t.side === 'sell');
        const buys = history.filter(t => t.side === 'buy');
        console.log('   Buys: ' + buys.length + ' | Sells: ' + sells.length);
        
        // 3. Check matchedLotIds in sells
        console.log('\n3. MATCHED LOT IDS IN SELLS:');
        let sellsWithMatches = 0;
        let matchedIdsValid = 0;
        let matchedIdsInvalid = 0;
        
        sells.forEach(sell => {
            if (sell.matchedLots && sell.matchedLots.length > 0) {
                sellsWithMatches++;
                sell.matchedLots.forEach(m => {
                    const lotId = (m.lotId || m.id || '').toString().replace('_recon', '');
                    if (binanceIds.has(lotId)) matchedIdsValid++;
                    else matchedIdsInvalid++;
                });
            }
        });
        
        console.log('   Sells with matched lots: ' + sellsWithMatches + '/' + sells.length);
        console.log('   Matched IDs valid: ' + matchedIdsValid);
        if (matchedIdsInvalid > 0) console.log('   INVALID MATCHED IDs: ' + matchedIdsInvalid);
        
        // 4. Show example of matched lot
        const sellWithMatch = sells.find(s => s.matchedLots && s.matchedLots.length > 0);
        if (sellWithMatch) {
            console.log('\n   Example sell:');
            console.log('   Price: $' + (sellWithMatch.price || sellWithMatch.fillPrice));
            console.log('   Matched lots:');
            sellWithMatch.matchedLots.slice(0,3).forEach(m => {
                const lotId = (m.lotId || m.id || '').toString().replace('_recon', '');
                const valid = binanceIds.has(lotId) ? 'VALID' : 'INVALID';
                console.log('     ' + lotId + ' -> ' + valid);
            });
        }
    }
}

deepVerify().catch(console.error);
