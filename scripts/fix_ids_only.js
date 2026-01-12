/**
 * FIX IDS ONLY - Safe script that ONLY replaces synthetic IDs with real Binance IDs
 *
 * This script does NOT modify:
 * - Profits
 * - Prices
 * - Amounts
 * - Fees
 * - matchedLots
 *
 * It ONLY changes the 'id' field of BUYs that have synthetic IDs (REC_xxx, SYNC_xxx)
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

// Get symbol from command line or default
const SYMBOL = process.argv[2] || 'BTC/USDT';
const STATE_FILE = process.argv[3] || path.join(__dirname, '..', 'data', 'sessions', 'VANTAGE01_BTCUSDT_state.json');

async function getAllTrades(symbol) {
    console.log(`\nDownloading all trades for ${symbol} from Binance...`);
    let allTrades = [];
    let since = undefined;

    // Go back to Dec 1, 2024 to get all trades
    since = Date.parse('2024-12-01T00:00:00Z');

    while (true) {
        const trades = await exchange.fetchMyTrades(symbol, since, 1000);
        if (trades.length === 0) break;

        allTrades = allTrades.concat(trades);

        // Get the last trade's timestamp for pagination
        const lastTrade = trades[trades.length - 1];
        since = lastTrade.timestamp + 1;

        console.log(`  Downloaded ${allTrades.length} trades so far...`);

        if (trades.length < 1000) break;

        await new Promise(r => setTimeout(r, 200));
    }

    console.log(`Total downloaded: ${allTrades.length} trades`);
    return allTrades;
}

async function main() {
    console.log('=== FIX IDS ONLY ===');
    console.log(`Symbol: ${SYMBOL}`);
    console.log(`State file: ${STATE_FILE}`);

    // Load state
    if (!fs.existsSync(STATE_FILE)) {
        console.error(`State file not found: ${STATE_FILE}`);
        process.exit(1);
    }

    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));

    // Get all BUYs
    const buys = state.filledOrders.filter(o => o.side && o.side.toLowerCase() === 'buy');
    const syntheticBuys = buys.filter(b =>
        String(b.id).startsWith('REC_') ||
        String(b.id).startsWith('SYNC_')
    );

    console.log(`\nTotal BUYs: ${buys.length}`);
    console.log(`Synthetic BUYs to fix: ${syntheticBuys.length}`);

    if (syntheticBuys.length === 0) {
        console.log('No synthetic BUYs to fix!');
        return;
    }

    // Download real trades from Binance
    const allTrades = await getAllTrades(SYMBOL);
    const binanceBuys = allTrades.filter(t => t.side === 'buy');
    console.log(`Binance BUY trades: ${binanceBuys.length}`);

    // Create lookup map by orderId
    // ccxt trades have: id (trade id), order (order id), price, amount, timestamp, side
    const binanceByOrderId = new Map();
    binanceBuys.forEach(t => {
        if (t.order) {
            binanceByOrderId.set(String(t.order), t);
        }
    });

    // Track what matchedLots need
    const sells = state.filledOrders.filter(o => o.side && o.side.toLowerCase() === 'sell');
    const neededLotIds = new Set();
    sells.forEach(s => {
        (s.matchedLots || []).forEach(m => {
            if (m.lotId && m.lotId !== 'SYNC_FALLBACK') {
                neededLotIds.add(String(m.lotId));
            }
        });
    });
    console.log(`\nLot IDs needed by matchedLots: ${neededLotIds.size}`);

    // Also check inventory IDs
    const inventoryIds = new Set((state.inventory || []).map(lot => String(lot.id)));
    console.log(`Inventory IDs: ${inventoryIds.size}`);

    // For each synthetic BUY, try to find matching Binance trade
    let fixed = 0;
    let notFound = 0;
    const usedOrderIds = new Set();

    for (const buy of syntheticBuys) {
        const buyPrice = buy.price;
        const buyTime = buy.timestamp;

        // Try to find a Binance BUY with similar price and timestamp
        let bestMatch = null;
        let bestScore = -Infinity;

        for (const [orderId, binanceTrade] of binanceByOrderId) {
            // Skip if already used
            if (usedOrderIds.has(orderId)) continue;

            const binancePrice = binanceTrade.price;
            const binanceTime = binanceTrade.timestamp;

            // Price must be within 1%
            const priceDiff = Math.abs(binancePrice - buyPrice) / buyPrice;
            if (priceDiff > 0.01) continue;

            // Time must be within 2 hours
            const timeDiff = Math.abs(binanceTime - buyTime);
            if (timeDiff > 7200000) continue;

            // Calculate score - prioritize:
            // 1. If this ID is needed by matchedLots (score +1000)
            // 2. Closer price match
            // 3. Closer time match
            let score = 0;
            if (neededLotIds.has(orderId)) {
                score += 1000;
            }
            score -= priceDiff * 100;  // Lower price diff = higher score
            score -= timeDiff / 60000;  // Lower time diff = higher score

            if (score > bestScore) {
                bestScore = score;
                bestMatch = binanceTrade;
            }
        }

        if (bestMatch) {
            const oldId = buy.id;
            const newId = String(bestMatch.order);

            // Only change the ID - nothing else!
            buy.id = newId;
            fixed++;
            usedOrderIds.add(newId);

            const needed = neededLotIds.has(newId) ? ' [NEEDED]' : '';
            console.log(`  Fixed: ${oldId} -> ${newId}${needed}`);
        } else {
            notFound++;
            console.log(`  NOT FOUND: ${buy.id} @ ${buyPrice} (${new Date(buyTime).toISOString()})`);
        }
    }

    console.log(`\n=== Results ===`);
    console.log(`Fixed: ${fixed}`);
    console.log(`Not found: ${notFound}`);

    // Calculate new trazability
    const buyIds = new Set(state.filledOrders.filter(o => o.side && o.side.toLowerCase() === 'buy').map(b => String(b.id)));

    // Also add inventory IDs
    (state.inventory || []).forEach(lot => buyIds.add(String(lot.id)));

    let validMatches = 0, totalMatches = 0;
    sells.forEach(s => {
        (s.matchedLots || []).forEach(m => {
            if (m.lotId && m.lotId !== 'SYNC_FALLBACK') {
                totalMatches++;
                if (buyIds.has(String(m.lotId))) validMatches++;
            }
        });
    });

    console.log(`\nNew Trazability: ${validMatches}/${totalMatches} (${(totalMatches > 0 ? (validMatches/totalMatches*100).toFixed(1) : 0)}%)`);

    // Verify profits unchanged
    const totalProfit = sells.reduce((s, o) => s + (o.profit || 0), 0);
    console.log(`Total Profit (unchanged): $${totalProfit.toFixed(2)}`);

    // Save backup and new state
    const timestamp = Date.now();
    const backupFile = STATE_FILE.replace('.json', `_backup_before_idfix_${timestamp}.json`);
    fs.copyFileSync(STATE_FILE, backupFile);
    console.log(`\nBackup saved: ${backupFile}`);

    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    console.log(`State saved: ${STATE_FILE}`);
}

main().catch(console.error);
