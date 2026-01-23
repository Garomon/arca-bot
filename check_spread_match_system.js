const fs = require('fs');

const pairs = ['BTCUSDT', 'SOLUSDT', 'DOGEUSDT'];

for (const pair of pairs) {
    console.log('\n' + '='.repeat(60));
    console.log('  ' + pair + ' - SPREAD_MATCH TRACKING SYSTEM');
    console.log('='.repeat(60));
    
    const state = JSON.parse(fs.readFileSync('/root/arca-bot/data/sessions/VANTAGE01_' + pair + '_state.json'));
    
    // 1. INVENTORY (current lots)
    console.log('\n📦 INVENTORY (Lotes actuales):');
    console.log('   Total lotes: ' + state.inventory.length);
    
    let fullLots = 0, partialLots = 0;
    state.inventory.forEach(lot => {
        if (Math.abs(lot.remaining - lot.amount) < 0.00000001) fullLots++;
        else partialLots++;
    });
    console.log('   Completos: ' + fullLots + ' | Parciales: ' + partialLots);
    
    // Show partial lots (these were partially consumed by sells)
    const partials = state.inventory.filter(l => Math.abs(l.remaining - l.amount) > 0.00000001);
    if (partials.length > 0) {
        console.log('\n   Lotes parcialmente consumidos:');
        partials.slice(0, 3).forEach(lot => {
            const consumed = ((lot.amount - lot.remaining) / lot.amount * 100).toFixed(1);
            console.log('   - ' + lot.id + ': ' + lot.remaining.toFixed(6) + '/' + lot.amount.toFixed(6) + ' (' + consumed + '% consumido)');
        });
    }
    
    // 2. TRADE HISTORY (transaction log)
    console.log('\n📜 TRADE HISTORY (Transaction Log):');
    const history = state.tradeHistory || [];
    const buys = history.filter(t => t.side === 'buy');
    const sells = history.filter(t => t.side === 'sell');
    console.log('   Total trades: ' + history.length);
    console.log('   Buys: ' + buys.length + ' | Sells: ' + sells.length);
    
    // 3. SPREAD_MATCH Analysis
    console.log('\n🎯 SPREAD_MATCH ANALYSIS:');
    
    // Check sells with matchedLots
    let sellsWithFullMatch = 0;
    let sellsWithPartialMatch = 0;
    let totalLotsConsumed = 0;
    
    sells.forEach(sell => {
        if (sell.matchedLots && sell.matchedLots.length > 0) {
            // Check if any lot was partially consumed
            const hasPartial = sell.matchedLots.some(m => {
                const consumed = m.consumed || m.amount || 0;
                return consumed < (m.originalAmount || consumed);
            });
            
            if (hasPartial) sellsWithPartialMatch++;
            else sellsWithFullMatch++;
            
            totalLotsConsumed += sell.matchedLots.length;
        }
    });
    
    console.log('   Sells con match completo: ' + sellsWithFullMatch);
    console.log('   Sells con match parcial: ' + sellsWithPartialMatch);
    console.log('   Total lot references en sells: ' + totalLotsConsumed);
    
    // 4. Show example of SPREAD_MATCH
    console.log('\n📋 EJEMPLO DE SPREAD_MATCH (último sell):');
    const lastSell = sells[sells.length - 1];
    if (lastSell) {
        console.log('   SELL: ' + lastSell.amount + ' @ $' + (lastSell.price || lastSell.fillPrice));
        console.log('   Timestamp: ' + new Date(lastSell.timestamp).toISOString());
        
        if (lastSell.matchedLots && lastSell.matchedLots.length > 0) {
            console.log('   Matched Lots:');
            lastSell.matchedLots.forEach(m => {
                const lotId = m.lotId || m.id;
                const consumed = m.consumed || m.amount || '?';
                const buyPrice = m.buyPrice || m.price || '?';
                console.log('     -> Lot ' + lotId + ': consumed ' + consumed + ' @ $' + buyPrice);
            });
        }
    }
    
    // 5. Verify consistency
    console.log('\n✅ VERIFICACIÓN DE CONSISTENCIA:');
    const invTotal = state.inventory.reduce((s, l) => s + l.remaining, 0);
    const historyBuyTotal = buys.reduce((s, t) => s + t.amount, 0);
    const historySellTotal = sells.reduce((s, t) => s + t.amount, 0);
    const expectedRemaining = historyBuyTotal - historySellTotal;
    
    console.log('   History: Comprado=' + historyBuyTotal.toFixed(6) + ' | Vendido=' + historySellTotal.toFixed(6));
    console.log('   Esperado remaining: ' + expectedRemaining.toFixed(6));
    console.log('   Inventory remaining: ' + invTotal.toFixed(6));
    console.log('   Match: ' + (Math.abs(expectedRemaining - invTotal) < 0.01 ? 'OK' : 'DIFERENCIA'));
}
