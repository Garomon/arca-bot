const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '../data/sessions/VANTAGE01_SOLUSDT_state.json');

try {
    const data = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));

    // 1. Locate the Ghost Sell Order
    const ghostOrderIndex = data.filledOrders.findIndex(o =>
        o.side === 'sell' &&
        o.amount === 0.18 &&
        o.profit === 0 &&
        o.timestamp > 1767920000000
    );

    if (ghostOrderIndex === -1) {
        // Check if ALREADY FIXED
        const fixedOrder = data.filledOrders.find(o =>
            o.side === 'sell' &&
            o.amount === 0.18 &&
            o.matchType === "MANUAL_FIX" &&
            o.timestamp > 1767920000000
        );

        if (fixedOrder) {
            console.log("⚠️ Order already patched. Resetting locks only.");
            data.isPaused = false;
            data.pauseReason = null;
            fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
            console.log("✅ Locks reset.");
            process.exit(0);
        }

        console.log("❌ Ghost order not found to patch!");
        process.exit(1);
    }

    const ghostOrder = data.filledOrders[ghostOrderIndex];
    console.log("👻 Found Ghost Order:", ghostOrder);

    // 2. Define the Missing Buy Data
    const buyPrice = 138.2;
    const buyCost = buyPrice * ghostOrder.amount;
    const sellRevenue = ghostOrder.price * ghostOrder.amount;

    // 3. Calculate Correct Profit
    const sellFee = sellRevenue * 0.00075;
    const buyFee = buyCost * 0.00075;

    const grossProfit = sellRevenue - buyCost;
    const netProfit = grossProfit - sellFee - buyFee;

    console.log(`\n🧮 RELOADED CALCULATION:`);
    console.log(`Net Profit: $${netProfit.toFixed(4)}`);

    // 4. Update the Order
    ghostOrder.profit = netProfit;
    ghostOrder.costBasis = buyPrice * ghostOrder.amount;
    ghostOrder.matchedLots = [{
        lotId: "MANUAL_FIX_FROM_SCREENSHOT",
        buyPrice: buyPrice,
        amountTaken: ghostOrder.amount,
        remainingAfter: 0,
        timestamp: ghostOrder.timestamp - 1800000
    }];
    ghostOrder.isNetProfit = true;
    ghostOrder.matchType = "MANUAL_FIX";

    // 5. Update State Total Profit
    // BE CAREFUL NOT TO ADD TWICE.
    // Since we found it by looking for profit === 0, we are safe.
    data.totalProfit += netProfit;
    data.accumulatedProfit = (data.accumulatedProfit || 0) + netProfit;

    // 6. CLEAR LOCKS
    data.isPaused = false;
    data.pauseReason = null;
    data.emergencyStop = false;

    // 7. Save
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
    console.log("\n✅ PATCH (v2) APPLIED SUCCESSFULLY. Loops Cleared. Locks Removed.");

} catch (e) {
    console.error(e);
}
