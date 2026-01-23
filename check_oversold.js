const s = require("/root/arca-bot/data/sessions/VANTAGE01_SOLUSDT_state.json");

const sells = s.filledOrders.filter(o => o.side === "sell" && o.matchedLots);
const byLot = {};

sells.forEach(o => {
    o.matchedLots.forEach(l => {
        if (!byLot[l.lotId]) {
            byLot[l.lotId] = { total: 0, sells: [] };
        }
        byLot[l.lotId].total += l.amountTaken;
        byLot[l.lotId].sells.push({
            amt: l.amountTaken,
            price: o.price,
            date: new Date(o.timestamp).toISOString().slice(0,10)
        });
    });
});

// Find lots used more than once
const duplicates = Object.entries(byLot).filter(([id, data]) => data.sells.length > 1);

console.log("Lotes usados multiples veces:", duplicates.length);
console.log("");

duplicates.slice(0, 5).forEach(([id, data]) => {
    console.log(`Lot ${id}:`);
    console.log(`  Total vendido: ${data.total.toFixed(6)}`);
    data.sells.forEach((s, i) => {
        console.log(`  Sell ${i+1}: ${s.amt.toFixed(6)} @ $${s.price} (${s.date})`);
    });
    console.log("");
});
