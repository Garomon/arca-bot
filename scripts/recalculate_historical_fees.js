/**
 * recalculate_historical_fees.js
 * 
 * This script fetches ACTUAL fees from Binance trade history
 * and updates the filledOrders in grid_state.json.
 * 
 * IMPORTANT: This only updates the 'fees' and 'feeCurrency' fields.
 * It does NOT recalculate profit - that would be too risky.
 * The profit was already calculated at trade time and is preserved.
 * 
 * Usage:
 *   node scripts/recalculate_historical_fees.js          # Dry run (preview only)
 *   node scripts/recalculate_historical_fees.js --apply  # Apply changes
 */

require('dotenv').config();
const ccxt = require('ccxt');
const fs = require('fs');
const path = require('path');

// === CONFIG ===
const SESSIONS_DIR = path.join(__dirname, '..', 'data', 'sessions');
const LEGACY_STATE_FILE = path.join(__dirname, '..', 'data', 'grid_state.json');
const DRY_RUN = !process.argv.includes('--apply');

// Find all state files
function findStateFiles() {
    const files = [];

    // Check legacy path first
    if (fs.existsSync(LEGACY_STATE_FILE)) {
        files.push({ path: LEGACY_STATE_FILE, pair: 'BTC/USDT' });
    }

    // Check multi-bot sessions
    if (fs.existsSync(SESSIONS_DIR)) {
        const sessionFiles = fs.readdirSync(SESSIONS_DIR)
            .filter(f => f.endsWith('_state.json') && !f.includes('backup'));

        for (const f of sessionFiles) {
            // Extract pair from filename: VANTAGE01_BTCUSDT_state.json -> BTC/USDT
            // Known quote assets: USDT, USDC, BTC, ETH, etc.
            const match = f.match(/VANTAGE\d+_([A-Z]+)(USDT|USDC|BTC|ETH|BUSD)_state\.json/);
            if (match) {
                const pair = `${match[1]}/${match[2]}`;
                files.push({ path: path.join(SESSIONS_DIR, f), pair });
            }
        }
    }

    return files;
}

// Initialize Binance
const binance = new ccxt.binance({
    apiKey: process.env.BINANCE_API_KEY,
    secret: process.env.BINANCE_SECRET,
    enableRateLimit: true,
    options: { defaultType: 'spot' }
});

