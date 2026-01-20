const ccxt = require("ccxt");
const fs = require("fs");

const GRID_SPACING = { BTC: 0.005, SOL: 0.008, DOGE: 0.010 };

async function spreadMatchTolerant() {
    const exchange = new ccxt.binance({
        apiKey: process.env.BINANCE_API_KEY,
        secret: process.env.BINANCE_SECRET,
        options: { defaultType: "spot" }
    });

    console.log("=== SPREAD_MATCH TOLERANTE (1.5x spacing) ===\n");
    let grandTotal = 0;

    for (const pair of ["BTC", "SOL", "DOGE"]) {
        const symbol = pair + "/USDT";
        const spacing = GRID_SPACING[pair];
        const tolerance = spacing * 1.5; // 1.5x tolerance
        
        const trades = await exchange.fetchMyTrades(symbol, undefined, 500);
        trades.sort((a, b) => a.timestamp - b.timestamp);
        
        const inventory = [];
        let totalProfit = 0;
        let matchedSells = 0;
        let unmatchedSells = 0;
        let totalFees = 0;
        
        for (const t of trades) {
            const feeUSD = t.fee ? (t.fee.currency === "USDT" ? t.fee.cost : t.fee.cost * 700) : 0;
            totalFees += feeUSD;
            
            if (t.side === "buy") {
                inventory.push({
                    price: t.price,
                    amount: t.amount,
                    remaining: t.amount,
                    fee: feeUSD
                });
            } else {
                const sellPrice = t.price;
                const minBuyPrice = sellPrice / (1 + tolerance);
                const maxBuyPrice = sellPrice / (1 - tolerance * 0.1); // small upper tolerance
                
                // Find best matching buy (price below sell, closest to expected)
                let bestMatch = null;
                let bestScore = -Infinity;
                
                for (const lot of inventory) {
                    if (lot.remaining <= 0) continue;
                    if (lot.price >= minBuyPrice && lot.price <= sellPrice) {
                        // Score = spread (higher is better, means more profit)
                        const spread = sellPrice - lot.price;
                        if (spread > bestScore) {
                            bestScore = spread;
                            bestMatch = lot;
                        }
                    }
                }
                
                if (bestMatch) {
                    const matched = Math.min(t.amount, bestMatch.remaining);
                    const revenue = sellPrice * matched;
                    const cost = bestMatch.price * matched;
                    const buyFee = bestMatch.fee * (matched / bestMatch.amount);
                    const profit = revenue - cost - feeUSD - buyFee;
                    
                    totalProfit += profit;
                    bestMatch.remaining -= matched;
                    matchedSells++;
                } else {
                    unmatchedSells++;
                }
            }
        }
        
        console.log(pair + ":");
        console.log("  Sells matched: " + matchedSells + " / " + (matchedSells + unmatchedSells));
        console.log("  Profit (neto): $" + totalProfit.toFixed(2));
        console.log("");
        grandTotal += totalProfit;
    }
    
    console.log("========================================");
    console.log("TOTAL REAL SPREAD_MATCH: $" + grandTotal.toFixed(2));
}

spreadMatchTolerant().catch(console.error);
