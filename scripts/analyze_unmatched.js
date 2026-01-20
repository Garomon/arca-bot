const ccxt = require("ccxt");
const fs = require("fs");

const GRID_SPACING = { BTC: 0.005, SOL: 0.008, DOGE: 0.010 };

async function analyzeUnmatched() {
    const exchange = new ccxt.binance({
        apiKey: process.env.BINANCE_API_KEY,
        secret: process.env.BINANCE_SECRET,
        options: { defaultType: "spot" }
    });

    for (const pair of ["BTC", "SOL", "DOGE"]) {
        const symbol = pair + "/USDT";
        const spacing = GRID_SPACING[pair];
        
        const trades = await exchange.fetchMyTrades(symbol, undefined, 500);
        trades.sort((a, b) => a.timestamp - b.timestamp);
        
        const inventory = [];
        const unmatched = [];
        
        for (const t of trades) {
            if (t.side === "buy") {
                inventory.push({
                    price: t.price,
                    amount: t.amount,
                    remaining: t.amount,
                    timestamp: t.timestamp
                });
            } else {
                const sellPrice = t.price;
                const expectedBuyPrice = sellPrice / (1 + spacing);
                const tolerance = spacing * 0.5;
                
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
                    bestMatch.remaining -= Math.min(t.amount, bestMatch.remaining);
                } else {
                    // Find closest buy regardless of tolerance
                    let closestBuy = null;
                    let closestDiff = Infinity;
                    for (const lot of inventory) {
                        if (lot.remaining > 0) {
                            const diff = Math.abs(lot.price - expectedBuyPrice);
                            if (diff < closestDiff) {
                                closestDiff = diff;
                                closestBuy = lot;
                            }
                        }
                    }
                    
                    unmatched.push({
                        sellPrice: sellPrice,
                        expectedBuy: expectedBuyPrice,
                        closestBuy: closestBuy ? closestBuy.price : null,
                        date: new Date(t.timestamp).toISOString().split("T")[0]
                    });
                }
            }
        }
        
        if (unmatched.length > 0) {
            console.log("\n" + pair + " - " + unmatched.length + " sells sin match:");
            unmatched.slice(0, 5).forEach(u => {
                const diff = u.closestBuy ? ((u.closestBuy - u.expectedBuy) / u.expectedBuy * 100).toFixed(2) : "N/A";
                console.log("  " + u.date + ": Sell $" + u.sellPrice.toFixed(2) + " | Esperaba buy $" + u.expectedBuy.toFixed(2) + " | Closest: $" + (u.closestBuy ? u.closestBuy.toFixed(2) : "NONE") + " (" + diff + "% off)");
            });
            if (unmatched.length > 5) console.log("  ... y " + (unmatched.length - 5) + " mas");
        }
    }
}

analyzeUnmatched().catch(console.error);
