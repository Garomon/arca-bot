const fs = require('fs');
const path = require('path');

const STATE_FILE = '/root/arca-bot/data/sessions/VANTAGE01_DOGEUSDT_state.json';
const AUDIT_FILE = '/root/arca-bot/reports/audit_DOGEUSDT_2026-01-03.json';

try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    const audit = JSON.parse(fs.readFileSync(fs.readFileSync(AUDIT_FILE, 'utf8') ? AUDIT_FILE : '', 'utf8'));

    if (!audit || !audit.tradeLog) {
        throw new Error('Audit file is empty or invalid');
    }

    console.log('Restoring DOGE data...');
    console.log('Current trades:', state.trades ? state.trades.length : 0);
    console.log('Audit trades:', audit.tradeLog.length);

    // Filter out internal audit fields to match grid_bot.js format if necessary
    // grid_bot.js trades usually have: pair, side, amount, price, cost, fee, profit, timestamp, matchType
    const restoredTrades = audit.tradeLog.map(t => ({
        pair: 'DOGE/USDT',
        side: t.type.toLowerCase(),
        amount: t.amount,
        price: t.price,
        cost: t.cost || t.revenue,
        fee: t.fee,
        profit: t.profit,
        timestamp: new Date(t.date).getTime(),
        matchType: t.matchType
    }));

    state.trades = restoredTrades;
    state.totalProfit = audit.pnl.realizedProfit;
    
    // Backup before overwrite
    fs.writeFileSync(STATE_FILE + '.pre_restoration', JSON.stringify(state, null, 2));
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

    console.log('SUCCESS: Restored ' + state.trades.length + ' trades.');
    console.log('Restored Profit: $' + state.totalProfit.toFixed(4));
} catch (e) {
    console.error('ERROR:', e.message);
}
