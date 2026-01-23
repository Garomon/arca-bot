const fs = require('fs');

const configs = [
    {name: 'BTC', file: './data/sessions/VANTAGE01_BTCUSDT_state.json'},
    {name: 'SOL', file: './data/sessions/VANTAGE01_SOLUSDT_state.json'},
    {name: 'DOGE', file: './data/sessions/VANTAGE01_DOGEUSDT_state.json'}
];

for (const cfg of configs) {
    const s = JSON.parse(fs.readFileSync(cfg.file, 'utf8'));
    console.log(cfg.name + ':');
    console.log('  totalProfit:', s.totalProfit);
    console.log('  accumulatedProfit:', s.accumulatedProfit);
    console.log('  estimatedProfit:', s.estimatedProfit);
    console.log('  realizedProfit:', s.realizedProfit);
    console.log('  initialCapital:', s.initialCapital);
    console.log('  metrics.totalProfit:', s.metrics?.totalProfit);
    console.log('  metrics.realizedPnL:', s.metrics?.realizedPnL);
    console.log('');
}
