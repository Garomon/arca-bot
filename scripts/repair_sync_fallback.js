/**
 * REPAIR SYNC_FALLBACK - Fix ONLY the lotId without changing profits
 *
 * This script finds trades where lotId = 'SYNC_FALLBACK' and replaces
 * the lotId with a real Binance Order ID. It does NOT change profits.
 */

const ccxt = require('ccxt');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const exchange = new ccxt.binance({
    apiKey: process.env.BINANCE_API_KEY,
    secret: process.env.BINANCE_SECRET,
    enableRateLimit: true
});

const SYMBOL = process.argv[2] || 'BTC/USDT';
const STATE_FILE = process.argv[3] || path.join(__dirname, '..', 'data', 'sessions', 'VANTAGE01_BTCUSDT_state.json');

async function getAllTrades(symbol) {
    console.log(`\nDownloading trades for ${symbol}...`);
    let allTrades = [];
    let since = Date.parse('2024-12-01T00:00:00Z');

    while (true) {
        const trades = await exchange.fetchMyTrades(symbol, since, 1000);
        if (trades.length === 0) break;
        allTrades = allTrades.concat(trades);
        since = trades[trades.length - 1].timestamp + 1;
        if (trades.length < 1000) break;
        await new Promise(r => setTimeout(r, 200));
    }

    console.log(`Downloaded ${allTrades.length} trades`);
    return allTrades;
}

async function main() {
    console.log('=== REPAIR SYNC_FALLBACK (IDs only) ===');
    console.log(`Symbol: ${SYMBOL}`);
    console.log(`State file: ${STATE_FILE}`);

    if (!fs.existsSync(STATE_FILE)) {
        console.error(`State file not found: ${STATE_FILE}`);
        process.exit(1);
    }

    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    const sells = state.filledOrders.filter(o => o.side && o.side.toLowerCase() === 'sell');

    // Find SELLs with SYNC_FALLBACK
    const fallbackSells = sells.filter(s =>
        s.matchedLots && s.matchedLots.some(m => m.lotId === 'SYNC_FALLBACK')
    );

    console.log(`\nSELLs with SYNC_FALLBACK: ${fallbackSells.length}`);

    if (fallbackSells.length === 0) {
        console.log('Nothing to repair!');
        return;
    }

    // Get profit BEFORE any changes
    const profitBefore = sells.reduce((s, o) => s + (o.profit || 0), 0);
    console.log(`Profit before: $${profitBefore.toFixed(2)}`);

    // Download real trades
    const allTrades = await getAllTrades(SYMBOL);
    const binanceBuys = allTrades.filter(t => t.side === 'buy');

    // Build available BUYs map
    const availableBuys = new Map();
    binanceBuys.forEach(t => {
        if (t.order) {
            availableBuys.set(String(t.order), {
                id: String(t.order),
                price: t.price,
                amount: t.amount,
                timestamp: t.timestamp
            });
        }
    });

    // Also add from inventory and filledOrders
    (state.inventory || []).forEach(lot => {
        if (!availableBuys.has(String(lot.id))) {
            availableBuys.set(String(lot.id), {
                id: String(lot.id),
                price: lot.price,
                amount: lot.amount,
                timestamp: lot.timestamp
            });
        }
    });

    state.filledOrders.filter(o => o.side && o.side.toLowerCase() === 'buy').forEach(b => {
        if (!availableBuys.has(String(b.id))) {
            availableBuys.set(String(b.id), {
                id: String(b.id),
                price: b.price,
                amount: b.amount,
                timestamp: b.timestamp
            });
        }
    });

    console.log(`Available BUYs: ${availableBuys.size}`);

    let fixed = 0;
    let notFound = 0;
    const usedIds = new Set();

    for (const sell of fallbackSells) {
        // Get the SYNC_FALLBACK matchedLot
        const fallbackLot = sell.matchedLots.find(m => m.lotId === 'SYNC_FALLBACK');
        if (!fallbackLot) continue;

        const expectedPrice = fallbackLot.buyPrice;
        const sellTime = sell.timestamp;

        console.log(`\nSELL #${sell.id} @ ${sell.price}:`);
        console.log(`  Expected BUY: ~${expectedPrice.toFixed(4)}`);

        // Find best match
        let bestMatch = null;
        let bestPriceDiff = Infinity;

        for (const [id, buy] of availableBuys) {
            if (usedIds.has(id)) continue;
            if (buy.timestamp > sellTime) continue;

            const priceDiff = Math.abs(buy.price - expectedPrice);
            if (priceDiff < bestPriceDiff && priceDiff / expectedPrice < 0.05) {
                bestPriceDiff = priceDiff;
                bestMatch = buy;
            }
        }

        if (bestMatch) {
            console.log(`  Found: #${bestMatch.id} @ ${bestMatch.price.toFixed(4)}`);

            // ONLY change lotId - nothing else!
            fallbackLot.lotId = bestMatch.id;
            usedIds.add(bestMatch.id);
            fixed++;
        } else {
            console.log(`  NOT FOUND`);
            notFound++;
        }
    }

    // Verify profit unchanged
    const profitAfter = sells.reduce((s, o) => s + (o.profit || 0), 0);

    console.log(`\n=== Results ===`);
    console.log(`Fixed: ${fixed}`);
    console.log(`Not found: ${notFound}`);
    console.log(`Profit before: $${profitBefore.toFixed(2)}`);
    console.log(`Profit after:  $${profitAfter.toFixed(2)}`);

    if (Math.abs(profitAfter - profitBefore) > 0.01) {
        console.error('ERROR: Profit changed! Aborting...');
        process.exit(1);
    }

    // Save
    const timestamp = Date.now();
    const backupFile = STATE_FILE.replace('.json', `_backup_syncfix_${timestamp}.json`);
    fs.copyFileSync(STATE_FILE, backupFile);
    console.log(`\nBackup: ${backupFile}`);

    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    console.log(`Saved: ${STATE_FILE}`);
}

main().catch(console.error);
