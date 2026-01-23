
const ccxt = require('ccxt');
require('dotenv').config();

const safeFloat = (v) => parseFloat(v) || 0;

(async () => {
    try {
        const binance = new ccxt.binance({
            apiKey: process.env.BINANCE_API_KEY,
            secret: process.env.BINANCE_SECRET,
            options: { adjustForTimeDifference: true }
        });

        console.log('Fetching balance...');
        const balance = await binance.fetchBalance();
        const usdt = safeFloat(balance.USDT?.total);

        console.log('Fetching tickers...');
        const allTickers = await binance.fetchTickers();

        const mxnTickers = Object.keys(allTickers).filter(t => t.includes('MXN'));
        console.log('MXN Tickers found:', mxnTickers);

        const allAssets = Object.keys(balance).filter(key =>
            key !== 'info' && key !== 'free' && key !== 'used' && key !== 'total' && key !== 'USDT'
        );

        let baseValue = 0;
        let breakdown = [];

        console.log(`\n--- ASSET BREAKDOWN ---`);
        console.log(`USDT: ${usdt.toFixed(4)} (Base)`);

        for (const asset of allAssets) {
            const qty = safeFloat(balance[asset]?.total);
            if (qty > 0.000001) {
                let price = 0;
                let method = 'Missing';

                // Logic from grid_bot.js
                const pairName = `${asset}/USDT`;
                const pairNameNoSlash = `${asset}USDT`;
                const reversePair = `USDT${asset}`;
                const reversePairSlash = `USDT/${asset}`;

                // Verbose check for MXN
                if (asset === 'MXN') {
                    console.log('>>> DEBUG MXN TICKERS:', Object.keys(allTickers).filter(k => k.includes('MXN')));
                }

                if (allTickers[pairName]) {
                    price = safeFloat(allTickers[pairName].last);
                    method = `Direct (${pairName})`;
                } else if (allTickers[pairNameNoSlash]) {
                    price = safeFloat(allTickers[pairNameNoSlash].last);
                    method = `DirectNoSlash (${pairNameNoSlash})`;
                } else if (allTickers[reversePair]) {
                    price = 1 / safeFloat(allTickers[reversePair].last);
                    method = `Reverse (${reversePair})`;
                } else if (allTickers[reversePairSlash]) {
                    price = 1 / safeFloat(allTickers[reversePairSlash].last);
                    method = `ReverseSlash (${reversePairSlash})`;
                }

                const val = qty * price;
                baseValue += val;

                console.log(`${asset}: Qty=${qty.toFixed(8)} | Price=${price.toFixed(8)} | Val=$${val.toFixed(4)} | Method=${method}`);
            }
        }

        const totalProy = usdt + baseValue;
        console.log(`\n--- SUMMARY ---`);
        console.log(`USDT Balance: $${usdt.toFixed(4)}`);
        console.log(`Derived Asset Value: $${baseValue.toFixed(4)}`);
        console.log(`TOTAL EQUITY: $${totalProy.toFixed(4)}`);

    } catch (e) {
        console.error(e);
    }
})();
