const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '../data/sessions/VANTAGE01_SOLUSDT_state.json');

try {
    const data = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));

    // 1. Locate the Ghost Sell Order
    // ID from audit: "16018087005" (or look for the one with profit 0 and recent timestamp)
    // Timestamp from screenshot: 20:08:25 = 1767924505608 (approx)
    // Price: 139.26 (screenshot close to 139.3)

    const ghostOrderIndex = data.filledOrders.findIndex(o =>
        o.side === 'sell' &&
        o.amount === 0.18 &&
        o.profit === 0 &&
        o.timestamp > 1767920000000 // Recent
    );

    if (ghostOrderIndex === -1) {
        console.log("❌ Ghost order not found!");
        process.exit(1);
    }

    const ghostOrder = data.filledOrders[ghostOrderIndex];
    console.log("👻 Found Ghost Order:", ghostOrder);

    // 2. Define the Missing Buy Data (from User Screenshot)
    // Buy Price: 138.2
    // Buy Amount: 0.18
    const buyPrice = 138.2;
    const buyCost = buyPrice * ghostOrder.amount;
    const sellRevenue = ghostOrder.price * ghostOrder.amount;

    // 3. Calculate Correct Profit
    // Fees: Assume standard 0.075% BNB fee equivalent roughly
    // Or just use the logic: Gross - Fees.
    // Screenshot shows SELL Fee: 0.000021 BNB ?? No, wait.
    // Previous trades show ~0.01-0.03 range.
    // Let's use a standard 0.1% estimate for safety or try to read fee from object if exists.

    // Ghost order might have fee info if it filled correctly
    // If not, we estimate.
    const sellFee = sellRevenue * 0.00075; // VIP 0 BNB fee approx
    const buyFee = buyCost * 0.00075;

    const grossProfit = sellRevenue - buyCost;
    const netProfit = grossProfit - sellFee - buyFee;

    console.log(`\n🧮 CALCULATION:`);
    console.log(`Sell: ${ghostOrder.amount} @ ${ghostOrder.price} = $${sellRevenue.toFixed(4)}`);
    console.log(`Buy:  ${ghostOrder.amount} @ ${buyPrice} = $${buyCost.toFixed(4)}`);
    console.log(`Gross: $${grossProfit.toFixed(4)}`);
    console.log(`Est Fees: $${(sellFee + buyFee).toFixed(4)}`);
    console.log(`Net Profit: $${netProfit.toFixed(4)}`);

    // 4. Update the Order
    ghostOrder.profit = netProfit;
    ghostOrder.costBasis = buyPrice * ghostOrder.amount;
    ghostOrder.matchedLots = [{
        lotId: "MANUAL_FIX_FROM_SCREENSHOT",
        buyPrice: buyPrice,
        amountTaken: ghostOrder.amount,
        timestamp: ghostOrder.timestamp - 1800000 // approx 30 mins prior
    }];
    ghostOrder.isNetProfit = true;
    ghostOrder.matchType = "MANUAL_FIX";

    // 5. Update State Total Profit
    data.totalProfit += netProfit;
    data.accumulatedProfit = (data.accumulatedProfit || 0) + netProfit;

    // 6. Save
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
    console.log("\n✅ PATCH APPLIED SUCCESSFULLY. Total Profit Updated.");

} catch (e) {
    console.error(e);
}
