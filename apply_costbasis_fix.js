require('dotenv').config();
const ccxt = require('ccxt');
const fs = require('fs');

async function applyCostBasisFix() {
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
    
    console.log('=== APLICANDO CORRECCION DE COST BASIS ===\n');
    
    for (const cfg of configs) {
        const state = JSON.parse(fs.readFileSync(cfg.file, 'utf8'));
        const price = tickers[cfg.symbol].last;
        
        // Get real P&L
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
        
        const totalProfit = state.totalProfit || 0;
        const requiredUnrealized = realPnL - totalProfit;
        const requiredInvCost = holdingValue - requiredUnrealized;
        
        // Current inventory cost
        const currentInvCost = state.inventory.reduce((a,b) => a + b.remaining * b.price, 0);
        const costBasisGap = requiredInvCost - currentInvCost;
        
        if (costBasisGap < 0.01) {
            console.log(cfg.name + ': No correction needed');
            continue;
        }
        
        // Find reconciled lots
        const reconciledLots = state.inventory.filter(l => l.reconciled);
        const reconciledQty = reconciledLots.reduce((a,b) => a + b.remaining, 0);
        
        if (reconciledQty < 0.00001 || reconciledLots.length === 0) {
            console.log(cfg.name + ': No reconciled lots to adjust');
            continue;
        }
        
        // Calculate new average price for reconciled lots
        const currentReconciledCost = reconciledLots.reduce((a,b) => a + b.remaining * b.price, 0);
        const newReconciledCost = currentReconciledCost + costBasisGap;
        const newAvgPrice = newReconciledCost / reconciledQty;
        
        console.log(cfg.name + ':');
        console.log('  Gap to add: $' + costBasisGap.toFixed(2));
        console.log('  Old avg price: $' + (currentReconciledCost/reconciledQty).toFixed(2));
        console.log('  New avg price: $' + newAvgPrice.toFixed(2));
        
        // Update prices in reconciled lots
        for (const lot of reconciledLots) {
            const lotIndex = state.inventory.findIndex(l => l.id === lot.id);
            if (lotIndex >= 0) {
                state.inventory[lotIndex].price = newAvgPrice;
                state.inventory[lotIndex].costBasisCorrected = true;
                state.inventory[lotIndex].correctedAt = Date.now();
            }
        }
        
        // Also update inventoryLots if exists
        if (state.inventoryLots) {
            for (const lot of state.inventoryLots.filter(l => l.reconciled)) {
                lot.price = newAvgPrice;
                lot.costBasisCorrected = true;
            }
        }
        
        // Save
        fs.writeFileSync(cfg.file, JSON.stringify(state, null, 2));
        
        // Verify
        const verify = JSON.parse(fs.readFileSync(cfg.file, 'utf8'));
        const newInvCost = verify.inventory.reduce((a,b) => a + b.remaining * b.price, 0);
        const newUnrealized = holdingValue - newInvCost;
        const newBotPnL = totalProfit + newUnrealized;
        
        console.log('  New inv cost: $' + newInvCost.toFixed(2) + ' (target: $' + requiredInvCost.toFixed(2) + ')');
        console.log('  New unrealized: $' + newUnrealized.toFixed(2));
        console.log('  New bot P&L: $' + newBotPnL.toFixed(2) + ' (real: $' + realPnL.toFixed(2) + ')');
        console.log('  SAVED OK');
        console.log('');
    }
    
    console.log('=== VERIFICACION FINAL ===');
}

applyCostBasisFix().catch(e => console.error(e));
