const ccxt = require("ccxt");
const fs = require("fs");

const GRID_SPACING = { BTC: 0.005, SOL: 0.008, DOGE: 0.010 };

async function quantumAuditTemporal() {
    const exchange = new ccxt.binance({
        apiKey: process.env.BINANCE_API_KEY,
        secret: process.env.BINANCE_SECRET,
        options: { defaultType: "spot" }
    });

    console.log("╔════════════════════════════════════════════════════════════════╗");
    console.log("║   AUDITORIA CUANTICA TEMPORAL - SOLO BUYS ANTES DEL SELL       ║");
    console.log("╚════════════════════════════════════════════════════════════════╝");
    console.log("");

    let grandTotalProfit = 0;

    for (const pair of ["BTC", "SOL", "DOGE"]) {
        const symbol = pair + "/USDT";
        const spacing = GRID_SPACING[pair];
        
        console.log("════════════════════════════════════════════════════════════════");
        console.log("  " + pair + "/USDT - Grid Spacing: " + (spacing * 100) + "%");
        console.log("════════════════════════════════════════════════════════════════");
        
        const trades = await exchange.fetchMyTrades(symbol, undefined, 1000);
        trades.sort((a, b) => a.timestamp - b.timestamp);
        
        const buys = trades.filter(t => t.side === "buy");
        const sells = trades.filter(t => t.side === "sell");
        
        console.log("Total trades: " + trades.length + " (Buys: " + buys.length + ", Sells: " + sells.length + ")");
        console.log("");
        
        // Build inventory from buys (with remaining tracking)
        const inventory = [];
        for (const b of buys) {
            const feeUSD = b.fee ? (b.fee.currency === "USDT" ? b.fee.cost : b.fee.cost * 700) : 0;
            inventory.push({
                id: b.id,
                price: b.price,
                amount: b.amount,
                remaining: b.amount,
                feeUSD: feeUSD,
                timestamp: b.timestamp,
                date: new Date(b.timestamp).toISOString().split("T")[0]
            });
        }
        
        let pairProfit = 0;
        let matchedCount = 0;
        let unmatchedCount = 0;
        let negativeCount = 0;
        const tolerance = spacing * 1.5;
        
        console.log("DETALLE DE CADA SELL:");
        console.log("─────────────────────────────────────────────────────────────────");
        
        for (let i = 0; i < sells.length; i++) {
            const s = sells[i];
            const sellPrice = s.price;
            const sellAmount = s.amount;
            const sellFeeUSD = s.fee ? (s.fee.currency === "USDT" ? s.fee.cost : s.fee.cost * 700) : 0;
            const sellDate = new Date(s.timestamp).toISOString().split("T")[0];
            const minBuyPrice = sellPrice / (1 + tolerance);
            
            // CRITICAL: Only match with buys that happened BEFORE this sell
            let bestMatch = null;
            let bestSpread = -Infinity;
            
            for (const lot of inventory) {
                // TEMPORAL CHECK: Buy must be BEFORE sell
                if (lot.timestamp >= s.timestamp) continue;
                if (lot.remaining <= 0.00000001) continue;
                if (lot.price >= minBuyPrice && lot.price < sellPrice) {
                    const spread = sellPrice - lot.price;
                    if (spread > bestSpread) {
                        bestSpread = spread;
                        bestMatch = lot;
                    }
                }
            }
            
            let profit = 0;
            let status = "";
            let buyInfo = "";
            
            if (bestMatch) {
                const matched = Math.min(sellAmount, bestMatch.remaining);
                const revenue = sellPrice * matched;
                const cost = bestMatch.price * matched;
                const buyFee = bestMatch.feeUSD * (matched / bestMatch.amount);
                profit = revenue - cost - sellFeeUSD - buyFee;
                
                bestMatch.remaining -= matched;
                matchedCount++;
                if (profit < 0) negativeCount++;
                status = profit >= 0 ? "MATCHED" : "MATCHED (LOSS)";
                buyInfo = "Buy @ $" + bestMatch.price.toFixed(4) + " (" + bestMatch.date + ")";
                pairProfit += profit;
            } else {
                unmatchedCount++;
                status = "UNMATCHED";
                buyInfo = "No buy found before this sell within tolerance";
            }
            
            const num = (i + 1).toString().padStart(3, " ");
            console.log(num + ". " + sellDate + " | SELL @ $" + sellPrice.toFixed(4) + " x " + sellAmount.toFixed(6));
            console.log("     " + status + " -> " + buyInfo);
            console.log("     Profit: $" + profit.toFixed(4));
            console.log("");
        }
        
        console.log("─────────────────────────────────────────────────────────────────");
        console.log("RESUMEN " + pair + ":");
        console.log("  Sells matched: " + matchedCount + " / " + sells.length);
        console.log("  Sells unmatched: " + unmatchedCount);
        console.log("  Sells with loss: " + negativeCount);
        console.log("  PROFIT: $" + pairProfit.toFixed(4));
        console.log("");
        
        grandTotalProfit += pairProfit;
    }
    
    console.log("╔════════════════════════════════════════════════════════════════╗");
    console.log("║  PROFIT TOTAL REAL: $" + grandTotalProfit.toFixed(4).padStart(10, " ") + "                           ║");
    console.log("╚════════════════════════════════════════════════════════════════╝");
}

quantumAuditTemporal().catch(console.error);
