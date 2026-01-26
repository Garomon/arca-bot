const fs = require("fs");
const crypto = require("crypto");
const https = require("https");

const pair = process.argv[2];
const applyChanges = process.argv.includes("--apply");

if (!pair) {
  console.log("Uso: node smart_reconcile.js SOLUSDT [--apply]");
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

function getBalance(asset) {
  return new Promise((resolve, reject) => {
    const params = { timestamp: Date.now() };
    const query = signRequest(params);
    const options = {
      hostname: "api.binance.com",
      path: "/api/v3/account?" + query,
      method: "GET",
      headers: { "X-MBX-APIKEY": API_KEY }
    };
    const req = https.request(options, res => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        const acc = JSON.parse(data);
        const bal = acc.balances.find(b => b.asset === asset);
        resolve(bal ? parseFloat(bal.free) + parseFloat(bal.locked) : 0);
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function main() {
  const asset = pair.replace("USDT", "");
  const stateFile = "/root/arca-bot/data/sessions/VANTAGE01_" + pair + "_state.json";
  const state = JSON.parse(fs.readFileSync(stateFile));
  
  const stateRemaining = (state.inventoryLots || []).reduce((sum, l) => sum + (l.remaining || 0), 0);
  const binanceBalance = await getBalance(asset);
  const needed = binanceBalance - stateRemaining;
  
  console.log("=== SMART RECONCILE: " + pair + " ===");
  console.log("Mode:", applyChanges ? "APLICAR CAMAIOS" : "DRY-RUN (solo mostrar)");
  console.log("");
  console.log("State remaining:", stateRemaining.toFixed(8));
  console.log("Binance balance:", binanceBalance.toFixed(8));
  console.log("Needed to add:", needed.toFixed(8), asset);
  console.log("");
  
  if (needed <= 0) {
    console.log("No se necesita agregar lotes.");
    process.exit(0);
  }
  
  // Find buys that don't have lots
  const existingLotIds = new Set((state.inventoryLots || []).map(l => l.id?.toString()));
  const buysWithoutLots = (state.filledOrders || []).filter(o => {
    if (o.side !== "buy") return false;
    const buyId = (o.id || o.orderId || "").toString();
    return !existingLotIds.has(buyId);
  }).sort((a, b) => a.timestamp - b.timestamp); // Oldest first
  
  console.log("Buys sin lotes:", buysWithoutLots.length);
  
  // Add lots until we reach the needed amount
  let added = 0;
  const lotsToAdd = [];
  for (const b of buysWithoutLots) {
    if (added >= needed) break;
    const qty = b.quantity || b.amount || 0;
    const lot = {
      id: (b.id || b.orderId).toString(),
      price: b.price || b.fillPrice,
      amount: qty,
      remaining: qty,
      fee: b.fees || b.feesUSD || 0,
      timestamp: b.timestamp,
      source: "RECONCILE",
      spacing: 0.008
    };
    lotsToAdd.push(lot);
    added += qty;
  }
  
  console.log("Lotes a agregar:", lotsToAdd.length);
  console.log("Total " + asset + " a agregar:", added.toFixed(8));
  console.log("");
  
  console.log("=== LOTES QUE SE ANADIRIAN ===");
  lotsToAdd.forEach(lot => {
    console.log(new Date(lot.timestamp).toISOString().slice(0,16), "|", lot.remaining.toFixed(6), asset, "@ $" + lot.price.toFixed(2), "| ID:", lot.id);
  });
  
  if (!applyChanges) {
    console.log("");
    console.log("DRY-RUN: No se hicieron cambios.");
    console.log("Para aplicar: node smart_reconcile.js " + pair + " --apply");
    process.exit(0);
  }
  
  console.log("");
  console.log("Aplicando cambios...");
  
  const backupFile = stateFile.replace(".json", "_backup_smart_" + Date.now() + ".json");
  fs.writeFileSync(backupFile, JSON.stringify(state, null, 2));
  console.log("Backup creado:", backupFile);
  
  if (!state.inventoryLots) state.inventoryLots = [];
  if (!Array.isArray(state.inventory)) state.inventory = [];
  
  lotsToAdd.forEach(lot => {
    state.inventoryLots.push(lot);
    state.inventory.push(lot);
  });
  
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  
  const newRemaining = state.inventoryLots.reduce((sum, l) => sum + (l.remaining || 0), 0);
  console.log("");
  console.log("COMPLETADO: Anadidos", lotsToAdd.length, "lotes");
  console.log("Nuevo total de lotes:", state.inventoryLots.length);
  console.log("Nuevo remaining:", newRemaining.toFixed(8), asset);
  console.log("Binance balance:", binanceBalance.toFixed(8));
  console.log("Diferencia:", (newRemaining - binanceBalance).toFixed(8));
}

main().catch(console.error);
