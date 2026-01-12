/**
 * REBUILD WITH REAL IDS
 *
 * Reconstruye el historial usando Order IDs REALES de Binance
 * para que matchedLots apunte a BUYs que realmente existen.
 *
 * Usage: PAIR=BTC/USDT node scripts/rebuild_with_real_ids.js
 */

require('dotenv').config();
const fs = require('fs');
const ccxt = require('ccxt');

const PAIR = process.env.PAIR || 'BTC/USDT';
const SYMBOL = PAIR.replace('/', '');
const STATE_FILE = `./data/sessions/VANTAGE01_${SYMBOL}_state.json`;
const GRID_SPACING = parseFloat(process.env.GRID_SPACING) || 0.01;
const TRADING_FEE = 0.001;

async function main() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║   REBUILD WITH REAL IDS - ' + PAIR.padEnd(37) + '║');
    console.log('╠══════════════════════════════════════════════════════════════╣');

    // Initialize Binance
    const binance = new ccxt.binance({
        apiKey: process.env.BINANCE_API_KEY,
        secret: process.env.BINANCE_SECRET,
        enableRateLimit: true,
        options: { defaultType: 'spot' }
    });

    // Load current state
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    const currentProfit = state.realizedProfit || state.totalProfit || 0;
    console.log(`║  Current Profit: $${currentProfit.toFixed(4).padEnd(44)}║`);

    // Backup
    const backupFile = STATE_FILE.replace('.json', `_backup_rebuild_${Date.now()}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(state, null, 2));
    console.log(`║  Backup: ${backupFile.slice(-50).padEnd(50)}║`);

    // Fetch ALL trades from Binance
    console.log('║  Fetching trades from Binance...                             ║');
    const allTrades = await binance.fetchMyTrades(PAIR, undefined, 1000);
    console.log(`║  Fetched ${String(allTrades.length).padEnd(4)} trades                                       ║`);

    // Get BNB price for fee conversion
    let bnbPrice = 700;
    try {
        const bnbTicker = await binance.fetchTicker('BNB/USDT');
        bnbPrice = bnbTicker.last;
    } catch (e) {}
    console.log(`║  BNB Price: $${bnbPrice.toFixed(2).padEnd(46)}║`);

    // Build inventory from BUYs (using REAL Order IDs)
    const inventory = [];
    const filledOrders = [];
    const buyMap = new Map(); // orderId -> trade data

    // First pass: Process all BUYs
    for (const trade of allTrades) {
        // Use ORDER ID as the primary ID (this is the real Binance Order ID)
        const orderId = String(trade.order || trade.id);

        // Convert fee to USDT
        let feeUSDT = 0;
        let feeCurrency = 'USDT';
        if (trade.fee && trade.fee.cost > 0) {
            if (trade.fee.currency === 'USDT') {
                feeUSDT = trade.fee.cost;
                feeCurrency = 'USDT';
            } else if (trade.fee.currency === 'BNB') {
                feeUSDT = trade.fee.cost * bnbPrice;
                feeCurrency = 'BNB';
            } else {
                feeUSDT = trade.fee.cost * trade.price;
                feeCurrency = trade.fee.currency;
            }
        }

        if (trade.side === 'buy') {
            // Add to inventory
            inventory.push({
                id: orderId,
                price: trade.price,
                amount: trade.amount,
                remaining: trade.amount,
                fee: feeUSDT,
                timestamp: trade.timestamp,
                auditVerified: true  // Prevents reconcile from overwriting
            });

            // Store for lookup
            buyMap.set(orderId, {
                id: orderId,
                price: trade.price,
                amount: trade.amount,
                fee: feeUSDT,
                timestamp: trade.timestamp
            });

            // Add to filledOrders
            filledOrders.push({
                id: orderId,
                side: 'buy',
                price: trade.price,
                amount: trade.amount,
                timestamp: trade.timestamp,
                fees: feeUSDT,
                feeCurrency: feeCurrency,
                profit: 0,
                isNetProfit: true
            });
        }
    }

    console.log(`║  BUYs processed: ${String(buyMap.size).padEnd(42)}║`);

    // Sort inventory by timestamp (oldest first for FIFO reference)
    inventory.sort((a, b) => a.timestamp - b.timestamp);

    // Second pass: Process SELLs with SPREAD_MATCH
    let totalProfit = 0;
    let exactMatches = 0;
    let closeMatches = 0;

    for (const trade of allTrades) {
        if (trade.side !== 'sell') continue;

        const orderId = String(trade.order || trade.id);
        const sellPrice = trade.price;
        const sellAmount = trade.amount;

        // Convert fee
        let feeUSDT = 0;
        let feeCurrency = 'USDT';
        if (trade.fee && trade.fee.cost > 0) {
            if (trade.fee.currency === 'USDT') {
                feeUSDT = trade.fee.cost;
                feeCurrency = 'USDT';
            } else if (trade.fee.currency === 'BNB') {
                feeUSDT = trade.fee.cost * bnbPrice;
                feeCurrency = 'BNB';
            } else {
                feeUSDT = trade.fee.cost * trade.price;
                feeCurrency = trade.fee.currency;
            }
        }

        // SPREAD_MATCH: Find best matching lot
        const expectedBuyPrice = sellPrice / (1 + GRID_SPACING);
        const tolerance = expectedBuyPrice * 0.005; // 0.5%

        // Sort candidates by proximity to expected price
        const candidates = inventory
            .filter(lot => lot.remaining > 0.00000001)
            .map(lot => ({
                ...lot,
                diff: Math.abs(lot.price - expectedBuyPrice)
            }))
            .sort((a, b) => a.diff - b.diff);

        let remainingToSell = sellAmount;
        let costBasis = 0;
        let entryFees = 0;
        const matchedLots = [];
        let matchType = 'EXACT';

        for (const candidate of candidates) {
            if (remainingToSell <= 0.00000001) break;

            // Find actual lot in inventory
            const lot = inventory.find(l => l.id === candidate.id);
            if (!lot || lot.remaining <= 0) continue;

            const take = Math.min(remainingToSell, lot.remaining);
            costBasis += take * lot.price;

            if (lot.fee && lot.amount > 0) {
                entryFees += (take / lot.amount) * lot.fee;
            }

            // Check match quality
            const priceDiff = Math.abs(lot.price - expectedBuyPrice);
            if (priceDiff > expectedBuyPrice * 0.02) {
                matchType = 'CLOSE';
            }

            matchedLots.push({
                lotId: lot.id, // This is now a REAL Order ID
                buyPrice: lot.price,
                amountTaken: take,
                remainingAfter: lot.remaining - take,
                timestamp: lot.timestamp
            });

            lot.remaining -= take;
            remainingToSell -= take;
        }

        if (matchedLots.length > 0 && matchedLots[0].lotId) {
            const firstDiff = Math.abs(matchedLots[0].buyPrice - expectedBuyPrice);
            if (firstDiff <= tolerance) {
                exactMatches++;
            } else {
                closeMatches++;
            }
        }

        // Calculate profit
        const sellRevenue = sellPrice * sellAmount;
        const totalFees = feeUSDT + entryFees;
        const profit = sellRevenue - costBasis - totalFees;
        totalProfit += profit;

        const spreadPct = costBasis > 0 ? ((sellRevenue - costBasis) / costBasis) * 100 : 0;

        filledOrders.push({
            id: orderId,
            side: 'sell',
            price: sellPrice,
            amount: sellAmount,
            timestamp: trade.timestamp,
            fees: totalFees,
            feeCurrency: feeCurrency,
            costBasis: costBasis / sellAmount,
            spreadPct: spreadPct,
            profit: profit,
            matchType: matchType,
            matchedLots: matchedLots,
            isNetProfit: true
        });
    }

    // Sort by timestamp desc
    filledOrders.sort((a, b) => b.timestamp - a.timestamp);

    // Clean inventory
    const cleanInventory = inventory.filter(lot => lot.remaining > 0.00000001);

    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║  Total Profit Calculated: $${totalProfit.toFixed(4).padEnd(33)}║`);
    console.log(`║  EXACT matches: ${String(exactMatches).padEnd(43)}║`);
    console.log(`║  CLOSE matches: ${String(closeMatches).padEnd(43)}║`);
    console.log(`║  Remaining inventory: ${String(cleanInventory.length).padEnd(37)} lots ║`);

    // Verify matchedLots point to real BUYs
    const buyIds = new Set(filledOrders.filter(o => o.side === 'buy').map(o => o.id));
    let validMatches = 0;
    let totalMatches = 0;

    filledOrders.filter(o => o.side === 'sell' && o.matchedLots).forEach(sell => {
        sell.matchedLots.forEach(lot => {
            totalMatches++;
            if (buyIds.has(String(lot.lotId))) {
                validMatches++;
            }
        });
    });

    const validPct = totalMatches > 0 ? ((validMatches / totalMatches) * 100).toFixed(0) : 0;
    console.log(`║  matchedLots pointing to real BUYs: ${validMatches}/${totalMatches} (${validPct}%)`.padEnd(63) + '║');

    // Update state
    state.filledOrders = filledOrders;
    state.inventory = cleanInventory;
    state.realizedProfit = totalProfit;
    state.totalProfit = totalProfit;
    state.inventoryStatus = 'VERIFIED';

    // Save
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log('║  ✅ STATE FILE UPDATED WITH REAL IDS                         ║');
    console.log('║  ⚠️  RESTART THE BOT: pm2 restart <bot-name>                  ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
}

main().catch(err => {
    console.error('ERROR:', err.message);
    process.exit(1);
});
