require("dotenv").config();
const ccxt = require("ccxt");
const fs = require("fs");

/**
 * RECONSTRUIR INVENTARIO DESDE BINANCE
 *
 * Este script reconstruye el inventario desde cero usando los trades de Binance.
 * Actualiza AMBOS arrays: 'inventory' (usado por dashboard) e 'inventoryLots'
 *
 * Lógica: Usa el mismo algoritmo que grid_bot.js
 * - Para cada SELL, encuentra el BUY correspondiente usando expectedBuyPrice = sellPrice / (1 + spacing)
 * - Descuenta el remaining del lot
 * - Al final, los lots con remaining > 0 son el inventario actual
 */

async function rebuildInventory() {
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

    console.log("═══════════════════════════════════════════════════════════════");
    console.log("  RECONSTRUCCION DE INVENTARIO DESDE BINANCE");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("Precios: BNB=$" + bnbPrice.toFixed(2) + ", BTC=$" + btcPrice.toFixed(0) + ", SOL=$" + solPrice.toFixed(2) + ", DOGE=$" + dogePrice.toFixed(4) + "\n");

    for (const pair of ["BTC", "SOL", "DOGE"]) {
        const symbol = pair + "/USDT";
        const stateFile = "/root/arca-bot/data/sessions/VANTAGE01_" + pair + "USDT_state.json";

        if (!fs.existsSync(stateFile)) {
            console.log("⚠️  " + pair + ": State file not found, skipping");
            continue;
        }

        const state = JSON.parse(fs.readFileSync(stateFile));

        // Get spacing from state
        let spacing = null;
        if (state.activeOrders && state.activeOrders.length > 0 && state.activeOrders[0].spacing) {
            spacing = state.activeOrders[0].spacing;
        } else if (state.config && state.config.gridSpacing) {
            spacing = state.config.gridSpacing;
        }

        if (!spacing) {
            console.log("⚠️  " + pair + ": No spacing found, skipping");
            continue;
        }

        console.log("───────────────────────────────────────────────────────────────");
        console.log("  " + pair + "/USDT - Grid spacing: " + (spacing * 100) + "%");
        console.log("───────────────────────────────────────────────────────────────");

        // Fetch all trades from Binance
        const trades = await exchange.fetchMyTrades(symbol, undefined, 1000);
        trades.sort((a, b) => a.timestamp - b.timestamp);

        const buys = trades.filter(t => t.side === "buy");
        const sells = trades.filter(t => t.side === "sell");

        console.log("  Trades de Binance: " + buys.length + " BUYs, " + sells.length + " SELLs");

        // Store old counts for comparison
        const oldInventory = state.inventory || [];
        const oldLots = state.inventoryLots || [];

        // Build inventory from buys
        const inventory = [];
        for (const t of buys) {
            const feeCurrency = t.fee ? t.fee.currency : "USDT";
            const feePrice = feeConversion[feeCurrency] || 1;
            const feeUSD = t.fee ? t.fee.cost * feePrice : 0;

            inventory.push({
                id: t.id,
                orderId: t.id,
                side: "buy",
                price: t.price,
                fillPrice: t.price,
                amount: t.amount,
                remaining: t.amount,
                timestamp: t.timestamp,
                status: "filled",
                fees: t.fee ? t.fee.cost : 0,
                feesUSD: feeUSD,
                feeCurrency: feeCurrency
            });
        }

        let totalProfit = 0;
        const filledOrders = [...inventory.map(lot => ({...lot, profit: 0, isNetProfit: true}))];

        // Process sells and consume inventory
        for (const t of sells) {
            const sellPrice = t.price;
            const sellAmount = t.amount;
            const sellTimestamp = t.timestamp;
            const sellFeeCurrency = t.fee ? t.fee.currency : "USDT";
            const sellFeePrice = feeConversion[sellFeeCurrency] || 1;
            const sellFeeUSD = t.fee ? t.fee.cost * sellFeePrice : 0;

            // SAME LOGIC AS grid_bot.js
            const expectedBuyPrice = sellPrice / (1 + spacing);
            const tolerance = expectedBuyPrice * 0.005;

            // Filter candidates: must be BEFORE sell and have remaining
            const candidates = inventory.filter(lot =>
                lot.timestamp < sellTimestamp &&
                lot.remaining > 0.00000001
            );

            // Sort by composite score (same as bot)
            candidates.sort((a, b) => {
                const priceDiffA = Math.abs(a.price - expectedBuyPrice) / expectedBuyPrice;
                const priceDiffB = Math.abs(b.price - expectedBuyPrice) / expectedBuyPrice;
                const amountDiffA = Math.abs(a.remaining - sellAmount) / sellAmount;
                const amountDiffB = Math.abs(b.remaining - sellAmount) / sellAmount;
                const scoreA = priceDiffA * 0.7 + amountDiffA * 0.3;
                const scoreB = priceDiffB * 0.7 + amountDiffB * 0.3;
                return scoreA - scoreB;
            });

            let costBasis = 0;
            let entryFees = 0;
            let matchedLots = [];
            let matchType = "EXACT";
            let remainingToSell = sellAmount;

            // Consume lots
            for (const candidate of candidates) {
                if (remainingToSell <= 0.00000001) break;

                const lot = inventory.find(l => l.id === candidate.id);
                if (!lot || lot.remaining <= 0) continue;

                const take = Math.min(remainingToSell, lot.remaining);
                costBasis += (take * lot.price);

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

                const priceDiff = Math.abs(lot.price - expectedBuyPrice);
                if (priceDiff > tolerance) {
                    if (priceDiff <= expectedBuyPrice * 0.02) {
                        matchType = "CLOSE";
                    } else {
                        matchType = "FALLBACK";
                    }
                }
            }

            // Handle inventory shortfall
            if (remainingToSell > 0.00000001) {
                const estimatedBuyPrice = sellPrice / (1 + spacing);
                costBasis += (remainingToSell * estimatedBuyPrice);
                entryFees += (remainingToSell * estimatedBuyPrice * 0.001);
                remainingToSell = 0;
                matchType = "ESTIMATED";
            }

            // Calculate profit
            const sellRevenue = sellPrice * sellAmount;
            let calcProfit = sellRevenue - costBasis - sellFeeUSD - entryFees;

            let avgCostBasis = costBasis / sellAmount;
            let spreadPct = ((sellPrice - avgCostBasis) / avgCostBasis) * 100;

            // If profit is negative, use grid estimation
            if (calcProfit < 0) {
                const estBuyPrice = sellPrice / (1 + spacing);
                const estCost = estBuyPrice * sellAmount;
                const estBuyFee = estCost * 0.001;
                calcProfit = sellRevenue - estCost - sellFeeUSD - estBuyFee;
                avgCostBasis = estBuyPrice;
                spreadPct = spacing * 100;
                matchType = "GRID_ESTIMATED";
                matchedLots = [];
            }

            totalProfit += calcProfit;

            filledOrders.push({
                id: t.id,
                orderId: t.id,
                side: "sell",
                price: sellPrice,
                fillPrice: sellPrice,
                amount: sellAmount,
                timestamp: sellTimestamp,
                status: "filled",
                fees: t.fee ? t.fee.cost : 0,
                feesUSD: sellFeeUSD,
                feeCurrency: sellFeeCurrency,
                profit: calcProfit,
                isNetProfit: true,
                costBasis: avgCostBasis,
                spreadPct: spreadPct,
                matchType: matchType,
                matchedLots: matchedLots
            });
        }

        // Get remaining lots (inventory)
        const remainingLots = inventory.filter(lot => lot.remaining > 0.00000001);

        // Calculate unrealized PnL with current price
        const currentPrice = pair === "BTC" ? btcPrice : (pair === "SOL" ? solPrice : dogePrice);
        let unrealizedPnL = 0;
        let inventoryCost = 0;
        let inventoryValue = 0;

        for (const lot of remainingLots) {
            const cost = lot.price * lot.remaining;
            const value = currentPrice * lot.remaining;
            inventoryCost += cost;
            inventoryValue += value;
            unrealizedPnL += (value - cost);
        }

        console.log("\n  ANTES:");
        console.log("    inventory:      " + oldInventory.length + " lots");
        console.log("    inventoryLots:  " + oldLots.length + " lots");

        // Backup
        fs.copyFileSync(stateFile, stateFile + ".bak_rebuild_" + Date.now());

        // Update state with BOTH arrays
        state.inventory = remainingLots.map(lot => ({
            id: lot.id,
            orderId: lot.id,
            price: lot.price,
            fillPrice: lot.price,
            amount: lot.amount,
            remaining: lot.remaining,
            timestamp: lot.timestamp,
            fee: lot.feesUSD || 0,
            feesUSD: lot.feesUSD || 0
        }));

        state.inventoryLots = remainingLots.map(lot => ({
            id: lot.id,
            price: lot.price,
            amount: lot.amount,
            remaining: lot.remaining,
            fee: lot.feesUSD || 0,
            timestamp: lot.timestamp
        }));

        state.filledOrders = filledOrders;
        state.realizedProfit = totalProfit;
        state.totalProfit = totalProfit;

        fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));

        console.log("\n  DESPUES (reconstruido desde Binance):");
        console.log("    inventory:      " + state.inventory.length + " lots");
        console.log("    inventoryLots:  " + state.inventoryLots.length + " lots");
        console.log("    filledOrders:   " + filledOrders.length + " orders");

        const sign = unrealizedPnL >= 0 ? "+" : "";
        console.log("\n  PROFIT:");
        console.log("    Realized:       $" + totalProfit.toFixed(2));
        console.log("    Unrealized:     " + sign + "$" + unrealizedPnL.toFixed(2));
        console.log("    Net:            " + (totalProfit + unrealizedPnL >= 0 ? "+" : "") + "$" + (totalProfit + unrealizedPnL).toFixed(2));

        console.log("\n  ✅ " + pair + " RECONSTRUIDO CORRECTAMENTE\n");
    }

    console.log("═══════════════════════════════════════════════════════════════");
    console.log("  RECONSTRUCCION COMPLETADA");
    console.log("  Ambos arrays (inventory e inventoryLots) ahora están");
    console.log("  sincronizados con los trades reales de Binance");
    console.log("═══════════════════════════════════════════════════════════════");
}

rebuildInventory().catch(console.error);
