const fs = require('fs');
const ccxt = require('ccxt');

async function verifySellMatches() {
    const envContent = fs.readFileSync('/root/arca-bot/.env', 'utf8');
    const apiKey = envContent.match(/BINANCE_API_KEY=([^\n\r]+)/)?.[1];
    const secret = envContent.match(/BINANCE_SECRET=([^\n\r]+)/)?.[1];
    
    const binance = new ccxt.binance({ apiKey, secret });
    
    const pairs = ['BTCUSDT', 'SOLUSDT', 'DOGEUSDT'];
    
    for (const pair of pairs) {
        const asset = pair.replace('USDT', '');
        console.log('\n========== ' + pair + ' ==========');
        
        const stateFile = '/root/arca-bot/data/sessions/VANTAGE01_' + pair + '_state.json';
        const state = JSON.parse(fs.readFileSync(stateFile));
        
        // Get current inventory IDs
        const inventoryIds = new Set(state.inventory.map(l => l.id.toString()));
        
        // Get all Binance trades
        const trades = await binance.fetchMyTrades(asset + '/USDT', undefined, 500);
        const buyIds = new Set(trades.filter(t => t.side === 'buy').map(t => t.id.toString()));
        const sells = trades.filter(t => t.side === 'sell');
        
        console.log('Inventory lots: ' + state.inventory.length);
        console.log('Binance buys: ' + buyIds.size);
        console.log('Binance sells: ' + sells.length);
        
        // Check tradeHistory for matchedLots
        const history = state.tradeHistory || [];
        const historySells = history.filter(t => t.side === 'sell');
        
        console.log('\nTradeHistory sells: ' + historySells.length);
        
        // Check if sells have matchedLots
        let sellsWithMatches = 0;
        let matchedToValidBuy = 0;
        let matchedToInvalidBuy = 0;
        
        historySells.forEach(sell => {
            if (sell.matchedLots && sell.matchedLots.length > 0) {
                sellsWithMatches++;
                sell.matchedLots.forEach(m => {
                    const lotId = (m.lotId || m.id || '').toString();
                    if (buyIds.has(lotId)) {
                        matchedToValidBuy++;
                    } else {
                        matchedToInvalidBuy++;
                    }
                });
            }
        });
        
        console.log('Sells with matchedLots: ' + sellsWithMatches + '/' + historySells.length);
        console.log('Matched to valid buy IDs: ' + matchedToValidBuy);
        console.log('Matched to INVALID buy IDs: ' + matchedToInvalidBuy);
        
        // Show last 3 sells with their matches
        console.log('\nÚltimos 3 sells con matches:');
        const recentSells = historySells.slice(-3);
        recentSells.forEach(sell => {
            console.log('  SELL: ' + sell.amount + ' @ $' + (sell.price || sell.fillPrice || '?'));
            if (sell.matchedLots && sell.matchedLots.length > 0) {
                sell.matchedLots.forEach(m => {
                    const lotId = (m.lotId || m.id || '').toString();
                    const valid = buyIds.has(lotId) ? 'VALID' : 'INVALID';
                    console.log('    -> Lot ' + lotId + ' (' + valid + ')');
                });
            } else {
                console.log('    -> NO MATCHES');
            }
        });
    }
}

verifySellMatches().catch(console.error);
