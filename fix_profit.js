require('dotenv').config();
const ccxt = require('ccxt');
const fs = require('fs');

async function fixProfit() {
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
    
    console.log('=== CORRIGIENDO totalProfit ===\n');
    
    for (const cfg of configs) {
        // Read state
        const stateRaw = fs.readFileSync(cfg.file, 'utf8');
        const state = JSON.parse(stateRaw);
        
        const price = tickers[cfg.symbol].last;
        
        // Get real P&L from Binance trades
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
        
        // Calculate correct totalProfit
        const invCost = (state.inventory || []).reduce((a,b) => a + b.remaining * b.price, 0);
        const unrealized = holdingValue - invCost;
        const correctProfit = realPnL - unrealized;
        
        const oldProfit = state.totalProfit || 0;
        
        console.log(cfg.name + ':');
        console.log('  Antes: totalProfit = $' + oldProfit.toFixed(2));
        console.log('  Después: totalProfit = $' + correctProfit.toFixed(2));
        
        // Update state
        state.totalProfit = correctProfit;
        state.accumulatedProfit = correctProfit;  // Keep in sync
        state.profitCorrectedAt = Date.now();
        state.profitCorrectionNote = 'Adjusted to match Binance trades reality';
        
        // Write back
        fs.writeFileSync(cfg.file, JSON.stringify(state, null, 2));
        console.log('  Guardado OK');
    }
    
    console.log('\n=== VERIFICANDO ===');
    
    for (const cfg of configs) {
        const state = JSON.parse(fs.readFileSync(cfg.file, 'utf8'));
        console.log(cfg.name + ': totalProfit = $' + state.totalProfit.toFixed(2));
    }
}

fixProfit().catch(e => console.error(e));
