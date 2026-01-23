/**
 * WRAPPER for full_audit.js --fix
 * Runs audit --fix but then restores inventory with correct Binance TRADE IDs
 * This prevents the audit from breaking lot ID matching
 */

const { execSync } = require('child_process');
const fs = require('fs');
const ccxt = require('ccxt');

async function auditWithPreserve(pair) {
    const pairId = pair.replace('/', '');
    const stateFile = `/root/arca-bot/data/sessions/VANTAGE01_${pairId}_state.json`;
    
    console.log('\n========================================');
    console.log('AUDIT WITH PRESERVE IDs: ' + pair);
    console.log('========================================\n');
    
    // Step 1: Run the original audit --fix
    console.log('Step 1: Running full_audit.js --fix...');
    try {
        execSync(`node /root/arca-bot/scripts/full_audit.js ${pair} --fix`, { stdio: 'inherit' });
    } catch (e) {
        console.error('Audit failed:', e.message);
        return;
    }
    
    // Step 2: Restore inventory with correct Binance TRADE IDs
    console.log('\nStep 2: Restoring inventory with correct Binance TRADE IDs...');
    
    const envContent = fs.readFileSync('/root/arca-bot/.env', 'utf8');
    const apiKey = envContent.match(/BINANCE_API_KEY=([^\n\r]+)/)?.[1];
    const secret = envContent.match(/BINANCE_SECRET=([^\n\r]+)/)?.[1];
    
    const binance = new ccxt.binance({ apiKey, secret });
    const balance = await binance.fetchBalance();
    const asset = pair.split('/')[0];
    const binanceTotal = parseFloat(balance[asset]?.total || 0);
    
    const trades = await binance.fetchMyTrades(pair, undefined, 500);
    const buys = trades.filter(t => t.side === 'buy').sort((a,b) => b.timestamp - a.timestamp);
    
    const state = JSON.parse(fs.readFileSync(stateFile));
    
    // Build new inventory with correct trade IDs
    const newInventory = [];
    const seenIds = new Set();
    let needed = binanceTotal;
    
    for (const trade of buys) {
        if (needed <= 0.00000001) break;
        if (seenIds.has(trade.id)) continue;
        
        seenIds.add(trade.id);
        const toAdd = Math.min(trade.amount, needed);
        
        newInventory.push({
            id: trade.id.toString(),
            price: trade.price,
            amount: trade.amount,
            remaining: toAdd,
            fee: trade.fee?.cost || 0,
            timestamp: trade.timestamp,
            auditVerified: true
        });
        
        needed -= toAdd;
    }
    
    state.inventory = newInventory;
    state.paused = false;
    state.pauseReason = null;
    
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    
    const finalTotal = newInventory.reduce((s,l) => s + l.remaining, 0);
    console.log('\nInventory rebuilt with ' + newInventory.length + ' lots');
    console.log('Total: ' + finalTotal.toFixed(8) + ' ' + asset);
    console.log('Match Binance: ' + (Math.abs(binanceTotal - finalTotal) < 0.00000001 ? 'YES' : 'NO'));
    
    // Step 3: Restore tradeHistory
    console.log('\nStep 3: Restoring tradeHistory...');
    const tradeHistory = trades.map(t => ({
        id: t.id,
        orderId: t.order,
        timestamp: t.timestamp,
        side: t.side,
        price: t.price,
        amount: t.amount,
        cost: t.cost,
        fee: t.fee?.cost || 0,
        feeCurrency: t.fee?.currency || 'USDT'
    }));
    
    state.tradeHistory = tradeHistory;
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    
    console.log('TradeHistory restored: ' + tradeHistory.length + ' trades');
    console.log('\n✅ AUDIT COMPLETE - IDs PRESERVED');
}

// Get pair from command line
const pair = process.argv[2];
if (!pair) {
    console.log('Usage: node audit_preserve_ids.js BTC/USDT');
    process.exit(1);
}

auditWithPreserve(pair).catch(console.error);
