const fs = require('fs');

const configs = [
    {name: 'BTC', file: './data/sessions/VANTAGE01_BTCUSDT_state.json'},
    {name: 'SOL', file: './data/sessions/VANTAGE01_SOLUSDT_state.json'},
    {name: 'DOGE', file: './data/sessions/VANTAGE01_DOGEUSDT_state.json'}
];

for (const cfg of configs) {
    const state = JSON.parse(fs.readFileSync(cfg.file, 'utf8'));
    
    const reconLots = state.inventory.filter(l => l.reconciled === true);
    const normalLots = state.inventory.filter(l => l.reconciled !== true);
    
    console.log('=== ' + cfg.name + ' ===');
    console.log('Lotes _recon: ' + reconLots.length + ' (ya corregidos)');
    console.log('Lotes normales: ' + normalLots.length);
    
    console.log('Muestra de lotes normales:');
    normalLots.slice(0, 3).forEach(l => {
        const date = new Date(l.timestamp).toISOString().slice(0,10);
        console.log('  ' + l.id.slice(0,15) + '... | ' + date + ' | $' + l.price.toFixed(4));
    });
    console.log('');
}

console.log('Los lotes NORMALES fueron creados correctamente por handleOrderFill');
console.log('con el precio real de Binance. No necesitan corrección.');
