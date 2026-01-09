const fs = require('fs');
const pairs = ['BTC', 'SOL', 'DOGE'];

pairs.forEach(pair => {
    try {
        const auditFile = `/root/arca-bot/reports/audit_${pair}USDT_2026-01-08.json`;
        const stateFile = `/root/arca-bot/data/sessions/VANTAGE01_${pair}USDT_state.json`;

        if (!fs.existsSync(auditFile)) {
            console.log(`Skipping ${pair}: Audit file not found.`);
            return;
        }

        const audit = JSON.parse(fs.readFileSync(auditFile, 'utf8'));
        const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));

        console.log(`--- REPAIRING METADATA: ${pair}/USDT ---`);

        // Re-map history with ALL fields required by main.js
        // main.js expects: fees, costBasis, spreadPct, matchType, matchedLots

        const newHistory = audit.tradeLog.map(t => ({
            id: t.orderId || `REC_${new Date(t.date).getTime()}`,
            symbol: `${pair}/USDT`,
            side: t.type.toLowerCase(),
            price: t.price,
            amount: t.amount,

            // Fix 1: Fees (Frontend wants 'fees')
            fees: t.fee || 0,
            feeCurrency: 'USDT', // Audit normalizes to USDT usually, but let's assume USDT for consistency

            // Fix 2: Cost Basis & Spread (Frontend wants 'costBasis', 'spreadPct')
            costBasis: t.costBasis || 0,
            spreadPct: t.spreadPct !== null ? t.spreadPct : 0,

            // Additional metrics
            profit: t.profit !== null ? t.profit : 0,
            timestamp: new Date(t.date).getTime(),
            datetime: t.date,
            matchType: t.matchType || undefined,
            matchedLots: t.lotsConsumed || undefined,
            isNetProfit: true
        }));

        state.filledOrders = newHistory;

        // Save
        fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
        console.log(`✔ Repaired ${newHistory.length} trades for ${pair}.`);

    } catch (e) {
        console.error(`Error repairing ${pair}:`, e.message);
    }
});
