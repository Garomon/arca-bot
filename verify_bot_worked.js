require('dotenv').config();
const ccxt = require("ccxt");

/**
 * VERIFY (not assume) that the bot worked correctly
 * For each SELL, find the BUY that triggered it and verify:
 * 1. Buy happened BEFORE sell
 * 2. Sell price > Buy price
 * 3. Spread is approximately equal to grid spacing
 */
async function verifyBotWorked() {
    const exchange = new ccxt.binance({
        apiKey: process.env.BINANCE_API_KEY,
        secret: process.env.BINANCE_SECRET,
        options: { defaultType: "spot" }
    });

    console.log("=== VERIFICACION: El bot funcionó correctamente? ===\n");
    console.log("Criterios de verificación:");
    console.log("  1. Cada SELL debe tener un BUY anterior");
    console.log("  2. Precio de SELL > Precio de BUY");
    console.log("  3. Spread real ≈ Grid spacing esperado\n");

    const EXPECTED_SPACING = { BTC: 0.005, SOL: 0.008, DOGE: 0.010 };
    const TOLERANCE = 0.02; // 2% tolerance for spread verification

    let totalVerified = 0;
    let totalFailed = 0;
    let totalProfit = 0;

    for (const pair of ["BTC", "SOL", "DOGE"]) {
        const symbol = pair + "/USDT";
        const spacing = EXPECTED_SPACING[pair];

        console.log("========================================");
        console.log("  " + pair + "/USDT - Expected spacing: " + (spacing * 100) + "%");
        console.log("========================================\n");

        const trades = await exchange.fetchMyTrades(symbol, undefined, 1000);
        trades.sort((a, b) => a.timestamp - b.timestamp);

        const buys = [];
        const sells = [];

        for (const t of trades) {
            if (t.side === "buy") {
                buys.push({
                    id: t.id,
                    price: t.price,
                    amount: t.amount,
                    timestamp: t.timestamp,
                    date: new Date(t.timestamp).toISOString().slice(0, 19),
                    used: false
                });
            } else {
                sells.push({
                    id: t.id,
                    price: t.price,
                    amount: t.amount,
                    timestamp: t.timestamp,
                    date: new Date(t.timestamp).toISOString().slice(0, 19)
                });
            }
        }

        console.log("Total BUYs: " + buys.length + " | Total SELLs: " + sells.length + "\n");

        let pairVerified = 0;
        let pairFailed = 0;
        let pairProfit = 0;

        for (const sell of sells) {
            // Find the buy that most likely triggered this sell
            // Criteria: happened BEFORE sell, price close to sellPrice/(1+spacing)
            const expectedBuyPrice = sell.price / (1 + spacing);

            // Find best matching buy (closest to expected price, not yet used, before sell)
            let bestBuy = null;
            let bestScore = Infinity;

            for (const buy of buys) {
                if (buy.timestamp >= sell.timestamp) continue; // Must be BEFORE
                if (buy.used) continue; // Already matched

                const priceDiff = Math.abs(buy.price - expectedBuyPrice) / expectedBuyPrice;
                const amountDiff = Math.abs(buy.amount - sell.amount) / sell.amount;
                const score = priceDiff * 0.7 + amountDiff * 0.3;

                if (score < bestScore) {
                    bestScore = score;
                    bestBuy = buy;
                }
            }

            if (bestBuy) {
                bestBuy.used = true;

                const actualSpread = (sell.price - bestBuy.price) / bestBuy.price;
                const spreadDiff = Math.abs(actualSpread - spacing) / spacing;
                const isCorrect = sell.price > bestBuy.price && spreadDiff < TOLERANCE;

                const profit = (sell.price - bestBuy.price) * Math.min(sell.amount, bestBuy.amount);
                const fees = profit * 0.002; // Approximate 0.2% total fees
                const netProfit = profit - fees;

                if (isCorrect) {
                    pairVerified++;
                    pairProfit += netProfit;
                    console.log("✅ SELL " + sell.id.slice(-6) + " @ $" + sell.price.toFixed(2));
                    console.log("   BUY  " + bestBuy.id.slice(-6) + " @ $" + bestBuy.price.toFixed(2));
                    console.log("   Spread: " + (actualSpread * 100).toFixed(3) + "% (expected " + (spacing * 100) + "%)");
                    console.log("   Profit: $" + netProfit.toFixed(4) + "\n");
                } else {
                    pairFailed++;
                    console.log("⚠️  SELL " + sell.id.slice(-6) + " @ $" + sell.price.toFixed(2));
                    console.log("   BUY  " + bestBuy.id.slice(-6) + " @ $" + bestBuy.price.toFixed(2));
                    console.log("   Spread: " + (actualSpread * 100).toFixed(3) + "% (expected " + (spacing * 100) + "%)");
                    console.log("   ISSUE: Spread differs by " + (spreadDiff * 100).toFixed(1) + "% from expected\n");

                    // Still count profit if sell > buy
                    if (sell.price > bestBuy.price) {
                        pairProfit += netProfit;
                    }
                }
            } else {
                pairFailed++;
                console.log("❌ SELL " + sell.id.slice(-6) + " @ $" + sell.price.toFixed(2));
                console.log("   NO MATCHING BUY FOUND (all buys already used or after sell)\n");
            }
        }

        console.log("--- RESUMEN " + pair + " ---");
        console.log("  Verificados: " + pairVerified + "/" + sells.length);
        console.log("  Con issues:  " + pairFailed);
        console.log("  Profit:      $" + pairProfit.toFixed(4));
        console.log("\n");

        totalVerified += pairVerified;
        totalFailed += pairFailed;
        totalProfit += pairProfit;
    }

    console.log("========================================");
    console.log("  RESULTADO FINAL");
    console.log("========================================");
    console.log("  Total verificados: " + totalVerified);
    console.log("  Total con issues:  " + totalFailed);
    console.log("  Profit verificado: $" + totalProfit.toFixed(2));
    console.log("");

    if (totalFailed === 0) {
        console.log("✅ CONCLUSION: El bot funcionó 100% correctamente");
        console.log("   Todos los sells tienen un buy correspondiente con spread correcto");
    } else if (totalFailed < totalVerified * 0.1) {
        console.log("✅ CONCLUSION: El bot funcionó correctamente (>90% verificado)");
        console.log("   Los issues pueden ser por reconstrucción imperfecta");
    } else {
        console.log("⚠️  CONCLUSION: Hay discrepancias significativas");
        console.log("   Revisar manualmente los trades con issues");
    }
}

verifyBotWorked().catch(console.error);
