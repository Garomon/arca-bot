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

console.log("=== FIX ESTIMATED SELLS for " + pair + " ===");

const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
let fixedCount = 0;
const tradingFee = 0.001;

for (const order of state.filledOrders) {
    const isEstimated = order.matchType && order.matchType.includes("ESTIMATED");
    const isGrid = order.matchType && order.matchType.includes("GRID");
    if (order.side === "sell" && isEstimated && !isGrid) {
        const sellPrice = order.price || order.fillPrice;
        const amount = order.amount;
        const oldProfit = order.profit || 0;

        const newBuyPrice = sellPrice / (1 + gridSpacing);
        const revenue = sellPrice * amount;
        const spreadPct = gridSpacing * 100;

        const feeUSD = order.feesUSD || (order.fees > 0.001 ? order.fees : order.fees * 700);
        const entryFee = newBuyPrice * amount * tradingFee;
        const totalFees = entryFee + feeUSD;

        const netProfit = revenue - (newBuyPrice * amount) - totalFees;

        order.costBasis = newBuyPrice;
        order.spreadPct = spreadPct;
        order.profit = netProfit;
        order.matchType = "GRID_ESTIMATED";

        fixedCount++;
        console.log("Fixed #" + order.id + ": $" + oldProfit.toFixed(4) + " -> $" + netProfit.toFixed(4));
    }
}

if (fixedCount > 0) {
    fs.copyFileSync(STATE_FILE, STATE_FILE + ".bak_estimated_" + Date.now());
    
    const profitAfter = state.filledOrders
        .filter(function(o) { return o.side === "sell"; })
        .reduce(function(s, o) { return s + (o.profit || 0); }, 0);

    state.realizedProfit = profitAfter;
    state.totalProfit = profitAfter;
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

    console.log("Fixed " + fixedCount + " sells, new total: $" + profitAfter.toFixed(2));
} else {
    console.log("No non-GRID ESTIMATED sells to fix");
}
