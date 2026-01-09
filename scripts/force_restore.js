const fs = require('fs');
const path = require('path');
const pair = process.argv[2] || 'SOL'; // e.g., 'SOL' or 'BTC'

const auditFile = `/root/arca-bot/reports/audit_${pair}USDT_2026-01-08.json`;
const stateFile = `/root/arca-bot/data/sessions/VANTAGE01_${pair}USDT_state.json`;

if (!fs.existsSync(auditFile)) {
    console.error(`Audit file not found: ${auditFile}`);
    process.exit(1);
}

if (!fs.existsSync(stateFile)) {
    console.error(`State file not found: ${stateFile}`);
    process.exit(1);
}

const audit = JSON.parse(fs.readFileSync(auditFile, 'utf8'));
const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));

console.log(`--- FORCE RESTORE: ${pair}/USDT ---`);
console.log(`State Profit Before: $${state.totalProfit}`);
console.log(`Audit Profit Target: $${audit.pnl.realizedProfit}`);

// 1. Overwrite Profit
state.totalProfit = audit.pnl.realizedProfit;
state.accumulatedProfit = audit.pnl.realizedProfit;

// 2. Overwrite Cost
if (audit.inventory && audit.inventory.avgCost) {
    state.entryPrice = audit.inventory.avgCost;
}

// 3. Overwrite History
const newHistory = audit.tradeLog.map(t => ({
    id: t.orderId || `REC_${new Date(t.date).getTime()}`,
    symbol: `${pair}/USDT`,
    side: t.type.toLowerCase(),
    price: t.price,
    amount: t.amount,
    cost: t.cost || t.revenue,
    fee: t.fee || 0,
    profit: t.profit !== null ? t.profit : 0,
    timestamp: new Date(t.date).getTime(),
    datetime: t.date,
    matchType: t.matchType || undefined,
    matchedLots: t.lotsConsumed || undefined,
    isNetProfit: true
}));

state.filledOrders = newHistory;
state.archivedOrders = []; // Clear separate archive

console.log(`History Replaced: ${newHistory.length} trades.`);
console.log(`State Profit After: $${state.totalProfit}`);

// 4. Save
fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
console.log('SAVED SUCCESSFULLY.');
