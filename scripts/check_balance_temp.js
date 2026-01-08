const ccxt = require('ccxt');
require('dotenv').config();
const b = new ccxt.binance({apiKey: process.env.API_KEY, secret: process.env.API_SECRET});
(async () => {
    try {
        const bal = await b.fetchBalance();
        const prices = await b.fetchTickers(['BTC/USDT', 'SOL/USDT', 'DOGE/USDT']);
        
        const usdt = bal.USDT ? bal.USDT.total : 0;
        const btc = bal.BTC ? bal.BTC.total : 0;
        const sol = bal.SOL ? bal.SOL.total : 0;
        const doge = bal.DOGE ? bal.DOGE.total : 0;

        const btcVal = btc * prices['BTC/USDT'].last;
        const solVal = sol * prices['SOL/USDT'].last;
        const dogeVal = doge * prices['DOGE/USDT'].last;
        
        const total = usdt + btcVal + solVal + dogeVal;

        console.log('REAL_TOTAL: ' + total.toFixed(2));
        console.log('USDT: ' + usdt.toFixed(2));
        console.log('BTC_VAL: ' + btcVal.toFixed(2));
        console.log('SOL_VAL: ' + solVal.toFixed(2));
        console.log('DOGE_VAL: ' + dogeVal.toFixed(2));
    } catch (e) { console.error(e); }
})();
