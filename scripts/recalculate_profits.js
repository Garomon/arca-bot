/**
 * recalculate_profits.js
 * 
 * Recalculates profits based on the corrected fees.
 * newProfit = oldProfit + (oldFees - newFees)
 * 
 * Usage:
 *   node scripts/recalculate_profits.js          # Dry run
 *   node scripts/recalculate_profits.js --apply  # Apply changes
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const SESSIONS_DIR = path.join(__dirname, '..', 'data', 'sessions');
const DRY_RUN = !process.argv.includes('--apply');

function findStateFiles() {
    const files = [];
    if (fs.existsSync(SESSIONS_DIR)) {
        const sessionFiles = fs.readdirSync(SESSIONS_DIR)
            .filter(f => f.endsWith('_state.json') && !f.includes('backup'));
        for (const f of sessionFiles) {
            const match = f.match(/VANTAGE\d+_([A-Z]+)(USDT|USDC|BTC|ETH|BUSD)_state\.json/);
            if (match) {
                files.push({ path: path.join(SESSIONS_DIR, f), pair: `${match[1]}/${match[2]}` });
            }
        }
    }
    return files;
}

function processStateFile(stateFile) {
    const backupFile = stateFile.replace('.json', '_backup_profits.json');
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📂 Processing: ${path.basename(stateFile)}`);

    const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    const filledOrders = state.filledOrders || [];
    const sellOrders = filledOrders.filter(o => o.side === 'sell' && o.profit !== undefined);

    console.log(`📦 Found ${sellOrders.length} sell orders with profit data.`);

    if (sellOrders.length === 0) return { updated: 0, totalDiff: 0 };

    if (!DRY_RUN) {
        fs.writeFileSync(backupFile, JSON.stringify(state, null, 2));
        console.log(`💾 Backup: ${path.basename(backupFile)}`);
    }

    let updated = 0;
    let totalDiff = 0;

    for (const order of sellOrders) {
        // Check if order has the new fee data from our recalculation
        if (order.fees !== undefined && order.feeRaw !== undefined && order.feeCurrency) {
            // Calculate what the old estimated fee would have been
            // Old logic: totalFees = tradeValue * CONFIG.tradingFee * 2 (entry + exit at 0.1%)
            const tradeValue = (order.fillPrice || order.price) * order.amount;
            const estimatedOldTotalFee = tradeValue * 0.001 * 2; // 0.1% entry + 0.1% exit
            const newFee = order.fees || 0;

            const feeDiff = estimatedOldTotalFee - newFee;

            if (feeDiff > 0.0001 && order.profit !== undefined) {
                const oldProfit = order.profit;
                const newProfit = oldProfit + feeDiff;

                if (!DRY_RUN) {
                    order.profit = newProfit;
                    order.profitAdjusted = true;
                }

                console.log(`  ${order.id.toString().slice(-6)}: $${oldProfit.toFixed(4)} → $${newProfit.toFixed(4)} (+$${feeDiff.toFixed(4)})`);
                updated++;
                totalDiff += feeDiff;
            }
        }
    }

    if (!DRY_RUN && updated > 0) {
        fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
        console.log(`💾 Saved ${updated} profit updates`);
    }

    return { updated, totalDiff };
}

async function main() {
    console.log('='.repeat(60));
    console.log('📊 PROFIT RECALCULATION SCRIPT');
    console.log(`   Mode: ${DRY_RUN ? '🔍 DRY RUN' : '⚡ APPLY'}`);
    console.log('='.repeat(60));

    const stateFiles = findStateFiles();
    if (stateFiles.length === 0) {
        console.error('❌ No state files found!');
        process.exit(1);
    }

    console.log(`\n📁 Found ${stateFiles.length} bot(s)`);

    let totalUpdated = 0;
    let grandTotalDiff = 0;

    for (const { path: stateFile } of stateFiles) {
        const result = processStateFile(stateFile);
        totalUpdated += result.updated;
        grandTotalDiff += result.totalDiff;
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`   ✅ Updated: ${totalUpdated} orders`);
    console.log(`   💰 Total profit increase: +$${grandTotalDiff.toFixed(4)}`);

    if (DRY_RUN) {
        console.log(`\n🔍 DRY RUN - Run with --apply to save changes`);
    }

    console.log('\n✅ Done!');
}

main().catch(e => { console.error('Error:', e); process.exit(1); });
