const fs = require('fs');

const s = JSON.parse(fs.readFileSync('./data/sessions/VANTAGE01_SOLUSDT_state.json', 'utf8'));

console.log('=== SOL - TODOS LOS LOTES ===\n');

const sorted = [...s.inventory].sort((a,b) => a.timestamp - b.timestamp);

sorted.forEach((l, i) => {
    const date = new Date(l.timestamp).toISOString().slice(0,16);
    const recon = l.reconciled ? ' [RECON]' : '';
    console.log((i+1) + '. ' + date + ' | ID:' + l.id.slice(0,15) + '... | $' + l.price.toFixed(2) + ' | qty:' + l.remaining.toFixed(4) + recon);
});

console.log('\nTotal: ' + s.inventory.length + ' lotes');
