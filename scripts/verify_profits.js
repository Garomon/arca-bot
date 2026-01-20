// Daily profit verification script
// Run: node /root/arca-bot/scripts/verify_profits.js
// Cron: 0 8 * * * node /root/arca-bot/scripts/verify_profits.js >> /root/arca-bot/logs/profit_audit.log 2>&1

const fs = require("fs");
const path = require("path");

const SESSIONS_DIR = "/root/arca-bot/data/sessions";
const PAIRS = ["BTCUSDT", "SOLUSDT", "DOGEUSDT"];

console.log(`\n=== PROFIT VERIFICATION: ${new Date().toISOString()} ===\n`);

let allGood = true;
let totalProfit = 0;

for (const pair of PAIRS) {
    const statePath = path.join(SESSIONS_DIR, `VANTAGE01_${pair}_state.json`);
    
    try {
        const data = JSON.parse(fs.readFileSync(statePath, "utf8"));
        const sells = (data.filledOrders || []).filter(o => o.side === "sell");
        
        const sumProfits = sells.reduce((sum, s) => sum + (parseFloat(s.profit) || 0), 0);
        const storedProfit = parseFloat(data.totalProfit || 0);
        const diff = Math.abs(storedProfit - sumProfits);
        
        const status = diff < 0.01 ? "OK" : "MISMATCH";
        if (diff >= 0.01) allGood = false;
        
        console.log(`${pair}: stored=$${storedProfit.toFixed(4)}, sum=$${sumProfits.toFixed(4)}, diff=$${diff.toFixed(4)} [${status}]`);
        totalProfit += storedProfit;
        
        // Auto-fix if mismatch detected
        if (diff >= 0.01) {
            console.log(`  >> AUTO-FIX: Correcting ${pair} profit from $${storedProfit.toFixed(4)} to $${sumProfits.toFixed(4)}`);
            data.totalProfit = sumProfits;
            data.accumulatedProfit = sumProfits;
            fs.writeFileSync(statePath, JSON.stringify(data, null, 2));
            console.log(`  >> FIXED!`);
        }
    } catch (err) {
        console.log(`${pair}: ERROR - ${err.message}`);
        allGood = false;
    }
}

console.log(`\nTOTAL: $${totalProfit.toFixed(4)}`);
console.log(`STATUS: ${allGood ? "ALL VERIFIED" : "CORRECTIONS APPLIED"}\n`);
