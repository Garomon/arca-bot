const ccxt = require("ccxt");

async function checkUnmatched() {
    const exchange = new ccxt.binance({
        apiKey: process.env.BINANCE_API_KEY,
        secret: process.env.BINANCE_SECRET,
        options: { defaultType: "spot" }
    });

    const SPACING = { BTC: 0.005, SOL: 0.008, DOGE: 0.010 };

    for (const pair of ["BTC", "SOL", "DOGE"]) {
        const symbol = pair + "/USDT";
        const spacing = SPACING[pair];
        const tolerance = spacing * 1.5;

        const trades = await exchange.fetchMyTrades(symbol, undefined, 1000);
        trades.sort((a, b) => a.timestamp - b.timestamp);

        const buys = trades.filter(t => t.side === "buy");
        const sells = trades.filter(t => t.side === "sell");

        console.log("\n=== " + pair + " ===");
        console.log("Total buys: " + buys.length + ", Total sells: " + sells.length);

        let unmatched = 0;
        for (const sell of sells) {
            const minBuyPrice = sell.price / (1 + tolerance);
            
            // Find buys BEFORE this sell within tolerance
            const validBuys = buys.filter(b => 
                b.timestamp < sell.timestamp && 
                b.price >= minBuyPrice && 
                b.price < sell.price
            );

            if (validBuys.length === 0) {
                unmatched++;
                console.log("\nUNMATCHED SELL:");
                console.log("  ID: " + sell.id);
                console.log("  Date: " + new Date(sell.timestamp).toISOString());
                console.log("  Price: $" + sell.price.toFixed(2));
                console.log("  Min buy needed: $" + minBuyPrice.toFixed(2));
                
                // Show what buys exist BEFORE this sell
                const buysBefore = buys.filter(b => b.timestamp < sell.timestamp);
                if (buysBefore.length === 0) {
                    console.log("  REASON: No buys before this sell in history");
                } else {
                    const closest = buysBefore.reduce((a, b) => 
                        Math.abs(b.price - minBuyPrice) < Math.abs(a.price - minBuyPrice) ? b : a
                    );
                    console.log("  Closest buy before: $" + closest.price.toFixed(2) + " (diff: " + ((sell.price - closest.price) / closest.price * 100).toFixed(2) + "%)");
                    console.log("  Tolerance needed: " + (tolerance * 100).toFixed(1) + "%");
                }
            }
        }

        console.log("\nTotal unmatched: " + unmatched + " / " + sells.length);
    }
}

checkUnmatched().catch(console.error);
