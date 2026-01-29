/**
 * FIX PARTIAL SELLS - Recalculate profits for sells where matchedLots < amount sold
 *
 * BUG: When there's inventory shortfall, profit was only calculated on the matched portion
 * FIX: Recalculate profit on TOTAL sold amount, estimating cost for unmatched portion
 *
 * Usage: node scripts/fix_partial_sells.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const TRADING_FEE = 0.001; // 0.1%
const GRID_SPACING = 0.005; // 0.5% typical

const DATA_DIR = path.join(__dirname, '..', 'data', 'sessions');

const STATE_FILES = [
    'VANTAGE01_BTCUSDT_state.json',
    'VANTAGE01_SOLUSDT_state.json',
    'VANTAGE01_DOGEUSDT_state.json'
];

function fixPartialSells() {
    console.log('='.repeat(60));
    console.log('FIX PARTIAL SELLS - Recalculating profits');
    console.log(DRY_RUN ? '>>> DRY RUN MODE - No changes will be saved <<<' : '>>> LIVE MODE - Changes will be saved <<<');
    console.log('='.repeat(60));
    console.log('');

    let totalFixed = 0;
    let totalProfitAdded = 0;

    for (const stateFile of STATE_FILES) {
        const filePath = path.join(DATA_DIR, stateFile);

        if (!fs.existsSync(filePath)) {
            console.log(`[SKIP] ${stateFile} not found`);
            continue;
        }

        console.log(`\n[PROCESSING] ${stateFile}`);
        console.log('-'.repeat(50));

        const state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const sells = (state.filledOrders || []).filter(o => o.side === 'sell');

        let fixedInThisBot = 0;
        let profitAddedInThisBot = 0;
        let originalTotalProfit = state.totalProfit || 0;

        for (const sell of sells) {
            const matchedLots = sell.matchedLots || [];
            const matchedAmount = matchedLots.reduce((sum, l) => sum + (l.amountTaken || 0), 0);
            const totalAmount = sell.amount;
            const unmatchedAmount = totalAmount - matchedAmount;

            // Skip if fully matched (no shortfall)
            if (unmatchedAmount < 0.00000001) continue;

            // Calculate what profit SHOULD be
            const sellPrice = sell.price;
            const matchedCost = matchedLots.reduce((sum, l) => sum + ((l.price || l.buyPrice) * (l.amountTaken || 0)), 0);

            // Estimate cost for unmatched portion
            const estimatedBuyPrice = sellPrice / (1 + GRID_SPACING);
            const unmatchedCost = unmatchedAmount * estimatedBuyPrice;
            const totalCost = matchedCost + unmatchedCost;

            // Calculate correct profit
            const sellRevenue = sellPrice * totalAmount;
            const grossProfit = sellRevenue - totalCost;
            const buyFee = totalCost * TRADING_FEE;
            const sellFee = sellRevenue * TRADING_FEE;
            const totalFees = buyFee + sellFee;
            const correctProfit = grossProfit - totalFees;

            const oldProfit = sell.profit || 0;
            const profitDiff = correctProfit - oldProfit;

            // Only fix if there's a significant difference (> $0.001)
            if (Math.abs(profitDiff) > 0.001) {
                console.log(`  [FIX] Sell ${sell.id}`);
                console.log(`    Matched: ${matchedAmount.toFixed(8)} / ${totalAmount.toFixed(8)} (${(matchedAmount/totalAmount*100).toFixed(1)}%)`);
                console.log(`    Old Profit: $${oldProfit.toFixed(6)}`);
                console.log(`    New Profit: $${correctProfit.toFixed(6)}`);
                console.log(`    Diff: +$${profitDiff.toFixed(6)}`);

                if (!DRY_RUN) {
                    // Update the sell
                    sell.profit = correctProfit;
                    sell.costBasis = totalCost / totalAmount; // Update avgCost
                    sell.spreadPct = ((sellPrice - (totalCost / totalAmount)) / (totalCost / totalAmount)) * 100;
                    sell.isNetProfit = true;

                    // Add estimated lot to matchedLots if not already there
                    const hasEstimated = matchedLots.some(l => l.source === 'SHORTFALL_ESTIMATE' || l.lotId === 'ESTIMATED_SHORTFALL');
                    if (!hasEstimated) {
                        sell.matchedLots.push({
                            lotId: 'ESTIMATED_SHORTFALL',
                            buyPrice: estimatedBuyPrice,
                            amountTaken: unmatchedAmount,
                            remainingAfter: 0,
                            timestamp: sell.timestamp,
                            source: 'SHORTFALL_ESTIMATE'
                        });
                    }

                    // Update matchType to indicate fix
                    if (sell.matchType === 'PARTIAL') {
                        sell.matchType = 'PARTIAL_FIXED';
                    }
                }

                fixedInThisBot++;
                profitAddedInThisBot += profitDiff;
            }
        }

        if (fixedInThisBot > 0) {
            console.log(`\n  [SUMMARY] ${stateFile.replace('_state.json', '')}`);
            console.log(`    Fixed: ${fixedInThisBot} sells`);
            console.log(`    Profit added: +$${profitAddedInThisBot.toFixed(4)}`);

            if (!DRY_RUN) {
                // Update totalProfit
                state.totalProfit = (state.totalProfit || 0) + profitAddedInThisBot;
                console.log(`    New totalProfit: $${state.totalProfit.toFixed(4)} (was $${originalTotalProfit.toFixed(4)})`);

                // Backup and save
                const backupPath = filePath + '.bak_partial_fix_' + Date.now();
                fs.copyFileSync(filePath, backupPath);
                console.log(`    Backup: ${path.basename(backupPath)}`);

                fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
                console.log(`    Saved!`);
            }

            totalFixed += fixedInThisBot;
            totalProfitAdded += profitAddedInThisBot;
        } else {
            console.log(`  [OK] No PARTIAL sells to fix`);
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log('TOTAL SUMMARY');
    console.log('='.repeat(60));
    console.log(`  Sells fixed: ${totalFixed}`);
    console.log(`  Profit recovered: +$${totalProfitAdded.toFixed(4)}`);
    if (DRY_RUN) {
        console.log('\n  >>> Run without --dry-run to apply fixes <<<');
    }
}

fixPartialSells();
