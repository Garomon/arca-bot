const ccxt = require("ccxt");
const fs = require("fs");
const path = require("path");

// Load env
const envPath = path.join(__dirname, "..", ".env");
const envFile = fs.readFileSync(envPath, "utf8");
const env = {};
envFile.split("\n").forEach(line => {
    const [key, ...val] = line.split("=");
    if (key && val.length) env[key.trim()] = val.join("=").trim();
});

async function checkOrphanOrders() {
    console.log("🔍 VERIFICADOR DE ÓRDENES HUÉRFANAS");
    console.log("===================================\n");

    const binance = new ccxt.binance({
        apiKey: env.BINANCE_API_KEY,
        secret: env.BINANCE_SECRET
    });

    const pairs = [
        { pair: "BTC/USDT", symbol: "BTCUSDT" },
        { pair: "SOL/USDT", symbol: "SOLUSDT" },
        { pair: "DOGE/USDT", symbol: "DOGEUSDT" }
    ];

    let totalOrphans = 0;
    let totalGhosts = 0;

    for (const { pair, symbol } of pairs) {
        try {
            const exchangeOrders = await binance.fetchOpenOrders(pair);
            
            const stateFile = path.join(__dirname, "..", "data", "sessions", "VANTAGE01_" + symbol + "_state.json");
            if (!fs.existsSync(stateFile)) {
                console.log("⚠️  " + pair + ": No state file found\n");
                continue;
            }
            
            const state = JSON.parse(fs.readFileSync(stateFile));
            const localOrders = state.activeOrders || [];
            
            const exchangeIds = new Set(exchangeOrders.map(o => o.id));
            const localIds = new Set(localOrders.map(o => o.id));
            
            const orphans = exchangeOrders.filter(o => !localIds.has(o.id));
            const ghosts = localOrders.filter(o => !exchangeIds.has(o.id));
            
            console.log("📊 " + pair);
            console.log("   Binance: " + exchangeOrders.length + " | Local: " + localOrders.length);
            
            if (orphans.length > 0) {
                totalOrphans += orphans.length;
                console.log("   ⚠️  " + orphans.length + " HUÉRFANAS (en Binance, no rastreadas):");
                orphans.slice(0, 3).forEach(o => {
                    console.log("      " + o.side.toUpperCase() + " " + o.amount + " @ $" + parseFloat(o.price).toFixed(2));
                });
                if (orphans.length > 3) console.log("      ... y " + (orphans.length - 3) + " más");
            }
            
            if (ghosts.length > 0) {
                totalGhosts += ghosts.length;
                console.log("   👻 " + ghosts.length + " FANTASMA (en local, no en Binance):");
                ghosts.slice(0, 3).forEach(o => {
                    console.log("      " + o.side.toUpperCase() + " " + o.amount + " @ $" + parseFloat(o.price).toFixed(2));
                });
                if (ghosts.length > 3) console.log("      ... y " + (ghosts.length - 3) + " más");
            }
            
            if (orphans.length === 0 && ghosts.length === 0) {
                console.log("   ✅ Sincronizado");
            }
            
            console.log("");
            
        } catch (e) {
            console.log("❌ " + pair + ": " + e.message + "\n");
        }
    }

    console.log("===================================");
    if (totalOrphans === 0 && totalGhosts === 0) {
        console.log("✅ SISTEMA LIMPIO - Sin órdenes huérfanas ni fantasma");
    } else {
        console.log("⚠️  ACCIÓN REQUERIDA:");
        if (totalOrphans > 0) console.log("   - " + totalOrphans + " órdenes huérfanas (reiniciar bots para adoptar)");
        if (totalGhosts > 0) console.log("   - " + totalGhosts + " órdenes fantasma (se limpiarán en próximo ciclo)");
    }
}

checkOrphanOrders().catch(e => console.error("Error:", e.message));
