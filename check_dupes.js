const fs = require('fs');

const configs = [
    {name: 'BTC', file: './data/sessions/VANTAGE01_BTCUSDT_state.json'},
    {name: 'SOL', file: './data/sessions/VANTAGE01_SOLUSDT_state.json'},
    {name: 'DOGE', file: './data/sessions/VANTAGE01_DOGEUSDT_state.json'}
];

for (const cfg of configs) {
    const s = JSON.parse(fs.readFileSync(cfg.file, 'utf8'));
    
    console.log('=== ' + cfg.name + ' ===');
    
    // Check for duplicate IDs
    const ids = s.inventory.map(l => l.id);
    const baseIds = s.inventory.map(l => l.id.replace('_recon', ''));
    
    // Find duplicates
    const seen = new Set();
    const dupes = [];
    
    for (const id of baseIds) {
        if (seen.has(id)) {
            dupes.push(id);
        }
        seen.add(id);
    }
    
    if (dupes.length > 0) {
        console.log('DUPLICADOS ENCONTRADOS: ' + dupes.length);
        dupes.forEach(id => {
            const lots = s.inventory.filter(l => l.id.replace('_recon', '') === id);
            console.log('  ID base: ' + id);
            lots.forEach(l => {
                console.log('    -> ' + l.id + ' | remaining: ' + l.remaining + ' | price: $' + l.price.toFixed(4));
            });
        });
    } else {
        console.log('Sin duplicados');
    }
    
    console.log('Total lotes: ' + s.inventory.length);
    console.log('');
}
