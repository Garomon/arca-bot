
// ORDER BOOK PRESSURE (Binance Spot)
async function fetchOrderBookPressure() {
    if (Date.now() - externalDataCache.orderBook.timestamp < 10000) { // 10s Cache
        return externalDataCache.orderBook.value;
    }

    try {
        // Fetch top 50 levels
        const orderBook = await binance.fetchOrderBook(CONFIG.pair, 50);
        const bids = orderBook.bids;
        const asks = orderBook.asks;

        // Calculate volume sum
        const bidVol = bids.reduce((acc, bid) => acc + bid[1], 0);
        const askVol = asks.reduce((acc, ask) => acc + ask[1], 0);

        const ratio = bidVol / askVol; // > 1 means more buyers
        const pressure = {
            bidVol,
            askVol,
            ratio,
            signal: ratio > 1.5 ? 'BULLISH' : (ratio < 0.66 ? 'BEARISH' : 'NEUTRAL'),
            timestamp: Date.now()
        };

        externalDataCache.orderBook = { value: pressure, timestamp: Date.now() };
        log('INTEL', `Order Book Pressure: ${ratio.toFixed(2)}x (${pressure.signal}) | Bids: ${bidVol.toFixed(0)} vs Asks: ${askVol.toFixed(0)}`, 'info');
        return pressure;

    } catch (e) {
        console.error('>> [ERROR] Order Book fetch failed:', e.message);
        return { ratio: 1.0, signal: 'NEUTRAL' };
    }
}
