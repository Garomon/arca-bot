const fs = require('fs');

const pairs = ['BTCUSDT', 'SOLUSDT', 'DOGEUSDT'];

for (const pair of pairs) {
    console.log('\n=== ' + pair + ' ===');
    const state = JSON.parse(fs.readFileSync('/root/arca-bot/data/sessions/VANTAGE01_' + pair + '_state.json'));
    
    const totalRemaining = state.inventory.reduce((s, l) => s + l.remaining, 0);
    const totalAmount = state.inventory.reduce((s, l) => s + l.amount, 0);
    
    console.log('Lotes: ' + state.inventory.length);
    console.log('Total amount (si fueran completos): ' + totalAmount.toFixed(8));
    console.log('Total remaining (real): ' + totalRemaining.toFixed(8));
    console.log('Diferencia consumida: ' + (totalAmount - totalRemaining).toFixed(8));
    
    // Mostrar lotes con muy poco remaining
    const tiny = state.inventory.filter(l => l.remaining < l.amount * 0.1 && l.remaining > 0);
    if (tiny.length > 0) {
        console.log('\nLotes casi vacíos (<10% remaining): ' + tiny.length);
        tiny.slice(0,3).forEach(l => {
            console.log('  ' + l.id + ': ' + l.remaining.toFixed(6) + '/' + l.amount.toFixed(6));
        });
    }
}
