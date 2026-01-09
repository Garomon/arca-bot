const fs = require('fs');
const path = require('path');

const SESSION_DIR = path.join(__dirname, '../data/sessions');

const bots = [
    { id: 'BTC', file: 'VANTAGE01_BTCUSDT_state.json' },
    { id: 'SOL', file: 'VANTAGE01_SOLUSDT_state.json' },
    { id: 'DOGE', file: 'VANTAGE01_DOGEUSDT_state.json' }
];

console.log('--- FINAL AUDIT PROFIT ---');
let total = 0;

bots.forEach(bot => {
    const filePath = path.join(SESSION_DIR, bot.file);
    if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const profit = data.totalProfit || 0;
        console.log(`${bot.id}: $${profit.toFixed(2)}`);
        total += profit;
    } else {
        console.log(`${bot.id}: FILE NOT FOUND`);
    }
});

console.log('--------------------------');
console.log(`TOTAL REALIZADO AUDITADO: $${total.toFixed(2)}`);