async function processStateFile(stateFile, tradingPair, bnbPrice) {
    const backupFile = stateFile.replace('.json', '_backup_fees.json');

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📂 Processing: ${path.basename(stateFile)}`);
    console.log(`   Pair: ${tradingPair}`);
    console.log(`${'─'.repeat(60)}`);

    // Load state
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    const filledOrders = state.filledOrders || [];

    console.log(`📦 Found ${filledOrders.length} filled orders.\n`);

    if (filledOrders.length === 0) {
        console.log('Nothing to process for this bot.');
        return { updated: 0, skipped: 0, notFound: 0 };
    }

    // Backup before any changes
    if (!DRY_RUN) {
        fs.writeFileSync(backupFile, JSON.stringify(state, null, 2));
        console.log(`💾 Backup saved to: ${path.basename(backupFile)}\n`);
    }

    // Fetch trades for this pair
    console.log('🔄 Fetching trade history from Binance...');
    let allTrades = [];
    let since = undefined;

    try {
        while (true) {
            const trades = await binance.fetchMyTrades(tradingPair, since, 1000);
            if (trades.length === 0) break;

            allTrades = allTrades.concat(trades);
            since = trades[trades.length - 1].timestamp + 1;

            console.log(`   Fetched ${allTrades.length} trades so far...`);

            if (allTrades.length >= 10000) {
                console.log('   (Reached 10000 trade limit)');
                break;
            }

            await new Promise(r => setTimeout(r, 200));
        }
    } catch (e) {
        console.error('❌ Error fetching trades:', e.message);
        return { updated: 0, skipped: 0, notFound: filledOrders.length };
    }

    console.log(`✅ Fetched ${allTrades.length} total trades.\n`);

    // Build trade map
    const tradeMap = new Map();
    for (const trade of allTrades) {
        const orderId = trade.order || trade.info?.orderId;
        if (orderId) {
            if (!tradeMap.has(orderId) || trade.fee?.cost > 0) {
                tradeMap.set(String(orderId), trade);
            }
        }
    }

    console.log(`📋 Mapped ${tradeMap.size} unique order IDs.\n`);

    // Process orders
    let updated = 0;
    let skipped = 0;
    let notFound = 0;

    const baseAsset = tradingPair.split('/')[0];

    for (const order of filledOrders) {
        const orderId = String(order.id);
        const trade = tradeMap.get(orderId);

        if (!trade) {
            notFound++;
            continue;
        }

        const actualFee = trade.fee;
        if (!actualFee || actualFee.cost === 0) {
            skipped++;
            continue;
        }

        let feeUSDT = 0;
        const feeCurrency = actualFee.currency;

        if (feeCurrency === 'USDT') {
            feeUSDT = actualFee.cost;
        } else if (feeCurrency === 'BNB' && bnbPrice > 0) {
            feeUSDT = actualFee.cost * bnbPrice;
        } else if (feeCurrency === baseAsset) {
            feeUSDT = actualFee.cost * (order.fillPrice || order.price || 0);
        } else {
            skipped++;
            continue;
        }

        if (!DRY_RUN) {
            order.fees = feeUSDT;
            order.feeCurrency = feeCurrency;
            order.feeRaw = actualFee.cost;
        }

        updated++;
    }

    // Save if not dry run
    if (!DRY_RUN && updated > 0) {
        fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
        console.log(`💾 Saved ${updated} updates to: ${path.basename(stateFile)}`);
    }

    return { updated, skipped, notFound };
}

async function main() {
    console.log('='.repeat(60));
    console.log('📊 HISTORICAL FEE RECALCULATION SCRIPT (Multi-Bot)');
    console.log(`   Mode: ${DRY_RUN ? '🔍 DRY RUN (preview only)' : '⚡ APPLY CHANGES'}`);
    console.log('='.repeat(60));

    // Find all state files
    const stateFiles = findStateFiles();

    if (stateFiles.length === 0) {
        console.error('❌ No state files found!');
        console.log('   Checked: data/grid_state.json');
        console.log('   Checked: data/sessions/*.json');
        process.exit(1);
    }

    console.log(`\n📁 Found ${stateFiles.length} bot state file(s):`);
    stateFiles.forEach(f => console.log(`   - ${path.basename(f.path)} (${f.pair})`));

    // Get BNB price once for all
    let bnbPrice = 0;
    try {
        const ticker = await binance.fetchTicker('BNB/USDT');
        bnbPrice = ticker.last;
        console.log(`\n💰 BNB Price: $${bnbPrice.toFixed(2)}`);
    } catch (e) {
        console.warn('⚠️ Could not fetch BNB price. BNB fees will be estimated.');
    }

    // Process each state file
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalNotFound = 0;

    for (const { path: stateFile, pair } of stateFiles) {
        const result = await processStateFile(stateFile, pair, bnbPrice);
        totalUpdated += result.updated;
        totalSkipped += result.skipped;
        totalNotFound += result.notFound;
    }

    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 FINAL SUMMARY');
    console.log('='.repeat(60));
    console.log(`   ✅ Updated: ${totalUpdated}`);
    console.log(`   ⏭️ Skipped (no fee data): ${totalSkipped}`);
    console.log(`   ❓ Not found in Binance: ${totalNotFound}`);

    if (DRY_RUN) {
        console.log(`\n🔍 DRY RUN complete. No changes made.`);
        console.log(`   Run with --apply to apply changes.`);
    }

    console.log('\n✅ Done!');
}

main().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});

