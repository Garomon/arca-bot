require("dotenv").config();
const ccxt = require("ccxt");
const fs = require("fs");

async function checkUnrealized() {
    const exchange = new ccxt.binance({
        apiKey: process.env.BINANCE_API_KEY,
        secret: process.env.BINANCE_SECRET,
        options: { defaultType: "spot" }
    });

    // Get current prices
    const btcTicker = await exchange.fetchTicker("BTC/USDT");
    const solTicker = await exchange.fetchTicker("SOL/USDT");
    const dogeTicker = await exchange.fetchTicker("DOGE/USDT");

    const prices = {
        BTC: btcTicker.last,
        SOL: solTicker.last,
        DOGE: dogeTicker.last
    };

    console.log("\n💰 UNREALIZED PnL POR BOT");
    console.log("══════════════════════════════════════════════════════════════\n");
    console.log("Precios actuales: BTC=$" + prices.BTC.toFixed(0) + " | SOL=$" + prices.SOL.toFixed(2) + " | DOGE=$" + prices.DOGE.toFixed(4));
    console.log("");

    let totalUnrealized = 0;
    let totalInventoryValue = 0;
    let totalInventoryCost = 0;

    for (const pair of ["BTC", "SOL", "DOGE"]) {
        const stateFile = "/root/arca-bot/data/sessions/VANTAGE01_" + pair + "USDT_state.json";
        const state = JSON.parse(fs.readFileSync(stateFile));
        const lots = state.inventoryLots || [];
        const currentPrice = prices[pair];

        let inventoryCost = 0;
        let inventoryValue = 0;
        let totalAmount = 0;

        for (const lot of lots) {
            const cost = lot.price * lot.remaining;
            const value = currentPrice * lot.remaining;
            inventoryCost += cost;
            inventoryValue += value;
            totalAmount += lot.remaining;
        }

        const unrealized = inventoryValue - inventoryCost;
        const unrealizedPct = inventoryCost > 0 ? (unrealized / inventoryCost * 100) : 0;
        const avgCost = totalAmount > 0 ? inventoryCost / totalAmount : 0;

        totalUnrealized += unrealized;
        totalInventoryValue += inventoryValue;
        totalInventoryCost += inventoryCost;

        const sign = unrealized >= 0 ? "+" : "";
        const emoji = unrealized >= 0 ? "📈" : "📉";

        console.log("┌─────────────────────────────────────────────────────────────┐");
        console.log("│  " + pair + "/USDT                                                    │");
        console.log("├─────────────────────────────────────────────────────────────┤");
        console.log("│  Lotes:          " + String(lots.length).padStart(5) + "                                       │");
        console.log("│  Cantidad:       " + totalAmount.toFixed(6).padStart(12) + " " + pair.padEnd(25) + "│");
        console.log("│  Avg Cost:       $" + avgCost.toFixed(4).padStart(11) + "                              │");
        console.log("│  Precio actual:  $" + currentPrice.toFixed(4).padStart(11) + "                              │");
        console.log("│  ───────────────────────────────────────────────────────── │");
        console.log("│  Invertido:      $" + inventoryCost.toFixed(2).padStart(11) + "                              │");
        console.log("│  Valor actual:   $" + inventoryValue.toFixed(2).padStart(11) + "                              │");
        console.log("│  " + emoji + " UNREALIZED:   " + (sign + "$" + unrealized.toFixed(2)).padStart(12) + " (" + (sign + unrealizedPct.toFixed(1) + "%").padStart(7) + ")                  │");
        console.log("└─────────────────────────────────────────────────────────────┘");
        console.log("");
    }

    const totalPct = totalInventoryCost > 0 ? (totalUnrealized / totalInventoryCost * 100) : 0;
    const sign = totalUnrealized >= 0 ? "+" : "";
    const emoji = totalUnrealized >= 0 ? "📈" : "📉";

    console.log("══════════════════════════════════════════════════════════════");
    console.log("  RESUMEN TOTAL");
    console.log("══════════════════════════════════════════════════════════════");
    console.log("  Invertido total:     $" + totalInventoryCost.toFixed(2));
    console.log("  Valor actual total:  $" + totalInventoryValue.toFixed(2));
    console.log("  " + emoji + " UNREALIZED TOTAL:   " + sign + "$" + totalUnrealized.toFixed(2) + " (" + sign + totalPct.toFixed(1) + "%)");
    console.log("══════════════════════════════════════════════════════════════");

    // Add realized profit for context
    let totalRealized = 0;
    for (const pair of ["BTC", "SOL", "DOGE"]) {
        const stateFile = "/root/arca-bot/data/sessions/VANTAGE01_" + pair + "USDT_state.json";
        const state = JSON.parse(fs.readFileSync(stateFile));
        totalRealized += state.realizedProfit || state.totalProfit || 0;
    }

    console.log("");
    console.log("📊 CONTEXTO:");
    console.log("   Realized Profit:    +$" + totalRealized.toFixed(2));
    console.log("   Unrealized PnL:     " + sign + "$" + totalUnrealized.toFixed(2));
    console.log("   ─────────────────────────────");
    const netSign = (totalRealized + totalUnrealized) >= 0 ? "+" : "";
    console.log("   NET PnL:            " + netSign + "$" + (totalRealized + totalUnrealized).toFixed(2));
}

checkUnrealized().catch(console.error);
