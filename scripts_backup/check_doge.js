const ccxt = require('ccxt');
const binance = new ccxt.binance({
    apiKey: 'UWAlkUOGv4AAhU7pRtXG2qovJ7AfoUdMGEN4FYsussqTBhkh8SPNlPcEVGatEk6t',
    secret: 'XpATUMxNJhUbOvcQLY2wbFs83lnfAky9RQQa8ukEbkWkNTq3VCbSV6bJ7ZLJ2LCr'
});

(async () => {
    try {
        console.log('--- DOGE AUDIT ---');
        const bal = await binance.fetchBalance();
        console.log('TOTAL DOGE:', bal.total.DOGE);
        console.log('FREE DOGE:', bal.free.DOGE);
        console.log('USED DOGE:', bal.used.DOGE);
        
        const orders = await binance.fetchOpenOrders('DOGE/USDT');
        console.log('OPEN ORDERS:', orders.length);
        orders.forEach(o => {
            console.log('ORDER:', o.id, '|', o.side.toUpperCase(), '| Amount:', o.amount, '| Price:', o.price);
        });
    } catch (e) {
        console.error('ERROR:', e.message);
    }
})();
EOF && node /root/arca-bot/scripts/check_doge.js
