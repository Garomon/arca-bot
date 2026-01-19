const fs = require('fs');
const path = require('path');

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║          🏛️ MONITOREO ARCA - 17 APARTADOS                   ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('Fecha:', new Date().toISOString().split('T')[0]);

// Load bot states from sessions directory
const sessionsDir = 'data/sessions';
const stateFiles = fs.readdirSync(sessionsDir).filter(f => f.endsWith('_state.json') && !f.includes('backup'));

const botStates = {};
stateFiles.forEach(f => {
    const content = JSON.parse(fs.readFileSync(path.join(sessionsDir, f), 'utf8'));
    const botName = f.replace('_state.json', '');
    botStates[botName] = content;
});

// Load trades from all session trade files
let trades = [];
const tradeFiles = fs.readdirSync(sessionsDir).filter(f => f.endsWith('_trades.json'));
tradeFiles.forEach(f => {
    try {
        const content = JSON.parse(fs.readFileSync(path.join(sessionsDir, f), 'utf8'));
        if (Array.isArray(content)) {
            trades = trades.concat(content);
        } else if (content.trades) {
            trades = trades.concat(content.trades);
        }
    } catch(e) {}
});

const depositsData = JSON.parse(fs.readFileSync('data/deposits.json', 'utf8'));
const deposits = depositsData.deposits || depositsData;

// 1. ESTADO GENERAL
console.log('\n═══ 1️⃣ ESTADO GENERAL DEL SISTEMA ═══');
const bots = Object.keys(botStates);
bots.forEach(bot => {
    const b = botStates[bot];
    const status = b.isRunning !== false ? '🟢 RUNNING' : '🔴 STOPPED';
    console.log(bot + ': ' + status + ' | Modo: ' + (b.currentAction || b.mode || 'TRADING'));
});

// 2. CAPITAL
console.log('\n═══ 2️⃣ CAPITAL DEPOSITADO ═══');
const totalDeposits = deposits.reduce((s,d) => s + d.amount, 0);
console.log('Total Depositado: $' + totalDeposits.toFixed(2));

// 3. ÓRDENES ACTIVAS
console.log('\n═══ 3️⃣ ÓRDENES ACTIVAS POR BOT ═══');
bots.forEach(bot => {
    const b = botStates[bot];
    const orders = b.activeOrders || [];
    const buys = orders.filter(o => o.side === 'BUY').length;
    const sells = orders.filter(o => o.side === 'SELL').length;
    console.log(bot + ': ' + buys + ' BUYS, ' + sells + ' SELLS (Total: ' + orders.length + ')');
});

// 4. INVENTARIO
console.log('\n═══ 4️⃣ INVENTARIO (LOTES) ═══');
bots.forEach(bot => {
    const b = botStates[bot];
    const inv = b.inventory || [];
    const totalCost = inv.reduce((s,i) => s + (i.quantity * i.price), 0);
    console.log(bot + ': ' + inv.length + ' lotes | Costo Total: $' + totalCost.toFixed(2));
});

// 5. TRADES HOY
console.log('\n═══ 5️⃣ TRADES HOY ═══');
const today = new Date().toISOString().split('T')[0];
const todayTrades = trades.filter(t => t.timestamp && t.timestamp.startsWith(today));
console.log('Total hoy: ' + todayTrades.length + ' trades');
const byBot = {};
todayTrades.forEach(t => {
    byBot[t.symbol] = byBot[t.symbol] || {buys: 0, sells: 0};
    if (t.side === 'BUY') byBot[t.symbol].buys++;
    else byBot[t.symbol].sells++;
});
Object.keys(byBot).forEach(s => {
    console.log('  ' + s + ': ' + byBot[s].buys + ' buys, ' + byBot[s].sells + ' sells');
});

// 6. PROFIT HOY
console.log('\n═══ 6️⃣ PROFIT HOY ═══');
const todaySells = todayTrades.filter(t => t.side === 'SELL');
const todayProfit = todaySells.reduce((s,t) => s + (t.profit || 0), 0);
console.log('Profit del día: $' + todayProfit.toFixed(4));

// 7. TRADES SEMANA
console.log('\n═══ 7️⃣ ACTIVIDAD ÚLTIMA SEMANA ═══');
const weekAgo = new Date(Date.now() - 7*24*60*60*1000).toISOString().split('T')[0];
const weekTrades = trades.filter(t => t.timestamp && t.timestamp >= weekAgo);
const weekSells = weekTrades.filter(t => t.side === 'SELL');
const weekProfit = weekSells.reduce((s,t) => s + (t.profit || 0), 0);
console.log('Trades semana: ' + weekTrades.length + ' | Sells: ' + weekSells.length + ' | Profit: $' + weekProfit.toFixed(2));

// 8. SPREAD PROMEDIO
console.log('\n═══ 8️⃣ SPREAD PROMEDIO ═══');
const recentSells = trades.filter(t => t.side === 'SELL' && t.spread !== undefined).slice(-50);
if (recentSells.length > 0) {
    const avgSpread = recentSells.reduce((s,t) => s + (t.spread || 0), 0) / recentSells.length;
    console.log('Últimos ' + recentSells.length + ' sells: ' + avgSpread.toFixed(3) + '% spread promedio');
} else {
    console.log('Sin datos de spread');
}

// 9. SMART DCA STATUS
console.log('\n═══ 9️⃣ SMART DCA STATUS ═══');
bots.forEach(bot => {
    const b = botStates[bot];
    const blocking = b.smartDcaBlocking ? '🔴 BLOCKING' : '🟢 OPEN';
    const regime = b.regime || 'N/A';
    console.log(bot + ': ' + blocking + ' | Regime: ' + regime);
});

