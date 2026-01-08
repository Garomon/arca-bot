const ccxt = require('/root/arca-bot/node_modules/ccxt');
require('dotenv').config();

async function checkEquity() {
    console.log("Connecting to Binance...");
    const binance = new ccxt.binance({
        apiKey: process.env.API_KEY || process.env.BINANCE_API_KEY,
        secret: process.env.API_SECRET || process.env.BINANCE_API_SECRET,
        enableRateLimit: true
    });

    const balance = await binance.fetchBalance();
    console.log("---------------------------------------------------");
    console.log("ASSET\t\tFREE\t\tUSED\t\tTOTAL");
    console.log("---------------------------------------------------");

    let totalEquityUSDT = 0;
    const assets = ['USDT', 'BTC', 'SOL', 'DOGE', 'ETH', 'BNB'];

    for (const asset of assets) {
        const free = balance[asset]?.free || 0;
        const used = balance[asset]?.used || 0;
        const total = balance[asset]?.total || 0;

        if (total > 0) {
            let price = 1;
            if (asset !== 'USDT') {
                try {
                    const ticker = await binance.fetchTicker(`${asset}/USDT`);
                    price = ticker.last;
                } catch (e) {
                    console.log(`Could not fetch price for ${asset}`);
                }
            }
            const value = total * price;
            totalEquityUSDT += value;
            console.log(`${asset}\t\t${free.toFixed(6)}\t${used.toFixed(6)}\t${total.toFixed(6)}\t(~$${value.toFixed(2)})`);
        }
    }

    console.log("---------------------------------------------------");
    console.log(`TOTAL ESTIMATED EQUITY: $${totalEquityUSDT.toFixed(2)}`);
    console.log("---------------------------------------------------");
}

checkEquity();
