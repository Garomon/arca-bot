const fs = require('fs');

const configs = [
    {name: 'BTC', file: './data/sessions/VANTAGE01_BTCUSDT_state.json'},
    {name: 'SOL', file: './data/sessions/VANTAGE01_SOLUSDT_state.json'},
    {name: 'DOGE', file: './data/sessions/VANTAGE01_DOGEUSDT_state.json'}
];

let sumInitial = 0;
let sumProfit = 0;
let sumInventoryCost = 0;

for (const cfg of configs) {
    const s = JSON.parse(fs.readFileSync(cfg.file, 'utf8'));
    
    // Calculate inventory cost
    const inv = s.inventory || [];
    let invCost = 0;
    for (const lot of inv) {
        invCost += lot.remaining * lot.price;
    }
    
    // Current balance
    const balanceTotal = s.balance?.total || 0;
    const usdtInBot = s.balance?.usdt || 0;
    
    console.log(cfg.name + ':');
    console.log('  initialCapital: $' + (s.initialCapital || 0).toFixed(2));
    console.log('  totalProfit: $' + (s.totalProfit || 0).toFixed(2));
    console.log('  balance.total: $' + balanceTotal.toFixed(2));
    console.log('  balance.usdt: $' + usdtInBot.toFixed(2));
    console.log('  inventoryCost: $' + invCost.toFixed(2));
    
    // Bot equity = usdt + inventory value at current price
    // But we need current price...
    console.log('');
    
    sumInitial += s.initialCapital || 0;
    sumProfit += s.totalProfit || 0;
    sumInventoryCost += invCost;
}

console.log('=== TOTALES ===');
console.log('Sum initialCapital: $' + sumInitial.toFixed(2));
console.log('Sum totalProfit: $' + sumProfit.toFixed(2));
console.log('Sum inventoryCost: $' + sumInventoryCost.toFixed(2));
console.log('');
console.log('Depósitos reales: 095.74');
console.log('Diferencia capital: $' + (2095.74 - sumInitial).toFixed(2));
