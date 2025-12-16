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
     * Initializes or rotates the write stream based on the current date.
     */
    _getStream() {
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD

        // Rotate file if day changed
        if (dateStr !== this.currentDateStr || !this.writeStream) {
            if (this.writeStream) {
                this.writeStream.end();
            }

            this.currentDateStr = dateStr;
            const filename = path.join(LOG_DIR, `market_snapshots_${dateStr}.jsonl`);
            console.log(`>> [DATA_COLLECTOR] Logging to: ${filename}`);

            this.writeStream = fs.createWriteStream(filename, { flags: 'a' });
        }

        return this.writeStream;
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

            const snapshot = {
                timestamp: Date.now(),
                iso: new Date().toISOString(),

                // 1. MARKET DATA (The "Input")
                price: state.currentPrice,
                rsi: analysis.rsi,
                ema: analysis.ema,
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

                // 4. BOT INTERNAL STATE (The "Context")
                active_orders: state.activeOrders ? state.activeOrders.length : 0,
                inventory_lots: state.inventory ? state.inventory.length : 0,
                total_profit: state.totalProfit,

                // 5. THE OUTPUT (The "Label" for training)
                // We record what the logic DECIDED to do.
                // Later, ML will learn: "Inputs -> Decision -> Result (Price Change)"
                decision_score: compositeSignal?.score || 0,
                decision_rec: compositeSignal?.recommendation || 'HOLD',
                decision_reasons: compositeSignal?.reasons || []
            };

            const stream = this._getStream();
            if (stream) {
                stream.write(JSON.stringify(snapshot) + '\n');
            }
        } catch (e) {
            console.error('>> [DATA_COLLECTOR] Error writing snapshot:', e.message);
        }
    }
}

module.exports = new DataCollector();
