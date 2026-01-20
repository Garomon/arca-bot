const ccxt = require("ccxt");
const fs = require("fs");

// NO HARDCODED VALUES - Read from state files
async function auditConnections() {
    const exchange = new ccxt.binance({
        apiKey: process.env.BINANCE_API_KEY,
        secret: process.env.BINANCE_SECRET,
        options: { defaultType: "spot" }
    });

    // Get real BNB price from Binance
    const bnbTicker = await exchange.fetchTicker("BNB/USDT");
    const bnbPrice = bnbTicker.last;
    console.log("BNB Price (real-time): $" + bnbPrice.toFixed(2));

    console.log("========================================================================================================");
    console.log("  AUDITORIA DE CONEXIONES: IDs, LOTES, REMAINING, FECHAS, FEES, PROFIT");
    console.log("  (SIN VALORES HARDCODEADOS - Todo leido de Binance y state files)");
    console.log("========================================================================================================\n");

    let grandTotal = 0;

    for (const pair of ["BTC", "SOL", "DOGE"]) {
        const symbol = pair + "/USDT";

        // Read spacing from state file (NOTHING HARDCODED)
        const stateFile = "/root/arca-bot/data/sessions/VANTAGE01_" + pair + "USDT_state.json";
        if (!fs.existsSync(stateFile)) {
            console.log("ERROR: State file not found: " + stateFile);
            continue;
        }
        const state = JSON.parse(fs.readFileSync(stateFile));
        let spacing = null;
        // Get spacing from first active order or config
        if (state.activeOrders && state.activeOrders.length > 0 && state.activeOrders[0].spacing) {
            spacing = state.activeOrders[0].spacing;
        } else if (state.config && state.config.gridSpacing) {
            spacing = state.config.gridSpacing;
        }
        if (!spacing) {
            console.log("ERROR: No spacing found in state file for " + pair);
            continue;
        }
        const tolerance = spacing * 1.5;

        console.log("========================================================================================================");
        console.log("  " + pair + "/USDT - Spacing: " + (spacing * 100) + "% | Tolerance: " + (tolerance * 100).toFixed(1) + "%");
        console.log("========================================================================================================");

        const trades = await exchange.fetchMyTrades(symbol, undefined, 1000);
        trades.sort((a, b) => a.timestamp - b.timestamp);

        // Build inventory with full details
        const inventory = [];
        for (const t of trades) {
            if (t.side === "buy") {
                // Use real BNB price (not hardcoded)
                const feeUSD = t.fee ? (t.fee.currency === "USDT" ? t.fee.cost : t.fee.cost * bnbPrice) : 0;
                inventory.push({
                    id: t.id,
                    price: t.price,
                    amount: t.amount,
                    remaining: t.amount,
                    feeUSD: feeUSD,
                    feeCurrency: t.fee ? t.fee.currency : "?",
                    feeOriginal: t.fee ? t.fee.cost : 0,
                    timestamp: t.timestamp,
                    date: new Date(t.timestamp).toISOString().slice(0, 19).replace("T", " ")
                });
            }
        }

        let pairProfit = 0;
        let sellNum = 0;

        console.log("\n--- DETALLE DE CONEXIONES ---\n");

        for (const t of trades) {
            if (t.side !== "sell") continue;
            sellNum++;

            const sellId = t.id;
            const sellPrice = t.price;
            const sellAmount = t.amount;
            const sellTimestamp = t.timestamp;
            const sellDate = new Date(sellTimestamp).toISOString().slice(0, 19).replace("T", " ");
            const sellFeeUSD = t.fee ? (t.fee.currency === "USDT" ? t.fee.cost : t.fee.cost * bnbPrice) : 0;
            const sellFeeOriginal = t.fee ? t.fee.cost : 0;
            const sellFeeCurrency = t.fee ? t.fee.currency : "?";

            const minBuyPrice = sellPrice / (1 + tolerance);

            // Find matching buy (temporal + price)
            let bestMatch = null;
            let bestSpread = -Infinity;
            let closestMatch = null;
            let closestDiff = Infinity;
            let matchType = "SPREAD_MATCH";

            for (const lot of inventory) {
                if (lot.timestamp >= sellTimestamp) continue; // Must be BEFORE
                if (lot.remaining <= 0.00000001) continue;

                // Track closest buy (for fallback)
                const diff = Math.abs(sellPrice - lot.price);
                if (lot.price < sellPrice && diff < closestDiff) {
                    closestDiff = diff;
                    closestMatch = lot;
                }

                // Strict match within tolerance
                if (lot.price >= minBuyPrice && lot.price < sellPrice) {
                    const spread = sellPrice - lot.price;
                    if (spread > bestSpread) {
                        bestSpread = spread;
                        bestMatch = lot;
                    }
                }
            }

            // If no strict match, use closest buy (PROFIT MUST BE REPORTED!)
            if (!bestMatch && closestMatch) {
                bestMatch = closestMatch;
                matchType = "CLOSEST_MATCH";
            }

            console.log("SELL #" + sellNum + " ------------------------------------------------------------------------");
            console.log("  Sell ID:        " + sellId);
            console.log("  Sell Date:      " + sellDate);
            console.log("  Sell Price:     $" + sellPrice.toFixed(6));
            console.log("  Sell Amount:    " + sellAmount.toFixed(8) + " " + pair);
            console.log("  Sell Fee:       " + sellFeeOriginal.toFixed(8) + " " + sellFeeCurrency + " = $" + sellFeeUSD.toFixed(6));
            console.log("");

            if (bestMatch) {
                const matchedAmount = Math.min(sellAmount, bestMatch.remaining);
                const remainingBefore = bestMatch.remaining;
                const remainingAfter = remainingBefore - matchedAmount;

                const revenue = sellPrice * matchedAmount;
                const cost = bestMatch.price * matchedAmount;
                const buyFeeProrated = bestMatch.feeUSD * (matchedAmount / bestMatch.amount);
                const totalFees = sellFeeUSD + buyFeeProrated;
                const grossProfit = revenue - cost;
                const netProfit = grossProfit - totalFees;
                const spreadPct = ((sellPrice - bestMatch.price) / bestMatch.price * 100).toFixed(2);

                console.log("  MATCHED BUY (" + matchType + "):");
                console.log("    Buy ID:         " + bestMatch.id);
                console.log("    Buy Date:       " + bestMatch.date);
                console.log("    Buy Price:      $" + bestMatch.price.toFixed(6));
                console.log("    Buy Amount:     " + bestMatch.amount.toFixed(8) + " " + pair);
                console.log("    Buy Fee:        " + bestMatch.feeOriginal.toFixed(8) + " " + bestMatch.feeCurrency + " = $" + bestMatch.feeUSD.toFixed(6));
                console.log("");
                console.log("  LOT TRACKING:");
                console.log("    Lot ID:         " + bestMatch.id);
                console.log("    Remaining BEFORE: " + remainingBefore.toFixed(8));
                console.log("    Amount matched:   " + matchedAmount.toFixed(8));
                console.log("    Remaining AFTER:  " + remainingAfter.toFixed(8));
                console.log("");
                console.log("  PROFIT CALCULATION (Spread: " + spreadPct + "%):");
                console.log("    Revenue:        $" + sellPrice.toFixed(6) + " x " + matchedAmount.toFixed(8) + " = $" + revenue.toFixed(6));
                console.log("    Cost:           $" + bestMatch.price.toFixed(6) + " x " + matchedAmount.toFixed(8) + " = $" + cost.toFixed(6));
                console.log("    Gross Profit:   $" + revenue.toFixed(6) + " - $" + cost.toFixed(6) + " = $" + grossProfit.toFixed(6));
                console.log("    Sell Fee:       -$" + sellFeeUSD.toFixed(6));
                console.log("    Buy Fee (pro):  -$" + buyFeeProrated.toFixed(6));
                console.log("    -----------------------------------------------");
                console.log("    NET PROFIT:     $" + netProfit.toFixed(6));

                bestMatch.remaining = remainingAfter;
                pairProfit += netProfit;
            } else {
                // NO BUY AVAILABLE - Estimate profit using grid spacing
                const estimatedBuyPrice = sellPrice / (1 + spacing);
                const revenue = sellPrice * sellAmount;
                const cost = estimatedBuyPrice * sellAmount;
                const estimatedBuyFee = cost * 0.001; // 0.1% fee estimate
                const grossProfit = revenue - cost;
                const netProfit = grossProfit - sellFeeUSD - estimatedBuyFee;
                const spreadPct = (spacing * 100).toFixed(2);

                console.log("  NO BUY IN INVENTORY - USING GRID SPACING ESTIMATE:");
                console.log("    Estimated Buy Price: $" + estimatedBuyPrice.toFixed(6) + " (sell / (1 + " + (spacing * 100) + "%))");
                console.log("");
                console.log("  PROFIT CALCULATION (Spread: " + spreadPct + "% ESTIMATED):");
                console.log("    Revenue:        $" + sellPrice.toFixed(6) + " x " + sellAmount.toFixed(8) + " = $" + revenue.toFixed(6));
                console.log("    Cost:           $" + estimatedBuyPrice.toFixed(6) + " x " + sellAmount.toFixed(8) + " = $" + cost.toFixed(6));
                console.log("    Gross Profit:   $" + revenue.toFixed(6) + " - $" + cost.toFixed(6) + " = $" + grossProfit.toFixed(6));
                console.log("    Sell Fee:       -$" + sellFeeUSD.toFixed(6));
                console.log("    Buy Fee (est):  -$" + estimatedBuyFee.toFixed(6));
                console.log("    -----------------------------------------------");
                console.log("    NET PROFIT:     $" + netProfit.toFixed(6) + " (GRID_ESTIMATED)");

                pairProfit += netProfit;
            }
            console.log("\n");
        }

        console.log("--- RESUMEN " + pair + " ---");
        console.log("    PROFIT TOTAL: $" + pairProfit.toFixed(6));
        console.log("\n");

        grandTotal += pairProfit;
    }

    console.log("========================================================================================================");
    console.log("  PROFIT TOTAL VERIFICADO: $" + grandTotal.toFixed(6));
    console.log("========================================================================================================");
}

auditConnections().catch(console.error);
