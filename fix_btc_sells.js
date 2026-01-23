const fs = require("fs");
const path = "data/sessions/VANTAGE01_BTCUSDT_state.json";
const state = JSON.parse(fs.readFileSync(path, "utf8"));

const GRID_SPACING = 0.005; // 0.5% for BTC
const TRADING_FEE = 0.00075;

state.filledOrders.forEach(order => {
  if (order.side !== "sell") return;
  if (order.spreadPct <= 0 || order.matchType === "UNMATCHED") {
    const sellPrice = order.price;
    const amount = order.amount;
    const estimatedBuyPrice = sellPrice / (1 + GRID_SPACING);
    const costBasis = estimatedBuyPrice;
    const sellRevenue = sellPrice * amount;
    const buyValue = costBasis * amount;
    const totalFees = (buyValue + sellRevenue) * TRADING_FEE;
    const netProfit = (sellRevenue - buyValue) - totalFees;
    const spreadPct = ((sellPrice - costBasis) / costBasis) * 100;
    
    console.log("FIXING BTC: Price " + sellPrice + " | Old cost: " + order.costBasis.toFixed(2) + " -> New: " + costBasis.toFixed(2) + " | Spread: " + spreadPct.toFixed(2) + "% | Profit: " + netProfit.toFixed(4));
    
    order.costBasis = costBasis;
    order.spreadPct = spreadPct;
    order.profit = netProfit;
    order.matchType = "GRID_ESTIMATED";
    if (order.matchedLots && order.matchedLots[0]) order.matchedLots[0].buyPrice = costBasis;
  }
});

fs.writeFileSync(path, JSON.stringify(state, null, 2));
console.log("BTC State saved!");
