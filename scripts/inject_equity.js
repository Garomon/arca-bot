const fs = require('fs');
const path = '/root/arca-bot/data/sessions/VANTAGE01_BTCUSDT_state.json';
try {
    const s = JSON.parse(fs.readFileSync(path, 'utf8'));
    s.globalEquity = 1091.28;
    fs.writeFileSync(path, JSON.stringify(s, null, 2));
    console.log('INJECTION SUCCESS');
} catch (e) { console.error(e); }
