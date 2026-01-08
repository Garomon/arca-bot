const fs = require('fs');
const path = require('path');

const pairs = [
    { id: 'BTCUSDT', pair: 'BTC/USDT', audit: 'audit_BTCUSDT_2026-01-04.json' },
    { id: 'SOLUSDT', pair: 'SOL/USDT', audit: 'audit_SOLUSDT_2026-01-04.json' }
];

pairs.forEach(p => {
    const STATE_FILE = '/root/arca-bot/data/sessions/VANTAGE01_' + p.id + '_state.json';
    const AUDIT_FILE = '/root/arca-bot/reports/' + p.audit;

    try {
        if (!fs.existsSync(AUDIT_FILE)) {
             console.error('Audit file not found for ' + p.pair);
             return;
        }
        const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        const audit = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8'));

        if (!audit || !audit.tradeLog) {
            console.error('Audit file invalid for ' + p.pair);
            return;
        }

        console.log('Restoring ' + p.pair + ' data...');
        
        const restoredTrades = audit.tradeLog.map(t => ({
            pair: p.pair,
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
        
        fs.writeFileSync(STATE_FILE + '.pre_restoration', JSON.stringify(state, null, 2));
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

        console.log('SUCCESS: Restored ' + p.pair + ' (' + state.trades.length + ' trades). Profit: $' + state.totalProfit.toFixed(4));
    } catch (e) {
        console.error('ERROR for ' + p.pair + ':', e.message);
    }
});
