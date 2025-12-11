/**
 * VANTAGE // QUANTUM GRID BOT
 * Version: 3.0 (Multi-Core Edition)
 * Features: Multi-Pair, Persistence, Precision Math, Circuit Breakers
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
require('./crash_handler'); // Black Box Recorder

// --- DYNAMIC CONFIGURATION (Multi-Pair Support) ---
const TRADING_PAIR = process.env.TRADING_PAIR || 'BTC/USDT';
const BOT_PORT = parseInt(process.env.BOT_PORT) || 3000;
const PAIR_ID = TRADING_PAIR.replace('/', ''); // e.g., 'BTCUSDT'
const [BASE_ASSET, QUOTE_ASSET] = TRADING_PAIR.split('/'); // e.g. ['BTC', 'USDT']

// CAPITAL ALLOCATION: Each pair only uses its assigned slice of total capital
// Value from 0 to 1.0 (e.g., 0.5 = 50% of total balance)
const CAPITAL_ALLOCATION = parseFloat(process.env.CAPITAL_ALLOCATION) || 1.0;

// Pair-specific presets
const PAIR_PRESETS = {
    'BTC/USDT': {
        minOrderSize: 0.00001,
        gridSpacing: 0.003,      // 0.3% base
        gridCount: 20,           // +/- 3% active range (tight)
        spacingNormal: 0.005,
        spacingHigh: 0.007,
        spacingLow: 0.003,
        bandwidthHigh: 0.04,
        bandwidthLow: 0.015,
        toleranceMultiplier: 10
    },
    'SOL/USDT': {
        minOrderSize: 0.01,
        gridSpacing: 0.008,      // 0.8% base
        gridCount: 40,           // +/- 16% active range (wide for volatility)
        spacingNormal: 0.010,
        spacingHigh: 0.015,
        spacingLow: 0.006,
        bandwidthHigh: 0.08,
        bandwidthLow: 0.02,
        toleranceMultiplier: 15  // 15x Grid Spacing (approx 12-15% drift tolerance)
    },
    'ETH/BTC': {
        minOrderSize: 0.001,
        gridSpacing: 0.004,
        gridCount: 20,
        spacingNormal: 0.006,
        spacingHigh: 0.010,
        spacingLow: 0.004,
        bandwidthHigh: 0.05,
        bandwidthLow: 0.015,
        toleranceMultiplier: 10
    }
};

// ... (existing code) ...

// Last time we logged the tolerance (for periodic visibility)
let lastToleranceLog = 0;
const TOLERANCE_LOG_INTERVAL = 5 * 60 * 1000; // Log every 5 minutes

// (Duplicate checkGridHealth removed)

// Get preset for current pair (fallback to BTC defaults)
const pairPreset = PAIR_PRESETS[TRADING_PAIR] || PAIR_PRESETS['BTC/USDT'];

const CONFIG = {
    // Trading Pair (Dynamic)
    pair: TRADING_PAIR,
    tradingFee: 0.001,       // 0.1% Standard Fee

    // GRID SETTINGS (PAIR-SPECIFIC)
    gridCount: pairPreset.gridCount || 16, // Dynamic Grid Count (20 for BTC, 40 for SOL)
    gridSpacing: pairPreset.gridSpacing,
    minOrderSize: pairPreset.minOrderSize,
    maxOpenOrders: 24,
    safetyMargin: 0.92,

    // Volatility Spacing (PAIR-SPECIFIC)
    spacingNormal: pairPreset.spacingNormal,
    spacingHigh: pairPreset.spacingHigh,
    spacingLow: pairPreset.spacingLow,
    bandwidthHigh: pairPreset.bandwidthHigh,
    bandwidthLow: pairPreset.bandwidthLow,
    healthCheckThreshold: pairPreset.healthCheckThreshold || 0.02, // Default 2%

    // AGGRESSIVE RSI (enter earlier)
    rsiOverbought: 65,
    rsiOversold: 35,

    // Technical Indicators
    indicators: {
        rsiPeriod: 7,
        emaPeriod: 20,
        bbPeriod: 14,
        bbStdDev: 2
    },

    // PROFIT OPTIMIZATION
    compoundProfits: true,
    minProfitToCompound: 0.5,

    // AGGRESSIVE DCA MODE
    dcaEnabled: true,
    dcaDropPercent: 0.02,
    dcaMultiplier: 1.5,

    // System Settings
    monitorInterval: 3000,
    orderDelay: 150,
    logBufferSize: 100,

    // State Persistence (PAIR-SPECIFIC PATH)
    stateFile: path.join(__dirname, 'data', 'sessions', `${PAIR_ID}_state.json`)
};

// Ensure state directory exists
const stateDir = path.dirname(CONFIG.stateFile);
if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
}

console.log(`>> [CONFIG] Trading Pair: ${TRADING_PAIR}`);
console.log(`>> [CONFIG] Port: ${BOT_PORT}`);
console.log(`>> [CONFIG] Capital Allocation: ${(CAPITAL_ALLOCATION * 100).toFixed(0)}%`);
console.log(`>> [CONFIG] State File: ${CONFIG.stateFile}`);
console.log(`>> [CONFIG] Grid Spacing: ${(CONFIG.gridSpacing * 100).toFixed(2)}%`);

// --- SERVER SETUP ---
const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(__dirname));
// Support strict subpath routing (if Nginx doesn't strip prefix)
app.use('/sol', express.static(__dirname));
app.use('/eth', express.static(__dirname));

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
    console.log(`[${new Date().toISOString()}] >> [${type}] ${msg}`);

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

// Cache for external data (avoid rate limits) - HOISTED TO TOP
const externalDataCache = {
    fearGreed: { value: null, timestamp: 0 },
    fundingRate: { value: null, timestamp: 0 },
    btcDominance: { value: null, timestamp: 0 },
    openInterest: { value: null, timestamp: 0 },
    orderBook: { value: null, timestamp: 0 }
};

// Load State
// Load State
function loadState() {
    try {
        if (fs.existsSync(CONFIG.stateFile)) {
            const raw = fs.readFileSync(CONFIG.stateFile);
            const saved = JSON.parse(raw);
            state = { ...state, ...saved };
            // AUDIT FIX: Ensure inventory exists
            if (!state.inventory) state.inventory = [];

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

// Save State (ASYNC & NON-BLOCKING)
// OPTIMIZATION: Prevents I/O blocking the Event Loop
let isSaving = false;
async function saveState() {
    if (isSaving) return; // Skip if already saving
    isSaving = true;

    try {
        const tempFile = `${CONFIG.stateFile}.tmp`;
        // Use Async Write
        await fs.promises.writeFile(tempFile, JSON.stringify(state, null, 2));
        // Atomic Rename (Fast)
        await fs.promises.rename(tempFile, CONFIG.stateFile);
    } catch (e) {
        console.error('>> [ERROR] Failed to save state:', e.message);
    } finally {
        isSaving = false;
    }
}

// ==================================================
// FIFO RECONCILIATION - Sync Inventory with Exchange
// Ensures no lots are ever lost due to state file issues
// ==================================================
async function reconcileInventoryWithExchange() {
    log('RECONCILE', 'Syncing inventory with exchange history...', 'info');
    try {
        const balance = await binance.fetchBalance();
        const baseAsset = CONFIG.pair.split('/')[0];
        const realBalance = parseFloat(balance[baseAsset]?.free || 0);

        // 1. Fetch History (Newest First)
        // We only fetch enough to verify the balance. 100 trades is safe.
        const trades = await binance.fetchMyTrades(CONFIG.pair, undefined, 100);
        const buyTrades = trades.filter(t => t.side === 'buy').sort((a, b) => b.timestamp - a.timestamp); // DESC

        // PROTECTION: If API returns empty history but we have balance, ABORT to prevent wiping state.
        if (realBalance > 0.0001 && buyTrades.length === 0) {
            log('WARN', `Reconcile Protection: Exchange has balance (${realBalance}) but returned 0 trades. API Issue? Skipping sync.`, 'warning');
            return;
        }

        // 2. Rebuild Ideal Inventory (Strict FIFO)
        // Principle: "My holdings are the sum of my most recent buys."
        const newInventory = [];
        let remainingBalanceToFill = realBalance;
        const TOLERANCE = 0.000001;

        for (const trade of buyTrades) {
            if (remainingBalanceToFill <= TOLERANCE) break;

            const amountToTake = Math.min(remainingBalanceToFill, trade.amount);
            // Pro-rate fee
            const originalFee = trade.fee?.cost || (trade.price * trade.amount * CONFIG.tradingFee);
            const fee = originalFee * (amountToTake / trade.amount);

            newInventory.push({
                id: trade.id,
                price: trade.price,
                amount: trade.amount,
                remaining: amountToTake,
                fee: fee,
                timestamp: trade.timestamp,
                recovered: true
            });

            remainingBalanceToFill -= amountToTake;
        }

        // 3. Compare & Commit
        // Sort inventory Oldest -> Newest (Standard FIFO array order for selling)
        newInventory.sort((a, b) => a.timestamp - b.timestamp);

        // Check if anything changed
        const oldIds = (state.inventory || []).map(i => i.id).sort().join(',');
        const newIds = newInventory.map(i => i.id).sort().join(',');

        // Check totals
        const currentTotal = state.inventory ? state.inventory.reduce((sum, lot) => sum + lot.remaining, 0) : 0;
        const newTotal = newInventory.reduce((sum, lot) => sum + lot.remaining, 0);

        if (Math.abs(currentTotal - newTotal) > TOLERANCE || oldIds !== newIds) {
            state.inventory = newInventory;
            saveState();
            log('RECONCILE', `✅ Inventory Rebuilt (Strict FIFO). Holdings: ${newTotal.toFixed(6)} ${baseAsset} (from ${newInventory.length} newest lots).`, 'success');
            if (oldIds !== newIds) {
                log('RECONCILE', `🔍 Fixed Composition: Old Lots replaced with Newest Lots.`, 'warning');
            }
        } else {
            log('RECONCILE', '✅ Inventory is in sync (Strict FIFO verified).', 'info');
        }

    } catch (e) {
        log('ERROR', `Reconciliation failed: ${e.message}`, 'error');
    }
}

// --- CORE LOGIC ---

async function updateBalance() {
    try {
        const balance = await binance.fetchBalance();
        state.balance.usdt = balance.USDT?.free || 0;
        state.balance.btc = balance[BASE_ASSET]?.free || 0;

        // Calculate Total Equity (USDT + BTC Value + Locked in Orders)
        const totalUSDT = balance.USDT?.total || 0;
        const totalBase = balance[BASE_ASSET]?.total || 0;

        // We use current price to value the Base Asset
        const baseValue = new Decimal(totalBase).mul(state.currentPrice || 0).toNumber();
        const totalEquity = new Decimal(totalUSDT).plus(baseValue).toNumber();

        io.emit('balance_update', {
            usdt: state.balance.usdt, // Free USDT
            btc: state.balance.btc,   // Free Base Asset (Legacy key 'btc' kept for UI compat)
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

        // --- 1. GLOBAL ACCOUNT STATE ---
        const globalFreeUSDT = balance.USDT?.free || 0;
        const globalTotalUSDT = balance.USDT?.total || 0; // Free + Locked

        const globalFreeBase = balance[BASE_ASSET]?.free || 0;
        const globalTotalBase = balance[BASE_ASSET]?.total || 0;

        // Calculate Global Equity (The "Pie")
        const currentPrice = state.currentPrice || 0;
        const globalBaseValue = globalTotalBase * currentPrice;
        const globalTotalEquity = globalTotalUSDT + globalBaseValue;

        // --- 2. THIS BOT'S SHARE (THE "SLICE") ---
        // We own a percentage of the total account equity
        const myAllocatedEquity = globalTotalEquity * CAPITAL_ALLOCATION;

        // --- 3. THIS BOT'S USAGE (THE "FILLING") ---
        // What do we currently have satisfying that equity?

        // A. Locked Funds (Active Orders)
        const activeOpenOrders = state.activeOrders.filter(o => o.status === 'open');
        const buyOrders = activeOpenOrders.filter(o => o.side === 'buy');
        const sellOrders = activeOpenOrders.filter(o => o.side === 'sell');

        // Locked USDT in OUR buy orders
        const myLockedUSDT = activeOpenOrders.reduce((sum, o) => sum + (o.side === 'buy' ? o.price * o.amount : 0), 0);

        // Locked Base in OUR sell orders
        const myLockedBase = activeOpenOrders.reduce((sum, o) => sum + (o.side === 'sell' ? o.amount : 0), 0);

        // B. Base Asset Holdings (Inventory)
        // Heuristic: If we track inventory, use it. If not, assume all base asset in account 'belongs' to this bot 
        // IF we are a single-pair bot. For multi-pair, we MUST derive this or assumptions break.
        // BETTER APPROACH for "Free USDT" calculation:
        // Free USDT = Allocated Equity - (My Base Asset Value) - (My Locked USDT)

        // For now, let's approximate "My Base Asset" as "Total Base Asset" 
        // assuming NO OTHER BOT TRADES THIS PAIR.
        // TODO: For strictly isolating ETH vs BTC holdings, this is fine. 
        // If two bots trade BTC/USDT, they will conflict here without a database.
        const myTotalBase = globalTotalBase;
        const myBaseValue = myTotalBase * currentPrice;

        // --- 4. THE RESULT: ISOLATED FREE USDT ---
        // "How much USDT do I have left to deploy?"
        let myFreeUSDT = myAllocatedEquity - myBaseValue - myLockedUSDT;

        // Safety Clamp: Can't be negative, can't exceed Global Free
        myFreeUSDT = Math.max(0, myFreeUSDT);
        myFreeUSDT = Math.min(myFreeUSDT, globalFreeUSDT); // Can't spend what doesn't exist

        // Profit calculations
        const profitPercent = state.initialCapital ? (state.totalProfit / state.initialCapital) * 100 : 0;

        return {
            freeUSDT: myFreeUSDT,       // CORRECTED: Isolated available capital
            lockedUSDT: myLockedUSDT,   // CORRECTED: Only MY orders
            freeBTC: globalFreeBase,    // Display base asset (Legacy key)
            lockedBTC: myLockedBase,
            totalBTC: myTotalBase,
            btcValueUSDT: myBaseValue,
            totalEquity: myAllocatedEquity, // Show the user THEIR slice size
            profit: state.totalProfit,
            profitPercent,
            pair: CONFIG.pair,
            startTime: state.firstTradeTime || state.startTime,
            activeOrders: {
                buy: buyOrders.length,
                sell: sellOrders.length,
                total: activeOpenOrders.length
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

    // PHASE 5: SMART CAPITAL DETECTION
    // Calculate current equity NOW to see if user added funds
    const balance = await binance.fetchBalance();
    const totalUSDT = balance.USDT?.total || 0;
    const totalBase = balance[BASE_ASSET]?.total || 0;
    const baseValue = new Decimal(totalBase).mul(price).toNumber();
    const currentEquity = new Decimal(totalUSDT).plus(baseValue).toNumber();

    // Apply CAPITAL_ALLOCATION to get THIS PAIR's share
    const allocatedEquity = currentEquity * CAPITAL_ALLOCATION;

    // Check for "New Money" (Capital Injection > 10% of THIS PAIR's allocation)
    if (state.initialCapital) {
        const capitalGrowth = (allocatedEquity - state.initialCapital) / state.initialCapital;

        // If capital grew by >10% (and it's not just profit, i.e., instantaneous jump vs previous partial state)
        if (capitalGrowth > 0.10) {
            log('MONEY', `💰 CAPITAL INJECTION DETECTED! ($${state.initialCapital.toFixed(2)} -> $${allocatedEquity.toFixed(2)})`, 'success');
            log('SYSTEM', `UPGRADING GRID (${(CAPITAL_ALLOCATION * 100).toFixed(0)}% of new total)...`, 'info');
            state.initialCapital = allocatedEquity; // Update baseline with ALLOCATED amount
            forceReset = true; // FORCE THE RESET
        }
    }

    // If we have active orders and not forcing reset, resume monitoring
    if (state.activeOrders.length > 0 && !forceReset) {
        log('SYSTEM', 'RESUMING EXISTING GRID');
        monitorOrders();
        return;
    }

    if (forceReset) {
        log('SYSTEM', 'FORCING GRID RESET');
        await cancelAllOrders();
        state.startTime = Date.now();
    }

    state.entryPrice = price;
    log('ENTRY', `$${price.toFixed(2)}`);

    // Calculate Grid
    // DYNAMIC CAPITAL: Apply CAPITAL_ALLOCATION to get this pair's slice
    const totalEquity = currentEquity;
    const dynamicCapital = totalEquity * CAPITAL_ALLOCATION;

    log('CAPITAL', `Total Equity: $${totalEquity.toFixed(2)} | Allocation: ${(CAPITAL_ALLOCATION * 100).toFixed(0)}% | This Pair: $${dynamicCapital.toFixed(2)}`, 'info');

    // Get regime and volatility for adaptive calculations
    const regime = await detectMarketRegime();
    const analysis = await getMarketAnalysis();
    const volatilityState = analysis && analysis.bandwidth > CONFIG.bandwidthHigh ? 'HIGH' :
        (analysis && analysis.bandwidth < CONFIG.bandwidthLow ? 'LOW' : 'NORMAL');

    // PHASE 2.5: ATR GRID SPACING (Dynamic Volatility Surfing)
    if (analysis && analysis.atr) {
        // --- GEOPOLITICAL CHECK ---
        const geoContext = checkGeopoliticalContext();
        if (geoContext.status === 'MIDTERM_RISK') {
            log('GEO', `Midterm Risk Detected. Expanding Grid Spacing (Defense Mode)`, 'warning');
        }

        // CALL THE BRAIN
        const spacingConfig = adaptiveHelpers.calculateOptimalGridSpacing(
            analysis.atr,
            price,
            volatilityState,
            geoContext.status
        );

        CONFIG.gridSpacing = spacingConfig.spacing;

        log('ATR', `Dynamic Spacing Set: ${(CONFIG.gridSpacing * 100).toFixed(2)}% (ATR: ${analysis.atr.toFixed(2)} | Mult: ${spacingConfig.multiplier})`, 'info');

        // IMMEDIATE TOLERANCE LOG (Visible on Startup)
        const tolMult = PAIR_PRESETS[CONFIG.pair]?.toleranceMultiplier || 10;
        const driftTol = CONFIG.gridSpacing * tolMult;
        log('TOLERANCE', `Grid: ${(CONFIG.gridSpacing * 100).toFixed(2)}% | Drift Tol: ${(driftTol * 100).toFixed(2)}% (${tolMult}x) | Status: ACTIVE`, 'success');
    }

    // PHASE 3: Use allocateCapital for smarter distribution
    const multiTF = await analyzeMultipleTimeframes();
    let allocation = adaptiveHelpers.allocateCapital(dynamicCapital, regime.regime, volatilityState, multiTF);

    // --- GEOPOLITICAL RESERVE OVERRIDE ---
    const geoContext = checkGeopoliticalContext(); // Re-check for reserve allocation
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
    const adaptiveSafetyMargin = adaptiveHelpers.getAdaptiveSafetyMargin(volatilityState, regime.regime);
    CONFIG.safetyMargin = adaptiveSafetyMargin; // Apply globally
    log('ADAPTIVE', `Safety Margin: ${(adaptiveSafetyMargin * 100).toFixed(0)}% (Vol: ${volatilityState} | Regime: ${regime.regime})`, 'info');

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

    // 1. Generate Levels (Prices only)
    const rawLevels = [];

    // Buys
    for (let i = 1; i <= halfGrid; i++) {
        const levelPrice = new Decimal(price).mul(new Decimal(1).minus(new Decimal(CONFIG.gridSpacing).mul(i)));
        rawLevels.push({ side: 'buy', price: levelPrice.toNumber(), level: -i });
    }
    // Sells
    for (let i = 1; i <= halfGrid; i++) {
        const levelPrice = new Decimal(price).mul(new Decimal(1).plus(new Decimal(CONFIG.gridSpacing).mul(i)));
        rawLevels.push({ side: 'sell', price: levelPrice.toNumber(), level: i });
    }

    // PHASE 2: ADAPTIVE PYRAMID SIZING (Brain Activation)
    const sizes = adaptiveHelpers.calculateOptimalOrderSizes(
        safeCapital,
        dynamicGridCount,
        price,
        rawLevels
    );

    // 2. Assign Sizes and Build Order List
    for (let i = 0; i < rawLevels.length; i++) {
        const sizeInUSDT = sizes[i]; // This is USDT Value (e.g. $50)
        const levelPrice = rawLevels[i].price; // Ensure we read price correctly

        // CRITICAL FIX: Convert USDT Value to Asset Quantity (BTC)
        // sizeInUSDT / price = BTC Quantity 
        const amountInBTC = new Decimal(sizeInUSDT).div(levelPrice);

        if (sizeInUSDT >= CONFIG.minOrderSize) {
            gridLevels.push({
                ...rawLevels[i],
                amount: amountInBTC // Pass QUANTITY to placeOrder, NOT Value
            });
        }
    }

    // Place Orders
    log('GRID', `PLACING ${gridLevels.length} ORDERS (PYRAMID STRATEGY)...`);
    for (const level of gridLevels) {
        try {
            await placeOrder(level);
        } catch (e) {
            log('ERROR', `Failed to place grid order: ${e.message}`, 'error');
        }
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
    let amount = new Decimal(level.amount).toNumber();

    // PHASE 4: Fee Optimization - Skip unprofitable orders
    const worthCheck = adaptiveHelpers.isOrderWorthPlacing(amount, CONFIG.gridSpacing, state.currentPrice, CONFIG.tradingFee);
    if (!worthCheck.worth) {
        log('SKIP', `Order too small: ${worthCheck.reason}`, 'warning');
        return;
    }

    // PHASE 4.5: WALL PROTECTION (Order Book Intelligence)
    try {
        const pressure = await fetchOrderBookPressure();
        // Don't BUY if there is a massive SELL WALL (Ratio < 0.15)
        if (level.side === 'buy' && pressure.ratio < 0.15) {
            log('SMART', `🧱 MASSIVE SELL WALL (Ratio ${pressure.ratio.toFixed(2)}x). Delaying BUY.`, 'warning');
            logDecision('BLOCKED_BY_WALL', [`Sell Wall Ratio: ${pressure.ratio.toFixed(2)}x`, 'Waiting for resistance to clear'], { level });
            return;
        }
        // Don't SELL if there is a massive BUY WALL (Ratio > 3.0)
        if (level.side === 'sell' && pressure.ratio > 3.0) {
            log('SMART', `🚀 BUY WALL DETECTED (Ratio ${pressure.ratio.toFixed(2)}x). Delaying SELL (Price might rise).`, 'warning');
            logDecision('BLOCKED_BY_WALL', [`Buy Wall Ratio: ${pressure.ratio.toFixed(2)}x`, 'Waiting for price rise'], { level });
            return;
        }
    } catch (e) {
        console.log('Wall check skipped');
    }

    // PRECISION ENFORCEMENT
    try {
        amount = binance.amountToPrecision(CONFIG.pair, amount);
        // Ensure it's a number for math later
        amount = parseFloat(amount);
    } catch (e) {
        console.warn('>> [WARN] Could not enforce precision:', e.message);
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
        const availableBase = balance[BASE_ASSET] ? balance[BASE_ASSET].free : 0;

        if (availableBase < amount) {
            // FIX: Sell Partial Amount if we have enough for a minimum order
            const estimatedValue = availableBase * price;
            if (estimatedValue > 6) { // Min order usually $5, using $6 for safety
                log('SMART', `Insufficient for full order, but selling available: ${availableBase.toFixed(6)} ${BASE_ASSET}`, 'info');
                amount = availableBase * 0.99; // 99% of available to avoid rounding errors
            } else {
                log('SMART', `INSUFFICIENT ASSETS for SELL. Available: ${availableBase.toFixed(6)} ${BASE_ASSET}`, 'warning');
                log('DECISION', 'HOLDING (HODL mode enabled)', 'info');
                return; // EXIT GRACEFULLY
            }
        }

        // === PROFIT GUARD (Check Inventory Cost Basis) ===
        if (state.inventory && state.inventory.length > 0) {
            let remainingToSell = amount;
            let totalCostBasis = 0;
            let coveredAmount = 0;

            // Simulate FIFO consumption
            for (const lot of state.inventory) {
                if (remainingToSell <= 0) break;
                const take = Math.min(remainingToSell, lot.remaining || lot.amount); // Use remaining for partial lots
                totalCostBasis += (take * lot.price);
                coveredAmount += take;
                remainingToSell -= take;
            }

            if (coveredAmount > 0) {
                const avgEntryPrice = totalCostBasis / coveredAmount;
                const breakEvenPrice = avgEntryPrice * (1 + (CONFIG.tradingFee * 2)); // Add fees for entry + exit

                if (price < breakEvenPrice) {
                    log('PROFIT_GUARD', `🛑 BLOCKED SELL @ $${price.toFixed(2)}. Avg Entry: $${avgEntryPrice.toFixed(2)} (Break-Even: $${breakEvenPrice.toFixed(2)})`, 'warning');
                    logDecision('BLOCKED_BY_PROFIT_GUARD', [`Price below Break-Even ($${breakEvenPrice.toFixed(2)})`, 'Preserving Capital'], { level });
                    return;
                }
            }
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
                `Amount: ${amount.toFixed(6)} ${BASE_ASSET}`,
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

    // DEDICATED HEARTBEAT LOOP (Independent of main processing)
    if (global.heartbeatInterval) clearInterval(global.heartbeatInterval);
    global.heartbeatInterval = setInterval(() => {
        if (isMonitoring) {
            io.emit('bot_heartbeat', { timestamp: Date.now() });
        }
    }, 2000); // 2 seconds

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
        // PHASE 2: FLASH CRASH PROTECTION
        await checkFlashCrash();
        if (state.isPaused) return; // Stop loop logic if paused
        if (myId !== monitorSessionId) return; // Zombie check

        let volatilityState = 'NORMAL';

        // PHASE 1: Market Intelligence
        const regime = await detectMarketRegime();
        const multiTF = await analyzeMultipleTimeframes();
        state.marketRegime = regime.regime;

        if (myId !== monitorSessionId) return; // Zombie check

        // HEARTBEAT for UI Watchdog
        io.emit('bot_heartbeat', { timestamp: Date.now() });

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
            // Cooldown: 20 mins for optimization (Zen Mode), 5 mins for safety (Panic Mode - Anti-Flicker)
            const cooldownMs = 20 * 60 * 1000;
            const emergencyCooldownMs = 5 * 60 * 1000;
            const isEmergency = volatilityState === 'HIGH' && timeSinceReset > emergencyCooldownMs;

            // CRITICAL FIX: Only adapt if the Volatility REGIME changes, not just the spacing number
            // (ATR calculation in initializeGrid makes the number dynamic, causing infinite loops otherwise)
            const currentRegime = state.volatilityRegime || 'NORMAL';

            if (volatilityState !== currentRegime && (timeSinceReset > cooldownMs || isEmergency)) {
                log('AI', `VOLATILITY REGIME SHIFT (${currentRegime} -> ${volatilityState}). ADAPTING GRID...`, 'warning');
                CONFIG.gridSpacing = newSpacing;
                state.lastRebalance = { timestamp: Date.now(), triggers: ['VOLATILITY'] };
                state.volatilityRegime = volatilityState; // Track the regime

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
                geoContext: checkGeopoliticalContext(state.marketRegime),
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

            const compositeSignal = await calculateCompositeSignal(analysis, regime, multiTF, adaptiveRSI);
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
            io.emit('inventory_update', state.inventory || []); // FIFO Warehouse Panel
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
        await checkGridHealth(analysis, regime, multiTF);

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

// Cache for Candles to prevent Rate Limit Bans
const candleCache = {
    '1h': { data: null, timestamp: 0 },
    '4h': { data: null, timestamp: 0 },
    '1d': { data: null, timestamp: 0 }
};

async function getCachedCandles(timeframe, limit = 100) {
    const now = Date.now();
    // 1h = 1 min cache, 4h/1d = 5 min cache
    const ttl = timeframe === '1h' ? 60 * 1000 : 5 * 60 * 1000;

    if (candleCache[timeframe].data && (now - candleCache[timeframe].timestamp < ttl)) {
        return candleCache[timeframe].data;
    }

    try {
        const candles = await binance.fetchOHLCV(CONFIG.pair, timeframe, undefined, limit);
        candleCache[timeframe] = { data: candles, timestamp: now };
        return candles;
    } catch (e) {
        console.error(`>> [WARN] Candle fetch failed for ${timeframe}: ${e.message}`);
        return candleCache[timeframe].data || []; // Return stale data if available
    }
}

async function getMarketAnalysis(timeframe = '1h') {
    try {
        // OPTIMIZED: Use Cached Candles
        const candles = await getCachedCandles(timeframe, 100);
        if (!candles || candles.length === 0) return null;

        const closes = candles.map(c => c[4]);
        const highs = candles.map(c => c[2]);
        const lows = candles.map(c => c[3]);
        const volumes = candles.map(c => c[5]);

        // ADAPTIVE PERIODS (Brain Activation)
        const periods = adaptiveHelpers.getAdaptiveIndicatorPeriods(state.volatilityRegime, state.marketRegime);

        // Calculate RSI
        const rsiInput = { values: closes, period: periods.rsi };
        const rsiValues = RSI.calculate(rsiInput);
        const currentRSI = rsiValues[rsiValues.length - 1];

        // Calculate EMA
        const emaInput = { values: closes, period: periods.ema };
        const emaValues = EMA.calculate(emaInput);
        const currentEMA = emaValues[emaValues.length - 1];

        // Calculate Bollinger Bands
        const bbInput = { period: periods.bb, values: closes, stdDev: CONFIG.indicators.bbStdDev };
        const bbValues = BollingerBands.calculate(bbInput);
        const currentBB = bbValues[bbValues.length - 1];

        // Calculate Bandwidth (Volatility Metric)
        const bandwidth = (currentBB.upper - currentBB.lower) / currentBB.middle;

        // Calculate ATR (Average True Range) for Dynamic Spacing
        const atrInput = { high: highs, low: lows, close: closes, period: 14 };
        const atrValues = ATR.calculate(atrInput);
        // ATR fallback if calculation fails
        const currentATR = atrValues.length > 0 ? atrValues[atrValues.length - 1] : 0;

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
        const tf4h = await getCachedCandles('4h', 100);
        const tf1d = await getCachedCandles('1d', 100);

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

// GEOPOLITICAL CONTEXT (Dynamic Adaptation)
function checkGeopoliticalContext(currentRegime = 'NEUTRAL') {
    // FEAT: REMOVED HARDCODED DATES (Time Bomb)
    // Now purely reactive to Market Structure.

    // If Market is in STRONG BEAR trend, we assume "Fear/Risk" context.
    // This allows the bot to auto-defend during any crash, not just predicted ones.
    if (currentRegime === 'STRONG_BEAR' || currentRegime === 'BEAR') {
        return {
            status: 'MARKET_FEAR',
            modifier: 'DEFENSIVE',
            defenseLevel: 1,
            scoreBias: -5 // Penalty for fighting the trend
        };
    }

    // Normal Conditions
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

        // PREVENT INFINITY: If askVol is 0 (unlikely w/ depth 50 but possible), use 1.0
        const ratio = (askVol > 0) ? bidVol / askVol : 1.0;
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
async function calculateCompositeSignal(analysis, regime, multiTF, adaptiveRSI = { overbought: 70, oversold: 30 }) {
    // Fetch all external data
    // Safe destructuring with defaults
    const [fearGreedRes, fundingRes, btcDomRes, openInterestRes] = await Promise.all([
        fetchFearGreedIndex().catch(() => ({ value: 50, classification: 'Neutral' })),
        fetchFundingRate().catch(() => ({ rate: 0, signal: 'NEUTRAL' })),
        fetchBTCDominance().catch(() => ({ value: 50 })),
        fetchOpenInterest().catch(() => ({ signal: 'NEUTRAL' }))
    ]);

    const fearGreed = fearGreedRes || { value: 50, classification: 'Neutral' };
    const funding = fundingRes || { rate: 0, signal: 'NEUTRAL' };
    const btcDom = btcDomRes || { value: 50 };
    const openInterest = openInterestRes || { signal: 'NEUTRAL' };

    // Ensure pressure is updated
    await fetchOrderBookPressure();

    const timing = checkMarketTiming();

    let score = 50; // Start neutral
    let reasons = [];

    // === TECHNICAL INDICATORS (40% weight) ===

    // RSI contribution (0-20 points)
    if (analysis.rsi < adaptiveRSI.oversold) {
        score += 15;
        reasons.push(`RSI oversold (<${adaptiveRSI.oversold}) (+15)`);
    } else if (analysis.rsi > adaptiveRSI.overbought) {
        score -= 15;
        reasons.push(`RSI overbought (>${adaptiveRSI.overbought}) (-15)`);
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
    if (!state.initialCapital || state.initialCapital <= 0 || state.emergencyStop) return;

    try {
        const balance = await binance.fetchBalance();
        const totalUSDT = balance.USDT?.total || 0;
        const totalBase = balance[BASE_ASSET]?.total || 0;

        // Calculate REAL total equity based on current holdings
        const baseValue = totalBase * (state.currentPrice || 0);
        const totalEquity = totalUSDT + baseValue;

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

// PHASE 2: FLASH CRASH BREAKER (Volatility Kill Switch)
// Protection against instant collapses (-5% in <1 min)
async function checkFlashCrash() {
    if (state.emergencyStop || state.isPaused) return;

    const now = Date.now();
    const currentPrice = state.currentPrice;
    if (!currentPrice) return;

    // Initialize history buffer
    if (!state.priceBuffer) state.priceBuffer = [];

    // Add current price point
    state.priceBuffer.push({ price: currentPrice, time: now });

    // Clean old data (> 60 seconds)
    const ONE_MINUTE = 60 * 1000;
    while (state.priceBuffer.length > 0 && (now - state.priceBuffer[0].time > ONE_MINUTE)) {
        state.priceBuffer.shift();
    }

    // MEMORY PROTECTION: Cap buffer size to prevent memory leaks on high frequency ticks
    if (state.priceBuffer.length > 200) {
        state.priceBuffer = state.priceBuffer.slice(-200);
    }

    // Check Drop Logic
    if (state.priceBuffer.length > 5) { // Need some data points
        const oldest = state.priceBuffer[0];
        const newest = state.priceBuffer[state.priceBuffer.length - 1];

        // Calculate % Drop explicitly
        const percentChange = ((newest.price - oldest.price) / oldest.price) * 100;

        // THRESHOLD: -5% drop in 1 minute
        if (percentChange <= -5) {
            log('CRITICAL', `⚡ FLASH CRASH DETECTED: ${percentChange.toFixed(2)}% drop in ${(now - oldest.time) / 1000}s.`, 'error');
            log('CRITICAL', `PAUSING BUY ORDERS FOR 15 MINUTES.`, 'error');

            state.isPaused = true;
            state.pauseUntil = now + (15 * 60 * 1000); // 15 min pause
            state.pauseReason = 'FLASH_CRASH_PROTECTION';

            saveState(); // Async save
            io.emit('flash_crash', { drop: percentChange, pauseUntil: state.pauseUntil });
        }
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


// Race Condition Protection
const processingOrders = new Set();
async function checkLiveOrders() {
    try {
        const openOrders = await binance.fetchOpenOrders(CONFIG.pair);
        const openOrderIds = new Set(openOrders.map(o => o.id));

        // Detect filled orders
        const filled = state.activeOrders.filter(o => !openOrderIds.has(o.id));

        for (const order of filled) {
            // SKIP if already being processed (Fix Race Condition)
            if (processingOrders.has(order.id)) continue;
            processingOrders.add(order.id);

            // Double check status
            try {
                const info = await binance.fetchOrder(order.id, CONFIG.pair);
                // FIX: CCXT/Binance returns 'filled' for completed orders. 'closed' is generic.
                if (info.status === 'closed' || info.status === 'filled') {
                    // CRITICAL: Use average fill price for accuracy, fallback to limit price
                    const realFillPrice = info.average || info.price;
                    await handleOrderFill(order, realFillPrice);
                }
            } catch (e) {
                // Order might be gone, assume filled if not in openOrders? 
                // Safer to ignore or check trades. For now, skip.
            } finally {
                processingOrders.delete(order.id);
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

    if (order.side === 'buy') {
        // INVENTORY TRACKING: Add new lot
        if (!state.inventory) state.inventory = [];
        const fee = fillPrice * order.amount * CONFIG.tradingFee;
        state.inventory.push({
            id: order.id,
            price: fillPrice,
            amount: order.amount, // Track full amount
            remaining: order.amount, // Amount available to sell
            fee: fee,
            timestamp: Date.now()
        });
        log('INVENTORY', `➕ Added Lot: ${order.amount.toFixed(6)} BTC @ $${fillPrice.toFixed(2)}`, 'info');
    }
    else if (order.side === 'sell') {
        // INVENTORY TRACKING: Consume lots (FIFO)
        if (!state.inventory) state.inventory = [];

        let remainingToSell = order.amount;
        let costBasis = 0;
        let entryFees = 0; // Track entry fees from consumed lots
        let consumedLots = 0;

        // Iterate mutable inventory
        for (let i = 0; i < state.inventory.length; i++) {
            if (remainingToSell <= 0.00000001) break; // Float epsilon

            let lot = state.inventory[i];
            // Normalize lot structure if migrating from old state
            if (lot.remaining === undefined) lot.remaining = lot.amount;

            if (lot.remaining > 0) {
                const take = Math.min(remainingToSell, lot.remaining);
                costBasis += (take * lot.price);
                // Calculate proportional entry fee for the amount taken
                if (lot.fee && lot.amount > 0) {
                    entryFees += (take / lot.amount) * lot.fee;
                }

                // MATH FIX: Prevent floating point dust
                lot.remaining = Number((lot.remaining - take).toFixed(8)); // BTC/SOL precision
                remainingToSell = Number((remainingToSell - take).toFixed(8));
                consumedLots++;
            }
        }

        // Prune fully consumed lots to keep array clean
        state.inventory = state.inventory.filter(lot => lot.remaining > 0.00000001);

        // Calculate REAL FIFO Profit
        const sellRevenue = fillPrice * order.amount;
        const sellFee = sellRevenue * CONFIG.tradingFee;

        // VALIDATION: Check for "Phantom Inventory" (Absurdly low cost basis)
        // If average cost per unit is < 50% of sell price, something is wrong.
        // (Grid bots don't hold through 50% drops usually, and definitely not 90% drops like the bug)
        const avgCostPerUnit = (costBasis > 0 && order.amount > 0) ? (costBasis / order.amount) : 0;
        const priceDeviation = avgCostPerUnit / fillPrice; // e.g. 90000 / 92000 = 0.97 (Normal) vs 1.07 / 93000 = 0.00001 (Bug)

        if (costBasis === 0 || priceDeviation < 0.5) {
            log('WARN', `⚠️ Suspicious Cost Basis Detected! (Avg Cost: $${avgCostPerUnit.toFixed(2)} vs Sell: $${fillPrice.toFixed(2)}). Using estimate.`, 'warning');
            const spacing = order.spacing || CONFIG.gridSpacing;
            const estimatedBuyPrice = fillPrice / (1 + spacing);
            costBasis = estimatedBuyPrice * order.amount;
            entryFees = costBasis * CONFIG.tradingFee; // Estimate entry fee too
        }

        const grossProfit = sellRevenue - costBasis;
        const totalFees = sellFee + entryFees; // Both entry and exit fees
        profit = grossProfit - totalFees; // TRUE NET PROFIT

        // === SANITY CHECK: Prevent impossible profits ===
        // Grid trading typically yields 0.5%-3% per trade. 
        // If profit > 10% of sale, something is wrong (phantom inventory).
        const maxRealisticProfit = sellRevenue * 0.10; // 10% cap
        if (profit > maxRealisticProfit) {
            log('WARN', `🚨 PROFIT ANOMALY DETECTED: $${profit.toFixed(4)} exceeds 10% cap. Using estimate.`, 'error');
            // Fallback to estimated profit using grid spacing
            const spacing = order.spacing || CONFIG.gridSpacing;
            const estimatedBuyPrice = fillPrice / (1 + spacing);
            const estimatedCostBasis = estimatedBuyPrice * order.amount;
            const estimatedGross = sellRevenue - estimatedCostBasis;
            profit = estimatedGross - totalFees;
            log('WARN', `🔧 Corrected profit: $${profit.toFixed(4)}`, 'warning');
        }

        log('PROFIT', `FIFO Realized: Rev $${sellRevenue.toFixed(2)} - Cost $${costBasis.toFixed(2)} - Fees $${totalFees.toFixed(4)} (Entry: $${entryFees.toFixed(4)} + Exit: $${sellFee.toFixed(4)}) = $${profit.toFixed(4)}`, 'success');
    }

    // Update State
    state.totalProfit += profit;
    // CRITICAL FIX: Mark as Net Profit so loadState doesn't deduct fees again!
    state.filledOrders.push({ ...order, fillPrice, profit, timestamp: Date.now(), isNetProfit: true });

    // MEMORY LEAK PROTECTION: Keep last 1000 orders only
    if (state.filledOrders.length > 1000) {
        state.filledOrders = state.filledOrders.slice(-1000);
    }

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
                    status: 'filled',
                    isNetProfit: false // Estimated, not FIFO-calculated
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

async function checkGridHealth(analysis, regime, multiTF) {
    if (state.activeOrders.length === 0) return;

    const currentPrice = state.currentPrice;
    if (!currentPrice) return;

    // PHASE 3: INTELLIGENT REBALANCE TRIGGER (Brain Activation)
    // DYNAMIC DRIFT TOLERANCE
    // Logic: Tolerance scales with Volatility (Grid Spacing)
    // Formula: Spacing * Multiplier (Default 10x)
    const multiplier = PAIR_PRESETS[CONFIG.pair]?.toleranceMultiplier || 10;
    const currentSpacing = CONFIG.gridSpacing; // This is dynamic from ATR
    const driftTolerance = currentSpacing * multiplier;

    // PHASE 3: INTELLIGENT REBALANCE TRIGGER (Brain Activation)
    if (analysis && regime && multiTF) {
        // Pass dynamic drift configuration to the brain
        const adaptiveConfig = { driftTolerance: driftTolerance };
        const triggers = adaptiveHelpers.shouldRebalance(state, analysis, regime, multiTF, adaptiveConfig);

        if (triggers && triggers.length > 0) {
            log('ADAPTIVE', `Rebalance Triggered by: ${triggers.join(', ')}`, 'warning');
            await initializeGrid(true);
            return;
        }
    }

    // Calculate Grid Range
    const prices = state.activeOrders.map(o => o.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    const lowerBound = minPrice * (1 - driftTolerance);
    const upperBound = maxPrice * (1 + driftTolerance);

    // ANTI-LOOP: Don't check health if we have too few orders (likely partial init)
    if (state.activeOrders.length < 3) {
        return;
    }

    if (currentPrice < lowerBound || currentPrice > upperBound) {
        log('WARN', `PRICE DRIFT DETECTED ($${currentPrice.toFixed(2)} vs Range $${minPrice.toFixed(2)}-$${maxPrice.toFixed(2)}). REBALANCING...`, 'error');
        log('DEBUG', `Bounds: Low ${lowerBound.toFixed(2)} | High ${upperBound.toFixed(2)} | Tol: ${(driftTolerance * 100).toFixed(2)}% (${multiplier}x Spacing)`);
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
server.listen(BOT_PORT, async () => {
    console.log(`>> [SYSTEM] VANTAGE OS ONLINE @ http://localhost:${BOT_PORT}`);
    console.log(`>> [SYSTEM] Trading Pair: ${TRADING_PAIR}`);
    loadState();

    // AUTO-RECONCILE: Sync inventory with exchange to recover any lost lots
    await reconcileInventoryWithExchange();

    // AUTO-RECOVERY: SAFETY FIRST
    // Do NOT clear emergency stop automatically. Force user to reset it.
    if (state.emergencyStop) {
        console.log('>> [WARN] 🚨 EMERGENCY STOP IS ACTIVE FROM PREVIOUS SESSION.');
        console.log('>> [WARN] The bot will remain paused until you manually clear it via the UI or by editing grid_state.json.');
        // Don't auto-clear!
    }

    // AUTO-INIT: Set initial capital if not set
    if (!state.initialCapital) {
        try {
            const balance = await binance.fetchBalance();

            // UNIVERSAL EQUITY: Always use USDT + BTC as the account base
            // This ensures ALL pairs see the same total account value
            const totalUSDT = balance.USDT?.total || 0;
            const totalBTC = balance.BTC?.total || 0;

            // Get BTC price for conversion (use BTC/USDT price)
            let btcPrice = 0;
            try {
                const ticker = await binance.fetchTicker('BTC/USDT');
                btcPrice = ticker.last || 0;
            } catch (e) {
                console.log('>> [WARN] Could not fetch BTC price, using 0');
            }

            const btcValue = totalBTC * btcPrice;
            const totalEquity = totalUSDT + btcValue;

            // Apply CAPITAL_ALLOCATION - this bot's share of total
            state.initialCapital = totalEquity * CAPITAL_ALLOCATION;

            console.log(`>> [AUTO] Universal Equity: $${totalUSDT.toFixed(2)} USDT + $${btcValue.toFixed(2)} BTC = $${totalEquity.toFixed(2)}`);
            console.log(`>> [AUTO] Allocation: ${(CAPITAL_ALLOCATION * 100).toFixed(0)}%`);
            console.log(`>> [AUTO] This Pair's Capital: $${state.initialCapital.toFixed(2)}`);
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

        // Manual FIFO Reconciliation Trigger
        socket.on('reconcile_inventory', async () => {
            console.log('>> [CMD] MANUAL INVENTORY RECONCILIATION TRIGGERED');
            await reconcileInventoryWithExchange();
        });
    });

    // Start Main Loop (AUTOMATED)
    try {
        log('SYSTEM', 'Loading Exchange Markets...');
        await binance.loadMarkets(); // Ensure time offsets and precision are ready
    } catch (e) {
        log('WARN', `Market sync warning: ${e.message}`, 'warning');
    }
    await initializeGrid();

    // AUTO-HEALTH CHECK: Ensure grid always has orders
    setInterval(async () => {
        if (state.activeOrders.length === 0 && !state.emergencyStop) {
            log('AUTO', 'No active orders detected - Reinitializing grid automatically', 'warning');
            await initializeGrid(true);
        }
    }, 60000); // Check every minute

    // === DAILY PERFORMANCE REPORT ===
    const REPORTS_DIR = path.join(__dirname, 'reports');
    if (!fs.existsSync(REPORTS_DIR)) {
        fs.mkdirSync(REPORTS_DIR, { recursive: true });
    }

    function generateDailyReport() {
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const reportFile = path.join(REPORTS_DIR, `daily_report_${dateStr}.txt`);

        // Calculate today's metrics
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const todayTrades = (state.filledOrders || []).filter(o => o.timestamp >= todayStart);
        const todaySells = todayTrades.filter(o => o.side === 'sell');
        const todayProfit = todaySells.reduce((sum, o) => sum + (o.profit || 0), 0);
        const todayWins = todaySells.filter(o => o.profit > 0).length;
        const todayWinRate = todaySells.length > 0 ? (todayWins / todaySells.length * 100).toFixed(1) : 'N/A';

        // Overall metrics
        const totalProfit = state.totalProfit || 0;
        const initialCapital = state.initialCapital || 100;
        const totalROI = ((totalProfit / initialCapital) * 100).toFixed(2);
        const activeOrders = state.activeOrders?.length || 0;
        const inventoryLots = state.inventory?.length || 0;

        // Anomaly detection
        const anomalies = [];
        if (todayTrades.length === 0) anomalies.push('⚠️ No trades today');
        if (state.maxDrawdown > 5) anomalies.push(`⚠️ High drawdown: ${state.maxDrawdown.toFixed(2)}%`);
        if (state.emergencyStop) anomalies.push('🚨 EMERGENCY STOP ACTIVE');
        if (todayProfit < 0) anomalies.push(`⚠️ Negative profit today: $${todayProfit.toFixed(4)}`);

        const report = `
╔══════════════════════════════════════════════════════════════╗
║           VANTAGE BOT - DAILY PERFORMANCE REPORT             ║
║                    ${dateStr}                                ║
╠══════════════════════════════════════════════════════════════╣
║  TODAY'S PERFORMANCE                                         ║
╠══════════════════════════════════════════════════════════════╣
  Trades Executed:      ${todayTrades.length}
  Sells (Profit Events): ${todaySells.length}
  Today's Profit:       $${todayProfit.toFixed(4)}
  Win Rate:             ${todayWinRate}%

╠══════════════════════════════════════════════════════════════╣
║  CUMULATIVE STATS                                            ║
╠══════════════════════════════════════════════════════════════╣
  Total Profit:         $${totalProfit.toFixed(4)}
  Total ROI:            ${totalROI}%
  Max Drawdown:         ${(state.maxDrawdown || 0).toFixed(2)}%
  Initial Capital:      $${initialCapital.toFixed(2)}

╠══════════════════════════════════════════════════════════════╣
║  CURRENT STATE                                               ║
╠══════════════════════════════════════════════════════════════╣
  Active Orders:        ${activeOrders}
  Inventory Lots:       ${inventoryLots}
  Current Price:        $${(state.currentPrice || 0).toFixed(2)}
  Market Regime:        ${state.marketRegime || 'UNKNOWN'}

╠══════════════════════════════════════════════════════════════╣
║  ALERTS & ANOMALIES                                          ║
╠══════════════════════════════════════════════════════════════╣
${anomalies.length > 0 ? anomalies.map(a => '  ' + a).join('\n') : '  ✅ All systems normal'}

╚══════════════════════════════════════════════════════════════╝
Generated: ${now.toISOString()}
`;

        fs.writeFileSync(reportFile, report);
        console.log(`>> [REPORT] Daily report saved: ${reportFile}`);
        log('REPORT', `📊 Daily report generated: ${dateStr}`, 'success');
    }

    // Schedule daily report at 11:59 PM
    function scheduleDailyReport() {
        const now = new Date();
        const next1159 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 0);

        // If already past 11:59 today, schedule for tomorrow
        if (now >= next1159) {
            next1159.setDate(next1159.getDate() + 1);
        }

        const msUntil1159 = next1159.getTime() - now.getTime();
        console.log(`>> [REPORT] Next daily report in ${(msUntil1159 / 1000 / 60 / 60).toFixed(1)} hours`);

        setTimeout(() => {
            generateDailyReport();
            // Schedule next one (every 24 hours)
            setInterval(generateDailyReport, 24 * 60 * 60 * 1000);
        }, msUntil1159);
    }

    scheduleDailyReport();
    console.log('>> [REPORT] Daily report scheduler initialized');
});

