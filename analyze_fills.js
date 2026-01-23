const fs = require('fs');

const configs = [
    {name: 'BTC', file: './data/sessions/VANTAGE01_BTCUSDT_state.json'},
    {name: 'SOL', file: './data/sessions/VANTAGE01_SOLUSDT_state.json'},
    {name: 'DOGE', file: './data/sessions/VANTAGE01_DOGEUSDT_state.json'}
];

let totalFromFills = 0;

for (const cfg of configs) {
    const s = JSON.parse(fs.readFileSync(cfg.file, 'utf8'));
    const fills = s.filledOrders || [];
    
    const sells = fills.filter(f => f.side === 'sell');
    let profitSum = 0;
    let estimatedProfitCount = 0;
    
    for (const sell of sells) {
        profitSum += sell.profit || 0;
        if (sell.costBasisEstimated || sell.estimatedCostBasis) {
            estimatedProfitCount++;
        }
    }
    
    console.log(cfg.name + ':');
    console.log('  Total fills:', fills.length);
    console.log('  Sells:', sells.length);
    console.log('  Profit sum from fills: $' + profitSum.toFixed(2));
    console.log('  Sells con cost estimado:', estimatedProfitCount);
    console.log('  State.totalProfit: $' + (s.totalProfit || 0).toFixed(2));
    
    // Show last 3 sells with their profit
    console.log('  Últimas ventas:');
    sells.slice(-3).forEach(sell => {
        console.log('    ' + new Date(sell.timestamp).toISOString().slice(0,16) + 
            ' qty=' + sell.amount + 
            ' price=$' + (sell.price || sell.fillPrice)?.toFixed(2) +
            ' profit=$' + (sell.profit || 0).toFixed(4) +
            (sell.costBasisEstimated ? ' [ESTIMATED]' : ''));
    });
    console.log('');
    
    totalFromFills += profitSum;
}

console.log('TOTAL profit de filledOrders: $' + totalFromFills.toFixed(2));