// 10. INJECTION INDICATOR
console.log('\n═══ 🔟 INJECTION INDICATOR ═══');
bots.forEach(bot => {
    const b = botStates[bot];
    const score = b.compositeScore || b.injectionScore || 'N/A';
    console.log(bot + ': Score ' + score);
});

// 11. GRID SPACING
console.log('\n═══ 1️⃣1️⃣ GRID SPACING ═══');
bots.forEach(bot => {
    const b = botStates[bot];
    const spacing = b.gridSpacing || b.currentSpacing || 'N/A';
    console.log(bot + ': ' + (typeof spacing === 'number' ? spacing.toFixed(2) + '%' : spacing));
});

// 12. VOLATILIDAD
console.log('\n═══ 1️⃣2️⃣ VOLATILIDAD ACTUAL ═══');
bots.forEach(bot => {
    const b = botStates[bot];
    const vol = b.volatility || b.currentVolatility || 'N/A';
    console.log(bot + ': ' + (typeof vol === 'number' ? vol.toFixed(2) + '%' : vol));
});

// 13. DISTANCIA AL PRÓXIMO TRADE
console.log('\n═══ 1️⃣3️⃣ DISTANCIA AL PRÓXIMO TRADE ═══');
bots.forEach(bot => {
    const b = botStates[bot];
    const orders = b.activeOrders || [];
    const price = b.lastPrice || b.currentPrice || 0;

    const buys = orders.filter(o => o.side === 'BUY').map(o => o.price).sort((a,b) => b-a);
    const sells = orders.filter(o => o.side === 'SELL').map(o => o.price).sort((a,b) => a-b);

    const nearestBuy = buys[0] || 0;
    const nearestSell = sells[0] || 0;

    if (price > 0) {
        const toBuy = nearestBuy ? ((price - nearestBuy) / price * 100).toFixed(2) : 'N/A';
        const toSell = nearestSell ? ((nearestSell - price) / price * 100).toFixed(2) : 'N/A';
        console.log(bot + ': Precio $' + price.toFixed(2) + ' | Buy -' + toBuy + '% | Sell +' + toSell + '%');
    }
});

// 14. PROFIT ACUMULADO TOTAL
console.log('\n═══ 1️⃣4️⃣ PROFIT ACUMULADO TOTAL ═══');
const allSells = trades.filter(t => t.side === 'SELL');
const totalProfit = allSells.reduce((s,t) => s + (t.profit || 0), 0);
console.log('Profit Total Histórico: $' + totalProfit.toFixed(2));

// 15. ERRORES RECIENTES
console.log('\n═══ 1️⃣5️⃣ ERRORES RECIENTES ═══');
try {
    const errors = JSON.parse(fs.readFileSync('data/errors.json', 'utf8') || '[]');
    const recent = errors.slice(-5);
    if (recent.length > 0) {
        recent.forEach(e => console.log('  ' + (e.timestamp || '') + ': ' + (e.message || e)));
    } else {
        console.log('Sin errores recientes');
    }
} catch(e) {
    console.log('Sin archivo de errores');
}

// 16. PROTECCIONES
console.log('\n═══ 1️⃣6️⃣ PROTECCIONES ACTIVAS ═══');
const code = fs.readFileSync('grid_bot.js', 'utf8');
const floor = code.match(/USDT_FLOOR.*?[:=]\s*([\d.]+)/)?.[1] || 'N/A';
const cap = code.match(/INVENTORY_CAP.*?[:=]\s*([\d.]+)/)?.[1] || 'N/A';
const loss = code.match(/LOSS_TOLERANCE.*?[:=]\s*(-?[\d.]+)/)?.[1] || 'N/A';
console.log('USDT_FLOOR: ' + floor + ' | INVENTORY_CAP: ' + cap + ' | LOSS_TOLERANCE: ' + loss + '%');
console.log('Fail Closed: ' + (code.includes('SAFETY_ERROR') ? '✅' : '❌'));
console.log('No Match Block: ' + (code.includes('NO_MATCH') ? '✅' : '❌'));

// 17. RECOMENDACIONES
console.log('\n═══ 1️⃣7️⃣ RECOMENDACIONES ═══');
let recommendations = [];

// Check inventory imbalance
bots.forEach(bot => {
    const b = botStates[bot];
    const inv = b.inventory || [];
    if (inv.length > 10) {
        recommendations.push('⚠️ ' + bot + ': Alto inventario (' + inv.length + ' lotes). Considerar esperar o ajustar grid.');
    }
});

// Check no trades
if (todayTrades.length === 0) {
    recommendations.push('📊 Sin trades hoy. Mercado lateral o fuera de rango.');
}

// Check BEAR regime
bots.forEach(bot => {
    const b = botStates[bot];
    if (b.regime === 'BEAR') {
        recommendations.push('🐻 ' + bot + ' en BEAR regime. Bot es conservador automáticamente.');
    }
});

// Check low activity
if (weekTrades.length < 10) {
    recommendations.push('📉 Baja actividad esta semana (' + weekTrades.length + ' trades). Verificar si grid está bien posicionado.');
}

if (recommendations.length === 0) {
    console.log('✅ Sistema funcionando normalmente. Sin acciones requeridas.');
} else {
    recommendations.forEach(r => console.log(r));
}

console.log('\n════════════════════════════════════════════════════════════');
console.log('                    FIN DEL MONITOREO');
console.log('════════════════════════════════════════════════════════════');
