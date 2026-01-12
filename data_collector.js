const fs = require('fs');
const path = require('path');

/**
 * DATA COLLECTOR (The "Scribe")
 * Purpose: Captures high-fidelity market snapshots for Machine Learning training.
 * Format: JSONL (One JSON object per line) for efficient appending and parsing.
 */

// LOG DIRECTORY
const LOG_DIR = path.join(__dirname, 'logs', 'training_data');
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

class DataCollector {
    constructor() {
        this.writeStream = null;
        this.currentDateStr = '';
    }

    /**
     * Initializes or rotates the write stream based on the current date and pair.
     */
    _getStream(pair) {
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
        const pairStr = pair ? pair.replace('/', '') : 'UNKNOWN';

        // Rotate file if day changed OR pair changed (shouldn't happen in singleton but safe)
        if (dateStr !== this.currentDateStr || !this.writeStream || this.currentPairStr !== pairStr) {
            if (this.writeStream) {
                this.writeStream.end();
            }

            this.currentDateStr = dateStr;
            this.currentPairStr = pairStr;
            const filename = path.join(LOG_DIR, `market_snapshots_${pairStr}_${dateStr}.jsonl`);
            console.log(`>> [DATA_COLLECTOR] Logging to: ${filename}`);

            this.writeStream = fs.createWriteStream(filename, { flags: 'a' });
        }

        return this.writeStream;
    }

    /**
     * Calculates efficiency metrics from filledOrders for ML enrichment
     */
    _calculateEfficiencyMetrics(state) {
        const now = Date.now();
        const h24 = 24 * 60 * 60 * 1000;
        const h1 = 60 * 60 * 1000;
        const orders = state.filledOrders || [];

        // Filter orders from last 24h
        const orders24h = orders.filter(o => o.timestamp && (now - o.timestamp) < h24);
        const orders1h = orders.filter(o => o.timestamp && (now - o.timestamp) < h1);

        // Calculate avg spread from sells with spreadPct
        const sellsWithSpread = orders24h.filter(o => o.side === 'sell' && typeof o.spreadPct === 'number');
        const avgSpread24h = sellsWithSpread.length > 0
            ? sellsWithSpread.reduce((sum, o) => sum + o.spreadPct, 0) / sellsWithSpread.length
            : 0;

        // Calculate trades in last hour (both buys and sells)
        const tradesLastHour = orders1h.filter(o => o.side === 'buy' || o.side === 'sell').length;

        // Calculate avg hold time from matched lots with timestamps
        const holdTimes = [];
        for (const order of orders24h) {
            if (order.side === 'sell' && order.matchedLots && order.matchedLots.length > 0) {
                for (const lot of order.matchedLots) {
                    if (lot.timestamp && order.timestamp) {
                        const holdMs = order.timestamp - lot.timestamp;
                        const holdHours = holdMs / (1000 * 60 * 60);
                        if (holdHours > 0 && holdHours < 720) {
                            holdTimes.push(holdHours);
                        }
                    }
                }
            }
        }
        const avgHoldTime24h = holdTimes.length > 0
            ? holdTimes.reduce((a, b) => a + b, 0) / holdTimes.length
            : 0;

        return {
            avgSpread24h: parseFloat(avgSpread24h.toFixed(3)),
            tradesLastHour,
            avgHoldTime24h: parseFloat(avgHoldTime24h.toFixed(1)),
            sellsCount24h: sellsWithSpread.length
        };
    }

