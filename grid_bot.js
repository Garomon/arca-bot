/**
 * VANTAGE // QUANTUM GRID BOT
 * Version: 2.0 (Quantum Upgrade)
 * Features: Persistence, Precision Math, Circuit Breakers
 */

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const ccxt = require('ccxt');
const Decimal = require('decimal.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { RSI, EMA, BollingerBands, ATR } = require('technicalindicators');
const adaptiveHelpers = require('./adaptive_helpers');

// --- CONFIGURATION (HYBRID AGGRESSIVE MODE) ---
const CONFIG = {
    // Trading Pair
    pair: 'BTC/USDT',
    tradingFee: 0.001,       // 0.1% Standard Fee

    // GRID SETTINGS (INITIAL - ADAPTIVE AI WILL OVERWRITE)
    gridCount: 16,           // [INITIAL] Max open orders
    gridSpacing: 0.003,      // [INITIAL] 0.3% (Adaptive Base)
    minOrderSize: 0.00001,
    maxOpenOrders: 24,
    safetyMargin: 0.92,

    // TIGHT Volatility Spacing
    spacingNormal: 0.005,
    spacingHigh: 0.007,      // 0.7% in high volatility
    spacingLow: 0.003,       // 0.3% in low vol - MAXIMUM trades
    bandwidthHigh: 0.04,     // Detect high vol faster
    bandwidthLow: 0.015,     // Detect low vol - tighten grid

    // AGGRESSIVE RSI (enter earlier)
    rsiOverbought: 65,       // Sell earlier (was 70)
    rsiOversold: 35,         // Buy earlier (was 30)

    // Technical Indicators
    indicators: {
        rsiPeriod: 7,        // Faster RSI (was 14)
        emaPeriod: 20,       // Faster EMA (was 50)
        bbPeriod: 14,        // Faster BB (was 20)
        bbStdDev: 2
    },

    // PROFIT OPTIMIZATION
    compoundProfits: true,   // Reinvest profits into grid
    minProfitToCompound: 0.5, // Compound even small profits

    // AGGRESSIVE DCA MODE
    dcaEnabled: true,        // Buy dips automatically
    dcaDropPercent: 0.02,    // DCA when price drops 2%
    dcaMultiplier: 1.5,      // Buy 1.5x more on dips

    // System Settings
    monitorInterval: 3000,   // Check every 3 seconds (faster!)
    orderDelay: 150,         // Faster order placement
    logBufferSize: 100,
    healthCheckThreshold: 0.015,  // 1.5% drift triggers rebalance (tighter)

    // State Persistence
    stateFile: path.join(__dirname, 'grid_state.json')
};

// --- SERVER SETUP ---
const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(__dirname));

// --- BINANCE CONNECTION ---
const binance = new ccxt.binance({
    apiKey: process.env.BINANCE_API_KEY,
    secret: process.env.BINANCE_SECRET,
    enableRateLimit: true,
    options: { 'adjustForTimeDifference': true }
});

// ============================================
// ENHANCED LOGGING SYSTEM - Full Transparency
// ============================================
const logBuffer = [];
const LOG_FILE = path.join(__dirname, 'bot_activity.log');
const DECISION_LOG = path.join(__dirname, 'decisions.log');

// Initialize log files
function initializeLogs() {
    const header = `\n\n========== BOT SESSION STARTED: ${new Date().toISOString()} ==========\n`;
    fs.appendFileSync(LOG_FILE, header);
    fs.appendFileSync(DECISION_LOG, header);
}

