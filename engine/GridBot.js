/**
 * GRIDBOT ENGINE - Multi-Core Ready
 * Version: 3.0 (Multi-Core Phase 1)
 * 
 * This class encapsulates ALL grid bot logic to allow multiple instances
 * running on different trading pairs.
 */

const Decimal = require('decimal.js');
const fs = require('fs');
const path = require('path');
const { RSI, EMA, BollingerBands, ATR } = require('technicalindicators');
const adaptiveHelpers = require('../adaptive_helpers');

class GridBot {
    /**
     * @param {Object} options - Configuration options
     * @param {string} options.pair - Trading pair (e.g., 'BTC/USDT')
     * @param {Object} options.exchange - CCXT exchange instance (shared)
     * @param {Object} options.io - Socket.IO instance (shared)
     * @param {string} options.sessionDir - Path to session data directory
     * @param {Object} [options.config] - Override default config values
     */
    constructor(options) {
        this.pair = options.pair;
        this.pairId = this.pair.replace('/', ''); // e.g., 'BTCUSDT'
        this.exchange = options.exchange;
        this.io = options.io;
        this.sessionDir = options.sessionDir || path.join(__dirname, '../data/sessions');

        // Merge default config with overrides
        this.config = {
            tradingFee: 0.001,
            gridCount: 16,
            gridSpacing: 0.003,
            minOrderSize: 0.00001,
            maxOpenOrders: 24,
            safetyMargin: 0.92,
            spacingNormal: 0.005,
            spacingHigh: 0.007,
            spacingLow: 0.003,
            bandwidthHigh: 0.04,
            bandwidthLow: 0.015,
            rsiOverbought: 65,
            rsiOversold: 35,
            indicators: {
                rsiPeriod: 7,
                emaPeriod: 20,
                bbPeriod: 14,
                bbStdDev: 2
            },
            compoundProfits: true,
            minProfitToCompound: 0.5,
            dcaEnabled: true,
            dcaDropPercent: 0.02,
            dcaMultiplier: 1.5,
            monitorInterval: 3000,
            orderDelay: 150,
            logBufferSize: 100,
            healthCheckThreshold: 0.015,
            ...options.config // Spread overrides
        };

        // State file path (per-pair)
        this.stateFile = path.join(this.sessionDir, `${this.pairId}_state.json`);

        // Initialize state
        this.state = {
            balance: { base: 0, quote: 0 },
            currentPrice: 0,
            entryPrice: 0,
            activeOrders: [],
            filledOrders: [],
            totalProfit: 0,
            initialCapital: null,
            firstTradeTime: null,
            isLive: true,
            startTime: Date.now(),
            marketCondition: null,
            marketRegime: null,
            emergencyStop: false,
            maxDrawdown: 0,
            lastRebalance: null,
            lastFillTime: null,
            lastVolatility: null,
            lastRegime: null,
            compositeSignal: null
        };

        // Logging buffer (per-instance)
        this.logBuffer = [];

        // Monitoring loop control
        this.isMonitoring = false;
        this.monitorTimeout = null;
        this.monitorSessionId = 0;

        // External data cache
        this.externalDataCache = {
            fearGreed: { value: null, timestamp: 0 },
            fundingRate: { value: null, timestamp: 0 },
            btcDominance: { value: null, timestamp: 0 },
            openInterest: { value: null, timestamp: 0 },
            orderBook: { value: null, timestamp: 0 }
        };
        this.CACHE_TTL = 5 * 60 * 1000;

        console.log(`>> [${this.pairId}] GridBot instance created`);
    }

    // ==========================================
    // LOGGING METHODS
    // ==========================================

    log(type, msg, style = '') {
        const timestamp = new Date().toISOString();
        const logLine = `[${timestamp}] [${this.pairId}] [${type}] ${msg}`;

        // Console (with pair prefix)
        console.log(`>> [${this.pairId}] [${type}] ${msg}`);

        // Buffer for UI
        const logEntry = { pair: this.pair, type, msg, style, timestamp: Date.now() };
        this.logBuffer.unshift(logEntry);
        if (this.logBuffer.length > this.config.logBufferSize) this.logBuffer.pop();

        // Emit to UI (namespace by pair)
        this.io.emit('log_message', logEntry);
    }

    logDecision(action, reasons, data = {}) {
        const logLine = `[${this.pairId}] ${action}: ${reasons.join(' | ')}`;
        console.log(`>> ${logLine}`);

        const decision = {
            pair: this.pair,
            timestamp: Date.now(),
            action,
            reasons,
            data,
            compositeScore: this.state.compositeSignal?.score || null,
            price: this.state.currentPrice,
            regime: this.state.marketRegime
        };

        // Emit to UI
        this.io.emit('bot_decision', decision);
        return decision;
    }

