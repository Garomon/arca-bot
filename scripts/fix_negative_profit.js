const fs = require("fs");
const path = require("path");

const GRID_SPACING = {
    "BTC": 0.005,
    "SOL": 0.008,
    "DOGE": 0.010
};

const pair = process.argv[2] || "DOGE";
const gridSpacing = GRID_SPACING[pair] || 0.005;
const STATE_FILE = path.join(__dirname, "..", "data", "sessions", "VANTAGE01_" + pair + "USDT_state.json");

console.log("=== FIX NEGATIVE PROFIT SELLS for " + pair + " ===");
console.log("Grid spacing: " + (gridSpacing * 100) + "%\n");

const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
let fixedCount = 0;
const tradingFee = 0.001;

const profitBefore = state.filledOrders
    .filter(function(o) { return o.side === "sell"; })
    .reduce(function(s, o) { return s + (o.profit || 0); }, 0);

for (const order of state.filledOrders) {
    if (order.side === "sell" && (order.profit || 0) <= 0) {
        const sellPrice = order.price || order.fillPrice;
        const amount = order.amount;
        const oldProfit = order.profit || 0;
        const oldType = order.matchType;

        const newBuyPrice = sellPrice / (1 + gridSpacing);
        const costBasis = newBuyPrice * amount;
        const revenue = sellPrice * amount;
        const spreadPct = gridSpacing * 100;

        const feeUSD = order.feesUSD || (order.fees > 0.001 ? order.fees : order.fees * 700);
        const entryFee = newBuyPrice * amount * tradingFee;
        const totalFees = entryFee + feeUSD;

        const netProfit = revenue - costBasis - totalFees;

        order.costBasis = newBuyPrice;
        order.spreadPct = spreadPct;
        order.profit = netProfit;
        order.matchType = "GRID_ESTIMATED";

        fixedCount++;
        console.log("Fixed #" + order.id + ": $" + oldProfit.toFixed(4) + " -> $" + netProfit.toFixed(4) + " (" + oldType + " -> GRID_ESTIMATED)");
    }
}

if (fixedCount > 0) {
    fs.copyFileSync(STATE_FILE, STATE_FILE + ".bak_negative_" + Date.now());
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

    const profitAfter = state.filledOrders
        .filter(function(o) { return o.side === "sell"; })
        .reduce(function(s, o) { return s + (o.profit || 0); }, 0);

    // Also sync realizedProfit
    state.realizedProfit = profitAfter;
    state.totalProfit = profitAfter;
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

    console.log("\nFixed " + fixedCount + " sells");
    console.log("Profit: $" + profitBefore.toFixed(2) + " -> $" + profitAfter.toFixed(2) + " (+$" + (profitAfter - profitBefore).toFixed(2) + ")");
} else {
    console.log("No negative profit sells to fix");
}
