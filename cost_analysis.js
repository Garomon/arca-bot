require('dotenv').config();
const ccxt = require('ccxt');
const fs = require('fs');

async function analyze() {
    const binance = new ccxt.binance({
        apiKey: process.env.BINANCE_API_KEY,
        secret: process.env.BINANCE_SECRET
    });
    
    const tickers = await binance.fetchTickers(['BTC/USDT', 'SOL/USDT', 'DOGE/USDT']);
    
    const configs = [
        {name: 'BTC', symbol: 'BTC/USDT', file: './data/sessions/VANTAGE01_BTCUSDT_state.json'},
        {name: 'SOL', symbol: 'SOL/USDT', file: './data/sessions/VANTAGE01_SOLUSDT_state.json'},
        {name: 'DOGE', symbol: 'DOGE/USDT', file: './data/sessions/VANTAGE01_DOGEUSDT_state.json'}
    ];
    
    // Get ALL buys from Binance
    let totalBuyValue = 0;
    let totalSellValue = 0;
    let totalFees = 0;
    
    for (const cfg of configs) {
        const trades = await binance.fetchMyTrades(cfg.symbol, undefined, 500);
        const buys = trades.filter(t => t.side === 'buy');
        const sells = trades.filter(t => t.side === 'sell');
        
        let buyValue = 0;
        let sellValue = 0;
        let fees = 0;
        
        for (const t of buys) {
            buyValue += t.amount * t.price;
            fees += t.fee?.cost || 0;
        }
        for (const t of sells) {
            sellValue += t.amount * t.price;
            fees += t.fee?.cost || 0;
        }
        
        const s = JSON.parse(fs.readFileSync(cfg.file, 'utf8'));
        const price = tickers[cfg.symbol].last;
        const qty = (s.inventory || []).reduce((a,b) => a + b.remaining, 0);
        const currentValue = qty * price;
        
        console.log(cfg.name + ':');
        console.log('  Total bought: $' + buyValue.toFixed(2));
        console.log('  Total sold: $' + sellValue.toFixed(2));
        console.log('  Fees: $' + fees.toFixed(2));
        console.log('  Still holding qty: ' + qty.toFixed(8));
        console.log('  Holding value: $' + currentValue.toFixed(2));
        console.log('  Net cash spent: $' + (buyValue - sellValue).toFixed(2));
        console.log('  Real P&L: $' + (sellValue + currentValue - buyValue - fees).toFixed(2));
        console.log('  Bot totalProfit: $' + (s.totalProfit || 0).toFixed(2));
        console.log('');
        
        totalBuyValue += buyValue;
        totalSellValue += sellValue;
        totalFees += fees;
    }
    
    const balance = await binance.fetchBalance();
    const usdt = parseFloat(balance['USDT']?.total || 0);
    
    console.log('=== TOTALES ===');
    console.log('Total compras: $' + totalBuyValue.toFixed(2));
    console.log('Total ventas: $' + totalSellValue.toFixed(2));
    console.log('Total fees: $' + totalFees.toFixed(2));
    console.log('Net cash: $' + (totalBuyValue - totalSellValue).toFixed(2));
    console.log('USDT actual: $' + usdt.toFixed(2));
    console.log('');
    
    // The actual P&L should be:
    // StartingUSDT + Sells - Buys - Fees = EndingUSDT
    // So: StartingUSDT = EndingUSDT - Sells + Buys + Fees
    const impliedStartingUSDT = usdt - totalSellValue + totalBuyValue + totalFees;
    console.log('USDT inicial implícito: $' + impliedStartingUSDT.toFixed(2));
    console.log('(Si empezamos con 095.74, debería dar eso)');
}
analyze();
