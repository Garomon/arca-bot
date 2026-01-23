const fs = require('fs');

const configs = [
    {name: 'BTC', file: './data/sessions/VANTAGE01_BTCUSDT_state.json'},
    {name: 'SOL', file: './data/sessions/VANTAGE01_SOLUSDT_state.json'},
    {name: 'DOGE', file: './data/sessions/VANTAGE01_DOGEUSDT_state.json'}
];

let grandTotal = 0;

for (const cfg of configs) {
    const state = JSON.parse(fs.readFileSync(cfg.file, 'utf8'));
    const history = state.tradeHistory || [];
    
    const sells = history.filter(t => t.side === 'sell' && t.profit !== undefined);
    
    let totalProfit = 0;
    let estimatedCount = 0;
    let estimatedProfit = 0;
    
    for (const s of sells) {
        totalProfit += s.profit || 0;
        if (s.estimatedCostBasis || s.costBasisEstimated) {
            estimatedCount++;
            estimatedProfit += s.profit || 0;
        }
    }
    
    console.log(cfg.name + ':');
    console.log('  Sells con profit: ' + sells.length);
    console.log('  Total profit historial: $' + totalProfit.toFixed(2));
    console.log('  Sells con cost basis estimado: ' + estimatedCount);
    console.log('  Profit de estimados: $' + estimatedProfit.toFixed(2));
    console.log('  State.totalProfit: $' + (state.totalProfit || 0).toFixed(2));
    console.log('');
    
    grandTotal += totalProfit;
}

console.log('TOTAL profit en historial: $' + grandTotal.toFixed(2));
