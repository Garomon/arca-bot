require('dotenv').config({ path: '/root/arca-bot/.env' });
const ccxt = require('ccxt');
const fs = require('fs');
const path = require('path');

const BASE_DIR = '/root/arca-bot';

async function fullAudit() {
    const binance = new ccxt.binance({
        apiKey: process.env.BINANCE_API_KEY,
        secret: process.env.BINANCE_SECRET,
        options: { adjustForTimeDifference: true }
    });
    
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║              AUDITORIA COMPLETA - DATOS EN VIVO              ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    
    // 1. BALANCE REAL DE BINANCE
    console.log('');
    console.log('=== 1. BALANCE REAL EN BINANCE ===');
    const balance = await binance.fetchBalance();
    const tickers = await binance.fetchTickers(['BTC/USDT', 'SOL/USDT', 'DOGE/USDT', 'BNB/USDT']);
    
    const assets = {
        USDT: { qty: balance.USDT?.total || 0, price: 1 },
        BTC: { qty: balance.BTC?.total || 0, price: tickers['BTC/USDT'].last },
        SOL: { qty: balance.SOL?.total || 0, price: tickers['SOL/USDT'].last },
        DOGE: { qty: balance.DOGE?.total || 0, price: tickers['DOGE/USDT'].last },
        BNB: { qty: balance.BNB?.total || 0, price: tickers['BNB/USDT'].last }
    };
    
    let totalEquity = 0;
    for (const [asset, data] of Object.entries(assets)) {
        const value = data.qty * data.price;
        totalEquity += value;
        if (data.qty > 0.0000001) {
            console.log('  ' + asset + ': ' + data.qty.toFixed(8) + ' x $' + data.price.toFixed(2) + ' = $' + value.toFixed(2));
        }
    }
    console.log('  TOTAL EQUITY BINANCE: $' + totalEquity.toFixed(2));
    
    // 2. DEPOSITOS
    console.log('');
    console.log('=== 2. DEPOSITOS REGISTRADOS ===');
    const depositsData = JSON.parse(fs.readFileSync(path.join(BASE_DIR, 'data/deposits.json'), 'utf8'));
    const actualDeposits = depositsData.deposits.filter(d => d.type !== 'rebalance');
    let totalDeposited = 0;
    for (const d of actualDeposits) {
        totalDeposited += d.amount || 0;
    }
    console.log('  Cantidad de depositos: ' + actualDeposits.length);
    console.log('  TOTAL DEPOSITADO: $' + totalDeposited.toFixed(2));
    
    // 3. INVENTARIO DE CADA BOT
    console.log('');
    console.log('=== 3. INVENTARIO POR BOT ===');
    const sessionsDir = path.join(BASE_DIR, 'data/sessions');
    const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('_state.json'));
    
    let totalBotProfit = 0;
    let botInventory = { BTC: 0, SOL: 0, DOGE: 0 };
    let botCosts = { BTC: 0, SOL: 0, DOGE: 0 };
    
    for (const file of files) {
        const state = JSON.parse(fs.readFileSync(path.join(sessionsDir, file), 'utf8'));
        const pair = state.pair || file;
        const asset = pair.includes('BTC') ? 'BTC' : pair.includes('SOL') ? 'SOL' : 'DOGE';
        const profit = state.totalProfit || 0;
        const currentPrice = state.currentPrice || 0;
        
        const inventory = state.inventory || state.inventoryLots || [];
        let qty = 0, cost = 0, lotCount = 0;
        for (const lot of inventory) {
            if (lot.remaining > 0.00000001) {
                qty += lot.remaining;
                cost += lot.price * lot.remaining;
                lotCount++;
            }
        }
        
        botInventory[asset] = qty;
        botCosts[asset] = cost;
        totalBotProfit += profit;
        
        const value = qty * currentPrice;
        const unrealized = value - cost;
        
        console.log('');
        console.log('  [' + asset + '] Profit=$' + profit.toFixed(2) + ' | Lotes=' + lotCount + ' | Qty=' + qty.toFixed(6) + ' | Flotante=$' + unrealized.toFixed(2));
    }
    
    // 4. COMPARACION BINANCE vs BOTS
    console.log('');
    console.log('=== 4. COMPARACION: BINANCE vs BOTS ===');
    
    let totalDiffValue = 0;
    for (const asset of ['BTC', 'SOL', 'DOGE']) {
        const binanceQty = assets[asset].qty;
        const botQty = botInventory[asset];
        const diff = binanceQty - botQty;
        const diffValue = diff * assets[asset].price;
        totalDiffValue += diffValue;
        
        const status = Math.abs(diff) < 0.00001 ? 'OK' : 'DIFF';
        console.log('  ' + asset + ': Binance=' + binanceQty.toFixed(8) + ' | Bot=' + botQty.toFixed(8) + ' | $' + diffValue.toFixed(2) + ' ' + status);
    }
    console.log('  BNB: ' + assets.BNB.qty.toFixed(4) + ' = $' + (assets.BNB.qty * assets.BNB.price).toFixed(2) + ' (fees)');
    totalDiffValue += assets.BNB.qty * assets.BNB.price;
    console.log('  TOTAL NO RASTREADO: $' + totalDiffValue.toFixed(2));
    
    // 5. RESUMEN FINAL
    console.log('');
    console.log('=== 5. RESUMEN FINAL ===');
    
    const botCryptoValue = botInventory.BTC * assets.BTC.price + 
                          botInventory.SOL * assets.SOL.price + 
                          botInventory.DOGE * assets.DOGE.price;
    const botCryptoTotalCost = botCosts.BTC + botCosts.SOL + botCosts.DOGE;
    const botFlotante = botCryptoValue - botCryptoTotalCost;
    
    const realPnL = totalEquity - totalDeposited;
    const botPnL = totalBotProfit + botFlotante;
    
    console.log('');
    console.log('  BINANCE REAL:');
    console.log('    Equity=$' + totalEquity.toFixed(2) + ' - Depositos=$' + totalDeposited.toFixed(2) + ' = PnL=$' + realPnL.toFixed(2));
    console.log('');
    console.log('  BOTS REPORTAN:');
    console.log('    Profit=$' + totalBotProfit.toFixed(2) + ' + Flotante=$' + botFlotante.toFixed(2) + ' = PnL=$' + botPnL.toFixed(2));
    
    console.log('');
    console.log('  *** DISCREPANCIA: $' + (realPnL - botPnL).toFixed(2) + ' ***');
    
    // 6. VERIFICAR TRADES RECIENTES
    console.log('');
    console.log('=== 6. ULTIMOS TRADES EN BINANCE (verificar si hay ordenes perdidas) ===');
    
    for (const symbol of ['BTC/USDT', 'SOL/USDT', 'DOGE/USDT']) {
        const trades = await binance.fetchMyTrades(symbol, undefined, 5);
        console.log('');
        console.log('  ' + symbol + ' - ultimos 5 trades:');
        for (const t of trades.slice(-5)) {
            const date = new Date(t.timestamp).toISOString().slice(0,16);
            console.log('    ' + date + ' ' + t.side.toUpperCase() + ' ' + t.amount.toFixed(6) + ' @ $' + t.price.toFixed(2));
        }
    }
}

fullAudit().catch(e => console.error('Error:', e.message));
