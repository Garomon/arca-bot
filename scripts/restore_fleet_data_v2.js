const fs = require('fs');
const path = require('path');

const pairs = [
    { id: 'BTCUSDT', pair: 'BTC/USDT', audit: 'audit_BTCUSDT_2026-01-04.json' },
    { id: 'SOLUSDT', pair: 'SOL/USDT', audit: 'audit_SOLUSDT_2026-01-04.json' },
    { id: 'DOGEUSDT', pair: 'DOGE/USDT', audit: 'audit_DOGEUSDT_2026-01-03.json' }
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

        console.log('Restoring ' + p.pair + ' data (v2)...');
        
        // Correcting property names: grid_bot.js uses filledOrders for the dashboard UI
        const restoredOrders = audit.tradeLog.map(t => ({
            pair: p.pair,
            side: t.type.toLowerCase(),
            amount: t.amount,
            price: t.price,
            cost: t.cost || t.revenue,
            fee: t.fee,
            profit: t.profit,
            timestamp: new Date(t.date).getTime(),
            matchType: t.matchType || t.matchMethod, // Use matchMethod as fallback
            fillPrice: t.price // Dashboard uses fillPrice often
        }));

        state.filledOrders = restoredOrders;
        state.trades = restoredOrders; // Keeping trades for internal sync logic
        state.totalProfit = audit.pnl.realizedProfit;
        
        fs.writeFileSync(STATE_FILE + '.backup_v2', JSON.stringify(state, null, 2));
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

        console.log('SUCCESS: Restored ' + p.pair + ' (' + state.filledOrders.length + ' orders). Profit: $' + state.totalProfit.toFixed(4));
    } catch (e) {
        console.error('ERROR for ' + p.pair + ':', e.message);
    }
});
