const fs = require('fs');
const path = '/root/arca-bot/data/sessions/';

const pairs = ['BTCUSDT', 'SOLUSDT', 'DOGEUSDT'];

console.log('='.repeat(60));
console.log('AUDIT: LOTES SOBRE-VENDIDOS EN TODOS LOS BOTS');
console.log('='.repeat(60));

let totalIssues = 0;
let totalOverSold = 0;

pairs.forEach(pair => {
    const file = `${path}VANTAGE01_${pair}_state.json`;

    try {
        const s = JSON.parse(fs.readFileSync(file));
        const sells = (s.filledOrders || []).filter(o => o.side === 'sell' && o.matchedLots);
        const buys = (s.filledOrders || []).filter(o => o.side === 'buy');

        // Agrupar por lotId
        const byLot = {};
        sells.forEach(o => {
            (o.matchedLots || []).forEach(l => {
                if (!byLot[l.lotId]) {
                    byLot[l.lotId] = { totalSold: 0, sells: [], profit: 0 };
                }
                byLot[l.lotId].totalSold += l.amountTaken || 0;
                byLot[l.lotId].profit += o.profit || 0;
                byLot[l.lotId].sells.push({
                    amt: l.amountTaken,
                    price: o.price,
                    profit: o.profit,
                    date: new Date(o.timestamp).toISOString().slice(0, 10)
                });
            });
        });

        // Encontrar lotes con problemas
        const issues = [];
        Object.entries(byLot).forEach(([lotId, data]) => {
            // Buscar el BUY original
            const buy = buys.find(b => (b.orderId || b.id) === lotId);
            const originalAmt = buy ? buy.amount : null;

            if (data.sells.length > 1) {
                // Usado múltiples veces
                issues.push({
                    lotId,
                    originalAmt,
                    totalSold: data.totalSold,
                    sellCount: data.sells.length,
                    overSold: originalAmt ? data.totalSold - originalAmt : null,
                    profit: data.profit,
                    sells: data.sells
                });
            }
        });

        console.log(`\n${'─'.repeat(60)}`);
        console.log(`📊 ${pair}`);
        console.log(`${'─'.repeat(60)}`);
        console.log(`Total sells: ${sells.length}`);
        console.log(`Total buys: ${buys.length}`);
        console.log(`Lotes con problema: ${issues.length}`);

        if (issues.length > 0) {
            totalIssues += issues.length;

            // Mostrar top 3 peores casos
            issues.sort((a, b) => (b.overSold || 0) - (a.overSold || 0));

            console.log(`\n⚠️  TOP 3 CASOS MÁS GRAVES:`);
            issues.slice(0, 3).forEach((issue, i) => {
                const overPct = issue.originalAmt
                    ? ((issue.totalSold / issue.originalAmt - 1) * 100).toFixed(0)
                    : '?';
                console.log(`\n  ${i + 1}. Lot #${issue.lotId}`);
                console.log(`     Original: ${issue.originalAmt?.toFixed(6) || 'DESCONOCIDO'}`);
                console.log(`     Vendido:  ${issue.totalSold.toFixed(6)} (${overPct}% más)`);
                console.log(`     En ${issue.sellCount} sells:`);
                issue.sells.forEach(s => {
                    console.log(`       - ${s.date}: ${s.amt.toFixed(6)} @ $${s.price.toFixed(2)} → $${(s.profit || 0).toFixed(4)}`);
                });

                if (issue.overSold > 0) {
                    totalOverSold += issue.overSold;
                }
            });

            // Calcular profit potencialmente inflado
            const totalDuplicateProfit = issues.reduce((sum, i) => sum + i.profit, 0);
            console.log(`\n  💰 Profit en lotes duplicados: $${totalDuplicateProfit.toFixed(4)}`);
        } else {
            console.log(`\n✅ Sin problemas de duplicados`);
        }

    } catch (e) {
        console.log(`\n❌ ${pair}: Error - ${e.message}`);
    }
});

console.log(`\n${'='.repeat(60)}`);
console.log(`RESUMEN GLOBAL`);
console.log(`${'='.repeat(60)}`);
console.log(`Total lotes con problema: ${totalIssues}`);
console.log(`Total sobre-vendido: ${totalOverSold.toFixed(6)} unidades`);
