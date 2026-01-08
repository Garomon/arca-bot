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
const STATE_FILE = path.join(__dirname, '..', 'data', 'grid_state.json');
const BACKUP_FILE = path.join(__dirname, '..', 'data', 'grid_state_backup_fees.json');
const TRADING_PAIR = process.env.TRADING_PAIR || 'BTC/USDT';
const DRY_RUN = !process.argv.includes('--apply');

// Initialize Binance
const binance = new ccxt.binance({
    apiKey: process.env.BINANCE_API_KEY,
    secret: process.env.BINANCE_API_SECRET,
    enableRateLimit: true,
    options: { defaultType: 'spot' }
});

async function main() {
    console.log('='.repeat(60));
    console.log('📊 HISTORICAL FEE RECALCULATION SCRIPT');
    console.log(`   Pair: ${TRADING_PAIR}`);
    console.log(`   Mode: ${DRY_RUN ? '🔍 DRY RUN (preview only)' : '⚡ APPLY CHANGES'}`);
    console.log('='.repeat(60));

    // Load state
    if (!fs.existsSync(STATE_FILE)) {
        console.error('❌ State file not found:', STATE_FILE);
        process.exit(1);
    }

    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    const filledOrders = state.filledOrders || [];

    console.log(`\n📦 Found ${filledOrders.length} filled orders in state.\n`);

    if (filledOrders.length === 0) {
        console.log('Nothing to process.');
        return;
    }

    // Backup before any changes
    if (!DRY_RUN) {
        fs.writeFileSync(BACKUP_FILE, JSON.stringify(state, null, 2));
        console.log(`💾 Backup saved to: ${BACKUP_FILE}\n`);
    }

    // Fetch all trades from Binance (paginated if needed)
    console.log('🔄 Fetching trade history from Binance...');
    let allTrades = [];
    let since = undefined;
    const symbol = TRADING_PAIR.replace('/', '');

    try {
        // Fetch in batches (Binance limit is 1000 per request)
        while (true) {
            const trades = await binance.fetchMyTrades(TRADING_PAIR, since, 1000);
            if (trades.length === 0) break;

            allTrades = allTrades.concat(trades);
            since = trades[trades.length - 1].timestamp + 1;

            console.log(`   Fetched ${allTrades.length} trades so far...`);

            // Safety: Don't fetch more than 10000 trades
            if (allTrades.length >= 10000) {
                console.log('   (Reached 10000 trade limit)');
                break;
            }

            // Rate limit protection
            await new Promise(r => setTimeout(r, 200));
        }
    } catch (e) {
        console.error('❌ Error fetching trades:', e.message);
        process.exit(1);
    }

    console.log(`✅ Fetched ${allTrades.length} total trades from Binance.\n`);

    // Build a map: orderId -> trade info (for quick lookup)
    const tradeMap = new Map();
    for (const trade of allTrades) {
        // CCXT trade structure: { id, order, info, ... }
        // info.orderId is the Binance order ID
        const orderId = trade.order || trade.info?.orderId;
        if (orderId) {
            // Store the trade with the most complete fee info
            if (!tradeMap.has(orderId) || trade.fee?.cost > 0) {
                tradeMap.set(String(orderId), trade);
            }
        }
    }

    console.log(`📋 Mapped ${tradeMap.size} unique order IDs.\n`);

    // Get current BNB price for conversions
    let bnbPrice = 0;
    try {
        const ticker = await binance.fetchTicker('BNB/USDT');
        bnbPrice = ticker.last;
        console.log(`💰 Current BNB Price: $${bnbPrice.toFixed(2)}\n`);
    } catch (e) {
        console.warn('⚠️ Could not fetch BNB price. BNB fees will be estimated.');
    }

    // Process each filled order
    let updated = 0;
    let skipped = 0;
    let notFound = 0;

    console.log('Processing orders...\n');
    console.log('ID'.padEnd(12) + 'Side'.padEnd(6) + 'Old Fee'.padEnd(12) + 'New Fee'.padEnd(12) + 'Currency'.padEnd(10) + 'Status');
    console.log('-'.repeat(70));

    for (const order of filledOrders) {
        const orderId = String(order.id);
        const trade = tradeMap.get(orderId);

        if (!trade) {
            // Order not found in Binance history (might be very old or different pair)
            notFound++;
            continue;
        }

        // Extract actual fee from trade
        const actualFee = trade.fee;
        if (!actualFee || actualFee.cost === 0) {
            skipped++;
            continue;
        }

        // Convert to USDT
        let feeUSDT = 0;
        const feeCurrency = actualFee.currency;

        if (feeCurrency === 'USDT') {
            feeUSDT = actualFee.cost;
        } else if (feeCurrency === 'BNB' && bnbPrice > 0) {
            feeUSDT = actualFee.cost * bnbPrice;
        } else if (feeCurrency === TRADING_PAIR.split('/')[0]) {
            // Paid in base asset (e.g., BTC)
            feeUSDT = actualFee.cost * (order.fillPrice || order.price || 0);
        } else {
            // Unknown currency, skip
            skipped++;
            continue;
        }

        const oldFee = order.fees || 0;
        const shortId = orderId.slice(-8);
        const side = order.side || '?';

        console.log(
            `...${shortId}`.padEnd(12) +
            side.toUpperCase().padEnd(6) +
            `$${oldFee.toFixed(4)}`.padEnd(12) +
            `$${feeUSDT.toFixed(4)}`.padEnd(12) +
            feeCurrency.padEnd(10) +
            (Math.abs(oldFee - feeUSDT) > 0.0001 ? '📝 Changed' : '✓ Same')
        );

        // Update the order (only if not dry run)
        if (!DRY_RUN) {
            order.fees = feeUSDT;
            order.feeCurrency = feeCurrency;
            order.feeRaw = actualFee.cost; // Store original amount too
        }

        updated++;
    }

    console.log('-'.repeat(70));
    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Updated: ${updated}`);
    console.log(`   ⏭️ Skipped (no fee data): ${skipped}`);
    console.log(`   ❓ Not found in Binance: ${notFound}`);

    // Save if not dry run
    if (!DRY_RUN && updated > 0) {
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
        console.log(`\n💾 Changes saved to: ${STATE_FILE}`);
        console.log(`   Backup available at: ${BACKUP_FILE}`);
    } else if (DRY_RUN) {
        console.log(`\n🔍 DRY RUN complete. No changes made.`);
        console.log(`   Run with --apply to apply changes.`);
    }

    console.log('\n✅ Done!');
}

main().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
