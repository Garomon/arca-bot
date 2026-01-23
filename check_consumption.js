const fs = require('fs');

const bots = ['BTCUSDT', 'SOLUSDT', 'DOGEUSDT'];

for (const pair of bots) {
    console.log('\n=== ' + pair + ' ===');
    const state = JSON.parse(fs.readFileSync('/root/arca-bot/data/sessions/VANTAGE01_' + pair + '_state.json'));
    
    let full = 0, partial = 0, empty = 0;
    
    state.inventory.forEach(lot => {
        if (lot.remaining === lot.amount) full++;
        else if (lot.remaining > 0) partial++;
        else empty++;
    });
    
    console.log('Total lotes: ' + state.inventory.length);
    console.log('  Completos (rem=amount): ' + full);
    console.log('  Parciales (0<rem<amount): ' + partial);
    console.log('  Vacios (rem=0): ' + empty);
    
    // Show some examples
    console.log('\nEjemplos:');
    state.inventory.slice(0, 5).forEach(lot => {
        const status = lot.remaining === lot.amount ? 'FULL' : (lot.remaining > 0 ? 'PARTIAL' : 'EMPTY');
        console.log('  ' + lot.id + ': amount=' + lot.amount + ' rem=' + lot.remaining + ' [' + status + ']');
    });
}
