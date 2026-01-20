const ccxt = require("ccxt");
const fs = require("fs");

const GRID_SPACING = { BTC: 0.005, SOL: 0.008, DOGE: 0.010 };

async function spreadMatchReal() {
    const exchange = new ccxt.binance({
        apiKey: process.env.BINANCE_API_KEY,
        secret: process.env.BINANCE_SECRET,
        options: { defaultType: "spot" }
    });

    console.log("=== SPREAD_MATCH CON DATOS REALES DE BINANCE ===\n");

    for (const pair of ["BTC", "SOL", "DOGE"]) {
        const symbol = pair + "/USDT";
        const spacing = GRID_SPACING[pair];
        
        const trades = await exchange.fetchMyTrades(symbol, undefined, 500);
        trades.sort((a, b) => a.timestamp - b.timestamp);
        
        // Build inventory of buys (lots)
        const inventory = [];
        let totalProfit = 0;
        let matchedSells = 0;
        let unmatchedSells = 0;
        
        for (const t of trades) {
            const feeUSD = t.fee ? (t.fee.currency === "USDT" ? t.fee.cost : t.fee.cost * 700) : 0;
            
            if (t.side === "buy") {
                inventory.push({
                    id: t.id,
                    price: t.price,
                    amount: t.amount,
                    remaining: t.amount,
                    fee: feeUSD,
                    timestamp: t.timestamp
                });
            } else {
                // SELL - find matching buy within grid spacing
                const sellPrice = t.price;
                const expectedBuyPrice = sellPrice / (1 + spacing);
                const tolerance = spacing * 0.5; // 50% tolerance
                
                // Find best matching buy (closest to expected price, with remaining amount)
                let bestMatch = null;
                let bestDiff = Infinity;
                
                for (const lot of inventory) {
                    if (lot.remaining <= 0) continue;
                    const priceDiff = Math.abs(lot.price - expectedBuyPrice) / expectedBuyPrice;
                    if (priceDiff < tolerance && priceDiff < bestDiff) {
                        bestMatch = lot;
                        bestDiff = priceDiff;
                    }
                }
                
                if (bestMatch) {
                    const matched = Math.min(t.amount, bestMatch.remaining);
                    const revenue = sellPrice * matched;
                    const cost = bestMatch.price * matched;
                    const profit = revenue - cost - feeUSD - (bestMatch.fee * matched / bestMatch.amount);
                    
                    totalProfit += profit;
                    bestMatch.remaining -= matched;
                    matchedSells++;
                } else {
                    // No matching buy found - this is a problem
                    unmatchedSells++;
                }
            }
        }
        
        console.log(pair + ":");
        console.log("  Sells matched: " + matchedSells);
        console.log("  Sells unmatched: " + unmatchedSells);
        console.log("  Total profit: $" + totalProfit.toFixed(2));
        console.log("");
    }
}

spreadMatchReal().catch(console.error);
