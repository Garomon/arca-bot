require('dotenv').config();
const ccxt = require('ccxt');
const fs = require('fs');

async function fullVerification() {
    const binance = new ccxt.binance({
        apiKey: process.env.BINANCE_API_KEY,
        secret: process.env.BINANCE_SECRET
    });
    
    const balance = await binance.fetchBalance();
    const tickers = await binance.fetchTickers(['BTC/USDT', 'SOL/USDT', 'DOGE/USDT', 'BNB/USDT']);
    
    const configs = [
        {name: 'BTC', symbol: 'BTC/USDT', file: './data/sessions/VANTAGE01_BTCUSDT_state.json'},
        {name: 'SOL', symbol: 'SOL/USDT', file: './data/sessions/VANTAGE01_SOLUSDT_state.json'},
        {name: 'DOGE', symbol: 'DOGE/USDT', file: './data/sessions/VANTAGE01_DOGEUSDT_state.json'}
    ];
    
    console.log('========== VERIFICACION COMPLETA ==========\n');
    
    // 1. BINANCE BALANCE
    console.log('=== 1. BALANCE BINANCE ===');
    let totalEquity = 0;
    
    const usdt = parseFloat(balance['USDT']?.total || 0);
    console.log('USDT: $' + usdt.toFixed(2));
    totalEquity += usdt;
    
    for (const cfg of configs) {
        const qty = parseFloat(balance[cfg.name]?.total || 0);
        const price = tickers[cfg.symbol].last;
        const value = qty * price;
        console.log(cfg.name + ': ' + qty.toFixed(8) + ' @ $' + price.toFixed(2) + ' = $' + value.toFixed(2));
        totalEquity += value;
    }
    
    const bnb = parseFloat(balance['BNB']?.total || 0);
    const bnbValue = bnb * tickers['BNB/USDT'].last;
    console.log('BNB: $' + bnbValue.toFixed(2) + ' (fees)');
    totalEquity += bnbValue;
    
    console.log('TOTAL EQUITY: $' + totalEquity.toFixed(2));
    console.log('DEPOSITOS: $2095.74');
    console.log('P&L REAL: $' + (totalEquity - 2095.74).toFixed(2));
    
    // 2. INVENTORY CHECK
    console.log('\n=== 2. INVENTARIO ===');
    for (const cfg of configs) {
        const s = JSON.parse(fs.readFileSync(cfg.file, 'utf8'));
        const binanceQty = parseFloat(balance[cfg.name]?.total || 0);
        const invQty = (s.inventory || []).reduce((a,b) => a + b.remaining, 0);
        const ok = Math.abs(binanceQty - invQty) < 0.00001;
        console.log(cfg.name + ': Bin=' + binanceQty.toFixed(8) + ' Inv=' + invQty.toFixed(8) + ' ' + (ok ? 'OK' : 'ERROR'));
    }
    
    // 3. PROFIT ANALYSIS
    console.log('\n=== 3. ANALISIS DE PROFIT ===');
    let corrections = [];
    
    for (const cfg of configs) {
        const s = JSON.parse(fs.readFileSync(cfg.file, 'utf8'));
        const price = tickers[cfg.symbol].last;
        
        const trades = await binance.fetchMyTrades(cfg.symbol, undefined, 500);
        let buyValue = 0, sellValue = 0, fees = 0;
        for (const t of trades) {
            if (t.side === 'buy') buyValue += t.amount * t.price;
            else sellValue += t.amount * t.price;
            fees += t.fee?.cost || 0;
        }
        
        const qty = parseFloat(balance[cfg.name]?.total || 0);
        const holdingValue = qty * price;
        const realPnL = sellValue + holdingValue - buyValue - fees;
        
        const invCost = (s.inventory || []).reduce((a,b) => a + b.remaining * b.price, 0);
        const unrealized = holdingValue - invCost;
        const correctProfit = realPnL - unrealized;
        
        console.log(cfg.name + ':');
        console.log('  Real P&L: $' + realPnL.toFixed(2));
        console.log('  Actual totalProfit: $' + (s.totalProfit || 0).toFixed(2));
        console.log('  Correct totalProfit: $' + correctProfit.toFixed(2));
        console.log('  Diferencia: $' + ((s.totalProfit || 0) - correctProfit).toFixed(2));
        
        corrections.push({
            name: cfg.name,
            file: cfg.file,
            current: s.totalProfit || 0,
            correct: correctProfit,
            diff: (s.totalProfit || 0) - correctProfit
        });
    }
    
    console.log('\n=== 4. CORRECCIONES NECESARIAS ===');
    for (const c of corrections) {
        console.log(c.name + ': ' + c.current.toFixed(2) + ' -> ' + c.correct.toFixed(2) + ' (ajuste: ' + (-c.diff).toFixed(2) + ')');
    }
    
    return corrections;
}

fullVerification().catch(e => console.error(e));
