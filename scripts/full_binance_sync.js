const fs = require("fs");
const crypto = require("crypto");
const https = require("https");

const pair = process.argv[2];
const applyChanges = process.argv.includes("--apply");

if (!pair) {
    console.log("Uso: node full_sync.js SOLUSDT [--apply]");
    process.exit(1);
}

const envContent = fs.readFileSync("/root/arca-bot/.env", "utf8");
const env = {};
envContent.split("\n").forEach(line => {
    const [key, ...val] = line.split("=");
    if (key && val.length) env[key.trim()] = val.join("=").trim();
});

const API_KEY = env.BINANCE_API_KEY;
const API_SECRET = env.BINANCE_SECRET;

function signRequest(params) {
    const qs = Object.entries(params).map(([k,v]) => k + "=" + v).join("&");
    const sig = crypto.createHmac("sha256", API_SECRET).update(qs).digest("hex");
    return qs + "&signature=" + sig;
}

function getTrades(symbol) {
    return new Promise((resolve, reject) => {
        const params = { symbol, limit: 1000, timestamp: Date.now() };
        const query = signRequest(params);
        const options = {
            hostname: "api.binance.com",
            path: "/api/v3/myTrades?" + query,
            method: "GET",
            headers: { "X-MBX-APIKEY": API_KEY }
        };
        const req = https.request(options, res => {
            let data = "";
            res.on("data", chunk => data += chunk);
            res.on("end", () => resolve(JSON.parse(data)));
        });
        req.on("error", reject);
        req.end();
    });
}

async function main() {
    const asset = pair.replace("USDT", "");
    const stateFile = "/root/arca-bot/data/sessions/VANTAGE01_" + pair + "_state.json";
    const state = JSON.parse(fs.readFileSync(stateFile));
    
    console.log("=== FULL BINANCE SYNC: " + pair + " ===");
    console.log("Mode:", applyChanges ? "APLICAR" : "DRY-RUN");
    console.log("");
    
    const trades = await getTrades(pair);
    const binanceBuys = trades.filter(t => t.isBuyer);
    
    console.log("Binance buys:", binanceBuys.length);
    
    // Use BOTH id and orderId for matching
    const stateFilledIds = new Set();
    (state.filledOrders || []).forEach(o => {
        if (o.id) stateFilledIds.add(o.id.toString());
        if (o.orderId) stateFilledIds.add(o.orderId.toString());
    });
    
    const stateLotIds = new Set();
    (state.inventoryLots || []).forEach(l => {
        if (l.id) stateLotIds.add(l.id.toString());
    });
    
    // Check both trade ID and order ID from Binance
    const missingBuys = binanceBuys.filter(t => 
        !stateFilledIds.has(t.id.toString()) && 
        !stateFilledIds.has(t.orderId.toString())
    );
    
    console.log("State filled IDs:", stateFilledIds.size);
    console.log("Buys faltantes:", missingBuys.length);
    
    // Show some details
    if (missingBuys.length > 0) {
        console.log("\nBuys faltantes (primeros 5):");
        missingBuys.slice(0, 5).forEach(t => {
            console.log("  ", new Date(t.time).toISOString().slice(0,19), 
                parseFloat(t.qty).toFixed(4), asset, "@ $" + parseFloat(t.price).toFixed(2),
                "| orderId:", t.orderId);
        });
    }
    
    const estSells = (state.filledOrders || []).filter(o => 
        o.side === "sell" && 
        o.matchedLots && 
        o.matchedLots.some(m => m.lotId?.toString().startsWith("EST_"))
    );
    
    console.log("\nEST_ sells a re-matchear:", estSells.length);
    
    if (!applyChanges) {
        console.log("\nDRY-RUN. Use --apply para aplicar.");
        return;
    }
    
    // Backup
    const backupFile = stateFile.replace(".json", "_backup_fullsync_" + Date.now() + ".json");
    fs.writeFileSync(backupFile, JSON.stringify(state, null, 2));
    console.log("\nBackup:", backupFile);
    
    if (!state.inventoryLots) state.inventoryLots = [];
    if (!Array.isArray(state.inventory)) state.inventory = [];
    
    // Add missing buys using orderId as the ID
    for (const t of missingBuys) {
        const qty = parseFloat(t.qty);
        const price = parseFloat(t.price);
        const fee = parseFloat(t.commission);
        const feeUSD = t.commissionAsset === "USDT" ? fee : fee * price;
        
        state.filledOrders.push({
            id: t.orderId.toString(),  // Use orderId to match existing format
            orderId: t.orderId.toString(),
            tradeId: t.id.toString(),
            side: "buy",
            price: price,
            quantity: qty,
            amount: qty,
            timestamp: t.time,
            source: "BINANCE_SYNC",
            fees: fee,
            feeCurrency: t.commissionAsset,
            feesUSD: feeUSD
        });
        
        const lot = {
            id: t.orderId.toString(),
            price: price,
            amount: qty,
            remaining: qty,
            fee: feeUSD,
            timestamp: t.time,
            source: "BINANCE_SYNC",
            spacing: 0.008
        };
        state.inventoryLots.push(lot);
        state.inventory.push(lot);
    }
    
    console.log("Buys agregados:", missingBuys.length);
    
    // Re-match EST_ sells
    let reMatched = 0;
    for (const sell of estSells) {
        const sellPrice = sell.price;
        const sellQty = sell.quantity || sell.amount;
        const spacing = sell.spacing || 0.008;
        const expectedBuyPrice = sellPrice / (1 + spacing);
        
        const candidates = state.inventoryLots
            .filter(l => l.remaining > 0.00000001)
            .sort((a, b) => Math.abs(a.price - expectedBuyPrice) - Math.abs(b.price - expectedBuyPrice));
        
        let remainingToMatch = sellQty;
        const newMatchedLots = [];
        
        for (const lot of candidates) {
            if (remainingToMatch <= 0.00000001) break;
            const take = Math.min(remainingToMatch, lot.remaining);
            
            newMatchedLots.push({
                lotId: lot.id,
                buyPrice: lot.price,
                amountTaken: take,
                remainingAfter: lot.remaining - take,
                timestamp: lot.timestamp
            });
            
            lot.remaining -= take;
            remainingToMatch -= take;
        }
        
        if (newMatchedLots.length > 0 && !newMatchedLots[0].lotId.startsWith("EST_")) {
            sell.matchedLots = newMatchedLots;
            sell.matchType = newMatchedLots.length === 1 ? "SYNC_MATCHED" : "SYNC_MULTI_MATCH";
            
            const avgCost = newMatchedLots.reduce((sum, m) => sum + m.buyPrice * m.amountTaken, 0) / sellQty;
            sell.costBasis = avgCost;
            sell.spreadPct = ((sellPrice - avgCost) / avgCost) * 100;
            sell.profit = (sellPrice - avgCost) * sellQty - (sell.feesUSD || 0);
            
            reMatched++;
            console.log("Re-matched sell", sell.id, "@ $" + sellPrice.toFixed(2), "-> cost $" + avgCost.toFixed(2));
        }
    }
    
    console.log("Sells re-matcheados:", reMatched);
    
    state.inventory = [...state.inventoryLots];
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    
    const newRemaining = state.inventoryLots.reduce((sum, l) => sum + (l.remaining || 0), 0);
    console.log("\nNuevo remaining:", newRemaining.toFixed(6), asset);
}

main().catch(console.error);
