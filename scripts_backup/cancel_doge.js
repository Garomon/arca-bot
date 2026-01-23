const ccxt = require('ccxt');
const binance = new ccxt.binance({
    apiKey: 'UWAlkUOGv4AAhU7pRtXG2qovJ7AfoUdMGEN4FYsussqTBhkh8SPNlPcEVGatEk6t',
    secret: 'XpATUMxNJhUbOvcQLY2wbFs83lnfAky9RQQa8ukEbkWkNTq3VCbSV6bJ7ZLJ2LCr'
});

(async () => {
    try {
        console.log('Canceling ghost order 13340097942...');
        await binance.cancelOrder('13340097942', 'DOGE/USDT');
        console.log('SUCCESS: Order canceled.');
    } catch (e) {
        console.error('ERROR:', e.message);
    }
})();
EOF && node /root/arca-bot/scripts/cancel_doge.js && pm2 stop bot-doge && node /root/arca-bot/scripts/full_audit.js DOGE/USDT --fix && pm2 start bot-doge
