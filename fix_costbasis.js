require('dotenv').config();
const ccxt = require('ccxt');
const fs = require('fs');

async function fixCostBasis() {
    const binance = new ccxt.binance({
        apiKey: process.env.BINANCE_API_KEY,
        secret: process.env.BINANCE_SECRET
    });
    
    const balance = await binance.fetchBalance();
    const tickers = await binance.fetchTickers(['BTC/USDT', 'SOL/USDT', 'DOGE/USDT']);
    
    const configs = [
        {name: 'BTC', symbol: 'BTC/USDT', file: './data/sessions/VANTAGE01_BTCUSDT_state.json'},
        {name: 'SOL', symbol: 'SOL/USDT', file: './data/sessions/VANTAGE01_SOLUSDT_state.json'},
        {name: 'DOGE', symbol: 'DOGE/USDT', file: './data/sessions/VANTAGE01_DOGEUSDT_state.json'}
    ];
    
    console.log('=== ANALISIS DE COST BASIS ===\n');
    
    for (const cfg of configs) {
        const state = JSON.parse(fs.readFileSync(cfg.file, 'utf8'));
        const price = tickers[cfg.symbol].last;
        
        // Get real P&L from Binance
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
        
        // Current state
        const totalProfit = state.totalProfit || 0;
        const invCost = (state.inventory || []).reduce((a,b) => a + b.remaining * b.price, 0);
        const unrealized = holdingValue - invCost;
        const botPnL = totalProfit + unrealized;
        
        // What SHOULD the unrealized be?
        // If totalProfit is correct (realized from actual sells), then:
        // unrealized = realPnL - totalProfit
        const requiredUnrealized = realPnL - totalProfit;
        const requiredInvCost = holdingValue - requiredUnrealized;
        const costBasisGap = requiredInvCost - invCost;
        
        // Reconciled lots
        const reconciledLots = state.inventory.filter(l => l.reconciled);
        const reconciledQty = reconciledLots.reduce((a,b) => a + b.remaining, 0);
        const reconciledCost = reconciledLots.reduce((a,b) => a + b.remaining * b.price, 0);
        
        console.log(cfg.name + ':');
        console.log('  Real P&L: $' + realPnL.toFixed(2));
        console.log('  Bot totalProfit: $' + totalProfit.toFixed(2) + ' (mantener)');
        console.log('  Current unrealized: $' + unrealized.toFixed(2));
        console.log('  Required unrealized: $' + requiredUnrealized.toFixed(2));
        console.log('  Current inv cost: $' + invCost.toFixed(2));
        console.log('  Required inv cost: $' + requiredInvCost.toFixed(2));
        console.log('  Gap a agregar: $' + costBasisGap.toFixed(2));
        console.log('  Reconciled lots: ' + reconciledLots.length + ' | qty: ' + reconciledQty.toFixed(8) + ' | cost: $' + reconciledCost.toFixed(2));
        
        if (reconciledQty > 0 && costBasisGap > 0) {
            const newAvgPrice = (reconciledCost + costBasisGap) / reconciledQty;
            console.log('  Nuevo avg price para reconciled: $' + newAvgPrice.toFixed(2));
        }
        console.log('');
    }
}

fixCostBasis().catch(e => console.error(e));
