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
        if (!fs.existsSync(AUDIT_FILE)) return;
        const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        const audit = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8'));

        console.log('Final Restoration (v3) for ' + p.pair);
        
        const restoredOrders = audit.tradeLog.map(t => ({
            pair: p.pair,
            side: t.type.toLowerCase(),
            amount: t.amount,
            price: t.price,
            cost: t.cost || t.revenue,
            fee: t.fee,
            profit: t.profit,
            timestamp: new Date(t.date).getTime(),
            matchType: t.matchType || t.matchMethod,
            fillPrice: t.price
        }));

        state.filledOrders = restoredOrders;
        state.trades = restoredOrders;
        state.totalProfit = audit.pnl.realizedProfit;
        state.accumulatedProfit = audit.pnl.realizedProfit; // TRIPLE DEFENSE
        state.feeCorrectionApplied = true;

        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
        console.log('SUCCESS: ' + p.pair + ' recovered.');
    } catch (e) {
        console.error('ERROR ' + p.pair + ':', e.message);
    }
});
