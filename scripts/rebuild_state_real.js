const ccxt = require("ccxt");
const fs = require("fs");

const GRID_SPACING = { BTC: 0.005, SOL: 0.008, DOGE: 0.010 };

async function rebuildState() {
    const exchange = new ccxt.binance({
        apiKey: process.env.BINANCE_API_KEY,
        secret: process.env.BINANCE_SECRET,
        options: { defaultType: "spot" }
    });

    console.log("=== REBUILD STATE WITH REAL BINANCE DATA ===\n");

    for (const pair of ["BTC", "SOL", "DOGE"]) {
        const symbol = pair + "/USDT";
        const spacing = GRID_SPACING[pair];
        const tolerance = spacing * 1.5;
        const stateFile = "/root/arca-bot/data/sessions/VANTAGE01_" + pair + "USDT_state.json";

        if (!fs.existsSync(stateFile)) continue;

        // Backup
        fs.copyFileSync(stateFile, stateFile + ".bak_rebuild_" + Date.now());

        const state = JSON.parse(fs.readFileSync(stateFile));
        const trades = await exchange.fetchMyTrades(symbol, undefined, 500);
        trades.sort((a, b) => a.timestamp - b.timestamp);

        // Build new filledOrders from real trades
        const inventory = [];
        const newFilledOrders = [];
        let totalProfit = 0;

        for (const t of trades) {
            const feeUSD = t.fee ? (t.fee.currency === "USDT" ? t.fee.cost : t.fee.cost * 700) : 0;
            const feeBNB = t.fee && t.fee.currency !== "USDT" ? t.fee.cost : feeUSD / 700;

            if (t.side === "buy") {
                const buyOrder = {
                    id: t.id,
                    side: "buy",
                    price: t.price,
                    amount: t.amount,
                    timestamp: t.timestamp,
                    fillPrice: t.price,
                    status: "filled",
                    fees: feeBNB,
                    feesUSD: feeUSD,
                    feeCurrency: t.fee ? t.fee.currency : "BNB",
                    profit: 0,
                    isNetProfit: true,
                    remaining: t.amount
                };
                inventory.push(buyOrder);
                newFilledOrders.push(buyOrder);
            } else {
                const sellPrice = t.price;
                const minBuyPrice = sellPrice / (1 + tolerance);

                // Find best matching buy
                let bestMatch = null;
                let bestSpread = -Infinity;

                for (const lot of inventory) {
                    if ((lot.remaining || 0) <= 0) continue;
                    if (lot.price >= minBuyPrice && lot.price < sellPrice) {
                        const spread = sellPrice - lot.price;
                        if (spread > bestSpread) {
                            bestSpread = spread;
                            bestMatch = lot;
                        }
                    }
                }

                let profit = 0;
                let matchType = "UNMATCHED";
                let costBasis = null;
                let spreadPct = 0;
                let matchedLots = [];

                if (bestMatch) {
                    const matched = Math.min(t.amount, bestMatch.remaining);
                    const revenue = sellPrice * matched;
                    const cost = bestMatch.price * matched;
                    const buyFee = (bestMatch.feesUSD || 0) * (matched / bestMatch.amount);
                    profit = revenue - cost - feeUSD - buyFee;

                    matchType = "SPREAD_MATCH";
                    costBasis = bestMatch.price;
                    spreadPct = ((sellPrice - bestMatch.price) / bestMatch.price) * 100;
                    matchedLots = [{
                        lotId: bestMatch.id,
                        buyPrice: bestMatch.price,
                        amountTaken: matched,
                        remainingAfter: bestMatch.remaining - matched
                    }];

                    bestMatch.remaining -= matched;
                    totalProfit += profit;
                }

                const sellOrder = {
                    id: t.id,
                    side: "sell",
                    price: sellPrice,
                    amount: t.amount,
                    timestamp: t.timestamp,
                    fillPrice: sellPrice,
                    status: "filled",
                    fees: feeBNB,
                    feesUSD: feeUSD,
                    feeCurrency: t.fee ? t.fee.currency : "BNB",
                    profit: profit,
                    isNetProfit: true,
                    costBasis: costBasis,
                    spreadPct: spreadPct,
                    matchType: matchType,
                    matchedLots: matchedLots
                };
                newFilledOrders.push(sellOrder);
            }
        }

        // Update state
        state.filledOrders = newFilledOrders;
        state.realizedProfit = totalProfit;
        state.totalProfit = totalProfit;

        // Rebuild inventory lots from unmatched buys
        state.inventoryLots = inventory
            .filter(lot => (lot.remaining || 0) > 0.00000001)
            .map(lot => ({
                id: lot.id,
                price: lot.price,
                amount: lot.amount,
                remaining: lot.remaining,
                fee: lot.feesUSD || 0,
                timestamp: lot.timestamp
            }));

        fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));

        const matched = newFilledOrders.filter(o => o.side === "sell" && o.matchType === "SPREAD_MATCH").length;
        const unmatched = newFilledOrders.filter(o => o.side === "sell" && o.matchType === "UNMATCHED").length;

        console.log(pair + ":");
        console.log("  Total trades: " + trades.length);
        console.log("  Sells matched: " + matched + ", unmatched: " + unmatched);
        console.log("  Profit: $" + totalProfit.toFixed(2));
        console.log("  Inventory lots remaining: " + state.inventoryLots.length);
        console.log("");
    }

    console.log("State files rebuilt successfully!");
}

rebuildState().catch(console.error);
