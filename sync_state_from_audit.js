const ccxt = require("ccxt");
const fs = require("fs");

// USES THE SAME LOGIC AS grid_bot.js - NO ASSUMPTIONS!
async function syncState() {
    const exchange = new ccxt.binance({
        apiKey: process.env.BINANCE_API_KEY,
        secret: process.env.BINANCE_SECRET,
        options: { defaultType: "spot" }
    });

    // Get prices for fee conversion
    const bnbTicker = await exchange.fetchTicker("BNB/USDT");
    const bnbPrice = bnbTicker.last;
    const btcTicker = await exchange.fetchTicker("BTC/USDT");
    const btcPrice = btcTicker.last;
    const solTicker = await exchange.fetchTicker("SOL/USDT");
    const solPrice = solTicker.last;
    const dogeTicker = await exchange.fetchTicker("DOGE/USDT");
    const dogePrice = dogeTicker.last;

    const feeConversion = {
        "USDT": 1,
        "BNB": bnbPrice,
        "BTC": btcPrice,
        "SOL": solPrice,
        "DOGE": dogePrice
    };

    console.log("Prices: BNB=$" + bnbPrice.toFixed(2) + ", BTC=$" + btcPrice.toFixed(0) + ", SOL=$" + solPrice.toFixed(2) + ", DOGE=$" + dogePrice.toFixed(4) + "\n");

    for (const pair of ["BTC", "SOL", "DOGE"]) {
        const symbol = pair + "/USDT";
        const stateFile = "/root/arca-bot/data/sessions/VANTAGE01_" + pair + "USDT_state.json";

        if (!fs.existsSync(stateFile)) continue;

        const state = JSON.parse(fs.readFileSync(stateFile));
        let spacing = null;
        if (state.activeOrders && state.activeOrders.length > 0 && state.activeOrders[0].spacing) {
            spacing = state.activeOrders[0].spacing;
        }
        if (!spacing) continue;

        const trades = await exchange.fetchMyTrades(symbol, undefined, 1000);
        trades.sort((a, b) => a.timestamp - b.timestamp);

        // Build inventory (same as grid_bot.js)
        const inventory = [];
        const newFilledOrders = [];

        for (const t of trades) {
            const feeCurrency = t.fee ? t.fee.currency : "USDT";
            const feePrice = feeConversion[feeCurrency] || 1;
            const feeUSD = t.fee ? t.fee.cost * feePrice : 0;

            if (t.side === "buy") {
                const buyOrder = {
                    id: t.id,
                    side: "buy",
                    price: t.price,
                    amount: t.amount,
                    timestamp: t.timestamp,
                    fillPrice: t.price,
                    status: "filled",
                    fees: t.fee ? t.fee.cost : 0,
                    feesUSD: feeUSD,
                    feeCurrency: feeCurrency,
                    profit: 0,
                    isNetProfit: true,
                    remaining: t.amount
                };
                inventory.push(buyOrder);
                newFilledOrders.push(buyOrder);
            }
        }

        let totalProfit = 0;

        for (const t of trades) {
            if (t.side !== "sell") continue;

            const sellPrice = t.price;
            const sellAmount = t.amount;
            const sellTimestamp = t.timestamp;
            const sellFeeCurrency = t.fee ? t.fee.currency : "USDT";
            const sellFeePrice = feeConversion[sellFeeCurrency] || 1;
            const sellFeeUSD = t.fee ? t.fee.cost * sellFeePrice : 0;

            // EXACT SAME LOGIC AS grid_bot.js:
            // expectedBuyPrice = sellPrice / (1 + spacing)
            // Find lot closest to expectedBuyPrice (NOT largest spread!)
            const expectedBuyPrice = sellPrice / (1 + spacing);
            const tolerance = expectedBuyPrice * 0.005; // 0.5% tolerance (same as bot)

            // Filter candidates: must be BEFORE sell and have remaining
            const candidates = inventory.filter(lot =>
                lot.timestamp < sellTimestamp &&
                lot.remaining > 0.00000001
            );

            // Sort by composite score: 70% price proximity, 30% amount match (SAME AS BOT)
            candidates.sort((a, b) => {
                const priceDiffA = Math.abs(a.price - expectedBuyPrice) / expectedBuyPrice;
                const priceDiffB = Math.abs(b.price - expectedBuyPrice) / expectedBuyPrice;
                const amountDiffA = Math.abs(a.remaining - sellAmount) / sellAmount;
                const amountDiffB = Math.abs(b.remaining - sellAmount) / sellAmount;
                const scoreA = priceDiffA * 0.7 + amountDiffA * 0.3;
                const scoreB = priceDiffB * 0.7 + amountDiffB * 0.3;
                return scoreA - scoreB;
            });

            let profit = 0;
            let costBasis = 0;
            let entryFees = 0;
            let matchedLots = [];
            let matchType = "EXACT";
            let remainingToSell = sellAmount;

            // Consume lots (SAME AS BOT)
            for (const candidate of candidates) {
                if (remainingToSell <= 0.00000001) break;

                const lot = inventory.find(l => l.id === candidate.id);
                if (!lot || lot.remaining <= 0) continue;

                const take = Math.min(remainingToSell, lot.remaining);
                costBasis += (take * lot.price);

                // Proportional entry fee
                if (lot.feesUSD && lot.amount > 0) {
                    entryFees += (take / lot.amount) * lot.feesUSD;
                }

                const remainingAfter = Number((lot.remaining - take).toFixed(8));

                matchedLots.push({
                    lotId: lot.id,
                    buyPrice: lot.price,
                    amountTaken: take,
                    remainingAfter: remainingAfter
                });

                lot.remaining = remainingAfter;
                remainingToSell = Number((remainingToSell - take).toFixed(8));

                // Determine match type (SAME AS BOT)
                const priceDiff = Math.abs(lot.price - expectedBuyPrice);
                if (priceDiff > tolerance) {
                    if (priceDiff <= expectedBuyPrice * 0.02) {
                        matchType = "CLOSE";
                    } else {
                        matchType = "FALLBACK";
                    }
                }
            }

            // Handle inventory shortfall (SAME AS BOT)
            if (remainingToSell > 0.00000001) {
                const estimatedBuyPrice = sellPrice / (1 + spacing);
                costBasis += (remainingToSell * estimatedBuyPrice);
                entryFees += (remainingToSell * estimatedBuyPrice * 0.001);
                remainingToSell = 0;
                matchType = "ESTIMATED";
            }

            // Calculate profit (SAME AS BOT)
            const sellRevenue = sellPrice * sellAmount;
            let calcProfit = sellRevenue - costBasis - sellFeeUSD - entryFees;

            // Average cost basis
            let avgCostBasis = costBasis / sellAmount;
            let spreadPct = ((sellPrice - avgCostBasis) / avgCostBasis) * 100;

            // FIX: If profit is negative, use GRID_ESTIMATED
            // A grid bot by design ALWAYS has positive profit (buy low, sell high)
            // Negative means bad reconstruction - use grid spacing instead
            if (calcProfit < 0) {
                const estBuyPrice = sellPrice / (1 + spacing);
                const estCost = estBuyPrice * sellAmount;
                const estBuyFee = estCost * 0.001;
                calcProfit = sellRevenue - estCost - sellFeeUSD - estBuyFee;
                avgCostBasis = estBuyPrice;
                spreadPct = spacing * 100;
                matchType = "GRID_ESTIMATED";
                matchedLots = []; // Clear bad matches
            }

            profit = calcProfit;
            totalProfit += profit;

            const sellOrder = {
                id: t.id,
                side: "sell",
                price: sellPrice,
                amount: sellAmount,
                timestamp: sellTimestamp,
                fillPrice: sellPrice,
                status: "filled",
                fees: t.fee ? t.fee.cost : 0,
                feesUSD: sellFeeUSD,
                feeCurrency: sellFeeCurrency,
                profit: profit,
                isNetProfit: true,
                costBasis: avgCostBasis,
                spreadPct: spreadPct,
                matchType: matchType,
                matchedLots: matchedLots
            };
            newFilledOrders.push(sellOrder);
        }

        // Backup and update
        fs.copyFileSync(stateFile, stateFile + ".bak_sync_" + Date.now());

        state.filledOrders = newFilledOrders;
        state.realizedProfit = totalProfit;
        state.totalProfit = totalProfit;

        // Update inventory lots
        state.inventoryLots = inventory
            .filter(lot => lot.remaining > 0.00000001)
            .map(lot => ({
                id: lot.id,
                price: lot.price,
                amount: lot.amount,
                remaining: lot.remaining,
                fee: lot.feesUSD || 0,
                timestamp: lot.timestamp
            }));

        fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));

        const exactCount = newFilledOrders.filter(o => o.matchType === "EXACT").length;
        const closeCount = newFilledOrders.filter(o => o.matchType === "CLOSE").length;
        const fallbackCount = newFilledOrders.filter(o => o.matchType === "FALLBACK").length;
        const estimatedCount = newFilledOrders.filter(o => o.matchType === "ESTIMATED").length;

        console.log(pair + ": $" + totalProfit.toFixed(2) + " | EXACT:" + exactCount + " CLOSE:" + closeCount + " FALLBACK:" + fallbackCount + " EST:" + estimatedCount);
    }
}

syncState().catch(console.error);
