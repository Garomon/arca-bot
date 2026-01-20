const ccxt = require("ccxt");
const fs = require("fs");

async function compareProfits() {
    const exchange = new ccxt.binance({
        apiKey: process.env.BINANCE_API_KEY,
        secret: process.env.BINANCE_SECRET,
        options: { defaultType: "spot" }
    });

    console.log("=== COMPARACION: BINANCE FIFO vs NUESTRO CALCULO ===");
    console.log("");
    console.log("Binance usa FIFO: First In, First Out");
    console.log("Nosotros usamos SPREAD_MATCH: cada sell se matchea con buy del grid");
    console.log("");

    let totalBinance = 0;
    let totalOurs = 0;

    for (const pair of ["BTC", "SOL", "DOGE"]) {
        const symbol = pair + "/USDT";
        const stateFile = "/root/arca-bot/data/sessions/VANTAGE01_" + pair + "USDT_state.json";
        
        if (!fs.existsSync(stateFile)) continue;
        
        const state = JSON.parse(fs.readFileSync(stateFile));
        
        const trades = await exchange.fetchMyTrades(symbol, undefined, 500);
        
        // FIFO calculation (how Binance calculates)
        const buyQueue = [];
        let realizedPnL = 0;
        let totalFees = 0;
        
        trades.sort((a, b) => a.timestamp - b.timestamp);
        
        for (const t of trades) {
            const feeUSD = t.fee ? (t.fee.currency === "USDT" ? t.fee.cost : t.fee.cost * 700) : 0;
            totalFees += feeUSD;
            
            if (t.side === "buy") {
                buyQueue.push({ price: t.price, amount: t.amount });
            } else {
                let remaining = t.amount;
                while (remaining > 0.00000001 && buyQueue.length > 0) {
                    const buy = buyQueue[0];
                    const matched = Math.min(remaining, buy.amount);
                    
                    realizedPnL += (t.price - buy.price) * matched;
                    
                    buy.amount -= matched;
                    remaining -= matched;
                    
                    if (buy.amount <= 0.00000001) buyQueue.shift();
                }
            }
        }
        
        const netPnL = realizedPnL - totalFees;
        
        const ourProfit = state.filledOrders
            .filter(o => o.side === "sell")
            .reduce((s, o) => s + (o.profit || 0), 0);
        
        totalBinance += netPnL;
        totalOurs += ourProfit;
        
        console.log(pair + ":");
        console.log("  Binance FIFO (neto): $" + netPnL.toFixed(2));
        console.log("  Nuestro calculo:     $" + ourProfit.toFixed(2));
        console.log("  Diferencia:          $" + (ourProfit - netPnL).toFixed(2));
        console.log("");
    }
    
    console.log("========================================");
    console.log("TOTAL Binance FIFO: $" + totalBinance.toFixed(2));
    console.log("TOTAL Nuestro:      $" + totalOurs.toFixed(2));
    console.log("Diferencia total:   $" + (totalOurs - totalBinance).toFixed(2));
}

compareProfits().catch(console.error);
