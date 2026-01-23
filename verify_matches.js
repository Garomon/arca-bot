const fs = require('fs');
const ccxt = require('ccxt');

async function verifyMatches() {
    const envContent = fs.readFileSync('/root/arca-bot/.env', 'utf8');
    const apiKey = envContent.match(/BINANCE_API_KEY=([^\n\r]+)/)?.[1];
    const secret = envContent.match(/BINANCE_SECRET=([^\n\r]+)/)?.[1];
    
    const binance = new ccxt.binance({ apiKey, secret });
    
    // Check SOL as example
    console.log('=== VERIFICANDO MATCHES SOL ===\n');
    
    const state = JSON.parse(fs.readFileSync('/root/arca-bot/data/sessions/VANTAGE01_SOLUSDT_state.json'));
    const trades = await binance.fetchMyTrades('SOL/USDT', undefined, 200);
    
    // Get all trade IDs from Binance
    const binanceTradeIds = new Map();
    trades.forEach(t => binanceTradeIds.set(t.id, t));
    
    // Get inventory lot IDs
    const inventoryIds = new Set(state.inventory.map(l => l.id.toString()));
    
    console.log('Inventory lots: ' + state.inventory.length);
    console.log('Binance trades: ' + trades.length);
    
    // Check tradeHistory for lot references
    console.log('\n--- Trade History Analysis ---');
    const recentSells = (state.tradeHistory || [])
        .filter(t => t.side === 'sell')
        .slice(-10);
    
    console.log('Last 10 sells in tradeHistory:');
    let matchIssues = 0;
    
    for (const sell of recentSells) {
        const matchedLots = sell.matchedLots || [];
        console.log('\nSELL: ' + sell.amount + ' SOL @ $' + (sell.price || sell.fillPrice));
        
        if (matchedLots.length === 0) {
            console.log('  -> NO MATCHED LOTS RECORDED');
            matchIssues++;
        } else {
            for (const match of matchedLots) {
                const lotId = match.lotId || match.id;
                const inInventory = inventoryIds.has(lotId?.toString());
                const inBinance = binanceTradeIds.has(lotId?.toString()?.replace('_recon', ''));
                
                let status = '';
                if (!lotId) {
                    status = 'NO LOT ID';
                    matchIssues++;
                } else if (!inBinance) {
                    status = 'LOT ID NOT IN BINANCE!';
                    matchIssues++;
                } else {
                    status = 'OK';
                }
                
                console.log('  -> Lot: ' + lotId + ' | consumed: ' + (match.consumed || match.amount) + ' | ' + status);
            }
        }
    }
    
    console.log('\n=== RESUMEN ===');
    console.log('Issues encontrados: ' + matchIssues);
    
    if (matchIssues === 0) {
        console.log('TODOS LOS MATCHES SON CORRECTOS');
    } else {
        console.log('HAY PROBLEMAS CON LOS MATCHES');
    }
}

verifyMatches().catch(console.error);