// Main logging function - writes to console, UI, and file
function log(type, msg, style = '') {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${type}] ${msg}`;

    // Console
    console.log(`>> [${type}] ${msg}`);

    // Persistent file (append)
    try {
        fs.appendFileSync(LOG_FILE, logLine + '\n');
    } catch (e) {
        console.error('Log write failed:', e.message);
    }

    // Buffer for UI
    const logEntry = { type, msg, style, timestamp: Date.now() };
    logBuffer.unshift(logEntry);
    if (logBuffer.length > CONFIG.logBufferSize) logBuffer.pop();

    // Emit to UI
    io.emit('log_message', logEntry);
}

// Decision logging - explains WHY the bot did something
function logDecision(action, reasons, data = {}) {
    const timestamp = new Date().toISOString();
    const decision = {
        timestamp,
        action,
        reasons,
        data,
        compositeScore: state.compositeSignal?.score || null,
        price: state.currentPrice,
        regime: state.marketRegime
    };

    // Write to decision log
    const logLine = `[${timestamp}] ${action}: ${reasons.join(' | ')} | Price: $${state.currentPrice?.toFixed(0) || '??'} | Score: ${decision.compositeScore?.toFixed(0) || '??'}`;

    try {
        fs.appendFileSync(DECISION_LOG, logLine + '\n');
        fs.appendFileSync(DECISION_LOG, `  Details: ${JSON.stringify(data)}\n`);
    } catch (e) {
        console.error('Decision log failed:', e.message);
    }

    // Also log to main feed
    log('DECISION', `${action}: ${reasons.slice(0, 2).join(', ')}`,
        action.includes('BUY') ? 'success' : (action.includes('SELL') ? 'warning' : 'info'));

    // Emit to UI for activity feed
    io.emit('bot_decision', decision);

    return decision;
}

// Activity summary - what the bot is doing right now
function logActivity(activity) {
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
    io.emit('bot_activity', { activity, msg, timestamp: Date.now() });
}

// Initialize logs on startup
try { initializeLogs(); } catch (e) { console.log('Log init skipped'); }

// --- STATE MANAGEMENT ---
let state = {
    balance: { usdt: 0, btc: 0 },
    currentPrice: 0,
    entryPrice: 0,
    activeOrders: [], // { id, side, price, amount, level, status, timestamp }
    filledOrders: [], // History
    totalProfit: 0,
    initialCapital: null, // Track starting capital for profit % calculation
    firstTradeTime: null, // NEVER resets - for APY calculation
    isLive: true,
    startTime: Date.now(),
    marketCondition: null, // Stores RSI/EMA analysis
    marketRegime: null,    // PHASE 1: Bull/Bear/Sideways
    emergencyStop: false,  // PHASE 1: Stop-loss triggered
    maxDrawdown: 0,        // PHASE 1: Track worst drawdown
    lastRebalance: null,   // PHASE 3: Last rebalance info
    lastFillTime: null,    // PHASE 3: Last order fill time
    lastVolatility: null,  // PHASE 3: Previous volatility state
    lastRegime: null       // PHASE 3: Previous market regime
};

// Load State
// Load State
function loadState() {
    try {
        if (fs.existsSync(CONFIG.stateFile)) {
            const raw = fs.readFileSync(CONFIG.stateFile);
            const saved = JSON.parse(raw);
            state = { ...state, ...saved };

            // AUTO-SANITIZER: Fix Historical Profit Logic (Buys = 0) & Retroactive Fee Deduction
            let fixedProfit = 0;
            if (state.filledOrders) {
                // FIXED: Migration Logic - Run cleanly
                console.log('>> [MIGRATION] Verifying Fee Deduction on Historical Orders...');
                state.filledOrders.forEach(o => {
                    // 1. Zero out Buy Profit
                    if (o.side === 'buy' && o.profit > 0) {
                        o.profit = 0;
                    }

                    // 2. Deduct Fees from Sell Profit (Net = Gross - 0.2%)
                    if (o.side === 'sell' && o.profit > 0) {
                        // Check if we already deducted fees (heuristic: is it weirdly precise?) 
                        // Better: Just assume if it's high it's gross.
                        // Or add a flag to the ORDER itself.
                        if (!o.isNetProfit) {
                            const estimatedFees = (o.price * o.amount) * (CONFIG.tradingFee * 2);
                            o.profit = Math.max(0, o.profit - estimatedFees);
                            o.isNetProfit = true; // Mark as processed
                            console.log(`>> [FIX] Order ${o.id}: Deducted $${estimatedFees.toFixed(4)} fees. New Net: $${o.profit.toFixed(4)}`);
                        }
                    }
                    fixedProfit += (o.profit || 0);
                });
                state.totalProfit = fixedProfit; // Force Recalculation
                state.feeCorrectionApplied = true;
            }
            // AUTO-DETECT firstTradeTime from earliest SELL with profit (for APY)
            if (!state.firstTradeTime && state.filledOrders && state.filledOrders.length > 0) {
                // Only count SELLs with profit - that's when we actually started making money
                const profitableSells = state.filledOrders.filter(o => o.side === 'sell' && o.profit > 0);
                if (profitableSells.length > 0) {
                    const timestamps = profitableSells.map(o => o.timestamp).filter(t => t);
                    if (timestamps.length > 0) {
                        state.firstTradeTime = Math.min(...timestamps);
                        console.log(`>> [APY] First profitable SELL: ${new Date(state.firstTradeTime).toISOString()}`);
                    }
                }
            }

            log('SYSTEM', 'STATE LOADED & SANITIZED');
            log('RESUME', `Active Orders: ${state.activeOrders.length} | Real Profit: $${state.totalProfit.toFixed(4)}`);
        }
    } catch (e) {
        console.error('>> [ERROR] Failed to load state:', e.message);
    }
}

// Save State
function saveState() {
    try {
        fs.writeFileSync(CONFIG.stateFile, JSON.stringify(state, null, 2));
    } catch (e) {
        console.error('>> [ERROR] Failed to save state:', e.message);
    }
}

// --- CORE LOGIC ---

async function updateBalance() {
    try {
        const balance = await binance.fetchBalance();
        state.balance.usdt = balance.USDT?.free || 0;
        state.balance.btc = balance.BTC?.free || 0;

        // Calculate Total Equity (USDT + BTC Value + Locked in Orders)
        const totalUSDT = balance.USDT?.total || 0;
        const totalBTC = balance.BTC?.total || 0;

        // We use current price to value the BTC
        const btcValue = new Decimal(totalBTC).mul(state.currentPrice || 0).toNumber();
        const totalEquity = new Decimal(totalUSDT).plus(btcValue).toNumber();

        io.emit('balance_update', {
            usdt: state.balance.usdt, // Free USDT
            btc: state.balance.btc,   // Free BTC
            equity: totalEquity,      // Total Account Value
            isDemo: !state.isLive
        });
    } catch (e) {
        console.error('>> [ERROR] Balance fetch failed:', e.message);
    }
}

async function getCurrentPrice() {
    try {
        const ticker = await binance.fetchTicker(CONFIG.pair);
        state.currentPrice = ticker.last;
        return state.currentPrice;
    } catch (e) {
        console.error('>> [ERROR] Price fetch failed:', e.message);
        return null;
    }
}

async function getDetailedFinancials() {
    try {
        const balance = await binance.fetchBalance();
        const freeUSDT = balance.USDT?.free || 0;
        const freeBTC = balance.BTC?.free || 0;

        // CRITICAL: Use REAL Binance data for locked capital (not manual calculation)
        const lockedUSDT = balance.USDT?.used || 0;  // This is the TRUE amount locked in orders
        const lockedBTC = balance.BTC?.used || 0;    // BTC locked in SELL orders

        // TOTAL holdings (not just free)
        const totalBTC = freeBTC + lockedBTC;
        const totalUSDT = freeUSDT + lockedUSDT;

        // BTC value in USDT (using TOTAL, not just free)
        const btcValueUSDT = totalBTC * (state.currentPrice || 0);

        // Total equity = ALL USDT + ALL BTC valued at current price
        const totalEquity = totalUSDT + btcValueUSDT;

        // Profit calculations (use initial capital if available, otherwise current equity)
        const baseCapital = state.initialCapital || totalEquity;
        const profitPercent = state.initialCapital ? (state.totalProfit / state.initialCapital) * 100 : 0;

        // Active order counts
        const buyOrders = state.activeOrders.filter(o => o.side === 'buy' && o.status === 'open');
        const sellOrders = state.activeOrders.filter(o => o.side === 'sell' && o.status === 'open');

        return {
            freeUSDT,
            lockedUSDT,
            freeBTC,
            lockedBTC,     // NEW: locked BTC
            totalBTC,      // NEW: total BTC
            btcValueUSDT,
            totalEquity,
            profit: state.totalProfit,
            profitPercent,
            startTime: state.firstTradeTime || state.startTime,  // For APY calculation (uses earliest trade)
            activeOrders: {
                buy: buyOrders.length,
                sell: sellOrders.length,
                total: state.activeOrders.length
            },
            currentPrice: state.currentPrice
        };
    } catch (e) {
        console.error('>> [ERROR] Financial calculation failed:', e.message);
        return null;
    }
}

async function initializeGrid(forceReset = false) {
    log('SYSTEM', 'INITIALIZING GRID...');

    const price = await getCurrentPrice();
    if (!price) return;

    // Sync first to ensure we know about all orders
    await syncWithExchange();

    // If we have active orders and not forcing reset, resume monitoring
    if (state.activeOrders.length > 0 && !forceReset) {
        log('SYSTEM', 'RESUMING EXISTING GRID');
        monitorOrders();
        return;
    }

    if (forceReset) {
        log('SYSTEM', 'FORCING GRID RESET');
        await cancelAllOrders();
        // Do NOT wipe profit/history on rebalance
        // state.totalProfit = 0; 
        // state.filledOrders = [];
        state.startTime = Date.now();
    }

    state.entryPrice = price;
    log('ENTRY', `$${price.toFixed(2)}`);

    // Calculate Grid
    // DYNAMIC CAPITAL: Use actual available equity instead of hardcoded config
    const balance = await binance.fetchBalance();
    const totalUSDT = balance.USDT?.total || 0;
    const totalBTC = balance.BTC?.total || 0;
    const btcValue = new Decimal(totalBTC).mul(price).toNumber();
    const dynamicCapital = new Decimal(totalUSDT).plus(btcValue).toNumber();

    // Get regime and volatility for adaptive calculations
    const regime = await detectMarketRegime();
    const analysis = await getMarketAnalysis();
    const volatilityState = analysis && analysis.bandwidth > CONFIG.bandwidthHigh ? 'HIGH' :
        (analysis && analysis.bandwidth < CONFIG.bandwidthLow ? 'LOW' : 'NORMAL');

    // PHASE 2.5: ATR GRID SPACING (Dynamic Volatility Surfing)
    // If ATR is available, use it to set grid spacing (e.g., 1.5x ATR)
    if (analysis && analysis.atr) {
        const atrPercent = analysis.atr / price;
        // Multiplier: 1.5 for normal, 2.0 for high vol, 1.0 for low vol
        let atrMultiplier = volatilityState === 'HIGH' ? 2.0 : (volatilityState === 'LOW' ? 1.0 : 1.5);

        // --- GEOPOLITICAL OVERRIDE ---
        const geoContext = checkGeopoliticalContext();
        if (geoContext.status === 'MIDTERM_RISK') {
            atrMultiplier *= 1.5; // INCREASE SPACING by 50% in risk year to survive deeper drops
            log('GEO', `Midterm Risk Detected. Expanding Grid Spacing (Defense Mode)`, 'warning');
        }

        CONFIG.gridSpacing = Math.max(0.001, Math.min(0.03, atrPercent * atrMultiplier)); // Allow up to 3% spacing
        log('ATR', `Dynamic Spacing Set: ${(CONFIG.gridSpacing * 100).toFixed(2)}% (ATR: ${analysis.atr.toFixed(2)} | Mult: ${atrMultiplier})`, 'info');
    }

    // PHASE 3: Use allocateCapital for smarter distribution
    const multiTF = await analyzeMultipleTimeframes();
    let allocation = adaptiveHelpers.allocateCapital(dynamicCapital, regime.regime, volatilityState, multiTF);

    // --- GEOPOLITICAL RESERVE OVERRIDE ---
    const geoContext = checkGeopoliticalContext(); // Re-check or reuse variable
    if (geoContext.status === 'MIDTERM_RISK') {
        const defensiveReserve = dynamicCapital * 0.25; // 25% Reserve
        if (allocation.reserve < defensiveReserve) {
            allocation.reserve = defensiveReserve;
            allocation.grid = dynamicCapital - defensiveReserve;
            allocation.reason += ' + MIDTERM DEFENSE';
            log('GEO', `Midterm Risk: Boosting Reserve to 25% ($${defensiveReserve.toFixed(2)})`, 'warning');
        }
    }

    const safeCapital = allocation.grid;

    log('SYSTEM', `CAPITAL ALLOCATION: $${safeCapital.toFixed(2)} for grid | $${allocation.reserve.toFixed(2)} reserve (${allocation.reason})`);

    // Log adaptive safety margin for transparency
    const adaptiveSafetyMargin = allocation.allocation;

    // Track initial capital for profit % (only set once on first run)
    if (!state.initialCapital) {
        state.initialCapital = dynamicCapital;
        log('CAPITAL', `Initial Capital Set: $${state.initialCapital.toFixed(2)}`, 'info');
    }

    // PHASE 2: Dynamic Grid Count (adapt to capital and volatility)
    const dynamicGridCount = adaptiveHelpers.calculateOptimalGridCount(safeCapital, volatilityState);
    log('ADAPTIVE', `Grid Count: ${dynamicGridCount} (Capital: $${safeCapital.toFixed(0)} | Vol: ${volatilityState})`, 'info');

    const orderAmountUSDT = new Decimal(safeCapital).div(dynamicGridCount);
    const gridLevels = [];
    const halfGrid = Math.floor(dynamicGridCount / 2);

    // Buys
    for (let i = 1; i <= halfGrid; i++) {
        const levelPrice = new Decimal(price).mul(new Decimal(1).minus(new Decimal(CONFIG.gridSpacing).mul(i)));

        // PHASE 2: Pyramid sizing - bigger orders closer to price
        const distanceFromPrice = Math.abs(levelPrice.toNumber() - price) / price;
        const sizeMultiplier = 1.5 - (distanceFromPrice * 30); // Closer = bigger
        const clampedMultiplier = Math.max(0.7, Math.min(1.5, sizeMultiplier));
        const amount = orderAmountUSDT.mul(clampedMultiplier).div(levelPrice);

        if (amount.toNumber() >= CONFIG.minOrderSize) {
            gridLevels.push({ side: 'buy', price: levelPrice, amount: amount, level: -i });
        }
    }

    // Sells
    for (let i = 1; i <= halfGrid; i++) {
        const levelPrice = new Decimal(price).mul(new Decimal(1).plus(new Decimal(CONFIG.gridSpacing).mul(i)));

        // PHASE 2: Pyramid sizing - bigger orders closer to price
        const distanceFromPrice = Math.abs(levelPrice.toNumber() - price) / price;
        const sizeMultiplier = 1.5 - (distanceFromPrice * 30);
        const clampedMultiplier = Math.max(0.7, Math.min(1.5, sizeMultiplier));
        const amount = orderAmountUSDT.mul(clampedMultiplier).div(price);

        if (amount.toNumber() >= CONFIG.minOrderSize) {
            gridLevels.push({ side: 'sell', price: levelPrice, amount: amount, level: i });
        }
    }

    // Place Orders
    log('GRID', `PLACING ${gridLevels.length} ORDERS (PYRAMID STRATEGY)...`);
    for (const level of gridLevels) {
        await placeOrder(level);
        await sleep(CONFIG.orderDelay);
    }

    saveState();
    emitGridState();
    monitorOrders();
}

async function placeOrder(level) {
    // Circuit Breaker
    if (state.activeOrders.length >= CONFIG.maxOpenOrders) {
        console.warn('>> [WARN] MAX ORDERS REACHED. SKIPPING.');
        return;
    }

    const price = new Decimal(level.price).toNumber();
    const amount = new Decimal(level.amount).toNumber();

    // PHASE 4: Fee Optimization - Skip unprofitable orders
    const worthCheck = adaptiveHelpers.isOrderWorthPlacing(amount, CONFIG.gridSpacing, state.currentPrice);
    if (!worthCheck.worth) {
        log('SKIP', `Order too small: ${worthCheck.reason}`, 'warning');
        return;
    }

    // PHASE 4.5: WALL PROTECTION (Order Book Intelligence)
    try {
        const pressure = await fetchOrderBookPressure();
        // Don't BUY if there is a massive SELL WALL (Ratio < 0.3)
        if (level.side === 'buy' && pressure.ratio < 0.3) {
            log('SMART', `🧱 SELL WALL DETECTED (Ratio ${pressure.ratio.toFixed(2)}x). Delaying BUY.`, 'warning');
            logDecision('BLOCKED_BY_WALL', [`Sell Wall Ratio: ${pressure.ratio.toFixed(2)}x`, 'Waiting for resistance to clear'], { level });
            return;
        }
        // Don't SELL if there is a massive BUY WALL (Ratio > 3.0) - Wait for price to go up
        if (level.side === 'sell' && pressure.ratio > 3.0) {
            log('SMART', `🚀 BUY WALL DETECTED (Ratio ${pressure.ratio.toFixed(2)}x). Delaying SELL (Price might rise).`, 'warning');
            logDecision('BLOCKED_BY_WALL', [`Buy Wall Ratio: ${pressure.ratio.toFixed(2)}x`, 'Waiting for price rise'], { level });
            return;
        }
    } catch (e) {
        // Ignore error and proceed if order book fails
        console.log('Wall check skipped');
    }

    // PHASE 5: SMART BALANCE CHECK (New Intelligence)
    if (level.side === 'buy') {
        const balance = await binance.fetchBalance();
        const availableUSDT = balance.USDT ? balance.USDT.free : 0;
        const requiredUSDT = amount * price;

        if (availableUSDT < requiredUSDT) {
            log('SMART', `INSUFFICIENT FUNDS for BUY. Available: $${availableUSDT.toFixed(2)}, Req: $${requiredUSDT.toFixed(2)}`, 'warning');
            log('DECISION', 'HOLDING (Waiting for liquidity or sells)', 'info');
            return; // EXIT GRACEFULLY - DO NOT ERROR
        }
    } else if (level.side === 'sell') {
        const balance = await binance.fetchBalance();
        const availableBTC = balance.BTC ? balance.BTC.free : 0;

        if (availableBTC < amount) {
            log('SMART', `INSUFFICIENT ASSETS for SELL. Available: ${availableBTC.toFixed(6)} BTC, Req: ${amount.toFixed(6)} BTC`, 'warning');
            log('DECISION', 'HOLDING (HODL mode enabled)', 'info');
            return; // EXIT GRACEFULLY
        }
    }

    try {
        let order;
        // LIVE - Using resilient API call with retries
        order = await adaptiveHelpers.resilientAPICall(
            () => binance.createLimitOrder(CONFIG.pair, level.side, amount, price),
            3,
            `Place ${level.side} order`
        );

        // Log with full transparency
        log('LIVE', `${level.side.toUpperCase()} ${amount.toFixed(6)} @ $${price.toFixed(2)}`, 'success');
        logActivity('PLACING_ORDER');
        logDecision(
            `ORDER_PLACED_${level.side.toUpperCase()}`,
            [
                `Price: $${price.toFixed(2)}`,
                `Amount: ${amount.toFixed(6)} BTC`,
                `Composite Score: ${state.compositeSignal?.score?.toFixed(0) || 'N/A'}`,
                `Regime: ${state.marketRegime || 'Unknown'}`
            ],
            { orderId: order.id, level: level.level, worthCheck: worthCheck }
        );

        state.activeOrders.push({
            id: order.id,
            side: level.side,
            price: price,
            amount: amount,
            level: level.level,
            status: 'open',
            timestamp: Date.now(),
            spacing: CONFIG.gridSpacing // Phase 2 Audit: Track spacing per order
        });
        saveState();

    } catch (e) {
        log('ERROR', `Order Placement Failed: ${e.message}`, 'error');
        logDecision('ORDER_FAILED', [e.message], { level });
    }
}

async function cancelAllOrders() {
    try {
        await binance.cancelAllOrders(CONFIG.pair);
        state.activeOrders = [];
        saveState();
        log('SYSTEM', 'ALL ORDERS CANCELLED');
    } catch (e) {
        log('ERROR', `Cancel Failed: ${e.message}`, 'error');
    }
}
// --- MONITORING LOOP ---
let isMonitoring = false;
let monitorTimeout;
let monitorSessionId = 0; // Generation counter to kill zombies

function monitorOrders() {
    // Clear any existing timeout
    if (monitorTimeout) clearTimeout(monitorTimeout);

    // Start a new session
    monitorSessionId++;
    isMonitoring = true;

    log('SYSTEM', `MONITORING ACTIVE (Session ${monitorSessionId})`);

    // Start the recursive loop with the current ID
    runMonitorLoop(monitorSessionId);
}

async function runMonitorLoop(myId) {
    if (!isMonitoring || myId !== monitorSessionId) return;

    try {
        // PHASE 1: Stop-loss protection
        if (state.emergencyStop) {
            log('STOPPED', 'Bot halted due to emergency stop-loss', 'error');
            return;
        }
        await checkStopLoss();
        if (myId !== monitorSessionId) return; // Zombie check

        let volatilityState = 'NORMAL';

        // PHASE 1: Market Intelligence
        const regime = await detectMarketRegime();
        const multiTF = await analyzeMultipleTimeframes();
        state.marketRegime = regime.regime;

        if (myId !== monitorSessionId) return; // Zombie check

        // Log market intelligence
        log('INTEL', `Regime: ${regime.regime} | MTF Confidence: ${multiTF.confidence} | Direction: ${multiTF.direction}`, 'info');

        // Analytical Brain
        const analysis = await getMarketAnalysis();
        if (myId !== monitorSessionId) return; // Zombie check

        if (analysis) {
            const trend = analysis.price > analysis.ema ? 'BULLISH' : 'BEARISH';
            volatilityState = analysis.bandwidth > CONFIG.bandwidthHigh ? 'HIGH' :
                (analysis.bandwidth < CONFIG.bandwidthLow ? 'LOW' : 'NORMAL');

            // PHASE 2: Adaptive RSI Thresholds
            const adaptiveRSI = adaptiveHelpers.getAdaptiveRSI(regime.regime, volatilityState);

            // SMART FILTERS with ADAPTIVE thresholds
            state.marketCondition = {
                rsi: analysis.rsi,
                trend: trend,
                isOverbought: analysis.rsi > adaptiveRSI.overbought,
                isOversold: analysis.rsi < adaptiveRSI.oversold,
                bandwidth: analysis.bandwidth,
                adaptiveRSI,
                signalScore: analysis.signalScore || 0,
                recommendation: analysis.recommendation || 'HOLD',
                macd: analysis.macd || { signal: 'NEUTRAL', crossing: 'NONE' },
                stochRSI: analysis.stochRSI || 50,
                volume: analysis.volume || { signal: 'NORMAL' }
            };

            // ADAPTIVE VOLATILITY ENGINE
            let newSpacing = CONFIG.spacingNormal;

            if (analysis.bandwidth > CONFIG.bandwidthHigh) {
                newSpacing = CONFIG.spacingHigh;
                volatilityState = 'HIGH';
            } else if (analysis.bandwidth < CONFIG.bandwidthLow) {
                newSpacing = CONFIG.spacingLow;
                volatilityState = 'LOW';
            }

            // Check if we need to adapt (with Smart Hysteresis)
            const lastResetTime = state.lastRebalance?.timestamp || 0;
            const timeSinceReset = Date.now() - lastResetTime;
            // Cooldown: 20 mins for optimization (Zen Mode), 0 for safety (Panic Mode)
            const cooldownMs = 20 * 60 * 1000;
            const isEmergency = volatilityState === 'HIGH';

            if (newSpacing !== CONFIG.gridSpacing && (timeSinceReset > cooldownMs || isEmergency)) {
                log('AI', `VOLATILITY SHIFT DETECTED (${volatilityState}). ADAPTING GRID...`, 'warning');
                CONFIG.gridSpacing = newSpacing;
                state.lastRebalance = { timestamp: Date.now(), triggers: ['VOLATILITY'] };

                // CRITICAL: Call initializeGrid via RECURSION STOP
                // initializeGrid calls monitorOrders, which increments SessionID.
                // This current loop (checking old ID) will die naturally at next check.
                await initializeGrid(true);
                return;
            } else {
                // Auto-Sync
                const lastSync = state.lastSyncTime || 0;
                if (Date.now() - lastSync > 5 * 60 * 1000) {
                    log('SYSTEM', 'AUTO-SYNC: Validating state with exchange...', 'info');
                    await syncWithExchange();
                    state.lastSyncTime = Date.now();
                }

                // Heartbeat Log - ONLY IF still active
                if (myId === monitorSessionId) {
                    log('AI', `ANALYZING: Volatility [${volatilityState}] | RSI [${analysis.rsi.toFixed(1)}]`, 'info');
                }
            }

            if (myId !== monitorSessionId) return; // Zombie check

            // Emit to UI
            io.emit('analysis_update', {
                rsi: analysis.rsi,
                ema: analysis.ema,
                trend: trend,
                price: analysis.price,
                bandwidth: analysis.bandwidth,
                volatility: volatilityState,
                pressure: externalDataCache.orderBook.value || { ratio: 1.0, signal: 'NEUTRAL' },
                geoContext: checkGeopoliticalContext(),
                warning: state.marketCondition.isOverbought ? 'OVERBOUGHT' : (state.marketCondition.isOversold ? 'OVERSOLD' : null),
                signalScore: state.marketCondition.signalScore,
                regime: state.marketRegime,
                multiTF: multiTF,
                bollingerBands: analysis.bb ? {
                    upper: analysis.bb.upper,
                    middle: analysis.bb.middle,
                    lower: analysis.bb.lower
                } : null
            });

            const compositeSignal = await calculateCompositeSignal(analysis, regime, multiTF);
            state.compositeSignal = compositeSignal;

            if (myId !== monitorSessionId) return; // Zombie check

            io.emit('composite_signal', {
                score: compositeSignal.score,
                recommendation: compositeSignal.recommendation,
                sizeMultiplier: compositeSignal.sizeMultiplier,
                reasons: compositeSignal.reasons,
                fearGreed: compositeSignal.components.fearGreed.value,
                funding: compositeSignal.components.funding.rate,
                btcDominance: compositeSignal.components.btcDominance.value,
                timing: compositeSignal.components.timing.recommendation
            });
        }

        // Profit Taking
        if (state.initialCapital && state.totalProfit > 0) {
            const profitActions = adaptiveHelpers.manageProfitTaking(state.totalProfit, state.initialCapital, state);
            profitActions.forEach(action => {
                if (action.type === 'LOCK_PROFIT') {
                    log('PROFIT', `🎯 ${action.reason} - Locking $${action.amount.toFixed(2)}`, 'success');
                } else if (action.type === 'TRAILING_STOP') {
                    log('PROFIT', `⚠️ ${action.reason}`, 'warning');
                }
            });
        }

        const financials = await getDetailedFinancials();
        if (financials && myId === monitorSessionId) {
            const metrics = adaptiveHelpers.calculatePerformanceMetrics(state, state.initialCapital || 100);
            io.emit('financial_update', { ...financials, metrics });
            io.emit('hud_update', {
                status: 'LIVE TRADING',
                detail: `GRID ACTIVE | ${financials.activeOrders.total} ORDERS | $${state.currentPrice.toFixed(0)} | Win: ${metrics.winRate}%`
            });
            io.emit('grid_state', {
                currentPrice: state.currentPrice,
                orders: state.activeOrders,
                filledOrders: state.filledOrders
            });
            io.emit('settings_update', {
                gridCount: state.activeOrders.length,
                gridSpacing: (CONFIG.gridSpacing * 100).toFixed(2),
                safetyMargin: (CONFIG.safetyMargin * 100).toFixed(0),
                rsiThresholds: state.marketCondition?.adaptiveRSI || { overbought: 70, oversold: 30 },
                regime: state.marketRegime,
                volatility: volatilityState
            });
        }

        await checkLiveOrders();
        await checkGridHealth();

    } catch (e) {
        if (myId === monitorSessionId) {
            console.error('>> [CRITICAL ERROR] Monitor Loop Failed:', e);
            log('ERROR', `Monitor Loop Crashed: ${e.message}`, 'error');
        }
    } finally {
        // Schedule NEXT iteration ONLY if we are still the active session
        if (isMonitoring && !state.emergencyStop && myId === monitorSessionId) {
            monitorTimeout = setTimeout(() => runMonitorLoop(myId), CONFIG.monitorInterval);
        }
    }
}

async function getMarketAnalysis() {
    try {
        // Fetch last 100 candles (1h)
        const candles = await binance.fetchOHLCV(CONFIG.pair, '1h', undefined, 100);
        const closes = candles.map(c => c[4]);
        const highs = candles.map(c => c[2]);
        const lows = candles.map(c => c[3]);
        const volumes = candles.map(c => c[5]);

        // Calculate RSI
        const rsiInput = { values: closes, period: CONFIG.indicators.rsiPeriod };
        const rsiValues = RSI.calculate(rsiInput);
        const currentRSI = rsiValues[rsiValues.length - 1];

        // Calculate EMA
        const emaInput = { values: closes, period: CONFIG.indicators.emaPeriod };
        const emaValues = EMA.calculate(emaInput);
        const currentEMA = emaValues[emaValues.length - 1];

        // Calculate Bollinger Bands
        const bbInput = { period: CONFIG.indicators.bbPeriod, values: closes, stdDev: CONFIG.indicators.bbStdDev };
        const bbValues = BollingerBands.calculate(bbInput);
        const currentBB = bbValues[bbValues.length - 1];

        // Calculate Bandwidth (Volatility Metric)
        const bandwidth = (currentBB.upper - currentBB.lower) / currentBB.middle;

        // Calculate ATR (Average True Range) for Dynamic Spacing
        const atrInput = { high: highs, low: lows, close: closes, period: 14 };
        const atrValues = ATR.calculate(atrInput);
        const currentATR = atrValues[atrValues.length - 1];

        // === NEW INDICATORS ===

        // MACD (Momentum) - Using manual calculation since library may not have it
        const ema12 = EMA.calculate({ values: closes, period: 12 });
        const ema26 = EMA.calculate({ values: closes, period: 26 });
        const macdLine = ema12[ema12.length - 1] - ema26[ema26.length - 1];
        const prevMacdLine = ema12[ema12.length - 2] - ema26[ema26.length - 2];
        const macdSignal = macdLine > 0 ? 'BULLISH' : 'BEARISH';
        const macdCrossing = prevMacdLine < 0 && macdLine > 0 ? 'BUY_CROSS' :
            (prevMacdLine > 0 && macdLine < 0 ? 'SELL_CROSS' : 'NONE');

        // Stochastic RSI (more sensitive oversold/overbought)
        const stochPeriod = 14;
        const recentRSI = rsiValues.slice(-stochPeriod);
        const minRSI = Math.min(...recentRSI);
        const maxRSI = Math.max(...recentRSI);
        const stochRSI = ((currentRSI - minRSI) / (maxRSI - minRSI || 1)) * 100;

        // Volume Analysis
        const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
        const currentVolume = volumes[volumes.length - 1];
        const volumeRatio = currentVolume / avgVolume;
        const volumeSignal = volumeRatio > 1.5 ? 'HIGH' : (volumeRatio < 0.5 ? 'LOW' : 'NORMAL');

        // === COMBINED SIGNAL SCORE (-100 to +100) ===
        let signalScore = 0;

        // RSI component (-30 to +30)
        if (currentRSI < 35) signalScore += 30;      // Oversold = BUY
        else if (currentRSI > 65) signalScore -= 30; // Overbought = SELL
        else signalScore += (50 - currentRSI) * 0.5; // Neutral bias

        // Stochastic RSI component (-20 to +20)
        if (stochRSI < 20) signalScore += 20;       // Strong oversold
        else if (stochRSI > 80) signalScore -= 20;  // Strong overbought

        // MACD component (-25 to +25)
        if (macdCrossing === 'BUY_CROSS') signalScore += 25;
        else if (macdCrossing === 'SELL_CROSS') signalScore -= 25;
        else if (macdSignal === 'BULLISH') signalScore += 10;
        else signalScore -= 10;

        // EMA trend component (-15 to +15)
        const price = closes[closes.length - 1];
        if (price > currentEMA * 1.01) signalScore += 15;      // Above EMA
        else if (price < currentEMA * 0.99) signalScore -= 15;  // Below EMA

        // Volume confirmation (-10 to +10)
        if (volumeSignal === 'HIGH' && signalScore > 0) signalScore += 10;  // Volume confirms bullish
        if (volumeSignal === 'HIGH' && signalScore < 0) signalScore -= 10;  // Volume confirms bearish

        // Final signal recommendation
        let recommendation = 'HOLD';
        if (signalScore >= 40) recommendation = 'STRONG_BUY';
        else if (signalScore >= 20) recommendation = 'BUY';
        else if (signalScore <= -40) recommendation = 'STRONG_SELL';
        else if (signalScore <= -20) recommendation = 'SELL';

        // Log the analysis
        // log('AI', `ANALYZING: Volatility [${volumeSignal}] | RSI [${currentRSI.toFixed(1)}]`);

        return {
            rsi: currentRSI,
            ema: currentEMA,
            bb: currentBB,
            bandwidth: bandwidth,
            atr: currentATR,
            price: price,
            // New indicators
            macd: { line: macdLine, signal: macdSignal, crossing: macdCrossing },
            stochRSI: stochRSI,
            volume: { current: currentVolume, avg: avgVolume, ratio: volumeRatio, signal: volumeSignal },
            // Combined signal
            signalScore: signalScore,
            recommendation: recommendation
        };
    } catch (e) {
        console.error('>> [ERROR] Analysis Failed:', e.message);
        return null;
    }
}

// PHASE 1: Market Regime Detection
async function detectMarketRegime() {
    try {
        // Get multiple EMAs for trend analysis
        const candles = await binance.fetchOHLCV(CONFIG.pair, '1h', undefined, 200);
        const closes = candles.map(c => c[4]);

        // EMA 50 and EMA 200
        const ema50 = EMA.calculate({ values: closes, period: 50 });
        const ema200 = EMA.calculate({ values: closes, period: 200 });

        const currentPrice = closes[closes.length - 1];
        const currentEMA50 = ema50[ema50.length - 1];
        const currentEMA200 = ema200[ema200.length - 1];

        // Calculate price position in recent range
        const recentHigh = Math.max(...closes.slice(-100));
        const recentLow = Math.min(...closes.slice(-100));
        const pricePosition = (currentPrice - recentLow) / (recentHigh - recentLow);

        // Trend strength
        const trendStrength = Math.abs(currentEMA50 - currentEMA200) / currentEMA200;

        // Determine regime
        let regime = 'SIDEWAYS';

        if (currentEMA50 > currentEMA200) {
            // Bullish alignment
            if (pricePosition > 0.7 && trendStrength > 0.02) {
                regime = 'STRONG_BULL';
            } else if (pricePosition > 0.5) {
                regime = 'BULL';
            } else {
                regime = 'WEAK_BULL';
            }
        } else {
            // Bearish alignment
            if (pricePosition < 0.3 && trendStrength > 0.02) {
                regime = 'STRONG_BEAR';
            } else if (pricePosition < 0.5) {
                regime = 'BEAR';
            } else {
                regime = 'WEAK_BEAR';
            }
        }

        return {
            regime,
            ema50: currentEMA50,
            ema200: currentEMA200,
            pricePosition,
            trendStrength
        };
    } catch (e) {
        console.error('>> [ERROR] Regime detection failed:', e.message);
        return { regime: 'UNKNOWN' };
    }
}

// PHASE 1: Multi-Timeframe Analysis
async function analyzeMultipleTimeframes() {
    try {
        // Analyze 1h, 4h, and 1d timeframes
        const tf1h = await getMarketAnalysis('1h');
        const tf4h = await binance.fetchOHLCV(CONFIG.pair, '4h', undefined, 100);
        const tf1d = await binance.fetchOHLCV(CONFIG.pair, '1d', undefined, 100);

        // Simple trend detection for each TF
        const closes4h = tf4h.map(c => c[4]);
        const closes1d = tf1d.map(c => c[4]);

        const ema504h = EMA.calculate({ values: closes4h, period: 50 });
        const ema501d = EMA.calculate({ values: closes1d, period: 50 });

        const price4h = closes4h[closes4h.length - 1];
        const price1d = closes1d[closes1d.length - 1];

        const trend4h = price4h > ema504h[ema504h.length - 1] ? 'BULL' : 'BEAR';
        const trend1d = price1d > ema501d[ema501d.length - 1] ? 'BULL' : 'BEAR';

        // Confluence (all agree = high confidence)
        const allBullish = tf1h && tf1h.price > tf1h.ema && trend4h === 'BULL' && trend1d === 'BULL';
        const allBearish = tf1h && tf1h.price < tf1h.ema && trend4h === 'BEAR' && trend1d === 'BEAR';

        return {
            trend1h: tf1h ? (tf1h.price > tf1h.ema ? 'BULL' : 'BEAR') : 'UNKNOWN',
            trend4h,
            trend1d,
            confidence: allBullish || allBearish ? 'HIGH' : 'LOW',
            direction: allBullish ? 'UP' : (allBearish ? 'DOWN' : 'UNCERTAIN')
        };
    } catch (e) {
        console.error('>> [ERROR] Multi-timeframe analysis failed:', e.message);
        return { confidence: 'LOW', direction: 'UNCERTAIN' };
    }
}

// ============================================
// ULTIMATE INTELLIGENCE MODULE
// All external data sources for best decisions
// ============================================

// Cache for external data (avoid rate limits)
const externalDataCache = {
    fearGreed: { value: null, timestamp: 0 },
    fundingRate: { value: null, timestamp: 0 },
    btcDominance: { value: null, timestamp: 0 },
    openInterest: { value: null, timestamp: 0 },
    orderBook: { value: null, timestamp: 0 }
};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// FEAR & GREED INDEX (Alternative.me)
async function fetchFearGreedIndex() {
    if (Date.now() - externalDataCache.fearGreed.timestamp < CACHE_TTL) {
        return externalDataCache.fearGreed.value;
    }

    try {
        const response = await fetch('https://api.alternative.me/fng/?limit=1');
        if (response.ok) {
            const data = await response.json();
            const fng = {
                value: parseInt(data.data[0].value),
                classification: data.data[0].value_classification,
                timestamp: Date.now()
            };
            externalDataCache.fearGreed = { value: fng, timestamp: Date.now() };
            log('INTEL', `Fear/Greed: ${fng.value} (${fng.classification})`, 'info');
            return fng;
        }
    } catch (e) {
        console.error('>> [ERROR] Fear/Greed fetch failed:', e.message);
    }
    return { value: 50, classification: 'Neutral', timestamp: Date.now() };
}

// FUNDING RATE (Binance Futures)
async function fetchFundingRate() {
    if (Date.now() - externalDataCache.fundingRate.timestamp < CACHE_TTL) {
        return externalDataCache.fundingRate.value;
    }

    try {
        const response = await fetch('https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1');
        if (response.ok) {
            const data = await response.json();
            const rate = parseFloat(data[0].fundingRate) * 100; // Convert to percentage
            const funding = {
                rate: rate,
                signal: rate > 0.05 ? 'OVERLEVERAGED_LONG' : (rate < -0.05 ? 'OVERLEVERAGED_SHORT' : 'NEUTRAL'),
                timestamp: Date.now()
            };
            externalDataCache.fundingRate = { value: funding, timestamp: Date.now() };
            log('INTEL', `Funding Rate: ${rate.toFixed(4)}% (${funding.signal})`, 'info');
            return funding;
        }
    } catch (e) {
        console.error('>> [ERROR] Funding rate fetch failed:', e.message);
    }
    return { rate: 0, signal: 'NEUTRAL', timestamp: Date.now() };
}

// BTC DOMINANCE (CoinGecko)
async function fetchBTCDominance() {
    if (Date.now() - externalDataCache.btcDominance.timestamp < CACHE_TTL) {
        return externalDataCache.btcDominance.value;
    }

    try {
        const response = await fetch('https://api.coingecko.com/api/v3/global');
        if (response.ok) {
            const data = await response.json();
            const dominance = data.data.market_cap_percentage.btc;
            const dom = {
                value: dominance,
                signal: dominance > 55 ? 'BTC_FLIGHT_TO_SAFETY' : (dominance < 45 ? 'ALT_SEASON' : 'BALANCED'),
                timestamp: Date.now()
            };
            externalDataCache.btcDominance = { value: dom, timestamp: Date.now() };
            log('INTEL', `BTC Dominance: ${dominance.toFixed(1)}% (${dom.signal})`, 'info');
            return dom;
        }
    } catch (e) {
        console.error('>> [ERROR] BTC Dominance fetch failed:', e.message);
    }
    return { value: 50, signal: 'BALANCED', timestamp: Date.now() };
}

// OPEN INTEREST CHANGE (Binance Futures)
async function fetchOpenInterest() {
    if (Date.now() - externalDataCache.openInterest.timestamp < CACHE_TTL) {
        return externalDataCache.openInterest.value;
    }

    try {
        const response = await fetch('https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT');
        if (response.ok) {
            const data = await response.json();
            const currentOI = parseFloat(data.openInterest);
            const previousOI = externalDataCache.openInterest.value?.current || currentOI;
            const change = ((currentOI - previousOI) / previousOI) * 100;

            const oi = {
                current: currentOI,
                change: change,
                signal: change > 5 ? 'OI_INCREASING' : (change < -5 ? 'OI_DECREASING' : 'STABLE'),
                timestamp: Date.now()
            };
            externalDataCache.openInterest = { value: oi, timestamp: Date.now() };
            return oi;
        }
    } catch (e) {
        console.error('>> [ERROR] Open Interest fetch failed:', e.message);
    }
    return { current: 0, change: 0, signal: 'STABLE', timestamp: Date.now() };
}

// TIME-BASED MARKET CHECK
function checkMarketTiming() {
    const now = new Date();
    const hour = now.getUTCHours();
    const day = now.getUTCDay(); // 0 = Sunday, 6 = Saturday

    // Weekend = lower liquidity, higher spreads
    const isWeekend = day === 0 || day === 6;

    // NY Open (13:30-15:30 UTC) and Close (20:00-22:00 UTC) = high volatility
    const isNYOpenClose = (hour >= 13 && hour <= 15) || (hour >= 20 && hour <= 22);

    // Asian session (23:00-07:00 UTC) = often quieter for BTC
    const isAsianSession = hour >= 23 || hour <= 7;

    return {
        isWeekend,
        isNYOpenClose,
        isAsianSession,
        recommendation: isWeekend ? 'REDUCE_SIZE' :
            (isNYOpenClose ? 'CAUTION_HIGH_VOL' : 'NORMAL')
    };
}

// GEOPOLITICAL CONTEXT (Midterm Cycle 2026 + Institutional Adoption)
function checkGeopoliticalContext(currentRegime = 'NEUTRAL') {
    const now = new Date();
    // Danger Zone: Nov 1, 2025 to Nov 5, 2026
    const startDanger = new Date('2025-11-01');
    const endDanger = new Date('2026-11-05');

    const inDangerZone = now >= startDanger && now <= endDanger;

    if (inDangerZone) {
        // ADAPTIVE LOGIC: If Market is Bullish, ignore the "Calendar Fear"
        // This reflects "Institutional Adoption" overriding typical cycles
        if (currentRegime.includes('BULL')) {
            return {
                status: 'INSTITUTIONAL_ADOPTION',
                modifier: 'AGGRESSIVE',
                defenseLevel: 0,
                scoreBias: 15 // Bonus points for defying the cycle
            };
        }

        // Otherwise, respect the danger zone
        return {
            status: 'MIDTERM_RISK',
            modifier: 'DEFENSIVE',
            defenseLevel: 2 // Level 2 Defense (High Reserves)
        };
    }
    return { status: 'NORMAL', modifier: 'NONE', defenseLevel: 0, scoreBias: 0 };
}

// ORDER BOOK PRESSURE (Binance Spot)
async function fetchOrderBookPressure() {
    // Initialize cache if missing
    if (!externalDataCache.orderBook) {
        externalDataCache.orderBook = { value: null, timestamp: 0 };
    }

    if (Date.now() - externalDataCache.orderBook.timestamp < 10000) { // 10s Cache
        return externalDataCache.orderBook.value || { ratio: 1.0, signal: 'NEUTRAL', bidVol: 0, askVol: 0 };
    }

    try {
        // Fetch top 50 levels (Depth 50)
        const orderBook = await binance.fetchOrderBook(CONFIG.pair, 50);
        const bids = orderBook.bids;
        const asks = orderBook.asks;

        // Calculate volume sum
        const bidVol = bids.reduce((acc, bid) => acc + bid[1], 0);
        const askVol = asks.reduce((acc, ask) => acc + ask[1], 0);

        const ratio = askVol > 0 ? bidVol / askVol : 1.0;
        // Ratio > 1.0 = More Bids (Support) = BULLISH
        // Ratio < 1.0 = More Asks (Resistance) = BEARISH

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
        return { ratio: 1.0, signal: 'NEUTRAL', bidVol: 0, askVol: 0 };
    }
}

// COMPOSITE SIGNAL SCORE - Combines ALL intelligence
async function calculateCompositeSignal(analysis, regime, multiTF) {
    // Fetch all external data
    const [fearGreed, funding, btcDom, openInterest] = await Promise.all([
        fetchFearGreedIndex(),
        fetchFundingRate(),
        fetchBTCDominance(),
        fetchOpenInterest()
    ]);

    // Ensure pressure is updated
    await fetchOrderBookPressure();

    const timing = checkMarketTiming();

    let score = 50; // Start neutral
    let reasons = [];

    // === TECHNICAL INDICATORS (40% weight) ===

    // RSI contribution (0-20 points)
    if (analysis.rsi < 30) {
        score += 15;
        reasons.push('RSI oversold (+15)');
    } else if (analysis.rsi > 70) {
        score -= 15;
        reasons.push('RSI overbought (-15)');
    } else if (analysis.rsi < 45) {
        score += 5;
        reasons.push('RSI low-ish (+5)');
    } else if (analysis.rsi > 55) {
        score -= 5;
        reasons.push('RSI high-ish (-5)');
    }

    // MACD contribution (0-10 points)
    if (analysis.macd?.crossing === 'BUY_CROSS') {
        score += 10;
        reasons.push('MACD buy cross (+10)');
    } else if (analysis.macd?.crossing === 'SELL_CROSS') {
        score -= 10;
        reasons.push('MACD sell cross (-10)');
    } else if (analysis.macd?.signal === 'BULLISH') {
        score += 3;
    } else if (analysis.macd?.signal === 'BEARISH') {
        score -= 3;
    }

    // Multi-Timeframe (0-10 points)
    if (multiTF.confidence === 'HIGH' && multiTF.direction === 'UP') {
        score += 10;
        reasons.push('MTF aligned UP (+10)');
    } else if (multiTF.confidence === 'HIGH' && multiTF.direction === 'DOWN') {
        score -= 10;
        reasons.push('MTF aligned DOWN (-10)');
    }

    // === SENTIMENT INDICATORS (30% weight) ===

    // Fear & Greed (0-15 points)
    if (fearGreed.value < 25) {
        score += 15;
        reasons.push(`Extreme Fear ${fearGreed.value} (+15)`);
    } else if (fearGreed.value < 40) {
        score += 8;
        reasons.push(`Fear ${fearGreed.value} (+8)`);
    } else if (fearGreed.value > 75) {
        score -= 15;
        reasons.push(`Extreme Greed ${fearGreed.value} (-15)`);
    } else if (fearGreed.value > 60) {
        score -= 8;
        reasons.push(`Greed ${fearGreed.value} (-8)`);
    }

    // Funding Rate (0-10 points)
    if (funding.signal === 'OVERLEVERAGED_LONG') {
        score -= 10;
        reasons.push('High funding, longs overleveraged (-10)');
    } else if (funding.signal === 'OVERLEVERAGED_SHORT') {
        score += 10;
        reasons.push('Negative funding, shorts overleveraged (+10)');
    }

    // === MARKET STRUCTURE (20% weight) ===

    // Regime (0-10 points)
    if (regime.regime === 'STRONG_BULL') {
        score += 10;
        reasons.push('Strong bull regime (+10)');
    } else if (regime.regime === 'STRONG_BEAR') {
        score -= 10;
        reasons.push('Strong bear regime (-10)');
    } else if (regime.regime.includes('BULL')) {
        score += 5;
    } else if (regime.regime.includes('BEAR')) {
        score -= 5;
    }

    // Open Interest trend
    if (openInterest.signal === 'OI_INCREASING' && score > 50) {
        score += 5; // OI rising with bullish signals = strong
        reasons.push('OI increasing in uptrend (+5)');
    } else if (openInterest.signal === 'OI_DECREASING' && score < 50) {
        score += 5; // OI falling with bearish signals = capitulation
        reasons.push('OI decreasing, possible bottom (+5)');
    }

    // === ORDER BOOK PRESSURE (New Intelligence) ===
    const pressure = await fetchOrderBookPressure();
    if (pressure.ratio > 2.0) { // 2x more buyers
        score += 10;
        reasons.push(`Strong Buy Wall (${pressure.ratio.toFixed(1)}x) (+10)`);
    } else if (pressure.ratio < 0.5) { // 2x more sellers
        score -= 10;
        reasons.push(`Strong Sell Wall (${pressure.ratio.toFixed(1)}x) (-10)`);
    } else if (pressure.ratio > 1.2) {
        score += 5;
        reasons.push('Buy Pressure (+5)');
    } else if (pressure.ratio < 0.8) {
        score -= 5;
        reasons.push('Sell Pressure (-5)');
    }

    // === GEOPOLITICAL CONTEXT (Corrected \u0026 Adaptive) ===
    const geo = checkGeopoliticalContext(regime.regime || 'NEUTRAL');
    if (geo.scoreBias !== 0) {
        score += geo.scoreBias;
        reasons.push(`${geo.status} (${geo.scoreBias > 0 ? '+' : ''}${geo.scoreBias})`);
    }

    // === TIMING ADJUSTMENTS (10% weight) ===

    if (timing.isWeekend) {
        // Reduce conviction on weekends
        score = 50 + (score - 50) * 0.7;
        reasons.push('Weekend: reduced confidence');
    }

    if (timing.isNYOpenClose) {
        reasons.push('NY session: expect volatility');
    }

    // Clamp to 0-100
    score = Math.max(0, Math.min(100, score));

    // Determine recommendation
    let recommendation;
    let sizeMultiplier;

    if (score >= 80) {
        recommendation = 'STRONG_BUY';
        sizeMultiplier = 1.5;
    } else if (score >= 65) {
        recommendation = 'BUY';
        sizeMultiplier = 1.2;
    } else if (score >= 55) {
        recommendation = 'WEAK_BUY';
        sizeMultiplier = 1.0;
    } else if (score >= 45) {
        recommendation = 'HOLD';
        sizeMultiplier = 0.8;
    } else if (score >= 35) {
        recommendation = 'WEAK_SELL';
        sizeMultiplier = 0.6;
    } else if (score >= 20) {
        recommendation = 'SELL';
        sizeMultiplier = 0.4;
    } else {
        recommendation = 'STRONG_SELL';
        sizeMultiplier = 0.2;
    }

    const result = {
        score,
        recommendation,
        sizeMultiplier,
        reasons,
        components: {
            fearGreed,
            funding,
            btcDominance: btcDom,
            openInterest,
            timing,
            geo, // Added to output for UI
            technicals: {
                rsi: analysis.rsi,
                macd: analysis.macd,
                multiTF
            }
        },
        timestamp: Date.now()
    };

    log('COMPOSITE', `Score: ${score} | ${recommendation} | Size: ${sizeMultiplier}x`,
        score >= 60 ? 'success' : (score <= 40 ? 'warning' : 'info'));

    return result;
}

// Store latest composite signal in state
state.compositeSignal = null;

// PHASE 1: Stop-Loss Protection (Fixed for accurate drawdown calculation)
async function checkStopLoss() {
    if (!state.initialCapital || state.emergencyStop) return;

    try {
        const balance = await binance.fetchBalance();
        const totalUSDT = balance.USDT?.total || 0;
        const totalBTC = balance.BTC?.total || 0;

        // Calculate REAL total equity based on current holdings
        const btcValue = totalBTC * (state.currentPrice || 0);
        const totalEquity = totalUSDT + btcValue;

        // Only calculate drawdown if we have meaningful data
        if (totalEquity <= 0) return;

        const drawdown = ((state.initialCapital - totalEquity) / state.initialCapital) * 100;

        // Update max drawdown (only if positive, meaning we're down)
        if (drawdown > 0 && drawdown > state.maxDrawdown) {
            state.maxDrawdown = drawdown;
        }

        // Emergency stop at -10% (only if truly in significant loss)
        if (drawdown > 10 && totalEquity < state.initialCapital * 0.9) {
            log('EMERGENCY', '🚨 STOP-LOSS TRIGGERED @ -10% DRAWDOWN', 'error');
            log('EMERGENCY', `Initial: $${state.initialCapital.toFixed(2)} | Current: $${totalEquity.toFixed(2)}`, 'error');

            // Cancel all orders
            await cancelAllOrders();
            state.emergencyStop = true;
            saveState();

            io.emit('emergency_stop', {
                drawdown,
                initialCapital: state.initialCapital,
                currentEquity: totalEquity
            });
        }
    } catch (e) {
        console.error('>> [ERROR] Stop-loss check failed:', e.message);
    }
}

// PHASE 1: Fee-Aware Profit Calculation
function calculateNetProfit(buyPrice, sellPrice, amount) {
    const grossProfit = (sellPrice - buyPrice) * amount;
    const buyFee = buyPrice * amount * CONFIG.tradingFee;
    const sellFee = sellPrice * amount * CONFIG.tradingFee;
    const netProfit = grossProfit - buyFee - sellFee;

    return {
        gross: grossProfit,
        fees: buyFee + sellFee,
        net: netProfit,
        feePercent: ((buyFee + sellFee) / (buyPrice * amount)) * 100
    };
}


async function checkLiveOrders() {
    try {
        const openOrders = await binance.fetchOpenOrders(CONFIG.pair);
        const openOrderIds = new Set(openOrders.map(o => o.id));

        // Detect filled orders
        const filled = state.activeOrders.filter(o => !openOrderIds.has(o.id));

        for (const order of filled) {
            // Double check status
            try {
                const info = await binance.fetchOrder(order.id, CONFIG.pair);
                if (info.status === 'closed') {
                    handleOrderFill(order, info.price);
                }
            } catch (e) {
                // Order might be gone, assume filled if not in openOrders? 
                // Safer to ignore or check trades. For now, skip.
            }
        }

        // Update active list
        state.activeOrders = state.activeOrders.filter(o => openOrderIds.has(o.id));
        saveState();
        emitGridState();
        updateBalance(); // Keep balance fresh

    } catch (e) {
        console.error('>> [ERROR] Check Failed:', e.message);
    }
}

async function handleOrderFill(order, fillPrice) {
    // FIX: Only SELL orders realize profit. BUY orders are just entries.
    let profit = 0;
    if (order.side === 'sell') {
        const spacing = order.spacing || CONFIG.gridSpacing; // Phase 2 Audit: Use historical spacing
        const buyPrice = fillPrice / (1 + spacing); // Estimate based on actual spacing
        const grossProfit = (fillPrice - buyPrice) * order.amount;
        const fees = (buyPrice * order.amount * CONFIG.tradingFee) + (fillPrice * order.amount * CONFIG.tradingFee);
        profit = grossProfit - fees;
    }

    // Update State
    state.totalProfit += profit;
    // CRITICAL FIX: Mark as Net Profit so loadState doesn't deduct fees again!
    state.filledOrders.push({ ...order, fillPrice, profit, timestamp: Date.now(), isNetProfit: true });
    state.lastFillTime = Date.now();

    const profitMsg = profit > 0 ? `| Profit: $${profit.toFixed(4)}` : '';
    log('EXECUTION', `💰 ${order.side.toUpperCase()} FILLED @ $${fillPrice.toFixed(2)} ${profitMsg}`, 'success');
    io.emit('trade_success', { side: order.side, price: fillPrice, profit });

    // Re-place opposite order
    const newSide = order.side === 'buy' ? 'sell' : 'buy';
    const newPrice = order.side === 'buy'
        ? fillPrice * (1 + CONFIG.gridSpacing)
        : fillPrice * (1 - CONFIG.gridSpacing);

    // === SMART FILTERS USING ALL INDICATORS ===
    const signalScore = state.marketCondition?.signalScore || 0;
    const recommendation = state.marketCondition?.recommendation || 'HOLD';
    const macdSignal = state.marketCondition?.macd?.signal || 'NEUTRAL';
    const stochRSI = state.marketCondition?.stochRSI || 50;

    // BUY FILTER: Don't buy when signals say SELL
    if (newSide === 'buy') {
        if (state.marketCondition?.isOverbought) {
            log('FILTER', `🛑 RSI OVERBOUGHT. SKIPPING BUY.`, 'error');
            return;
        }
        if (recommendation === 'STRONG_SELL' || recommendation === 'SELL') {
            log('FILTER', `🛑 Signal: ${recommendation} (Score: ${signalScore}). SKIPPING BUY.`, 'error');
            return;
        }
        if (macdSignal === 'BEARISH' && stochRSI > 70) {
            log('FILTER', `🛑 MACD Bearish + Stoch High (${stochRSI.toFixed(0)}). SKIPPING BUY.`, 'error');
            return;
        }
    }

    // SELL FILTER: Don't sell when signals say BUY
    if (newSide === 'sell') {
        if (state.marketCondition?.isOversold) {
            log('FILTER', `🛑 RSI OVERSOLD. SKIPPING SELL.`, 'error');
            return;
        }
        if (recommendation === 'STRONG_BUY' || recommendation === 'BUY') {
            log('FILTER', `🛑 Signal: ${recommendation} (Score: ${signalScore}). SKIPPING SELL.`, 'error');
            return;
        }
        if (macdSignal === 'BULLISH' && stochRSI < 30) {
            log('FILTER', `🛑 MACD Bullish + Stoch Low (${stochRSI.toFixed(0)}). SKIPPING SELL.`, 'error');
            return;
        }
    }

    // All filters passed - place the order
    log('AI', `✅ Signal OK: ${recommendation} | MACD: ${macdSignal} | Stoch: ${stochRSI.toFixed(0)}`);

    await placeOrder({
        side: newSide,
        price: newPrice,
        amount: order.amount,
        level: order.level
    });
}

async function syncWithExchange() {
    log('SYSTEM', 'SYNCING WITH EXCHANGE...');
    try {
        const openOrders = await binance.fetchOpenOrders(CONFIG.pair);
        const openIds = new Set(openOrders.map(o => o.id));

        // 1. Remove local orders that are no longer open on exchange
        // CRITICAL FIX: Check if they were filled while offline, don't just delete them!
        const missingOrders = state.activeOrders.filter(o => !openIds.has(o.id));

        for (const missingOrder of missingOrders) {
            try {
                const orderInfo = await binance.fetchOrder(missingOrder.id, CONFIG.pair);
                if (orderInfo.status === 'closed' || orderInfo.status === 'filled') {
                    log('SYNC', `Order ${missingOrder.id} filled while offline. Processing...`, 'success');
                    handleOrderFill(missingOrder, orderInfo.price);
                } else if (orderInfo.status === 'canceled') {
                    log('SYNC', `Order ${missingOrder.id} was canceled. Removing.`, 'info');
                }
            } catch (e) {
                log('WARN', `Could not fetch status for missing order ${missingOrder.id}. Assuming canceled.`, 'warning');
            }
        }

        // Now update the active list
        state.activeOrders = state.activeOrders.filter(o => openIds.has(o.id));

        // 2. Adopt orphan orders from exchange
        let adoptedCount = 0;
        for (const order of openOrders) {
            const isKnown = state.activeOrders.some(o => o.id === order.id);
            if (!isKnown) {
                // Adopt it
                state.activeOrders.push({
                    id: order.id,
                    side: order.side,
                    price: order.price,
                    amount: order.amount,
                    level: 0, // Unknown level, assign 0 or estimate
                    status: 'open',
                    timestamp: order.timestamp
                });
                adoptedCount++;
            }
        }

        if (adoptedCount > 0) {
            log('SYNC', `ADOPTED ${adoptedCount} ORPHAN ORDERS`);
            saveState();
            emitGridState();
        } else {
            log('SYNC', 'STATE IS IN SYNC');
        }

        // 3. Sync recent history (for UI completeness)
        await syncHistoricalTrades();

    } catch (e) {
        log('ERROR', `Sync Failed: ${e.message}`, 'error');
    }
}

async function syncHistoricalTrades() {
    try {
        const trades = await binance.fetchMyTrades(CONFIG.pair, undefined, 50); // Last 50 trades
        if (trades.length > 0) log('DEBUG', `Fetched ${trades.length} trades. Verifying against known orders...`);
        let addedCount = 0;

        // Ensure filledOrders array exists
        if (!state.filledOrders) state.filledOrders = [];

        // AUTO-REPAIR: Remove invalid entries (ID is null/undefined)
        const initialLength = state.filledOrders.length;
        state.filledOrders = state.filledOrders.filter(o => o.id);
        if (state.filledOrders.length < initialLength) {
            log('SYSTEM', `Cleaned ${initialLength - state.filledOrders.length} corrupt history entries.`, 'warning');
        }

        const knownIds = new Set(state.filledOrders.map(o => o.id));

        for (const trade of trades) {
            // Fix ID access: CCXT sometimes uses .order, .orderId, or .id
            const tradeId = trade.orderId || trade.order || trade.id;

            // Check if we know this trade
            if (!knownIds.has(tradeId)) {

                // Estimate Profit (Heuristic for Grid Bot)
                // We assume Sells are closing profitable grid levels (~gridSpacing)
                // Buys are entries, so 0 realized profit.
                let estimatedProfit = 0;
                if (trade.side === 'sell') {
                    // DEBUG: Log calculation details
                    log('DEBUG', `Calc Profit: ${trade.amount} * ${trade.price} * ${CONFIG.gridSpacing}`);
                    estimatedProfit = (trade.amount * trade.price) * CONFIG.gridSpacing;
                    state.totalProfit += estimatedProfit; // Add to global counter
                }

                // Add to history
                state.filledOrders.push({
                    id: tradeId,
                    side: trade.side,
                    price: trade.price,
                    amount: trade.amount,
                    timestamp: trade.timestamp,
                    profit: estimatedProfit,
                    status: 'filled' // Mark as filled
                });
                knownIds.add(tradeId); // Prevent duplicates in this loop
                addedCount++;
            } else {
                // BACKFILL CHECK: If we know it, but profit is 0 and it's a SELL, fix it!
                const existingOrder = state.filledOrders.find(o => o.id === tradeId);
                if (existingOrder && existingOrder.side === 'sell' && existingOrder.profit === 0) {
                    const estimatedProfit = (trade.amount * trade.price) * CONFIG.gridSpacing;
                    existingOrder.profit = estimatedProfit;
                    state.totalProfit += estimatedProfit;
                    log('SYNC', `REPAIRED history for Sell ${trade.orderId}: +$${estimatedProfit.toFixed(4)}`, 'success');
                    addedCount++; // Count as an update so we save state
                }
            }
        }

        if (addedCount > 0) {
            // Sort by date desc
            state.filledOrders.sort((a, b) => b.timestamp - a.timestamp);
            // Keep size manageable
            if (state.filledOrders.length > 200) {
                state.filledOrders = state.filledOrders.slice(0, 200);
            }
            log('SYNC', `Imported ${addedCount} historical trades from exchange`, 'success');
            saveState();
        }

        // Emit updated history to UI (Debugging Payload) - SORTED
        if (state.filledOrders) {
            const sortedHistory = [...state.filledOrders].sort((a, b) => b.timestamp - a.timestamp);
            io.emit('debug_trades', sortedHistory);
        }
    } catch (e) {
        console.error('>> [WARN] History sync failed (API permission?):', e.message);
    }
}

async function checkGridHealth() {
    if (state.activeOrders.length === 0) return;

    const currentPrice = state.currentPrice;
    if (!currentPrice) return;

    // SMART FILTER CHECK
    if (state.marketCondition) {
        if (state.marketCondition.isOverbought) {
            log('FILTER', 'RSI > 70 (OVERBOUGHT). PAUSING REBALANCE.');
            return;
        }
        if (state.marketCondition.isOversold) {
            log('FILTER', 'RSI < 30 (OVERSOLD). PAUSING REBALANCE.');
            return;
        }
    }

    // Calculate Grid Range
    const prices = state.activeOrders.map(o => o.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    // Thresholds: If price is outside grid by threshold %, reset
    const lowerBound = minPrice * (1 - CONFIG.healthCheckThreshold);
    const upperBound = maxPrice * (1 + CONFIG.healthCheckThreshold);

    if (currentPrice < lowerBound || currentPrice > upperBound) {
        log('WARN', `PRICE DRIFT DETECTED ($${currentPrice.toFixed(2)}). REBALANCING...`, 'error');
        await initializeGrid(true); // Force Reset
    }
}

function emitGridState() {
    io.emit('grid_state', {
        entryPrice: state.entryPrice,
        currentPrice: state.currentPrice,
        orders: state.activeOrders,
        profit: state.totalProfit
    });
}



function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// --- STARTUP (FULLY AUTOMATED) ---
server.listen(3000, async () => {
    console.log('>> [SYSTEM] VANTAGE OS ONLINE @ http://localhost:3000');
    loadState();

    // AUTO-RECOVERY: Clear any stale emergency stop on fresh start
    if (state.emergencyStop) {
        console.log('>> [AUTO] Clearing stale emergency stop from previous session');
        state.emergencyStop = false;
        state.maxDrawdown = 0;
        saveState();
    }

    // AUTO-INIT: Set initial capital if not set
    if (!state.initialCapital) {
        try {
            const balance = await binance.fetchBalance();
            const totalUSDT = balance.USDT?.total || 0;
            const totalBTC = balance.BTC?.total || 0;
            const price = await getCurrentPrice();
            const btcValue = totalBTC * (price || 0);
            state.initialCapital = totalUSDT + btcValue;
            console.log(`>> [AUTO] Initial capital set: $${state.initialCapital.toFixed(2)}`);
            saveState();
        } catch (e) {
            console.error('>> [ERROR] Could not set initial capital:', e.message);
        }
    }

    // Socket Listeners
    io.on('connection', (socket) => {
        console.log('>> [NETWORK] CLIENT CONNECTED');

        // Send History
        socket.emit('log_history', logBuffer);
        socket.emit('init_state', state);
        if (state.filledOrders) {
            socket.emit('debug_trades', state.filledOrders);
        }
        emitGridState();

        socket.on('reset_grid', () => {
            console.log('>> [CMD] MANUAL RESET TRIGGERED');
            initializeGrid(true);
        });

        socket.on('cancel_all', async () => {
            console.log('>> [CMD] CANCEL ALL ORDERS TRIGGERED');
            await cancelAllOrders();
            log('SYSTEM', 'ALL ORDERS CANCELLED BY USER', 'warning');
        });

        socket.on('clear_emergency', async () => {
            console.log('>> [CMD] CLEARING EMERGENCY STOP');
            state.emergencyStop = false;
            state.maxDrawdown = 0;
            saveState();
            log('SYSTEM', '🔓 EMERGENCY STOP CLEARED - Reinitializing grid...', 'success');
            await initializeGrid(true);
        });

        socket.on('update_initial_capital', (newCapital) => {
            if (newCapital && !isNaN(newCapital) && newCapital > 0) {
                const oldCapital = state.initialCapital;
                state.initialCapital = parseFloat(newCapital);
                saveState();
                log('CONFIG', `Initial Capital updated: $${oldCapital.toFixed(2)} -> $${state.initialCapital.toFixed(2)}`, 'info');
                socket.emit('hud_update', { status: 'CAPITAL UPDATED', detail: `$${state.initialCapital.toFixed(2)}` });
            }
        });
    });

    // Start Main Loop (AUTOMATED)
    await initializeGrid();

    // AUTO-HEALTH CHECK: Ensure grid always has orders
    setInterval(async () => {
        if (state.activeOrders.length === 0 && !state.emergencyStop) {
            log('AUTO', 'No active orders detected - Reinitializing grid automatically', 'warning');
            await initializeGrid(true);
        }
    }, 60000); // Check every minute
});

