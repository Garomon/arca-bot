/**
 * FIX FEE CURRENCY - Correct 'BNB-' to 'USDT' for orders where fee is already converted
 *
 * BUG: The fee value was stored in USDT equivalent but feeCurrency said 'BNB-'
 * FIX: Change feeCurrency to 'USDT' since the value is already in USDT
 *
 * Usage: node scripts/fix_fee_currency.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

const DATA_DIR = path.join(__dirname, '..', 'data', 'sessions');

const STATE_FILES = [
    'VANTAGE01_BTCUSDT_state.json',
    'VANTAGE01_SOLUSDT_state.json',
    'VANTAGE01_DOGEUSDT_state.json'
];

function fixFeeCurrency() {
    console.log('='.repeat(60));
    console.log('FIX FEE CURRENCY - Correcting BNB- to USDT');
    console.log(DRY_RUN ? '>>> DRY RUN MODE <<<' : '>>> LIVE MODE <<<');
    console.log('='.repeat(60));
    console.log('');

    let totalFixed = 0;

    for (const stateFile of STATE_FILES) {
        const filePath = path.join(DATA_DIR, stateFile);

        if (!fs.existsSync(filePath)) {
            console.log(`[SKIP] ${stateFile} not found`);
            continue;
        }

        console.log(`\n[PROCESSING] ${stateFile}`);
        console.log('-'.repeat(50));

        const state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const orders = state.filledOrders || [];
        const inventory = state.inventory || [];

        let fixedOrders = 0;
        let fixedLots = 0;

        // Fix filledOrders
        for (const order of orders) {
            if (order.feeCurrency === 'BNB-') {
                if (!DRY_RUN) {
                    order.feeCurrency = 'USDT';
                }
                fixedOrders++;
            }
        }

        // Fix inventory lots
        for (const lot of inventory) {
            // Lots don't have feeCurrency but might have related issues
            // Skip for now
        }

        console.log(`  Fixed ${fixedOrders} orders with 'BNB-' feeCurrency`);

        if (fixedOrders > 0 && !DRY_RUN) {
            // Backup and save
            const backupPath = filePath + '.bak_fee_fix_' + Date.now();
            fs.copyFileSync(filePath, backupPath);
            console.log(`  Backup: ${path.basename(backupPath)}`);

            fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
            console.log(`  Saved!`);
        }

        totalFixed += fixedOrders;
    }

    console.log('\n' + '='.repeat(60));
    console.log(`TOTAL: Fixed ${totalFixed} orders`);
    console.log('='.repeat(60));

    if (DRY_RUN) {
        console.log('\n>>> Run without --dry-run to apply fixes <<<');
    }
}

fixFeeCurrency();