    logActivity(activity) {
        const activities = {
            'MONITORING': '👁️ Monitoreando mercado...',
            'ANALYZING': '🔍 Analizando señales...',
            'WAITING': '⏳ Esperando mejor momento...',
            'PLACING_ORDER': '📝 Colocando orden...',
            'ORDER_FILLED': '✅ Orden ejecutada!',
            'PROFIT_TAKEN': '💰 Profit asegurado!',
            'GRID_REBALANCE': '🔄 Rebalanceando grid...',
            'STOP_TRIGGERED': '🚨 Stop-loss activado!'
        };

        const msg = activities[activity] || activity;
        this.io.emit('bot_activity', { pair: this.pair, activity, msg, timestamp: Date.now() });
    }

    // ==========================================
    // STATE MANAGEMENT
    // ==========================================

    loadState() {
        try {
            if (fs.existsSync(this.stateFile)) {
                const raw = fs.readFileSync(this.stateFile);
                const saved = JSON.parse(raw);
                this.state = { ...this.state, ...saved };
                this.log('SYSTEM', 'STATE LOADED');
                this.log('RESUME', `Active Orders: ${this.state.activeOrders.length} | Profit: $${this.state.totalProfit.toFixed(4)}`);
            }
        } catch (e) {
            console.error(`>> [${this.pairId}] [ERROR] Failed to load state:`, e.message);
        }
    }

    saveState() {
        try {
            // Ensure directory exists
            if (!fs.existsSync(this.sessionDir)) {
                fs.mkdirSync(this.sessionDir, { recursive: true });
            }
            fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
        } catch (e) {
            console.error(`>> [${this.pairId}] [ERROR] Failed to save state:`, e.message);
        }
    }

    // ==========================================
    // CORE METHODS (Stubs - Will be migrated)
    // ==========================================

    async start() {
        this.log('SYSTEM', 'STARTING BOT...');
        this.loadState();

        // Set initial capital if needed
        if (!this.state.initialCapital) {
            try {
                const balance = await this.exchange.fetchBalance();
                const quote = this.pair.split('/')[1]; // e.g., 'USDT'
                const base = this.pair.split('/')[0]; // e.g., 'BTC'

                const totalQuote = balance[quote]?.total || 0;
                const totalBase = balance[base]?.total || 0;
                const price = await this.getCurrentPrice();
                const baseValue = totalBase * (price || 0);

                this.state.initialCapital = totalQuote + baseValue;
                this.log('AUTO', `Initial capital set: $${this.state.initialCapital.toFixed(2)}`);
                this.saveState();
            } catch (e) {
                console.error(`>> [${this.pairId}] [ERROR] Could not set initial capital:`, e.message);
            }
        }

        await this.initializeGrid();
    }

    async getCurrentPrice() {
        try {
            const ticker = await this.exchange.fetchTicker(this.pair);
            this.state.currentPrice = ticker.last;
            return this.state.currentPrice;
        } catch (e) {
            console.error(`>> [${this.pairId}] [ERROR] Price fetch failed:`, e.message);
            return null;
        }
    }

    async initializeGrid(forceReset = false) {
        this.log('SYSTEM', 'INITIALIZING GRID...');

        const price = await this.getCurrentPrice();
        if (!price) return;

        // TODO: Full migration of initializeGrid logic
        this.log('SYSTEM', `Entry price: $${price.toFixed(2)}`);
        this.log('STUB', 'Full grid logic will be migrated in Phase 1b');
    }

    // ==========================================
    // PLACEHOLDER METHODS (To be filled)
    // ==========================================

    // These placeholder methods maintain the API surface
    // while we migrate logic piece by piece

    async getMarketAnalysis() { /* TODO */ }
    async detectMarketRegime() { /* TODO */ }
    async analyzeMultipleTimeframes() { /* TODO */ }
    async fetchFearGreedIndex() { /* TODO */ }
    async fetchFundingRate() { /* TODO */ }
    async fetchBTCDominance() { /* TODO */ }
    async fetchOpenInterest() { /* TODO */ }
    checkMarketTiming() { /* TODO */ }
    checkGeopoliticalContext() { /* TODO */ }
    async fetchOrderBookPressure() { /* TODO */ }
    async calculateCompositeSignal() { /* TODO */ }
    async checkStopLoss() { /* TODO */ }
    calculateNetProfit() { /* TODO */ }
    async checkLiveOrders() { /* TODO */ }
    handleOrderFill() { /* TODO */ }
    async syncWithExchange() { /* TODO */ }
    async syncHistoricalTrades() { /* TODO */ }
    async checkGridHealth() { /* TODO */ }
    emitGridState() { /* TODO */ }
    monitorOrders() { /* TODO */ }
    runMonitorLoop() { /* TODO */ }
    async placeOrder() { /* TODO */ }
    async cancelAllOrders() { /* TODO */ }
    async updateBalance() { /* TODO */ }
    async getDetailedFinancials() { /* TODO */ }

    // ==========================================
    // UTILITY
    // ==========================================

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = GridBot;
