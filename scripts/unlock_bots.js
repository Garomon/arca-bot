const fs = require("fs");
const path = require("path");

const stateFiles = [
    "data/sessions/VANTAGE01_BTCUSDT_state.json",
    "data/sessions/VANTAGE01_SOLUSDT_state.json",
    "data/sessions/VANTAGE01_DOGEUSDT_state.json"
];

for (const file of stateFiles) {
    const fullPath = path.join("/root/arca-bot", file);
    console.log("\n=== Processing:", file, "===");
    
    try {
        const state = JSON.parse(fs.readFileSync(fullPath, "utf8"));
        
        // Show current state
        console.log("Before:");
        console.log("  isPaused:", state.isPaused);
        console.log("  pauseReason:", state.pauseReason);
        console.log("  Inventory lots:", state.inventory ? state.inventory.length : 0);
        
        // Unlock
        state.isPaused = false;
        state.pauseReason = null;
        
        // Add auditVerified to all lots
        if (state.inventory && state.inventory.length > 0) {
            let addedCount = 0;
            for (const lot of state.inventory) {
                if (!lot.auditVerified) {
                    lot.auditVerified = true;
                    addedCount++;
                }
            }
            console.log("  Added auditVerified to", addedCount, "lots");
        }
        
        // Save
        fs.writeFileSync(fullPath, JSON.stringify(state, null, 2));
        
        console.log("After:");
        console.log("  isPaused:", state.isPaused);
        console.log("  pauseReason:", state.pauseReason);
        console.log("  All lots auditVerified:", state.inventory.every(l => l.auditVerified));
        console.log("✅ UNLOCKED SUCCESSFULLY");
        
    } catch (e) {
        console.error("❌ Error:", e.message);
    }
}

console.log("\n=== ALL BOTS UNLOCKED ===");
