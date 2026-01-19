/**
 * REBUILD CLEAN HISTORY
 * Reconstruye el historial desde Binance usando SPREAD_MATCH correcto
 * SIN duplicados de lotes
 */

const ccxt = require('ccxt');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pair = process.argv[2] || 'BTC/USDT';
const pairFile = pair.replace('/', '');

async function rebuild() {
    console.log(`\n🔧 Rebuilding clean history for ${pair}...\n`);

    const binance = new ccxt.binance({
        apiKey: process.env.BINANCE_API_KEY,
        secret: process.env.BINANCE_SECRET
    });

    const stateFile = path.join(__dirname, '..', 'data', 'sessions', `VANTAGE01_${pairFile}_state.json`);
    const state = JSON.parse(fs.readFileSync(stateFile));

    // Fetch all trades from Binance
    const trades = await binance.fetchMyTrades(pair, undefined, 500);
    trades.sort((a, b) => a.timestamp - b.timestamp); // Chronological order

    console.log(`📊 Fetched ${trades.length} trades from Binance`);

    // Separate buys and sells
    const buys = trades.filter(t => t.side === 'buy');
    const sells = trades.filter(t => t.side === 'sell');

    console.log(`   Buys: ${buys.length}, Sells: ${sells.length}`);

    // Track used buys (by ID)
    const usedBuyIds = new Set();
    const newFilledOrders = [];
    let totalProfit = 0;

    // Get BNB price for fee conversion
    const bnbPrice = (await binance.fetchTicker('BNB/USDT')).last;

    // Process each sell and find matching buy using SPREAD_MATCH logic
    for (const sell of sells) {
        const sellId = sell.orderId || sell.order || sell.id;
        const sellPrice = sell.price;
        const sellAmount = sell.amount;

        // SPREAD_MATCH: Find buy where buyPrice * (1 + spread) ≈ sellPrice
        // Expected buy price for a ~1% spread grid
        const expectedBuyPrice = sellPrice / 1.01;
        const tolerance = expectedBuyPrice * 0.02; // 2% tolerance

        // Find best matching buy that hasn't been used
        let bestBuy = null;
        let bestScore = Infinity;

        for (const buy of buys) {
            const buyId = buy.orderId || buy.order || buy.id;

            // Skip if already used
            if (usedBuyIds.has(buyId)) continue;

            // Skip if after sell (can't sell what you haven't bought)
            if (buy.timestamp >= sell.timestamp) continue;

            // Calculate match score (lower is better)
            const priceDiff = Math.abs(buy.price - expectedBuyPrice);
            const amountDiff = Math.abs(buy.amount - sellAmount) / sellAmount;

            // Must be within tolerance
            if (priceDiff > tolerance) continue;
            if (amountDiff > 0.1) continue; // 10% amount tolerance

            const score = priceDiff + (amountDiff * expectedBuyPrice * 10);

            if (score < bestScore) {
                bestScore = score;
                bestBuy = buy;
            }
        }

        // Convert fees to USDT
        const sellFee = sell.fee?.currency === 'BNB' ? sell.fee.cost * bnbPrice :
                       sell.fee?.currency === 'USDT' ? sell.fee.cost :
                       sell.fee?.cost * sellPrice || 0;

        if (bestBuy) {
            const buyId = bestBuy.orderId || bestBuy.order || bestBuy.id;
            usedBuyIds.add(buyId);

            const buyFee = bestBuy.fee?.currency === 'BNB' ? bestBuy.fee.cost * bnbPrice :
                          bestBuy.fee?.currency === 'USDT' ? bestBuy.fee.cost :
                          bestBuy.fee?.cost * bestBuy.price || 0;

            const costBasis = bestBuy.price * sellAmount;
            const revenue = sellPrice * sellAmount;
            const totalFees = buyFee + sellFee;
            const profit = revenue - costBasis - totalFees;
            const spreadPct = ((sellPrice - bestBuy.price) / bestBuy.price) * 100;

            totalProfit += profit;

            newFilledOrders.push({
                id: sellId,
                side: 'sell',
                price: sellPrice,
                amount: sellAmount,
                timestamp: sell.timestamp,
                fillPrice: sellPrice,
                status: 'filled',
                costBasis: bestBuy.price,
                spreadPct: spreadPct,
                fees: totalFees,
                feeCurrency: sell.fee?.currency || 'USDT',
                profit: profit,
                matchType: 'SPREAD_MATCH',
                matchedLots: [{
                    lotId: buyId,
                    buyPrice: bestBuy.price,
                    amountTaken: sellAmount,
                    remainingAfter: 0,
                    timestamp: bestBuy.timestamp
                }],
                isNetProfit: true
            });
        } else {
            // No match found - record sell without profit calculation
            console.log(`   ⚠️ No match for SELL ${sellId} @ $${sellPrice.toFixed(4)}`);
            newFilledOrders.push({
                id: sellId,
                side: 'sell',
                price: sellPrice,
                amount: sellAmount,
                timestamp: sell.timestamp,
                fillPrice: sellPrice,
                status: 'filled',
                costBasis: 0,
                spreadPct: 0,
                fees: sellFee,
                feeCurrency: sell.fee?.currency || 'USDT',
                profit: 0,
                matchType: 'UNMATCHED',
                matchedLots: [],
                isNetProfit: false
            });
        }
    }

    // Add buy orders too (for transaction log display)
    for (const buy of buys) {
        const buyId = buy.orderId || buy.order || buy.id;
        const buyFee = buy.fee?.currency === 'BNB' ? buy.fee.cost * bnbPrice :
                      buy.fee?.currency === 'USDT' ? buy.fee.cost :
                      buy.fee?.cost * buy.price || 0;

        newFilledOrders.push({
            id: buyId,
            side: 'buy',
            price: buy.price,
            amount: buy.amount,
            timestamp: buy.timestamp,
            fillPrice: buy.price,
            status: 'filled',
            profit: 0,
            fees: buyFee,
            feeCurrency: buy.fee?.currency || 'USDT',
            isNetProfit: true
        });
    }

    // Sort by timestamp desc
    newFilledOrders.sort((a, b) => b.timestamp - a.timestamp);

    // Verify no duplicates
    const lotCounts = {};
    newFilledOrders.filter(o => o.side === 'sell' && o.matchedLots?.length > 0)
        .forEach(o => o.matchedLots.forEach(l => {
            lotCounts[l.lotId] = (lotCounts[l.lotId] || 0) + 1;
        }));
    const duplicates = Object.entries(lotCounts).filter(([id, c]) => c > 1);

    // Update state
    state.filledOrders = newFilledOrders;
    state.totalProfit = totalProfit;

    // Backup and save
    const backupFile = stateFile.replace('.json', `_backup_${Date.now()}.json`);
    fs.copyFileSync(stateFile, backupFile);
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));

    console.log(`\n✅ Rebuild complete for ${pair}:`);
    console.log(`   Orders: ${newFilledOrders.length}`);
    console.log(`   Profit: $${totalProfit.toFixed(4)}`);
    console.log(`   Duplicate lots: ${duplicates.length}`);
    console.log(`   Backup: ${path.basename(backupFile)}`);
}

rebuild().catch(console.error);
