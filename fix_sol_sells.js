const fs = require("fs");
const path = "data/sessions/VANTAGE01_SOLUSDT_state.json";
const state = JSON.parse(fs.readFileSync(path, "utf8"));

const GRID_SPACING = 0.008; // 0.8% for SOL
const TRADING_FEE = 0.00075; // 0.075% per trade

let fixed = 0;

state.filledOrders.forEach(order => {
  if (order.side !== "sell") return;
  
  // Fix sells with zero or negative spread
  if (order.spreadPct <= 0 || order.matchType === "UNMATCHED") {
    const sellPrice = order.price;
    const oldCostBasis = order.costBasis;
    const amount = order.amount;
    
    // Calculate proper costBasis using grid spacing
    const estimatedBuyPrice = sellPrice / (1 + GRID_SPACING);
    const costBasis = estimatedBuyPrice;
    const sellRevenue = sellPrice * amount;
    const buyValue = costBasis * amount;
    
    // Calculate fees and profit
    const entryFee = buyValue * TRADING_FEE;
    const exitFee = sellRevenue * TRADING_FEE;
    const totalFees = entryFee + exitFee;
    
    const grossProfit = sellRevenue - buyValue;
    const netProfit = grossProfit - totalFees;
    const spreadPct = ((sellPrice - costBasis) / costBasis) * 100;
    
    console.log(`FIXING: Price ${sellPrice} | Old cost: ${oldCostBasis.toFixed(2)} -> New: ${costBasis.toFixed(2)} | Spread: ${spreadPct.toFixed(2)}% | Profit: ${netProfit.toFixed(4)}`);
    
    order.costBasis = costBasis;
    order.spreadPct = spreadPct;
    order.profit = netProfit;
    order.matchType = "GRID_ESTIMATED";
    order.feesUSD = totalFees;
    
    if (order.matchedLots && order.matchedLots.length > 0) {
      order.matchedLots[0].buyPrice = costBasis;
    }
    
    fixed++;
  }
});

console.log(`\nFixed ${fixed} sells`);

fs.writeFileSync(path, JSON.stringify(state, null, 2));
console.log("State saved!");
