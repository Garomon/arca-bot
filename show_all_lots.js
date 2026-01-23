const fs = require('fs');

const configs = [
    {name: 'DOGE', file: './data/sessions/VANTAGE01_DOGEUSDT_state.json'}
];

for (const cfg of configs) {
    const s = JSON.parse(fs.readFileSync(cfg.file, 'utf8'));
    
    console.log('=== ' + cfg.name + ' - TODOS LOS LOTES ===\n');
    
    // Sort by timestamp
    const sorted = [...s.inventory].sort((a,b) => a.timestamp - b.timestamp);
    
    sorted.forEach((l, i) => {
        const date = new Date(l.timestamp).toISOString().slice(0,16);
        const recon = l.reconciled ? ' [RECON]' : '';
        console.log((i+1) + '. ' + date + ' | ID:' + l.id.slice(0,12) + '... | $' + l.price.toFixed(4) + ' | qty:' + l.remaining.toFixed(2) + recon);
    });
    
    console.log('\nTotal: ' + s.inventory.length + ' lotes');
}
