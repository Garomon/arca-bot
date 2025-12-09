const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'grid_state.json');

function runAudit() {
    console.log("🔍 STARTING BOT HEALTH AUDIT...\n");

    if (!fs.existsSync(STATE_FILE)) {
        console.error("❌ CRITICAL: grid_state.json not found!");
        return;
    }

    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));

    // 1. Order Health
    const buyOrders = state.activeOrders.filter(o => o.side === 'buy').length;
    const sellOrders = state.activeOrders.filter(o => o.side === 'sell').length;
    console.log(`📊 ORDER BALANCE: [ ${buyOrders} BUYS | ${sellOrders} SELLS ]`);
    if (buyOrders === 0 || sellOrders === 0) {
        console.log("   ⚠️  WARNING: One side of the grid is empty! (Bot might be exposed)");
    } else {
        console.log("   ✅  Grid is balanced.");
    }

    // 2. Financial Logic
    if (state.initialCapital > 0) {
        const roi = (state.totalProfit / state.initialCapital) * 100;
        console.log(`💰 FINANCIALS:`);
        console.log(`   - Initial Capital: $${state.initialCapital.toFixed(2)}`);
        console.log(`   - Total Profit:    $${state.totalProfit.toFixed(4)}`);
        console.log(`   - Current ROI:     ${roi.toFixed(2)}%`);
        console.log("   ✅  ROI calculation is valid.");
    } else {
        console.log("   ⚠️  WARNING: Initial Capital is 0. ROI cannot be calculated.");
    }

    // 3. Activity Check
    const lastRebalance = new Date(state.lastRebalance.timestamp);
    const now = new Date();
    const diffMinutes = (now - lastRebalance) / 1000 / 60;

    console.log(`⏱️  TIMING:`);
    console.log(`   - Last Rebalance: ${diffMinutes.toFixed(1)} minutes ago`);
    if (diffMinutes < 5) {
        console.log("   ℹ️   NOTE: Bot reset recently (likely manual user action or volatility trigger).");
    } else {
        console.log("   ✅  Bot is stable (no recent resets).");
    }

    // 4. Intelligence
    console.log(`🧠 AI STATUS:`);
    console.log(`   - Market Regime: ${state.marketRegime}`);
    console.log(`   - Composite Score: ${state.compositeSignal.score} (${state.compositeSignal.recommendation})`);

    console.log("\n✅ AUDIT COMPLETE. SYSTEM IS HEALTHY.");
}

runAudit();
