const fs = require('fs');

// Read deposits
const depositsData = JSON.parse(fs.readFileSync('./data/deposits.json', 'utf8'));
const deposits = depositsData.deposits;

// Calculate correct allocation
let btcCapital = 0;
let solCapital = 0;
let dogeCapital = 0;
let totalBeforeRebalance = 0;

console.log('=== CALCULANDO CAPITAL CORRECTO ===\n');

for (const d of deposits) {
    if (d.type === 'rebalance') {
        // Rebalance redistributes all existing capital
        const total = totalBeforeRebalance;
        btcCapital = total * (d.allocation.BTC / 100);
        solCapital = total * (d.allocation.SOL / 100);
        dogeCapital = total * (d.allocation.DOGE / 100);
        console.log('REBALANCE: Total $' + total.toFixed(2) + ' -> BTC:$' + btcCapital.toFixed(2) + ' SOL:$' + solCapital.toFixed(2) + ' DOGE:$' + dogeCapital.toFixed(2));
        continue;
    }
    
    const amount = d.amount || 0;
    const alloc = d.allocation || {};
    
    // Add to each bot based on allocation
    const btcAdd = amount * (alloc.BTC || 0) / 100;
    const solAdd = amount * (alloc.SOL || 0) / 100;
    const dogeAdd = amount * (alloc.DOGE || 0) / 100;
    
    btcCapital += btcAdd;
    solCapital += solAdd;
    dogeCapital += dogeAdd;
    totalBeforeRebalance += amount;
    
    console.log(d.date + ': $' + amount + ' -> BTC:+$' + btcAdd.toFixed(2) + ' SOL:+$' + solAdd.toFixed(2) + ' DOGE:+$' + dogeAdd.toFixed(2));
}

console.log('\n=== CAPITAL CORRECTO ===');
console.log('BTC: $' + btcCapital.toFixed(2));
console.log('SOL: $' + solCapital.toFixed(2));
console.log('DOGE: $' + dogeCapital.toFixed(2));
console.log('TOTAL: $' + (btcCapital + solCapital + dogeCapital).toFixed(2));

// Apply to state files
const configs = [
    {name: 'BTC', file: './data/sessions/VANTAGE01_BTCUSDT_state.json', capital: btcCapital},
    {name: 'SOL', file: './data/sessions/VANTAGE01_SOLUSDT_state.json', capital: solCapital},
    {name: 'DOGE', file: './data/sessions/VANTAGE01_DOGEUSDT_state.json', capital: dogeCapital}
];

console.log('\n=== APLICANDO CORRECCIONES ===');

for (const cfg of configs) {
    const state = JSON.parse(fs.readFileSync(cfg.file, 'utf8'));
    const oldCapital = state.initialCapital || 0;
    
    console.log(cfg.name + ': $' + oldCapital.toFixed(2) + ' -> $' + cfg.capital.toFixed(2));
    
    state.initialCapital = cfg.capital;
    state.initialCapitalCorrectedAt = Date.now();
    
    fs.writeFileSync(cfg.file, JSON.stringify(state, null, 2));
}

console.log('\n=== VERIFICANDO ===');
let total = 0;
for (const cfg of configs) {
    const state = JSON.parse(fs.readFileSync(cfg.file, 'utf8'));
    console.log(cfg.name + ' initialCapital: $' + state.initialCapital.toFixed(2));
    total += state.initialCapital;
}
console.log('TOTAL: $' + total.toFixed(2));
