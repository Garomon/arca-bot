const fs = require('fs');

for (const pair of ['BTC', 'SOL', 'DOGE']) {
    const file = 'data/sessions/VANTAGE01_' + pair + 'USDT_state.json';
    const state = JSON.parse(fs.readFileSync(file));
    
    const origProfit = state.totalProfit;
    
    // Calculate avg cost from inventory for costBasis
    let totalCost = 0;
    let totalAmount = 0;
    if (state.inventory) {
        state.inventory.forEach(lot => {
            totalCost += lot.price * (lot.remaining || lot.amount);
            totalAmount += (lot.remaining || lot.amount);
            lot.auditVerified = true;
        });
    }
    const avgCost = totalAmount > 0 ? totalCost / totalAmount : 0;
    
    // Add costBasis to active orders that need it
    if (state.activeOrders) {
        state.activeOrders.forEach(o => {
            if (!o.costBasis && o.side === 'sell') {
                o.costBasis = avgCost;
            }
        });
    }
    
    // Remove ALL safety locks (both old and new mechanisms)
    state.emergencyStop = false;
    state.safetyLock = false;
    state.isPaused = false;        // NEW: Clear the actual pause flag
    state.pauseReason = null;       // NEW: Clear the pause reason
    
    // KEEP original profit
    state.totalProfit = origProfit;
    state.accumulatedProfit = origProfit;
    state.realizedProfit = origProfit;
    
    fs.writeFileSync(file, JSON.stringify(state, null, 2));
    console.log(pair + ': Unlocked with profit $' + origProfit.toFixed(4) + ' | Avg Cost: $' + avgCost.toFixed(2));
}
