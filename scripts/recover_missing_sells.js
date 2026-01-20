/**
 * RECOVER MISSING SELLS - Downloads all sells from Binance and adds missing ones
 * Does NOT delete or modify existing records - only ADDS what's missing
 * 
 * Usage: node scripts/recover_missing_sells.js BTC
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

const pair = process.argv[2] || 'BTC';
const SYMBOL = `${pair}/USDT`;
const STATE_FILE = path.join(__dirname, '..', 'data', 'sessions', `VANTAGE01_${pair}USDT_state.json`);

async function getAllTrades(symbol) {
    console.log(`\nDownloading ALL trades for ${symbol}...`);
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
    
    console.log(`Downloaded ${allTrades.length} total trades from Binance`);
    return allTrades;
}

async function main() {
    console.log('=== RECOVER MISSING SELLS ===');
    console.log(`Symbol: ${SYMBOL}`);
    console.log(`State file: ${STATE_FILE}`);
    console.log('Mode: ADD ONLY (no deletions)\n');
    
    if (!fs.existsSync(STATE_FILE)) {
        console.error(`State file not found: ${STATE_FILE}`);
        process.exit(1);
    }
    
    // Load state
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    const existingIds = new Set(state.filledOrders.map(o => String(o.id)));
    const existingSells = state.filledOrders.filter(o => o.side === 'sell');
    
    console.log(`Existing orders in state: ${state.filledOrders.length}`);
    console.log(`Existing sells in state: ${existingSells.length}`);
    
    // Download trades from Binance
    const allTrades = await getAllTrades(SYMBOL);
    const binanceSells = allTrades.filter(t => t.side === 'sell');
    const binanceBuys = allTrades.filter(t => t.side === 'buy');
    
    console.log(`Sells in Binance: ${binanceSells.length}`);
    console.log(`Buys in Binance: ${binanceBuys.length}`);
    
    // Find missing sells
    const missingSells = binanceSells.filter(t => !existingIds.has(String(t.order)));
    console.log(`\nMISSING SELLS: ${missingSells.length}`);
    
    if (missingSells.length === 0) {
        console.log('All sells are already in state. Nothing to recover.');
        return;
    }
    
    // Grid config
    const gridSpacing = 0.005; // 0.5%
    const tradingFee = 0.001; // 0.1%
    
    // Build map of buys by approximate price for matching
    const buysByPrice = new Map();
    binanceBuys.forEach(b => {
        const priceKey = Math.round(b.price / 100) * 100; // Group by ~$100 ranges for BTC
        if (!buysByPrice.has(priceKey)) buysByPrice.set(priceKey, []);
        buysByPrice.get(priceKey).push(b);
    });
    
    let addedCount = 0;
    
    for (const sell of missingSells) {
        const sellPrice = sell.price;
        const amount = sell.amount;
        
        // Try to find a matching BUY from before this sell
        const expectedBuyPrice = sellPrice / (1 + gridSpacing);
        const priceKey = Math.round(expectedBuyPrice / 100) * 100;
        
        let matchedBuy = null;
        let buyPrice = state.entryPrice || sellPrice * 0.995; // Default fallback
        
        // Look for matching buy in nearby price ranges
        for (let delta of [0, -100, 100, -200, 200]) {
            const candidates = buysByPrice.get(priceKey + delta) || [];
            const match = candidates.find(b => 
                b.timestamp < sell.timestamp && 
                Math.abs(b.price - expectedBuyPrice) < expectedBuyPrice * 0.02 &&
                Math.abs(b.amount - amount) < amount * 0.1
            );
            if (match) {
                matchedBuy = match;
                buyPrice = match.price;
                break;
            }
        }
        
        // Calculate profit
        const costBasis = buyPrice * amount;
        const revenue = sellPrice * amount;
        const entryFee = buyPrice * amount * tradingFee;
        const exitFee = sell.fee ? sell.fee.cost * 700 : sellPrice * amount * tradingFee;
        const spreadPct = ((sellPrice - buyPrice) / buyPrice) * 100;
        const netProfit = revenue - costBasis - entryFee - exitFee;
        
        // Create order record
        const orderRecord = {
            id: String(sell.order),
            side: 'sell',
            price: sellPrice,
            amount: amount,
            timestamp: sell.timestamp,
            fillPrice: sellPrice,
            status: 'filled',
            isEstimated: !matchedBuy,
            isNetProfit: true,
            costBasis: buyPrice,
            spreadPct: spreadPct,
            fees: sell.fee ? sell.fee.cost : exitFee / 700, // Store original fee amount
            feesUSD: exitFee,
            feeCurrency: sell.fee ? sell.fee.currency : 'BNB',
            profit: netProfit,
            matchType: matchedBuy ? 'RECOVERED_MATCHED' : 'RECOVERED_ESTIMATED',
            matchedLots: [{
                lotId: matchedBuy ? String(matchedBuy.order) : 'EST_' + sell.order,
                buyPrice: buyPrice,
                amountTaken: amount,
                remainingAfter: 0,
                timestamp: sell.timestamp
            }],
            recoveredAt: new Date().toISOString()
        };
        
        state.filledOrders.push(orderRecord);
        addedCount++;
        
        const matchStatus = matchedBuy ? 'MATCHED' : 'ESTIMATED';
        console.log(`+ SELL ${sell.order}: $${sellPrice.toFixed(2)} | Cost: $${buyPrice.toFixed(2)} | Profit: $${netProfit.toFixed(4)} [${matchStatus}]`);
    }
    
    // Sort by timestamp
    state.filledOrders.sort((a, b) => a.timestamp - b.timestamp);
    
    // Backup and save
    const backupFile = STATE_FILE + '.bak_recover_' + Date.now();
    fs.copyFileSync(STATE_FILE, backupFile);
    console.log(`\nBackup: ${backupFile}`);
    
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    
    console.log(`\n=== RECOVERY COMPLETE ===`);
    console.log(`Added ${addedCount} missing sells`);
    console.log(`Total orders now: ${state.filledOrders.length}`);
    
    const totalProfit = state.filledOrders
        .filter(o => o.side === 'sell')
        .reduce((sum, o) => sum + (o.profit || 0), 0);
    console.log(`Total profit from sells: $${totalProfit.toFixed(2)}`);
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
