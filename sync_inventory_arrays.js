require("dotenv").config();
const fs = require("fs");

/**
 * Sync inventory and inventoryLots arrays for all bots
 * The 'inventory' array is the one the dashboard uses (source of truth)
 * The 'inventoryLots' array should match it
 */

console.log("═══════════════════════════════════════════════════════════════");
console.log("  SYNC: inventory → inventoryLots (TODOS LOS BOTS)");
console.log("═══════════════════════════════════════════════════════════════\n");

for (const pair of ["BTC", "SOL", "DOGE"]) {
    const stateFile = "/root/arca-bot/data/sessions/VANTAGE01_" + pair + "USDT_state.json";
    const state = JSON.parse(fs.readFileSync(stateFile));

    const inv = state.inventory || [];
    const lots = state.inventoryLots || [];

    // Get IDs from each array
    const invIds = new Set(inv.map(x => String(x.id || x.orderId)));
    const lotsIds = new Set(lots.map(x => String(x.id)));

    // Check overlap
    const inBoth = [...invIds].filter(id => lotsIds.has(id));
    const onlyInInv = [...invIds].filter(id => !lotsIds.has(id));
    const onlyInLots = [...lotsIds].filter(id => !invIds.has(id));

    console.log(pair + "/USDT:");
    console.log("  ANTES:");
    console.log("    inventory:      " + inv.length + " lots");
    console.log("    inventoryLots:  " + lots.length + " lots");
    console.log("    En ambos:       " + inBoth.length);
    console.log("    Solo inventory: " + onlyInInv.length);
    console.log("    Solo invLots:   " + onlyInLots.length);

    const needsSync = inv.length !== lots.length || onlyInInv.length > 0 || onlyInLots.length > 0;

    if (needsSync) {
        console.log("  ⚠️  DESINCRONIZADO - Sincronizando...");

        // Backup
        fs.copyFileSync(stateFile, stateFile + ".bak_sync_" + Date.now());

        // Convert inventory to inventoryLots format
        const newLots = inv.map(item => ({
            id: item.id || item.orderId,
            price: item.price || item.fillPrice,
            amount: item.amount,
            remaining: item.remaining || item.amount,
            fee: item.fee || item.feesUSD || 0,
            timestamp: item.timestamp
        }));

        state.inventoryLots = newLots;

        // Write back
        fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));

        console.log("  DESPUÉS:");
        console.log("    inventory:      " + inv.length + " lots");
        console.log("    inventoryLots:  " + newLots.length + " lots");
        console.log("  ✅ SINCRONIZADO!");
    } else {
        console.log("  ✅ Ya sincronizado - no cambios necesarios");
    }
    console.log("");
}

console.log("═══════════════════════════════════════════════════════════════");
console.log("  SYNC COMPLETADO");
console.log("═══════════════════════════════════════════════════════════════");