    /**
     * Logs a snapshot of the current market state and bot internals.
     * @param {Object} state - The bot's state object
     * @param {Object} analysis - Technical analysis results
     * @param {Object} compositeSignal - The decision outcome
     * @param {Object} externalMetrics - FearGreed, Funding, etc.
     */
    logSnapshot(state, analysis, compositeSignal, externalMetrics) {
        try {
            if (!state || !analysis) return;

            const now = new Date();
            const hourOfDay = now.getHours();
            const dayOfWeek = now.getDay(); // 0=Sun, 6=Sat
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

            // Calculate efficiency metrics from recent trades
            const efficiency = this._calculateEfficiencyMetrics(state);

            const snapshot = {
                timestamp: Date.now(),
                iso: now.toISOString(),

                // 0. IDENTITY (Critical for Unified Model)
                pair: state.pair || 'UNKNOWN',

                // 0.5 TEMPORAL CONTEXT (Time-based patterns)
                hour_of_day: hourOfDay,
                day_of_week: dayOfWeek,
                is_weekend: isWeekend,

                // 1. MARKET DATA (The "Input")
                price: state.currentPrice,
                rsi: analysis.rsi,
                ema: analysis.ema,
                ema_dev_pct: analysis.ema ? ((state.currentPrice - analysis.ema) / analysis.ema) * 100 : 0, // Normalized Trend
                bb_bandwidth: analysis.bandwidth,
                volatility_regime: state.volatilityRegime,
                market_regime: state.marketRegime,

                // 2. ORDER BOOK (The "Pressure")
                ob_ratio: externalMetrics?.orderBook?.value?.ratio || 1.0,
                ob_bid_vol: externalMetrics?.orderBook?.value?.bidVol || 0,
                ob_ask_vol: externalMetrics?.orderBook?.value?.askVol || 0,

                // 3. EXTERNAL SENTIMENT (The "Macro")
                fear_greed: externalMetrics?.fearGreed?.value?.value || 50,
                funding_rate: externalMetrics?.fundingRate?.value?.rate || 0,
                btc_dominance: externalMetrics?.btcDominance?.value?.value || 0,
                open_interest_signal: externalMetrics?.openInterest?.value?.signal || 'NEUTRAL',

                // 3.5 GEOPOLITICAL (The "Context")
                geo_defense_level: externalMetrics?.geoContext?.defenseLevel || 0,
                geo_status: externalMetrics?.geoContext?.status || 'NORMAL',

                // 4. BOT INTERNAL STATE (The "Context")
                active_orders: state.activeOrders ? state.activeOrders.length : 0,
                inventory_lots: state.inventory ? state.inventory.length : 0,
                total_profit: state.totalProfit,

                // 4.5 EFFICIENCY METRICS (ML Feature Engineering)
                avg_spread_24h: efficiency.avgSpread24h,
                avg_hold_time_24h: efficiency.avgHoldTime24h,
                trades_last_hour: efficiency.tradesLastHour,
                sells_count_24h: efficiency.sellsCount24h,

                // 4.6 WEEKLY METRICS (Performance Tracking)
                in_range_percent: state.metrics && (state.metrics.ticksInRange + state.metrics.ticksOutOfRange) > 0
                    ? ((state.metrics.ticksInRange / (state.metrics.ticksInRange + state.metrics.ticksOutOfRange)) * 100).toFixed(1)
                    : 'N/A',
                inventory_avg_cost: state.inventory && state.inventory.length > 0
                    ? (state.inventory.reduce((s, l) => s + (l.price || 0) * (l.remaining || 0), 0) /
                        state.inventory.reduce((s, l) => s + (l.remaining || 0), 0)).toFixed(2)
                    : 0,
                buy_hold_return_pct: state.metrics?.buyHoldStartPrice > 0
                    ? (((state.currentPrice - state.metrics.buyHoldStartPrice) / state.metrics.buyHoldStartPrice) * 100).toFixed(2)
                    : 'N/A',

                // 5. THE OUTPUT (The "Label" for training)
                // We record what the logic DECIDED to do.
                // Later, ML will learn: "Inputs -> Decision -> Result (Price Change)"
                decision_score: compositeSignal?.score || 0,
                decision_rec: compositeSignal?.recommendation || 'HOLD',
                decision_reasons: compositeSignal?.reasons || []
            };

            const stream = this._getStream(state.pair);
            if (stream) {
                stream.write(JSON.stringify(snapshot) + '\n');
            }
        } catch (e) {
            console.error('>> [DATA_COLLECTOR] Error writing snapshot:', e.message);
        }
    }
}

module.exports = new DataCollector();
