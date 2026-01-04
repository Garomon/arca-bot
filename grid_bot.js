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
const DataCollector = require('./data_collector');
const crypto = require('crypto');

// --- BINANCE CONNECTION (GLOBAL SCOPE) ---
const binance = new ccxt.binance({
    apiKey: process.env.BINANCE_API_KEY,
    secret: process.env.BINANCE_SECRET,
    timeout: 60000,
    enableRateLimit: true,
    options: { 'adjustForTimeDifference': true }
});

// --- DEBUG HELPER ---
function logDebugFinancials(tag, data) {
    try {
        const fs = require('fs');
        const path = require('path');
        const file = path.join(__dirname, 'data', 'debug_financials.json');
        const entry = { timestamp: new Date().toISOString(), tag, ...data };
        fs.appendFileSync(file, JSON.stringify(entry) + '\n');
    } catch (e) { /* ignore */ }
}

// --- ENGINEER FIX 0: crash Handler (Debug PM2 Restarts) ---
process.on('uncaughtException', (err) => {
    const msg = `[CRITICAL] Uncaught Exception: ${err.message}`;
    console.error(msg);
    console.error(err.stack);
    try {
        const fs = require('fs');
        const path = require('path');
        if (!fs.existsSync(path.join(__dirname, 'logs'))) fs.mkdirSync(path.join(__dirname, 'logs'));
        fs.appendFileSync(path.join(__dirname, 'logs', 'pm2_crash.log'), `\n[${new Date().toISOString()}] ${msg}\n${err.stack}\n`);
    } catch (e) { /* emergency log failed */ }
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    const msg = `[CRITICAL] Unhandled Rejection: ${reason}`;
    console.error(msg);
    try {
        const fs = require('fs');
        const path = require('path');
        fs.appendFileSync(path.join(__dirname, 'logs', 'pm2_crash.log'), `\n[${new Date().toISOString()}] ${msg}\n`);
    } catch (e) { /* emergency log failed */ }
    // Don't exit on rejection, just log it. Maybe it recovers.
});

// P0 FIX: Robust Order Filter Helper
// Binance returns clientOrderId in different places depending on endpoint (openOrders vs myTrades)
function getClientId(o) {
    if (!o) return '';
    return (
        o.clientOrderId ||
        o.info?.clientOrderId ||
        o.info?.origClientOrderId ||
        o.info?.newClientOrderId ||
        ''
    );
}

// --- ENGINEER FIX 1: Robust Fetch Environment Check ---
if (!global.fetch) {
    console.error(">> [CRITICAL] Node.js version is too old (No global fetch). Updating to Node 18+ is required.");
    process.exit(1);
}
const fetch = global.fetch; // Standardize for consistency

// --- ENGINEER FIX 2: Safety Guard for Non-USDT Pairs ---
if (process.env.TRADING_PAIR && !process.env.TRADING_PAIR.endsWith('/USDT')) {
    console.error(`>> [CRITICAL] Safety Guard: Only */USDT pairs are currently supported. Got: ${process.env.TRADING_PAIR}`);
    console.error(">> To support ETH/BTC, a full refactor of 'balance.USDT' checks is required.");
    process.exit(1);
}

// --- DYNAMIC CONFIGURATION (Multi-Pair Support) ---
// CRITICAL P0: Bot Isolation & Pair ID
const BOT_ID = process.env.BOT_ID || "VANTAGE01";
const TRADING_PAIR = process.env.TRADING_PAIR || 'BTC/USDT';
const BOT_PORT = parseInt(process.env.BOT_PORT) || 3000;
const PAIR_ID = TRADING_PAIR.replace('/', '').toUpperCase(); // e.g., 'BTCUSDT'
const [BASE_ASSET, QUOTE_ASSET] = TRADING_PAIR.split('/'); // e.g. ['BTC', 'USDT']

// CAPITAL ALLOCATION: Each pair only uses its assigned slice of total capital
// Value from 0 to 1.0 (e.g., 0.5 = 50% of total balance)
const CAPITAL_ALLOCATION = parseFloat(process.env.CAPITAL_ALLOCATION) || 1.0;

// Phase 31: PRODUCTION SAFETY GUARDRAILS
// Prevents account ruin by limiting exposure
const USDT_FLOOR_PERCENT = 0.15;      // Min 15% of equity must stay in USDT (pauses BUYs)
const INVENTORY_CAP_PERCENT = 0.70;   // Max 70% of equity can be in BASE_ASSET (pauses BUYs)


// Pair-specific presets
const PAIR_PRESETS = {
    'BTC/USDT': {
        minOrderSize: 0.00001,
        gridSpacing: 0.005,      // OPTIMIZED v2: 0.5% base (was 0.3% - too tight for stable BTC)
        gridCount: 16,           // Fewer but wider grids
        spacingNormal: 0.007,    // OPTIMIZED v2: 0.7% normal (was 0.5%)
        spacingHigh: 0.010,      // OPTIMIZED v2: 1.0% high volatility (was 0.8%)
        spacingLow: 0.005,       // OPTIMIZED v2: 0.5% low volatility (was 0.3% - BOTTLENECK FIXED)
        bandwidthHigh: 0.04,
        bandwidthLow: 0.015,
        toleranceMultiplier: 10,
        dustThreshold: 0.00005   // Ignore balances < $4.50
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
        toleranceMultiplier: 15,
        dustThreshold: 0.05      // Ignore balances < $6.50 (Fixes SOL Block)
    },
    'DOGE/USDT': {
        minOrderSize: 10,        // ~$3.50 minimum order (DOGE trades in whole coins)
        gridSpacing: 0.010,      // 1.0% base (meme coin = wider spreads needed)
        gridCount: 50,           // +/- 25% active range (DOGE can swing hard)
        spacingNormal: 0.012,    // 1.2% normal
        spacingHigh: 0.020,      // 2.0% high volatility (DOGE pumps/dumps)
        spacingLow: 0.008,       // 0.8% low volatility
        bandwidthHigh: 0.10,     // 10% bollinger bandwidth = high vol
        bandwidthLow: 0.03,      // 3% = low vol
        toleranceMultiplier: 15, // Tightened from 20 to 15 per user request
        dustThreshold: 50.0      // Ignore balances < $7.00
    }
    // ETH/BTC Removed temporarily (requires non-USDT safety guard bypass)
    // 'ETH/BTC': { ... }
};

// ... (existing code) ...

// Last time we logged the tolerance (for periodic visibility)
let lastToleranceLog = 0;
const TOLERANCE_LOG_INTERVAL = 5 * 60 * 1000; // Log every 5 minutes

// ACCOUNTING METHOD: 'SPREAD_MATCH' (Best for Grid), 'FIFO', or 'LIFO'
// SPREAD_MATCH: Matches sells to buys where buyPrice * (1+spread) ≈ sellPrice (Optimal for Grid Trading)
// FIFO: First-In First-Out (Sells oldest inventory first)
// LIFO: Last-In First-Out (Sells newest inventory first - BAD for grid trading!)
const ACCOUNTING_METHOD = process.env.ACCOUNTING_METHOD || 'SPREAD_MATCH';

// (Duplicate checkGridHealth removed)

// Get preset for current pair (fallback to BTC defaults)
const pairPreset = PAIR_PRESETS[TRADING_PAIR] || PAIR_PRESETS['BTC/USDT'];

const CONFIG = {
    // Trading Pair (Dynamic)
    pair: TRADING_PAIR,
    tradingFee: parseFloat(process.env.TRADING_FEE) || 0.001, // 0.1% default, set to 0.00075 for BNB 25% discount

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


    // System Settings
    monitorInterval: 3000,
    orderDelay: 150,
    logBufferSize: 100,

    // State Persistence (PAIR-SPECIFIC PATH)
    // State Persistence (BOT-SPECIFIC PATH to prevent collisions)
    stateFile: path.join(__dirname, 'data', 'sessions', `${BOT_ID}_${PAIR_ID}_state.json`)
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
console.log(`>> [DOCTRINE] 🛡️ SAFETY NET ACTIVE: Tolerance -0.5% (Strict Profit Guard)`);


// --- SERVER SETUP ---
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// SECURITY UPDATE: Serve only the public folder
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint for Master Dashboard
app.get('/api/status', async (req, res) => {
    try {
        // Calculate inventory metrics
        const inventory = state.inventory || [];
        const totalAmount = inventory.reduce((sum, lot) => sum + (lot.remaining || 0), 0);
        const totalCost = inventory.reduce((sum, lot) => sum + ((lot.price || 0) * (lot.remaining || 0)), 0);
        const avgCost = totalAmount > 0 ? totalCost / totalAmount : 0;
        const currentValue = totalAmount * (state.currentPrice || 0);
        const unrealizedPnL = currentValue - totalCost;

        // Get Global Equity from cached financials (same as main dashboard)
        let globalEquity = 0;
        let allocatedEquity = 0;
        try {
            // Use late-binding to access function after it's defined
            if (typeof getDetailedFinancialsCached === 'function') {
                const fin = await getDetailedFinancialsCached(2000);
                if (fin) {
                    globalEquity = fin.globalEquity || fin.accountEquity || 0;
                    allocatedEquity = fin.totalEquity || 0;
                }
            }
        } catch (e) {
            console.error('[API] Error getting financials:', e.message);
        }

        // Fallback equity calculation
        const usdtBalance = state.balance?.usdt || state.availableCapital || 0;
        const totalEquity = allocatedEquity > 0 ? allocatedEquity : (usdtBalance + currentValue);

        // Calculate ROI
        // Calculate ROI (Realized only, to match reports)
        const initialCapital = state.initialCapital || CONFIG.initialCapital || 400;
        // Exclude unrealizedPnL from main ROI to prevent "inflated" look
        const roi = initialCapital > 0 ? ((state.totalProfit || 0) / initialCapital) * 100 : 0;

        // Secondary metric: Total Return (Realized + Unrealized)
        const totalPnL = (state.totalProfit || 0) + unrealizedPnL;
        const netRoi = initialCapital > 0 ? (totalPnL / initialCapital) * 100 : 0;

        // Calculate win rate from filled orders (same as performance metrics)
        const filledOrders = state.filledOrders || [];
        const successfulTrades = filledOrders.filter(o => o.profit > 0);
        const totalTrades = filledOrders.length;
        const winRate = totalTrades > 0 ? (successfulTrades.length / totalTrades) * 100 : 0;

        // Get decision score from composite signal
        const decisionScore = state.compositeSignal?.score || state.marketCondition?.signalScore || 50;

        // Get blocking reason
        let blockingReason = null;
        if (state.smartDcaBlocking) {
            const priceAbovePct = avgCost > 0 ? ((state.currentPrice - avgCost) / avgCost * 100).toFixed(1) : 0;
            blockingReason = `Price ${priceAbovePct}% above avg cost`;
        }

        // Time in range
        const inRangeCycles = state.inRangeCycles || 0;
        const totalCycles = state.totalCycles || 1;
        const timeInRange = (inRangeCycles / totalCycles * 100).toFixed(1);

        // Calculate daily profit from filled orders (UTC-6 / CDMX Timezone)
        const now = new Date();
        // Convert current server time to UTC-6 (Mexico City)
        // 1. Get UTC timestamp
        const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
        // 2. Apply -6h offset
        const cdmxTime = new Date(utcTime + (3600000 * -6));
        // 3. Reset to midnight of that CDMX day
        cdmxTime.setHours(0, 0, 0, 0);
        // 4. Convert back to pure timestamp relative to UTC for comparison? 
        // Actually, we need the timestamp of "00:00 CDMX today" in server time logic?
        // No, simplest way: Get start of day timestamp in UTC-6

        // Let's do robust ISO string method:
        const cdmxISO = new Date(utcTime + (3600000 * -6)).toISOString().split('T')[0]; // "2026-01-02"
        const startOfDayCDMX = new Date(`${cdmxISO}T00:00:00.000-06:00`).getTime();

        const todayOrders = filledOrders.filter(o => o.timestamp && o.timestamp >= startOfDayCDMX);
        const dailyProfit = todayOrders.reduce((sum, o) => sum + (o.profit || 0), 0);
        const dailyTrades = todayOrders.length;

        // Calculate Yesterday's Profit (UTC-6)
        const startOfYesterdayCDMX = startOfDayCDMX - (24 * 60 * 60 * 1000);
        const yesterdayOrders = filledOrders.filter(o =>
            o.timestamp &&
            o.timestamp >= startOfYesterdayCDMX &&
            o.timestamp < startOfDayCDMX
        );
        const yesterdayProfit = yesterdayOrders.reduce((sum, o) => sum + (o.profit || 0), 0);

        // Calculate APY from ROI and days active
        const startTime = state.firstTradeTime || state.startTime || Date.now();
        const daysActive = Math.max(1, (Date.now() - startTime) / (1000 * 60 * 60 * 24));
        const dailyROI = roi / daysActive;
        const apy = dailyROI * 365;

        // Last trade info (robustly pick latest by timestamp regardless of array order)
        const lastTrade = filledOrders.length > 0
            ? [...filledOrders].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0]
            : null;

        // Recent logs (last 5)
        const recentLogs = (logBuffer || []).slice(-5).map(l => ({
            type: l.type,
            message: l.message?.substring(0, 100),
            timestamp: l.timestamp
        }));

        res.json({
            // Basic info
            pair: CONFIG.pair,
            botId: BOT_ID,

            // Price data
            currentPrice: state.currentPrice || 0,

            // Profit metrics
            totalProfit: state.totalProfit || 0,
            unrealizedPnL: unrealizedPnL,
            totalPnL: totalPnL,
            dailyProfit: dailyProfit,
            yesterdayProfit: yesterdayProfit,
            dailyTrades: dailyTrades,

            // Portfolio metrics
            totalEquity: totalEquity,
            globalEquity: globalEquity,
            usdtBalance: usdtBalance,
            initialCapital: initialCapital,
            roi: roi,
            apy: apy,

            // Trade metrics
            winRate: winRate,
            totalTrades: totalTrades,
            wins: successfulTrades.length,

            // Orders and inventory
            activeOrders: state.activeOrders?.length || 0,
            inventoryLots: inventory.length,
            inventoryAmount: totalAmount,
            inventoryValue: currentValue,
            avgCost: avgCost,

            // Market analysis
            marketRegime: state.marketRegime || 'UNKNOWN',
            volatilityRegime: state.volatilityRegime || 'NORMAL',
            score: decisionScore,
            rsi: state.lastRSI || state.marketCondition?.rsi || 50,

            // Status
            smartDcaBlocking: state.smartDcaBlocking || false,
            blockingReason: blockingReason,
            timeInRange: timeInRange,

            // Last trade
            lastTrade: lastTrade ? {
                side: lastTrade.side,
                price: lastTrade.price,
                amount: lastTrade.amount,
                profit: lastTrade.profit,
                timestamp: lastTrade.timestamp
            } : null,

            // System
            uptime: process.uptime(),
            startTime: startTime,
            daysActive: daysActive,
            recentLogs: recentLogs,
            timestamp: Date.now()
        });
    } catch (err) {
        console.error('[API] /api/status error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- BINANCE CONNECTION (MOVED TO TOP) ---
// const binance = ...

// API endpoint for real Binance balance (Master Dashboard)
app.get('/api/balance', async (req, res) => {
    try {
        const balance = await binance.fetchBalance();
        const usdt = balance.USDT?.total || 0;
        const btc = balance.BTC?.total || 0;
        const sol = balance.SOL?.total || 0;
        const doge = balance.DOGE?.total || 0;

        // Use the global equity source of truth for the total
        const total = await getGlobalEquity();

        // Get prices for breakdown (optional: could also use equityCache if available)
        let btcPrice = 0;
        try {
            if (CONFIG.pair === 'BTC/USDT') btcPrice = state.currentPrice;
            else { const t = await binance.fetchTicker('BTC/USDT'); btcPrice = t.last; }
        } catch (e) { }

        res.json({
            usdt: usdt,
            btc: btc,
            sol: sol,
            doge: doge,
            btcPrice: btcPrice,
            totalEquity: total,
            timestamp: Date.now()
        });
    } catch (err) {
        console.error('[API] /api/balance CRITICAL ERROR:', err.message);
        res.status(500).json({ error: err.message, equity: 0 });
    }
});

// --- RPG GAMIFICATION API ---
app.get('/api/rpg', async (req, res) => {
    try {
        const sessionsDir = path.join(__dirname, 'data', 'sessions');
        let totalProfit = 0;
        let daysActive = 32; // Fallback default
        const LAUNCH_DATE = new Date('2025-12-03T00:00:00Z');

        // 1. Calculate Global Profit from all state files
        if (fs.existsSync(sessionsDir)) {
            const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('_state.json'));
            files.forEach(file => {
                try {
                    const data = JSON.parse(fs.readFileSync(path.join(sessionsDir, file), 'utf8'));
                    if (data.totalProfit) totalProfit += parseFloat(data.totalProfit);
                } catch (e) { }
            });
        }

        // 2. Calculate Days Active
        const now = new Date();
        const diffTime = Math.abs(now - LAUNCH_DATE);
        daysActive = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // 3. XP Calculation
        const BASE_XP_MANUAL_BONUS = 350; // Achievements unlocked manually
        const xpFromProfit = Math.round(totalProfit * 10);
        const xpFromDays = daysActive * 50;
        const totalXp = xpFromProfit + xpFromDays + BASE_XP_MANUAL_BONUS;

        // 4. Level Calculation
        const LEVEL_THRESHOLDS = [
            { level: 1, xp: 0 }, { level: 2, xp: 100 }, { level: 3, xp: 300 },
            { level: 4, xp: 600 }, { level: 5, xp: 1000 }, { level: 6, xp: 1500 },
            { level: 7, xp: 2200 }, { level: 8, xp: 3000 }, { level: 9, xp: 4500 },
            { level: 10, xp: 6000 }, { level: 11, xp: 8000 }, { level: 50, xp: 150000 }
        ];

        let currentLevel = LEVEL_THRESHOLDS[0];
        let nextLevel = LEVEL_THRESHOLDS[1];
        for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
            if (totalXp >= LEVEL_THRESHOLDS[i].xp) {
                currentLevel = LEVEL_THRESHOLDS[i];
                nextLevel = LEVEL_THRESHOLDS[i + 1] || { level: 99, xp: 99999999 };
            }
        }

        // 5. Quest Status (Dynamic Progression)
        const currentEquity = await getGlobalEquity();
        const activeQuest = {
            name: "El Cruce del Valle",
            objective: "Alcanzar $1,500 en Capital Total (Equity)",
            status: (currentEquity >= 1500) ? "COMPLETED" : "IN_PROGRESS",
            reward: "1000 XP + Rango: Caballero del Grid"
        };

        // P0 FIX: Get Real Equity for Quest Tracking
        try {
            // We need global equity here. Since we are INSIDE grid_bot.js, we can use the same logic as /api/balance or cache
            // For now, let's use a hardcoded estimate fallback if globalEquity isn't available in this scope, 
            // but ideally getting it via function if possible.
            // Simplification: The frontend creates the friction. We return the quest definition here.
        } catch (e) { }

        res.json({
            level: currentLevel.level,
            title: "Mercader Errante", // Dynamic based on level ranges?
            xp: totalXp,
            nextLevelXp: nextLevel.xp,
            xpProgress: Math.round(((totalXp - currentLevel.xp) / (nextLevel.xp - currentLevel.xp)) * 100),
            stats: {
                profit: totalProfit,
                days: daysActive
            },
            quest: activeQuest
        });

    } catch (err) {
        console.error('[API] /api/rpg error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- GLOBAL PROFIT HISTORY API ---
// Aggregates daily profit from ALL bots for the RPG Dashboard chart
app.get('/api/profit-history', async (req, res) => {
    try {
        const sessionsDir = path.join(__dirname, 'data', 'sessions');
        const profitByDay = {};

        if (fs.existsSync(sessionsDir)) {
            const stateFiles = fs.readdirSync(sessionsDir).filter(f => f.endsWith('_state.json'));

            for (const file of stateFiles) {
                try {
                    const data = JSON.parse(fs.readFileSync(path.join(sessionsDir, file), 'utf8'));

                    // Aggregate from tradeHistory if available
                    if (data.tradeHistory && Array.isArray(data.tradeHistory)) {
                        data.tradeHistory.forEach(trade => {
                            if (trade.side === 'sell' && trade.profit > 0) {
                                const date = new Date(trade.timestamp).toISOString().split('T')[0];
                                profitByDay[date] = (profitByDay[date] || 0) + parseFloat(trade.profit);
                            }
                        });
                    }
                } catch (e) { /* Ignore malformed files */ }
            }
        }

        // Sort and format for chart
        const sortedDates = Object.keys(profitByDay).sort();
        const history = sortedDates.map(date => ({
            date: date,
            profit: parseFloat(profitByDay[date].toFixed(4))
        }));

        res.json({
            success: true,
            totalDays: history.length,
            history: history
        });

    } catch (err) {
        console.error('[API] /api/profit-history error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// BOT_ID and PAIR_ID defined at top of file
// (Removed duplicate definition)


// ============================================
// ENHANCED LOGGING SYSTEM - Full Transparency
// ============================================
const logBuffer = []; // Re-added as it's used by addToBuffer, which is not in the diff but implied.
const LOG_FILE = path.join(__dirname, 'logs', `${BOT_ID}_${PAIR_ID}_activity.log`);
const DECISION_LOG = path.join(__dirname, 'logs', `${BOT_ID}_${PAIR_ID}_decisions.log`);

// ENGINEER FIX: Async Logging Strings (Performance P0)
let logStream;
let decisionStream;

// Initialize log files
function initializeLogs() {
    const logsDir = path.join(__dirname, 'logs');
    // P0 FIX: Create logs directory if missing
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }

    const header = `\n\n========== BOT SESSION STARTED: ${new Date().toISOString()} ==========\n`;

    // Create non-blocking streams
    // P1 FIX: Log Rotation (Rename if exists)
    if (fs.existsSync(LOG_FILE)) {
        try {
            const stats = fs.statSync(LOG_FILE);
            if (stats.size > 0) { // Rotate if not empty
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                fs.renameSync(LOG_FILE, LOG_FILE.replace('.log', `_${timestamp}.log`));
                if (fs.existsSync(DECISION_LOG)) {
                    fs.renameSync(DECISION_LOG, DECISION_LOG.replace('.log', `_${timestamp}.log`));
                }
            }
        } catch (e) {
            console.error('Log rotation failed:', e);
        }
    }

    logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
    decisionStream = fs.createWriteStream(DECISION_LOG, { flags: 'a' });

    logStream.write(header);
    decisionStream.write(header);
}

// Helper to add to logBuffer for UI
function addToBuffer(logEntry) {
    logBuffer.unshift(logEntry);
    if (logBuffer.length > CONFIG.logBufferSize) logBuffer.pop();
}

// Helper to format prices with dynamic decimals for logs
// DOGE ($0.12) needs 4 decimals, BTC ($88000) needs 2
function formatPriceLog(price) {
    if (price === null || price === undefined) return '0';
    const p = parseFloat(price);
    if (p < 1) return p.toFixed(4);      // DOGE: $0.1168
    if (p < 10) return p.toFixed(3);     // Low alts: $1.234
    if (p < 100) return p.toFixed(2);    // SOL: $124.52
    return p.toFixed(2);                  // BTC: $88366.00
}

// Main logging function - writes to console, UI, and file
function log(type, message, status = 'info') {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${type}] ${message}`;

    // console.log(`>> [${type}] ${message}`); // OLD
    console.log(`[${timestamp}] >> [${type}] ${message}`); // NEW: With Timestamp

    // Emit to UI
    io.emit('log', { type, message, timestamp, status });
    addToBuffer({ type, message, timestamp, status });

    // Write to file (Non-blocking)
    if (logStream) logStream.write(logLine + '\n');
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
        if (decisionStream) {
            decisionStream.write(logLine + '\n');
            decisionStream.write(`  Details: ${JSON.stringify(data)}\n`);
        }
    } catch (e) {
        console.error('Decision log failed:', e.message);
    }

    // Also log to main feed
    // Also log to main feed
    log('DECISION', `${action}: ${reasons.join(', ')}`,
        action.includes('BUY') ? 'success' : (action.includes('SELL') ? 'warning' : 'info'));

    // Emit to UI for activity feed
    io.emit('bot_decision', decision);

    return decision;
}

// ENGINEER REQUEST: Explicit Decision Gate Logging
function logDecisionGate(action, details) {
    if (process.env.DEBUG_GATES === 'true') { // ENGINEER FIX: Control via ENV
        // Format for readability: >> [DECISION] {"action":"HOLD", ...}
        console.log(">> [DECISION]", JSON.stringify({
            pair: CONFIG.pair,
            ts: new Date().toISOString(),
            action: action, // HOLD, BUY, SELL
            ...details
        }));
    }
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
    pair: CONFIG.pair, // Identity for AI
    balance: { usdt: 0, btc: 0 },
    currentPrice: 0,
    entryPrice: 0,
    activeOrders: [], // { id, side, price, amount, level, status, timestamp }
    filledOrders: [], // History
    totalProfit: 0,
    // P0 FIX: State Defaults (Engineer FB Phase 27)
    volatilityRegime: 'NORMAL',
    isPaused: false,
    pauseUntil: null,
    pauseReason: null,
    initialCapital: null, // Track starting capital for profit % calculation
    capitalHistory: [],   // PHASE 5: Track deposits/withdrawals for accurate APY: [{amount, timestamp}]
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
    lastRegime: null,      // PHASE 3: Previous market regime
    // PHASE 4: Weekly Metrics for Performance Tracking
    metrics: {
        ticksInRange: 0,       // Cycles where price was inside grid
        ticksOutOfRange: 0,    // Cycles where price was outside grid
        buyHoldStartPrice: 0,  // Price at bot start for Buy & Hold comparison
        metricsStartTime: 0    // When we started tracking
    },
    // PHASE 5: Automatic Capital Change Detection
    lastKnownEquity: null,     // Last equity for detecting deposits/withdrawals
    lastEquityCheck: null      // Timestamp of last check
};

// Cache for external data (avoid rate limits) - HOISTED TO TOP
const externalDataCache = {
    fearGreed: { value: null, timestamp: 0 },
    fundingRate: { value: null, timestamp: 0 },
    btcDominance: { value: null, timestamp: 0 },
    openInterest: { value: null, timestamp: 0 },
    orderBook: { value: null, timestamp: 0 }
};

// --- HELPER: Universal Equity Source of Truth (USDT + BTC + SOL) ---
// (Moved to line ~1600 to be near Cache definitions)


// Load State
// Load State
function loadState() {
    try {
        if (fs.existsSync(CONFIG.stateFile)) {
            console.log(`>> [DEBUG] Loading state from: ${CONFIG.stateFile}`);
            const raw = fs.readFileSync(CONFIG.stateFile);
            const saved = JSON.parse(raw);

            // P0 FIX: Merge saved state BEFORE applied logic
            // This prevents old saved values from overwriting the "reborn" logic above
            state = { ...state, ...saved };

            // P1 FIX: Ensure filledOrders is RECOGNIZED if present in saved file
            if (saved.filledOrders && saved.filledOrders.length > 0) {
                state.filledOrders = saved.filledOrders;
                console.log(`>> [RECOVERY] Loaded ${state.filledOrders.length} historical orders.`);
            }

            // P0 FIX: UNIFY PROFIT ARCHITECTURE (Professional Grade)
            // Ensure totalProfit is ALWAYS at least the value of accumulated (audited) profit
            const acc = saved.accumulatedProfit || 0;
            const tot = saved.totalProfit || 0;
            state.totalProfit = Math.max(acc, tot);
            state.accumulatedProfit = Math.max(acc, tot); // Sync both in memory

            if (state.totalProfit > tot) {
                console.log(`>> [RECOVERY] Restored $${state.totalProfit.toFixed(4)} from Audited Baseline.`);
            }

            // P0 FIX: Restore accumulated profit if we just recovered from emergency stop
            if (saved.emergencyStop) {
                state.accumulatedProfit = state.totalProfit;
                // state.emergencyStop = false; // Doctrine: Keep true until manual intervention
            }

            // AUDIT FIX: Ensure inventory exists
            // AUDIT FIX: Ensure inventory exists
            if (!state.inventory) state.inventory = [];

            // AUTO-SANITIZER: Fix Historical Profit Logic (Buys = 0) & Retroactive Fee Deduction
            let fixedProfit = 0;
            let estimatedProfit = 0; // Separate estimated/unverified profit

            // P0 FIX: Check if we have a forensic audit baseline
            const accumulated = state.accumulatedProfit || 0;
            const hasAuditBaseline = accumulated > 0;

            if (state.filledOrders && !hasAuditBaseline) {
                // ONLY run migration/recalculation if NO audit baseline exists
                // If accumulated > 0, the audit script already calculated the EXACT profit.
                console.log('>> [MIGRATION] Verifying Fee Deduction on Historical Orders...');
                state.filledOrders.forEach(o => {
                    // 1. Zero out Buy Profit
                    if (o.side === 'buy' && o.profit > 0) {
                        o.profit = 0;
                    }

                    // 2. Deduct Fees from Sell Profit (Net = Gross - 0.2%)
                    if (o.side === 'sell' && o.profit > 0) {
                        if (!o.isNetProfit) {
                            const estimatedFees = (o.price * o.amount) * (CONFIG.tradingFee * 2);
                            o.profit = Math.max(0, o.profit - estimatedFees);
                            o.isNetProfit = true; // Mark as processed
                            console.log(`>> [FIX] Order ${o.id}: Deducted $${estimatedFees.toFixed(4)} fees. New Net: $${o.profit.toFixed(4)}`);
                        }
                    }

                    // P0 FIX: Only sum NET/REAL profit to totalProfit
                    if (o.side === 'sell' && (o.profit || 0) > 0) {
                        if (o.isNetProfit) fixedProfit += o.profit;
                        else estimatedProfit += o.profit;
                    }
                });

                // No audit baseline: use calculated values
                state.totalProfit = fixedProfit + estimatedProfit;
                state.estimatedProfit = estimatedProfit;
            } else if (hasAuditBaseline) {
                // AUDIT MODE: Trust the accumulated value, ignore filledOrders calculations
                console.log(`>> [AUDIT] Using forensic audit baseline: $${accumulated.toFixed(4)}`);
                state.totalProfit = accumulated;
                // Future trades with isNetProfit = true will add to this via handleOrderFill
            }

            state.feeCorrectionApplied = true;
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
// Save State (ASYNC & NON-BLOCKING)
// OPTIMIZATION: Prevents I/O blocking the Event Loop
let isSaving = false;
let pendingSave = false;

// Safe JSON Replacer to prevent Circular Errors
const safeReplacer = (key, value) => {
    // P0 FIX: State Sanitation - Exclude runtime noise
    if (key === 'priceBuffer') return undefined; // Dont persist high-freq data
    if (key === 'marketCondition') return undefined; // Derived state
    if (key === 'compositeSignal') return undefined; // Derived state

    // 1. Remove Circular References related to Timers
    if (key === '_idleNext' || key === '_idlePrev') return undefined;
    // 2. Filter out non-serializable objects
    if (value && typeof value === 'object') {
        if (value.constructor && (value.constructor.name === 'Timeout' || value.constructor.name === 'Interval' || value.constructor.name === 'Socket')) {
            return undefined; // Filter out complex objects
        }
    }
    return value;
};

async function saveState() {
    if (isSaving) {
        pendingSave = true;
        return;
    }
    isSaving = true;

    try {
        const tempFile = `${CONFIG.stateFile}.tmp`;
        // Use Async Write with SAFE REPLACER
        const json = JSON.stringify(state, safeReplacer, 2);
        await fs.promises.writeFile(tempFile, json);
        // Atomic Rename (Fast)
        await fs.promises.rename(tempFile, CONFIG.stateFile);

        // Optional: Emit to UI (safely)
        // io.emit('grid_state', JSON.parse(json)); 
    } catch (e) {
        console.error('>> [ERROR] Failed to save state:', e.message);
        // Debug Finding: Identify the specific circular key if possible
        try {
            JSON.stringify(state, (key, value) => {
                if (value && typeof value === 'object' && value.constructor && value.constructor.name === 'Timeout') {
                    console.error(`>> [DEBUG] FOUND TIMEOUT IN STATE AT KEY: ${key}`);
                }
                return value;
            });
        } catch (e2) { /* ignore */ }
    } finally {
        isSaving = false;
        if (pendingSave) {
            pendingSave = false;
            saveState(); // Process the queued save
        }
    }
}

// ==================================================
// FIFO RECONCILIATION - Sync Inventory with Exchange
// Ensures no lots are ever lost due to state file issues
// ==================================================
async function reconcileInventoryWithExchange() {
    // P0 FIX: Reconcile Guard (Env Var + Allocation)
    if (process.env.DISABLE_RECONCILE === 'true') {
        log('RECONCILE', 'Disabled by env DISABLE_RECONCILE=true', 'warning');
        return;
    }

    // P0 GUARD: CROSS-BOT ISOLATION IS HANDLED BY PAIR CHECK
    // Removing the strict allocation guard because separate pairs (BTC/SOL) MUST be able to reconcile their own assets.
    // The previous check prevented inventory recovery for bots with < 100% allocation.
    /* 
    if (CAPITAL_ALLOCATION < 1.0 && process.env.ALLOW_GLOBAL_RECONCILE !== 'true') {
        log('RECONCILE', 'Skipped: allocation < 1.0 (prevents cross-bot inventory bleed).', 'warning');
        return;
    } 
    */

    // P0 FIX: If we have historical trades in state, don't wipe them during startup reconciliation
    // This allows medical restoration of stolen history to PERSIST.
    if (state.trades && state.trades.length > 0) {
        log('RECONCILE', `✅ Historical trades detected (${state.trades.length}). Preservation protocol ACTIVE.`, 'success');
    }

    log('RECONCILE', 'Syncing inventory with exchange history...', 'info');
    try {
        const balance = await binance.fetchBalance();
        const baseAsset = CONFIG.pair.split('/')[0];
        // CRITICAL FIX: Use TOTAL balance (Free + Used/Locked). 
        // Logic: Inventory includes lots currently sitting in open Sell Orders.
        // Using .free caused inventory to vanish when orders were active!
        const realBalance = parseFloat(balance[baseAsset]?.total || 0);

        // 1. Fetch History (Newest First)
        // INCREASED: 500 trades to better handle long-term holders and frequent grid activity
        const trades = await binance.fetchMyTrades(CONFIG.pair, undefined, 500);
        const buyTrades = trades.filter(t => t.side === 'buy').sort((a, b) => b.timestamp - a.timestamp); // DESC

        // PROTECTION: If API returns empty history but we have balance, ABORT to prevent wiping state.
        if (realBalance > 0.0001 && buyTrades.length === 0) {
            log('WARN', `Reconcile Protection: Exchange has balance (${realBalance}) but returned 0 trades. API Issue? Skipping sync.`, 'warning');
            return;
        }

        // 2. Rebuild Ideal Inventory (Strict FIFO)
        // Principle: "My holdings are the sum of my most recent buys."
        // P0 FIX: Ignore DUST balances to prevent safety lock on negligible remainder
        const dustThreshold = pairPreset.dustThreshold || 0;
        const netBalance = realBalance < dustThreshold ? 0 : realBalance;

        if (realBalance > 0 && realBalance < dustThreshold) {
            log('RECONCILE', `🧹 Ignoring DUST balance: ${realBalance.toFixed(6)} ${baseAsset} (Threshold: ${dustThreshold})`, 'info');
        }

        const newInventory = [];
        let remainingBalanceToFill = netBalance;
        const TOLERANCE = 0.000001;

        if (netBalance <= TOLERANCE) {
            log('RECONCILE', `✅ Inventory is EMPTY (or below dust threshold).`, 'success');
        } else {
            for (const trade of buyTrades) {
                if (remainingBalanceToFill <= TOLERANCE) break;

                const amountToTake = Math.min(remainingBalanceToFill, trade.amount);
                // Pro-rate fee
                // P0 FIX: Normalize Fee to USDT (Ignore mixed currency from Trade)
                const originalFee = estimateFeeUSDT(trade.price, trade.amount);
                const fee = originalFee * (amountToTake / trade.amount);

                newInventory.push({
                    // FIX: Use Order ID to match Live Logic/History (Fallback to Trade ID)
                    id: trade.order || trade.id,
                    price: trade.price,
                    amount: amountToTake, // FIX: Use the VIRTUAL amount (the slice we own), so calculations use this as denominator
                    remaining: amountToTake,
                    fee: fee,
                    timestamp: trade.timestamp,
                    recovered: true
                });

                remainingBalanceToFill -= amountToTake;
            }
        }

        // 2b. Handle Legacy/HODL Stack (The "Remainder")
        // If we still have balance but ran out of history, this is OLD inventory.
        // We MUST create a lot for it so LIFO doesn't crash into "Shortfall Estimation" (which resets cost basis).
        if (remainingBalanceToFill > TOLERANCE) {
            log('RECONCILE', `Found ${remainingBalanceToFill.toFixed(6)} ${baseAsset} in LEGACY/HODL stack (older than 100 trades).`, 'warning');

            // Try to find a logical price for this legacy stack
            // 1. Existing entry price from state?
            // 2. Fallback to a safe low value? (Or current price if we want to be conservative?)
            // DECISION: Use state.entryPrice if available, else use the oldest trade price we found.
            const legacyPrice = state.entryPrice || (buyTrades.length > 0 ? buyTrades[buyTrades.length - 1].price : state.currentPrice);

            newInventory.push({
                id: 'LEGACY_STACK', // Special ID
                price: legacyPrice,
                amount: remainingBalanceToFill,
                remaining: remainingBalanceToFill,
                fee: 0, // Assume sunk cost
                timestamp: 0, // BIRTH OF TIME (Ensures it is absolutely the Oldest)
                recovered: true,
                note: 'Auto-Recovered HODL Stack'
            });
            log('RECONCILE', `✅ Created LEGACY Lot: ${remainingBalanceToFill.toFixed(6)} ${baseAsset} @ $${legacyPrice.toFixed(2)} (Timestamp 0)`, 'success');
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
            // Mark state as estimated until true sequence is established
            state.inventoryStatus = 'ESTIMATED';
            saveState();
            log('RECONCILE', `✅ Inventory Rebuilt (Strict FIFO). Holdings: ${newTotal.toFixed(6)} ${baseAsset}.`, 'success');

            // --- SAFETY NET: AMNESIA BLOCKING PROTOCOL ---
            // SELF-HEALING: If total balance is below DUST_THRESHOLD, don't pause!
            // Also skip if we already have AUDIT_VERIFIED lots (prevents overwriting full_audit.js results)
            const hasAuditedLots = state.inventory && state.inventory.some(l => l.auditVerified);

            if (newTotal < dustThreshold) {
                log('RECONCILE', `🧹 Self-Healing: Amnesia detected but balance (${newTotal.toFixed(6)}) is below DUST_THRESHOLD (${dustThreshold}). Skipping Pause.`, 'success');
                state.isPaused = false;
                state.pauseReason = null;
                saveState();
            } else if (hasAuditedLots && Math.abs(currentTotal - newTotal) < 0.0001) {
                log('RECONCILE', `✅ Audited Inventory preserved. Skipping Amnesia Lock.`, 'success');
                state.isPaused = false;
                state.pauseReason = null;
                saveState();
            } else {
                log('CRITICAL', `⛔ COST BASIS LOST (AMNESIA DETECTED). PAUSING BOT TO PREVENT LOSS.`, 'error');
                log('CRITICAL', `The bot has lost track of the original buy price for these coins.`, 'error');
                log('CRITICAL', `To prevent selling at a loss (thinking it's profit), you MUST run the audit fix.`, 'error');

                state.isPaused = true;
                state.pauseReason = `SAFETY LOCK: Cost Basis Lost. Run 'node scripts/full_audit.js ${CONFIG.pair} --fix' to resume.`;
                saveState();
            }

            log('RECONCILE', `⚠️ Note: Cost Basis is ESTIMATED from recent buys. Profit accuracy will improve as new trades occur.`, 'warning');

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

// --- HELPER FUNCTIONS ---
// P0 FIX: Fee Normalization (FIFO) - Always estimate in USDT
function estimateFeeUSDT(fillPrice, amount) {
    return fillPrice * amount * CONFIG.tradingFee;
}

// P0 FIX: Rate Limit Protection (Cache Financials)
const finCache = { v: null, ts: 0 };
async function getDetailedFinancialsCached(ttlMs = 2000) {
    if (finCache.v && Date.now() - finCache.ts < ttlMs) return finCache.v;
    finCache.v = await computeBotFinancials();
    finCache.ts = Date.now();
    return finCache.v;
}

// P0 FIX: Restore Alias for Legacy Calls (Engineer FB Phase 28)
async function getDetailedFinancials() {
    return getDetailedFinancialsCached(2000);
}



async function updateBalance() {
    try {
        const balance = await binance.fetchBalance();

        // P0 FIX: Balance Normalization using Allocated Financials
        // Use the robust financial engine to determine what is ACTUALLY ours
        const fin = await getDetailedFinancialsCached(500); // 500ms cache for freshness

        state.balance = {
            total: balance.USDT?.total || 0,
            usdt: fin ? fin.freeUSDT : (balance.USDT?.free || 0), // Use ALLOCATED Free
            base: fin ? fin.freeBTC : (balance[BASE_ASSET]?.free || 0),
            btc: fin ? fin.freeBTC : (balance[BASE_ASSET]?.free || 0),
            locked: fin ? fin.lockedUSDT : (balance.USDT?.used || 0)
        };

        const totalEquity = fin ? fin.accountEquity : (await getGlobalEquity());
        const myEquity = fin ? fin.totalEquity : (totalEquity * CAPITAL_ALLOCATION); // Fallback

        io.emit('balance_update', {
            usdt: state.balance.usdt, // Now sends ISOLATED Free USDT
            btc: state.balance.btc,   // Now sends Base Asset
            equity: totalEquity,      // Global (Reference)
            allocatedEquity: myEquity,// Bot's Slice
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

// PHASE 5: Time-Weighted Average Capital (TWAC) for accurate APY calculation
// This accounts for deposits/withdrawals that happened during the trading period
function calculateTimeWeightedCapital() {
    const history = state.capitalHistory || [];
    const now = Date.now();

    // If no history or only one entry, use initialCapital
    if (history.length === 0) {
        return state.initialCapital || 100;
    }

    // If only one entry, return that capital
    if (history.length === 1) {
        return history[0].amount;
    }

    // Calculate time-weighted average
    let totalWeightedCapital = 0;
    let totalTime = 0;

    for (let i = 0; i < history.length; i++) {
        const entry = history[i];
        const startTime = entry.timestamp;
        const endTime = (i < history.length - 1) ? history[i + 1].timestamp : now;
        const duration = endTime - startTime;

        totalWeightedCapital += entry.amount * duration;
        totalTime += duration;
    }

    // Avoid division by zero
    if (totalTime === 0) return state.initialCapital || 100;

    const avgCapital = totalWeightedCapital / totalTime;

    // Debug log (infrequent)
    if (Math.random() < 0.01) {
        console.log(`>> [APY] Time-Weighted Capital: $${avgCapital.toFixed(2)} (from ${history.length} entries)`);
    }

    return avgCapital;
}

// P0 FIX: Detailed Financials (Equity & Limits)
// RENAMED to avoid conflict with legacy function name (Engineer FB Phase 27)
async function computeBotFinancials() {
    try {
        const balance = await binance.fetchBalance();

        // --- 1. GLOBAL ACCOUNT STATE ---
        const globalFreeUSDT = balance.USDT?.free || 0;
        const globalTotalUSDT = balance.USDT?.total || 0; // Free + Locked

        const globalFreeBase = balance[BASE_ASSET]?.free || 0;
        const globalTotalBase = balance[BASE_ASSET]?.total || 0;

        // Calculate Global Equity (The "Pie")
        const currentPrice = state.currentPrice || 0;
        // FIX: Universal (USDT+BTC+SOL)
        const globalTotalEquity = await getGlobalEquity();

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
        // CRITICAL FIX: Use ACTUAL INVENTORY for this specific pair, not global balance.
        // This isolates BTC bot funds from SOL bot funds.
        const myTotalBase = (state.inventory || []).reduce((sum, lot) => {
            // Handle both 'remaining' (new format) and 'amount' (legacy)
            return sum + (lot.remaining !== undefined ? lot.remaining : lot.amount);
        }, 0);

        const myBaseValue = myTotalBase * currentPrice;

        // --- 4. THE RESULT: ISOLATED FREE USDT ---
        // "How much USDT do I have left to deploy?"
        // My Budget (Allocated Equity) - My Assets (Base) - My Locked Orders (USDT)
        let myFreeUSDT = myAllocatedEquity - myBaseValue - myLockedUSDT;

        // Safety Clamp: Can't be negative, can't exceed Global Free
        myFreeUSDT = Math.max(0, myFreeUSDT);
        myFreeUSDT = Math.min(myFreeUSDT, globalFreeUSDT); // Can't spend what doesn't exist

        // DEBUG: Log Detailed Financials
        logDebugFinancials('COMPUTE_FINANCIALS', {
            globalTotalEquity,
            capitalAllocation: CAPITAL_ALLOCATION,
            myAllocatedEquity,
            myBaseValue,
            myLockedUSDT,
            myFreeUSDT,
            globalFreeUSDT
        });

        // PHASE 5: Detect USDT Deposits/Withdrawals (NOT equity changes)
        // This tracks actual USDT added to Spot account, not price fluctuations
        const lastUSDT = state._lastTrackedUSDT || 0;
        const usdtChange = globalTotalUSDT - lastUSDT;

        // Only detect if:
        // 1. We have a previous reading
        // 2. Change is significant (>$25 to avoid noise)
        // 3. Change is NOT explained by a recent sell (which adds USDT)
        if (lastUSDT > 0 && Math.abs(usdtChange) > 25) {
            // Check if there was a recent sell that could explain the USDT increase
            const recentSells = (state.filledOrders || [])
                .filter(o => o.side === 'sell' && o.timestamp > Date.now() - 60000) // Last minute
                .reduce((sum, o) => sum + (o.price * o.amount), 0);

            const unexplainedUSDT = usdtChange - recentSells;

            // If USDT increased without a sell, it's a deposit
            // If USDT decreased without a buy (checked separately), it's a withdrawal
            if (Math.abs(unexplainedUSDT) > 25) {
                const myShareChange = unexplainedUSDT * CAPITAL_ALLOCATION;
                state.capitalHistory = state.capitalHistory || [];
                state.capitalHistory.push({
                    amount: myAllocatedEquity,
                    timestamp: Date.now(),
                    reason: unexplainedUSDT > 0 ? 'USDT_DEPOSIT' : 'USDT_WITHDRAWAL',
                    delta: myShareChange,
                    rawUSDT: unexplainedUSDT
                });
                log('CAPITAL', `💰 USDT ${unexplainedUSDT > 0 ? 'deposit' : 'withdrawal'} detected: ${unexplainedUSDT > 0 ? '+' : ''}$${unexplainedUSDT.toFixed(2)} → My share: ${myShareChange > 0 ? '+' : ''}$${myShareChange.toFixed(2)}`, unexplainedUSDT > 0 ? 'success' : 'warning');
                saveState();
            }
        }
        state._lastTrackedUSDT = globalTotalUSDT; // Update tracker

        // PHASE 5: Use Time-Weighted Average Capital for accurate APY
        const twac = calculateTimeWeightedCapital();
        const profitPercent = twac > 0 ? (state.totalProfit / twac) * 100 : 0;

        return {
            freeUSDT: myFreeUSDT,       // CORRECTED: Isolated available capital
            lockedUSDT: myLockedUSDT,   // CORRECTED: Only MY orders
            freeBTC: globalFreeBase,    // Display base asset (Legacy key)
            lockedBTC: myLockedBase,
            totalBTC: myTotalBase,
            btcValueUSDT: myBaseValue,
            totalEquity: myAllocatedEquity, // RESTORED: Bot's specific slice ($130)
            accountEquity: globalTotalEquity, // Available for Portfolio View (if supported)
            globalEquity: globalTotalEquity, // Alias try
            profit: state.totalProfit, // Lifetime Profit (Unified)
            profitPercent: profitPercent,
            avgCapital: twac,             // NEW: Time-weighted average capital for UI
            capitalHistoryCount: (state.capitalHistory || []).length, // NEW: How many entries
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

// P0 FIX: Anti "Rebalance Storm" Lock
let isRebalancing = false;

async function initializeGrid(forceReset = false) {
    if (isRebalancing && forceReset) {
        log('SYSTEM', '⚠️ Rebalance skipped (already in progress)', 'warning');
        return;
    }

    // SAFETY NET: Respect Pause (e.g. Amnesia Lock)
    if (state.isPaused) {
        log('SYSTEM', `⛔ Grid Initialization Skipped: PAUSED (${state.pauseReason || 'User Request'})`, 'warning');
        return;
    }

    if (forceReset) isRebalancing = true;

    try {
        log('SYSTEM', 'INITIALIZING GRID...');

        const price = await getCurrentPrice();
        if (!price) return;

        // Sync first to ensure we know about all orders
        await syncWithExchange();

        // PHASE 5: SMART CAPITAL DETECTION
        // Calculate current equity NOW to see if user added funds
        const totalEquity = await getGlobalEquity();

        // Apply CAPITAL_ALLOCATION to get THIS PAIR's share
        const allocatedEquity = totalEquity * CAPITAL_ALLOCATION;

        // FIX: Detect if initialCapital was set to GLOBAL equity (Legacy Bug)
        // If stored Initial Capital is close to GLOBAL Equity (within 10%) but we are using an Allocation (< 90%),
        // then it was set incorrectly in the past. We must scale it down to prevent false Stop-Loss triggers.
        if (state.initialCapital && Math.abs(state.initialCapital - totalEquity) < totalEquity * 0.1 && CAPITAL_ALLOCATION < 0.9) {
            log('MIGRATION', `🔧 Fixing Legacy Initial Capital (Was Global $${state.initialCapital.toFixed(2)} -> Now Allocated $${allocatedEquity.toFixed(2)})`, 'warning');
            state.initialCapital = allocatedEquity;
            saveState();
        }

        // Check for "New Money" (Capital Injection > 10% of THIS PAIR's allocation)
        if (state.initialCapital) {
            // P0 FIX: Profit-Aware Capital Detection
            // Subtract realized profit to see if the growth is ACTUALLY from a deposit
            // allocatedEquity includes (Base + Profit + Deposits). We want (Base + Deposits).
            const profitAdjustedEquity = allocatedEquity - (state.totalProfit || 0);

            const capitalGrowth = (profitAdjustedEquity - state.initialCapital) / state.initialCapital;

            // If capital grew by >10% (excluding profit)
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
            lastToleranceLog = Date.now(); // P1 FIX: Init Log Timer (Engineer FB Phase 28)
            await cancelAllOrders();
            state.startTime = Date.now();
            state.lastGridReset = Date.now(); // FIX: Track reset time for cooldown logic
            saveState(); // FIX: Persist reset time immediately
        }

        state.entryPrice = price;
        log('ENTRY', `$${price.toFixed(2)}`);

        // Calculate Grid
        // DYNAMIC CAPITAL: Use the allocated equity for this pair
        const dynamicCapital = allocatedEquity;

        log('CAPITAL', `Total Equity: $${totalEquity.toFixed(2)} | Allocation: ${(CAPITAL_ALLOCATION * 100).toFixed(0)}% | This Pair: $${dynamicCapital.toFixed(2)}`, 'info');

        // Get regime and volatility for adaptive calculations
        const regime = await detectMarketRegime();
        const analysis = await getMarketAnalysis();
        const volatilityState = analysis && analysis.bandwidth > CONFIG.bandwidthHigh ? 'HIGH' :
            (analysis && analysis.bandwidth < CONFIG.bandwidthLow ? 'LOW' : 'NORMAL');

        // P0 FIX: Persist Volatility State for Helpers
        state.volatilityRegime = volatilityState;

        // PHASE 2.5: ATR GRID SPACING (Dynamic Volatility Surfing)
        // FIX: Initialize geoContext with safe default before potential override
        let geoContext = { status: 'NORMAL', defenseLevel: 0 };

        if (analysis && analysis.atr) {
            // --- GEOPOLITICAL CHECK ---
            geoContext = checkGeopoliticalContext(regime.regime, price, regime.ema200);
            geoContext.tradingFee = CONFIG.tradingFee || 0.001; // Pass Fee for Spacing Calc
            geoContext.minSpacing = PAIR_PRESETS[CONFIG.pair]?.spacingLow || 0.005; // FLOOR: ATR can't go below this

            // FIX: Always calculate ATR spacing, regardless of geo status
            // Use CENTRALIZED logic in adaptive_helpers (Pass full geoContext)
            const spacingConfig = adaptiveHelpers.calculateOptimalGridSpacing(
                analysis.atr,
                price,
                volatilityState,
                geoContext // Pass full object (includes defenseLevel & status)
            );

            CONFIG.gridSpacing = spacingConfig.spacing;

            // Manual Spacing Overrides REMOVED (Now handled in adaptive_helpers)
            // This prevents double-counting of risk multipliers.
            if (geoContext.defenseLevel !== 0) {
                log('GEO', `Spacing Adjusted by Helper: ${(CONFIG.gridSpacing * 100).toFixed(2)}% (DefLevel: ${geoContext.defenseLevel})`, 'info');
            }

            log('ATR', `Dynamic Spacing Set: ${(CONFIG.gridSpacing * 100).toFixed(2)}% (ATR: ${analysis.atr.toFixed(2)} | Mult: ${spacingConfig.multiplier})`, 'info');

            // IMMEDIATE TOLERANCE LOG (Visible on Startup)
            const tolMult = PAIR_PRESETS[CONFIG.pair]?.toleranceMultiplier || 10;
            const driftTol = CONFIG.gridSpacing * tolMult;
            log('TOLERANCE', `Grid: ${(CONFIG.gridSpacing * 100).toFixed(2)}% | Drift Tol: ${(driftTol * 100).toFixed(2)}% (${tolMult}x) | Status: ACTIVE`, 'success');
        }
        // (End of ATR Block) - LOGIC MOVED OUTSIDE FOR SAFETY

        // PHASE 3: Use allocateCapital for smarter distribution
        const multiTF = await analyzeMultipleTimeframes();

        // --- GEOPOLITICAL RESERVE OVERRIDE ---
        // geoContext defined above safely now
        // PHASE 3: ADAPTIVE CAPITAL ALLOCATION (Brain Activation)
        // NOW PASSING GEOCONTEXT to helper (Centralized Logic)
        const capitalConfig = adaptiveHelpers.allocateCapital(
            dynamicCapital,     // Total available
            regime.regime,      // Market Phase
            volatilityState,    // Risk Level
            multiTF,            // Trend Confidence
            geoContext          // Geopolitical Context
        );

        // Apply computed allocation (Restored)
        let allocation = {
            grid: capitalConfig.grid,
            reserve: dynamicCapital - capitalConfig.grid,
            allocation: capitalConfig.allocation,
            reason: capitalConfig.reason
        };

        // Deduct locked profit from usable capital (PROFIT PROTECTION)
        const lockedProfit = state.lockedProfit || 0;
        const safeCapital = Math.max(0, allocation.grid - lockedProfit);

        if (lockedProfit > 0) {
            log('SYSTEM', `💰 PROFIT LOCK: $${lockedProfit.toFixed(2)} protected | Usable: $${safeCapital.toFixed(2)}`);
        }
        log('SYSTEM', `CAPITAL ALLOCATION: $${safeCapital.toFixed(2)} for grid | $${allocation.reserve.toFixed(2)} reserve (${allocation.reason})`);

        // Calculate Safety Margin based on Geo Level (Now handled by Helper)
        // P0 FIX: centralized logic in adaptive_helpers
        const adaptiveSafetyMargin = adaptiveHelpers.getAdaptiveSafetyMargin(
            volatilityState,
            regime.regime,
            geoContext
        );
        CONFIG.safetyMargin = adaptiveSafetyMargin;
        log('ADAPTIVE', `Safety Margin: ${(adaptiveSafetyMargin * 100).toFixed(0)}% (Vol: ${volatilityState} | Regime: ${regime.regime})`, 'info');

        // Track initial capital for profit % (only set once on first run)
        if (!state.initialCapital) {
            state.initialCapital = dynamicCapital;
            log('CAPITAL', `Initial Capital Set: $${state.initialCapital.toFixed(2)}`, 'info');
        }

        // P0 FIX: Force totalProfit to be persistent and match state.accumulatedProfit if higher
        // (Ensures the Restored data is actually USED by the ROI/Dashboard logic)
        if (state.accumulatedProfit > state.totalProfit) {
            state.totalProfit = state.accumulatedProfit;
        }

        // PHASE 2: Dynamic Grid Count (adapt to capital and volatility)
        let dynamicGridCount = adaptiveHelpers.calculateOptimalGridCount(safeCapital, volatilityState);
        // P0 FIX: Force Even Grid Count (Symmetry)
        if (dynamicGridCount % 2 !== 0) dynamicGridCount += 1;
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

            // FIX 1: Check against Exchange Limits (Amount) AND Min USDT Value
            const market = binance.markets?.[CONFIG.pair];
            const minAmount = market?.limits?.amount?.min || CONFIG.minOrderSize; // Fallback to preset
            const minCost = market?.limits?.cost?.min || 5; // Usually 5 USDT

            if (amountInBTC.toNumber() >= minAmount && sizeInUSDT >= minCost) {
                gridLevels.push({
                    ...rawLevels[i],
                    amount: amountInBTC // Pass QUANTITY to placeOrder, NOT Value
                });
            }
        }

        // FIX 2: Dynamic Max Open Orders
        // Ensure we can place the full calculated grid
        if (gridLevels.length > CONFIG.maxOpenOrders) {
            log('CONFIG', `Upgrading Max Orders from ${CONFIG.maxOpenOrders} to ${gridLevels.length} to fit grid.`, 'info');
            CONFIG.maxOpenOrders = gridLevels.length + 5; // Buffer
        }

        // Place Orders
        log('GRID', `PLACING ${gridLevels.length} ORDERS (PYRAMID STRATEGY)...`);

        // P0 FIX: Check Safety Guards (Inventory/Cash)
        const pauseCheck = await shouldPauseBuys();
        if (pauseCheck.pause) {
            log('SMART', `⚠️ BUY PROTECTION ACTIVE: ${pauseCheck.reason}. Filtering BUY orders.`);
        }

        // P0 FIX: Local Budget Tracking to prevent API Spam & Insufficient Funds
        // Calculate available budget from cached financials ONCE
        const startFin = await getDetailedFinancialsCached(500); // Ensure fresh
        let currentFreeUSDT = startFin ? (startFin.freeUSDT * CONFIG.safetyMargin) : Infinity;

        logDebugFinancials('INIT_GRID_START', {
            safeCapital,
            dynamicGridCount,
            startFinFreeUSDT: startFin?.freeUSDT,
            safetyMargin: CONFIG.safetyMargin,
            currentFreeUSDT,
            firstOrderSizeUSDT: sizes[0] || 'N/A'
        });

        for (const level of gridLevels) {
            try {
                // Pre-Check: Skip buys if paused
                if (level.side === 'buy' && pauseCheck.pause) {
                    continue;
                }

                // Pre-Check Budget
                if (level.side === 'buy') {
                    const orderCost = level.amount * level.price;
                    if (currentFreeUSDT < orderCost) {
                        log('SKIP', `Budget Exhausted: Have $${currentFreeUSDT.toFixed(2)}, Need $${orderCost.toFixed(2)}`, 'info');
                        logDebugFinancials('BUDGET_EXHAUSTED', {
                            currentFreeUSDT,
                            orderCost,
                            levelAmount: level.amount,
                            levelPrice: level.price
                        });
                        continue; // Skip this level, save API call
                    }
                    currentFreeUSDT -= orderCost; // Deduct locally
                }

                await placeOrder(level, true); // P0 FIX: Skip budget check, we tracked it locally
            } catch (e) {
                log('ERROR', `Failed to place grid order: ${e.message}`, 'error');
            }
            await sleep(CONFIG.orderDelay);
        }

        emitGridState();
        monitorOrders();
        // } // End of initializeGrid loop - REMOVED IF BLOCK
    } catch (e) {
        console.error('Grid Init Error:', e);
    } finally {
        if (forceReset) isRebalancing = false;
    }
}

// ==========================================
// SAFETY NET: PREVENT AMNESIA SELLS
// Checks if a SELL order would realize a significant loss
// ==========================================
function checkSafetyNet(level) {
    // 1. SafetyNet only applies to SELLS
    if (level.side !== 'sell') return { safe: true };

    // 2. If no inventory, we have nothing to protect (or it's a naked short)
    // CRITICAL: AMNESIA PROTECTION
    // If we are selling but have no inventory records, we MUST block.
    // This happens if state is lost/corrupted. We cannot assume it's "Zero Cost".
    if (!state.inventory || state.inventory.length === 0) {
        return {
            safe: false,
            reason: 'AMNESIA DETECTED: Selling with NO tracked inventory. State mismatch likely. Run: node scripts/full_audit.js PAIR --fix'
        };
    }

    try {
        const sellPrice = parseFloat(level.price);
        let remainingToSell = parseFloat(level.amount);
        let costBasis = 0;
        let consumedAmount = 0;

        // 3. Simulate Consumption (Clone to avoid mutating real state)
        // Use the same logic as handleOrderFill (SPREAD_MATCH preferred)
        const candidates = state.inventory
            .filter(lot => lot.remaining > 0.00000001)
            .map(lot => ({ ...lot })); // Shallow copy

        if (ACCOUNTING_METHOD === 'SPREAD_MATCH') {
            const spacing = level.spacing || CONFIG.gridSpacing || 0.01;
            const expectedBuyPrice = sellPrice / (1 + spacing);
            // Sort by proximity to expected buy price
            candidates.sort((a, b) => Math.abs(a.price - expectedBuyPrice) - Math.abs(b.price - expectedBuyPrice));
        } else if (ACCOUNTING_METHOD === 'LIFO') {
            candidates.sort((a, b) => b.timestamp - a.timestamp); // Newest first
        } else {
            candidates.sort((a, b) => a.timestamp - b.timestamp); // FIFO (Oldest first)
        }

        // 4. Calculate Weighted Average Cost
        for (const lot of candidates) {
            if (remainingToSell <= 0.00000001) break;
            const take = Math.min(remainingToSell, lot.remaining);
            costBasis += (take * lot.price);
            remainingToSell -= take;
            consumedAmount += take;
        }

        // If we couldn't match enough inventory, we can't fully judge.
        // Assume the rest is "at market" or safe? 
        // Safer to judge based on what we matched.
        if (consumedAmount === 0) return { safe: true };

        const avgCost = costBasis / consumedAmount;
        const profitPct = ((sellPrice - avgCost) / avgCost) * 100;

        // 5. DECISION: Block if loss > 0.5% (Strict Profit Protection)
        // Grid bot should NEVER sell below cost. We allow -0.5% only for slippage/fees buffer.
        const LOSS_TOLERANCE = -0.5;

        if (profitPct < LOSS_TOLERANCE) {
            // EXCEPTION: IF price is WAY above entry (e.g. we missed the top), maybe we want to sell?
            // No, grid bot sells are for profit. If we are selling below cost, it's wrong.
            // Unless it's a "Stop Loss" - in that case, the caller should bypass this check.
            // But placeOrder doesn't have a bypass flag yet. 
            // We assume standard grid operations here.

            return {
                safe: false,
                reason: `AMNESIA PREVENTED: Selling @ $${sellPrice.toFixed(2)} would realize ${profitPct.toFixed(2)}% loss (AvgCost: $${avgCost.toFixed(2)}).`
            };
        }

        return { safe: true };

    } catch (e) {
        console.error('SafetyNet Error:', e);
        return { safe: true }; // Fail open if logic crashes, don't freeze bot
    }
}

async function placeOrder(level, skipBudgetCheck = false) {
    // PHASE 31: SAFETY NET CHECK
    // Prevent "Amnesia Sells" (Selling below cost because we forgot we bought high)
    const safety = checkSafetyNet(level);
    if (!safety.safe) {
        log('GUARD', `🛡️ SAFETY NET: ${safety.reason}`, 'error');
        logDecision('BLOCKED_BY_SAFETY_NET', [safety.reason], { level });
        return;
    }

    // Circuit Breaker
    if (state.activeOrders.length >= CONFIG.maxOpenOrders) {
        console.warn('>> [WARN] MAX ORDERS REACHED. SKIPPING.');
        console.log(">> [SKIP] reason=MAX_OPEN_ORDERS_REACHED", JSON.stringify({ max: CONFIG.maxOpenOrders, current: state.activeOrders.length }));
        return;
    }

    const price = new Decimal(level.price).toNumber();
    let amount = new Decimal(level.amount).toNumber();

    // PRECISION ENFORCEMENT (Amount & Price)
    // MOVED UP for accuracy (P0 Fix)
    let finalPrice = price;
    try {
        amount = parseFloat(binance.amountToPrecision(CONFIG.pair, amount));
        finalPrice = parseFloat(binance.priceToPrecision(CONFIG.pair, price));
    } catch (e) {
        console.warn('>> [WARN] Could not enforce precision:', e.message);
    }

    // P0 FIX: Allocation Enforcement (Real Budget Check)
    // P0 FIX: Use Cached Financials for Rate Limit Protection
    const fin = await getDetailedFinancialsCached().catch(() => null);
    const finalNotionalUSDT = amount * finalPrice;

    if (fin) {
        if (level.side === 'buy') {
            const budget = fin.freeUSDT * CONFIG.safetyMargin;
            if (finalNotionalUSDT > budget) {
                log('SKIP', `Allocation Budget: Need $${finalNotionalUSDT.toFixed(2)}, Budget $${budget.toFixed(2)} (Free $${fin.freeUSDT.toFixed(2)})`, 'warning');
                return;
            }
        }
        if (level.side === 'sell') {
            const availableBase = Math.max(0, (fin.totalBTC || 0) - (fin.lockedBTC || 0));
            if (amount > availableBase * 0.999) {
                log('SKIP', `Insufficient BASE for SELL: Need ${amount.toFixed(6)} ${BASE_ASSET}, Avail ${availableBase.toFixed(6)}`, 'warning');
                return;
            }
        }
    }

    // Phase 4: Fee Optimization - Skip unprofitable orders
    // P0 FIX: Moved AFTER precision and allocation check
    const worthCheck = adaptiveHelpers.isOrderWorthPlacing(
        finalNotionalUSDT, // ✅ Correct Unit using PRECISE values
        CONFIG.gridSpacing,
        finalPrice,
        CONFIG.tradingFee
    );

    if (!worthCheck.worth) {
        log('SKIP', `Order too small: ${worthCheck.reason}`, 'warning');
        return;
    }

    // PROCEED TO EXECUTION...

    // PHASE 4.5: WALL PROTECTION (Order Book Intelligence)
    try {
        const pressure = await fetchOrderBookPressure();
        // Don't BUY if there is a massive SELL WALL (Ratio < 0.15)
        if (level.side === 'buy' && pressure.ratio < 0.15) {
            log('SMART', `🧱 MASSIVE SELL WALL (Ratio ${pressure.ratio.toFixed(2)}x). Delaying BUY.`, 'warning');
            logDecision('BLOCKED_BY_WALL', [`Sell Wall Ratio: ${pressure.ratio.toFixed(2)}x`, 'Waiting for resistance to clear'], { level });
            console.log(">> [SKIP] reason=BLOCKED_BY_SELL_WALL", JSON.stringify({ ratio: pressure.ratio }));
            return;
        }
        // Don't SELL if there is a massive BUY WALL (Ratio > 3.0)
        if (level.side === 'sell' && pressure.ratio > 3.0) {
            log('SMART', `🚀 BUY WALL DETECTED (Ratio ${pressure.ratio.toFixed(2)}x). Delaying SELL (Price might rise).`, 'warning');
            logDecision('BLOCKED_BY_WALL', [`Buy Wall Ratio: ${pressure.ratio.toFixed(2)}x`, 'Waiting for price rise'], { level });
            console.log(">> [SKIP] reason=BLOCKED_BY_BUY_WALL", JSON.stringify({ ratio: pressure.ratio }));
            return;
        }
    } catch (e) {
        console.log('Wall check skipped');
    }

    // LIVE - Using resilient API call with retries
    // CRITICAL P0: Isolation Tag
    // P0 FIX: Use UUID to prevent collision
    const simpleId = crypto.randomUUID().split('-')[0]; // Short unique
    const uniqueIdRaw = `${BOT_ID}_${PAIR_ID}_${level.side}_${simpleId}`;
    const uniqueId = uniqueIdRaw.slice(0, 32); // P0 FIX: Truncate to safe length (Binance Limit)

    // P0 FIX: Race Condition Mitigation - Fresh Balance Check
    // Prevents "Insufficient Funds" spam when multi-bot races occur
    // REMOVED: Handled by Local Budget Tracking in initializeGrid
    /*
    if (level.side === 'buy') {
        try {
            const freshBalance = await binance.fetchBalance();
            const freshUSDT = freshBalance.USDT?.free || 0;
            // P0 FIX: Use finalPrice (Precision) for accurate cost check
            const orderCost = amount * finalPrice;
            // Simple check: Do we have enough?
            if (freshUSDT < orderCost) {
                log('SKIP', `Insufficient Funds (Race Condition): Need $${orderCost.toFixed(2)}, Have $${freshUSDT.toFixed(2)}`, 'warning');
                return;
            }
        } catch (e) { console.log('Balance race check failed (non-fatal)'); }
    }
    */

    // (Precision logic moved up)

    let order;
    try {
        order = await adaptiveHelpers.resilientAPICall(
            // P0 FIX: Use Standard CCXT createOrder
            () => binance.createOrder(CONFIG.pair, 'limit', level.side, amount, finalPrice, {
                newClientOrderId: uniqueId, // ✅ Binance Spot Requirement
                clientOrderId: uniqueId,    // Fallback
                timeInForce: 'GTC'          // P0 NICE-TO-HAVE: Explicit GTC
            }),
            3,
            `Place ${level.side} order`
        );

        // Log with full transparency
        // P0 FIX: Audit Logging Consistency (Use Final Price)
        // P0 FIX: Variable Name Crash Fix (notionalUSDT -> finalNotionalUSDT)
        log('LIVE', `${level.side.toUpperCase()} $${finalNotionalUSDT.toFixed(2)} (~${amount.toFixed(6)} ${BASE_ASSET}) @ $${finalPrice.toFixed(2)} [Tag: ${uniqueId}]`, 'success');
        logActivity('PLACING_ORDER');

        // Audit the Decision (Traceability)
        // Removed duplicate worthCheck declaration
        logDecision(
            `ORDER_PLACED_${level.side.toUpperCase()}`,
            [
                `Price: $${finalPrice.toFixed(2)}`,
                `Amount: ${amount.toFixed(6)} ${BASE_ASSET}`,
                `Composite Score: ${state.compositeSignal?.score?.toFixed(0) || 'N/A'}`,
                `Regime: ${state.marketRegime || 'Unknown'}`
            ],
            { orderId: order.id, level: level.level, worthCheck: worthCheck }
        );

        state.activeOrders.push({
            id: order.id,
            side: level.side,
            price: finalPrice, // P0 FIX: Store Precise Price
            amount: amount,
            level: level.level,
            status: 'open',
            timestamp: Date.now(),
            clientOrderId: uniqueId, // Persist ID
            spacing: CONFIG.gridSpacing
        });
        saveState();

    } catch (e) {
        log('ERROR', `Order Placement Failed: ${e.message}`, 'error');
        logDecision('ORDER_FAILED', [e.message], { level });
    }
}


// CRITICAL P0: Isolation - Cancel ONLY this bot's orders
async function cancelAllOrders() {
    try {
        const myPrefix = `${BOT_ID}_${PAIR_ID}_`;
        log('SYSTEM', `CANCELLING ORDERS (Filter: ${myPrefix}*)...`, 'warning');

        const all = await binance.fetchOpenOrders(CONFIG.pair);

        // Filter carefully
        // Filter carefully using P0 Robust Helper
        const mine = all.filter(o => getClientId(o).startsWith(myPrefix));

        if (mine.length === 0) {
            log('SYSTEM', 'No active bot orders found to cancel.', 'info');

            // P0 FIX: Safe Cancel - Clean ONLY my prefix from local state
            state.activeOrders = (state.activeOrders || []).filter(o =>
                !((o.clientOrderId || '').startsWith(myPrefix))
            );
            saveState();
            return;
        }

        for (const o of mine) {
            await binance.cancelOrder(o.id, CONFIG.pair);
            // Small delay to be nice to API
            await new Promise(r => setTimeout(r, 80));
        }

        // Rebuild local state (Keep only what we couldn't cancel? Or just clear?)
        // Safer to clear what we found
        const mineIds = new Set(mine.map(o => o.id));
        state.activeOrders = (state.activeOrders || []).filter(o => !mineIds.has(o.id));

        saveState();
        log('SYSTEM', `CANCELLED ${mine.length} BOT ORDERS.`);
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
    // 1. Unpause Logic (Auto-Resume)
    if (state.isPaused) {
        const until = state.pauseUntil || 0;
        // Check if pause window has expired
        if (until && Date.now() >= until) {
            state.isPaused = false;
            state.pauseUntil = null;
            state.pauseReason = null;
            saveState();
            log('RECOVERY', '⏯️ Pause window ended. Resuming trading.', 'success');
        } else {
            // Still paused
            if (myId === monitorSessionId) {
                // Throttle logs slightly to avoid spam
                if (Math.random() < 0.05) io.emit('hud_update', { status: 'PAUSED', detail: state.pauseReason || 'PAUSED' });
            }
            // Check again in 1s (don't exit loop entirely, just skip this tick)
            setTimeout(() => runMonitorLoop(myId), 1000);
            return;
        }
    }

    if (!isMonitoring || myId !== monitorSessionId) return;

    try {
        // P1 FIX: Tolerance Log (Engineer FB Phase 27)
        if (lastToleranceLog && Date.now() - lastToleranceLog > TOLERANCE_LOG_INTERVAL) {
            lastToleranceLog = Date.now();
            const tolMult = PAIR_PRESETS[CONFIG.pair]?.toleranceMultiplier || 10;
            const driftTol = CONFIG.gridSpacing * tolMult;
            log('TOLERANCE', `Grid ${(CONFIG.gridSpacing * 100).toFixed(2)}% | Drift ${(driftTol * 100).toFixed(2)}%`, 'info');
        }

        // PHASE 1: Stop-loss protection
        if (state.emergencyStop) {
            log('STOPPED', '🛑 Bot halted due to emergency stop-loss. Killing loops.', 'error');
            isMonitoring = false; // Kill heartbeat
            if (global.heartbeatInterval) clearInterval(global.heartbeatInterval);
            return;
        }

        // FIX: Ensure Price is LIVE for Flash Crash & Health Checks
        await getCurrentPrice();

        await checkStopLoss();
        // PHASE 2: FLASH CRASH PROTECTION
        await checkFlashCrash();
        if (state.isPaused) return; // Stop loop logic if paused
        if (myId !== monitorSessionId) return; // Zombie check

        let volatilityState = 'NORMAL';

        // PHASE 1: Market Intelligence
        const regime = await detectMarketRegime();
        const multiTF = await analyzeMultipleTimeframes();

        // FIX: Track regime change properly
        state.lastRegime = state.marketRegime;
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
            const currentVol = state.volatilityRegime || 'NORMAL';

            // VOLATILITY HYSTERESIS (Anti-Flicker)
            const highThreshold = CONFIG.bandwidthHigh;
            const highExitThreshold = highThreshold * 0.90; // Must drop 10% below limit to exit HIGH

            const lowThreshold = CONFIG.bandwidthLow;
            const lowExitThreshold = lowThreshold * 1.10; // Must rise 10% above limit to exit LOW

            if (analysis.bandwidth > highThreshold) {
                volatilityState = 'HIGH';
            } else if (currentVol === 'HIGH' && analysis.bandwidth > highExitThreshold) {
                volatilityState = 'HIGH'; // STICKY HIGH (Hysteresis)
                if (monitorSessionId % 20 === 0) console.log(`>> [DEBUG] Volatility Hysteresis Active: Bandwidth ${analysis.bandwidth.toFixed(4)} > Exit ${highExitThreshold.toFixed(4)}`);
            } else if (analysis.bandwidth < lowThreshold) {
                volatilityState = 'LOW';
            } else if (currentVol === 'LOW' && analysis.bandwidth < lowExitThreshold) {
                volatilityState = 'LOW'; // STICKY LOW
            } else {
                volatilityState = 'NORMAL';
            }

            // P0 FIX: Update State for Helpers (Prevents Stale Data in shouldRebalance)
            if (state.volatilityRegime !== volatilityState) {
                state.lastVolatility = state.volatilityRegime;
                state.volatilityRegime = volatilityState;
                log('VOLATILITY', `Regime Shift: ${state.lastVolatility} -> ${state.volatilityRegime}`, 'warning');
            }

            // RESTORED: Trend & Adaptive RSI (Now using STABLE volatilityState)
            const trend = analysis.price > analysis.ema ? 'BULLISH' : 'BEARISH';
            const adaptiveRSI = adaptiveHelpers.getAdaptiveRSI(regime.regime, volatilityState);

            // RESTORED: Smart Filters & UI State
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
            // FIX: Don't overwrite ATR base spacing, use it as the foundation
            let spacingMultiplier = 1.0;

            if (volatilityState === 'HIGH') {
                spacingMultiplier = 1.5; // Widen by 50%
            } else if (volatilityState === 'LOW') {
                spacingMultiplier = 0.8; // Tighten by 20%
            }

            // Calculate effective spacing (ATR-based or manual base * multiplier)
            // If ATR is valid (non-zero), use it. Else fall back to config.
            let baseSpacing = CONFIG.gridSpacing; // Start with current or configured
            if (analysis.atr > 0 && analysis.price > 0) {
                // ATR-based Grid Spacing (e.g. 1.2 * ATR)
                baseSpacing = (analysis.atr / analysis.price) * 1.2;
            }

            const newSpacing = baseSpacing * spacingMultiplier;

            // FIX: Always update Volatility State (Stale State Bug Fix)
            // Use currentVol (captured at start of loop) for change detection
            const prevVol = currentVol;
            // state.volatilityRegime is already updated at line 1443

            // Check if we need to adapt (with Smart Hysteresis)
            const lastResetTime = state.lastRebalance?.timestamp || 0;
            const timeSinceReset = Date.now() - lastResetTime;
            // Cooldown: 20 mins for optimization (Zen Mode), 5 mins for safety (Panic Mode - Anti-Flicker)
            const cooldownMs = 20 * 60 * 1000;
            const emergencyCooldownMs = 5 * 60 * 1000;
            const isEmergency = volatilityState === 'HIGH' && timeSinceReset > emergencyCooldownMs;

            // Use tracked state for change detection
            if (volatilityState !== prevVol && (timeSinceReset > cooldownMs || isEmergency)) {
                log('DEBUG', `VOLATILITY TRIGGER: ${prevVol} -> ${volatilityState} | Delta: ${(timeSinceReset / 1000).toFixed(1)}s | Cooldown: ${(cooldownMs / 1000 / 60).toFixed(0)}m | Emergency: ${isEmergency}`, 'warning');
                log('AI', `VOLATILITY REGIME SHIFT (${prevVol} -> ${volatilityState}). ADAPTING GRID...`, 'warning');
                CONFIG.gridSpacing = newSpacing;
                state.lastRebalance = { timestamp: Date.now(), triggers: ['VOLATILITY'] };
                saveState(); // FORCE SAVE immediately to prevent amnesia
                // state.volatilityRegime already updated above

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
                geoContext: checkGeopoliticalContext(state.marketRegime, analysis.price, regime.ema200),
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

            // PHASE 2: DATA COLLECTION (Machine Learning Ground Truth)
            // Log the snapshot of "What we saw" and "What we decided"
            try {
                // Construct external metrics object from cache
                const externalMetrics = {
                    fundingRate: externalDataCache.fundingRate,
                    btcDominance: externalDataCache.btcDominance,
                    openInterest: externalDataCache.openInterest,
                    orderBook: externalDataCache.orderBook,
                    geoContext: checkGeopoliticalContext(state.marketRegime, analysis.price, regime.ema200) // ✅ Pass Geo Context with EMA200
                };
                DataCollector.logSnapshot(state, analysis, compositeSignal, externalMetrics);
            } catch (e) {
                // Non-blocking error handler for data collection
                console.error('>> [DATA] Snapshot failed:', e.message);
            }

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
                    // REAL EXECUTION: Lock the profit so it's not used for new buys
                    const previousLocked = state.lockedProfit || 0;
                    state.lockedProfit = Math.max(previousLocked, action.amount);
                    log('PROFIT', `🔒 ${action.reason} - LOCKED $${state.lockedProfit.toFixed(2)} (Protected from trading)`, 'success');
                    saveState(); // Persist immediately
                } else if (action.type === 'TRAILING_STOP') {
                    log('PROFIT', `⚠️ ${action.reason} - Consider reducing position`, 'warning');
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
                volatility: volatilityState,
                accounting: ACCOUNTING_METHOD // NEW: Send LIFO/FIFO status to UI
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

    // FIX: Ensure we have enough data (Cache Hit = Fresh AND Sufficient Length)
    if (candleCache[timeframe].data &&
        (now - candleCache[timeframe].timestamp < ttl) &&
        candleCache[timeframe].data.length >= limit) {
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

        // Calculate EMA
        const emaInput = { values: closes, period: periods.ema };
        const emaValues = EMA.calculate(emaInput);

        // Data integrity guards
        if (!closes || closes.length < 30) return null;
        if (rsiValues.length < 15 || emaValues.length < 5) return null;

        // Get latest values
        const currentRSI = rsiValues[rsiValues.length - 1];
        const currentEMA = emaValues[emaValues.length - 1];

        // Calculate Bollinger Bands (Adaptive for Signals)
        const bbInput = { period: periods.bb, values: closes, stdDev: CONFIG.indicators.bbStdDev };
        const bbValues = BollingerBands.calculate(bbInput);
        const currentBB = bbValues[bbValues.length - 1];

        // VOLATILITY FIX: Standardized Bandwidth (Period 20)
        // We use a FIXED yardstick to measure volatility, avoiding the "feedback loop"
        // where High Vol -> Faster Bands -> Lower Bandwidth -> Low Vol -> Slower Bands -> High Vol loop.
        const stdBBInput = { period: 20, values: closes, stdDev: 2 };
        const stdBBValues = BollingerBands.calculate(stdBBInput);
        const stdBB = stdBBValues.length > 0 ? stdBBValues[stdBBValues.length - 1] : currentBB;

        // Calculate Bandwidth (Volatility Metric) using STANDARD bands
        const bandwidth = (stdBB.upper - stdBB.lower) / stdBB.middle;

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
        if (macdCrossing === 'BUY_CROSS') {
            signalScore += 25;
        } else if (macdCrossing === 'SELL_CROSS') {
            signalScore -= 25;
        } else if (macdSignal === 'BULLISH') {
            signalScore += 10;
        } else if (macdSignal === 'BEARISH') {
            signalScore -= 10;
        }

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
        const candles = await getCachedCandles('1h', 300); // Bumped to 300 for safe EMA200
        const closes = candles.map(c => c[4]);

        // EMA 50 and EMA 200
        const ema50 = EMA.calculate({ values: closes, period: 50 });
        const ema200 = EMA.calculate({ values: closes, period: 200 });

        // ENGINEER FIX 4: Safety Guards for Empty/Insufficient Data (Prevents Crash)
        if (!ema50 || ema50.length < 2 || !ema200 || ema200.length < 2) {
            console.warn('>> [WARN] EMA calculation failed (insufficient data). Defaulting to NEUTRAL.');
            return { regime: 'UNKNOWN', confidence: 0, reason: 'Inductor Error' };
        }

        const currentPrice = closes[closes.length - 1];
        // CRITICAL FIX: Ensure global state is fresh immediately
        if (currentPrice) state.currentPrice = currentPrice;

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
        const candles4h = await getCachedCandles('4h', 100);
        const candles1d = await getCachedCandles('1d', 100);

        // Simple trend detection for each TF
        if (!candles4h || candles4h.length < 55) {
            console.warn('>> [WARN] Insufficient 4h candles for MTF analysis');
            return { confidence: 'LOW', direction: 'UNCERTAIN' };
        }
        if (!candles1d || candles1d.length < 55) {
            console.warn('>> [WARN] Insufficient 1d candles for MTF analysis');
            return { confidence: 'LOW', direction: 'UNCERTAIN' };
        }

        const closes4h = candles4h.map(k => parseFloat(k[4]));
        const closes1d = candles1d.map(k => parseFloat(k[4]));

        const ema504h = EMA.calculate({ values: closes4h, period: 50 });
        const ema501d = EMA.calculate({ values: closes1d, period: 50 });

        // Safety: Ensure calculation returned valid array
        if (!ema504h?.length || !ema501d?.length) return { confidence: 'LOW', direction: 'UNCERTAIN' };

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

// FIX: Rate Limit Protection (Cache 15s)
const equityCache = { value: 0, ts: 0 };

async function getGlobalEquity() {
    // Return cached if fresh (15s TTL)
    if (Date.now() - equityCache.ts < 15000 && equityCache.value > 0) {
        return equityCache.value;
    }

    try {
        const balance = await binance.fetchBalance();
        // Calculate Total USDT + crypto value
        let total = balance.USDT?.total || 0;

        // P0 FIX: Universal Equity (Dynamic Asset Verification)
        const assetsToValue = new Set(['BTC', 'ETH', 'SOL', 'DOGE', BASE_ASSET]);

        for (const asset of assetsToValue) {
            if (asset === 'USDT' || !asset) continue;
            const qty = balance[asset]?.total || 0;
            if (qty <= 0) continue;

            try {
                const px = await adaptiveHelpers.resilientAPICall(
                    () => binance.fetchTicker(`${asset}/USDT`).then(t => t.last || 0),
                    3,
                    `Fetch ${asset} Price`
                );
                total += qty * px;
            } catch (err) {
                console.error(`>> [WARN] Could not value asset ${asset}:`, err.message);
                // Fallback to state price if it's the bot's own asset
                if (asset === BASE_ASSET && state.currentPrice > 0) {
                    total += qty * state.currentPrice;
                }
            }
        }



        // Update Cache
        equityCache.value = total;
        equityCache.ts = Date.now();
        return total;
    } catch (e) {
        console.error('>> [ERROR] Global Equity Fetch Failed:', e.message);
        return equityCache.value > 0 ? equityCache.value : 1000; // Fallback
    }
}

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
// FUNDING RATE (Binance Futures)
async function fetchFundingRate() {
    if (Date.now() - externalDataCache.fundingRate.timestamp < CACHE_TTL) {
        return externalDataCache.fundingRate.value;
    }

    try {
        const symbol = CONFIG.pair.replace('/', '');
        const response = await fetch(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=1`);
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

// OPEN INTEREST CHANGE (Binance Futures)
async function fetchOpenInterest() {
    // Cache check (1 minute)
    if (externalDataCache.openInterest.value && (Date.now() - externalDataCache.openInterest.timestamp < 60000)) {
        return externalDataCache.openInterest.value;
    }

    try {
        const symbol = CONFIG.pair.replace('/', '');
        // Safety: Only fetch for pairs likely to have futures (BTC, ETH, SOL, etc)
        const response = await fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`);

        if (!response.ok) {
            // If pair not found on futures, return stable neutral signal
            return { current: 0, change: 0, signal: 'STABLE', timestamp: Date.now() };
        }

        const data = await response.json();
        const currentOI = parseFloat(data.openInterest);
        const previousOI = externalDataCache.openInterest.value?.current || currentOI;

        // Calculate % change
        const change = ((currentOI - previousOI) / previousOI) * 100;

        let signal = 'STABLE';
        if (change > 5) signal = 'OI_INCREASING'; // Increasing leverage/bets
        else if (change < -5) signal = 'OI_DECREASING'; // Liquidations or closing

        const oiData = {
            current: currentOI,
            change: change,
            signal: signal,
            timestamp: Date.now()
        };

        externalDataCache.openInterest = { value: oiData, timestamp: Date.now() };
        log('INTEL', `Open Interest: ${currentOI.toFixed(2)} (${change > 0 ? '+' : ''}${change.toFixed(2)}%)`, 'info');
        return oiData;

    } catch (e) {
        // Silent fail for non-futures pairs
        // console.error('>> [ERROR] Open Interest fetch failed:', e.message);
    }
    return { current: 0, change: 0, signal: 'STABLE', timestamp: Date.now() };
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

// GEOPOLITICAL & MACRO CONTEXT (Dynamic Adaptation)
function checkGeopoliticalContext(currentRegime = 'NEUTRAL', currentPrice = 0, ema200 = null) {
    // 1. Check Specific Scheduled Events (e.g. BoJ Dec 19)
    const eventRisk = adaptiveHelpers.evaluateGeopoliticalRisk(new Date());

    // 2. Check Macro Price Zones (DYNAMIC: based on EMA200)
    const macroSentiment = adaptiveHelpers.evaluateMacroSentiment(CONFIG.pair, currentPrice, ema200);

    // 3. Market Structure Override (The "Trend is King" Rule)
    // If Market is in STRONG BEAR trend, we assume "Fear/Risk" context regardless of news.
    let structureRisk = { status: 'NORMAL', modifier: 'NONE', defenseLevel: 0 };
    if (currentRegime === 'STRONG_BEAR') {
        structureRisk = {
            status: 'BEAR_MARKET_STRUCTURE',
            modifier: 'DEFENSIVE',
            defenseLevel: 2 // High caution in Strong Bear
        };
    } else if (currentRegime === 'BEAR') {
        structureRisk = {
            status: 'MARKET_FEAR',
            modifier: 'DEFENSIVE',
            defenseLevel: 1 // Moderate caution in Bear
        };
    }

    // 4. Resolve Conflict (Prioritization Logic)
    // Hierarchy: 
    // 1. LIQUIDITY CRISIS (Level 3+) -> Trumps everything (Safety First)
    // 2. INFLATIONARY ACCUMULATION (Level -1) -> Trumps Bear Markets (Levels 1 & 2) ("Cash is Trash")
    // 3. STANDARD DEFENSE -> Highest risk level wins (Math.max)

    let finalStatus = eventRisk.status;
    let finalModifier = eventRisk.modifier;
    let defenseLevel = 0;
    let activeMessage = eventRisk.activeEvent;

    // CASE 1: Crisis always wins (Level 3+)
    if (eventRisk.defenseLevel >= 3 || structureRisk.defenseLevel >= 3) {
        defenseLevel = Math.max(eventRisk.defenseLevel, structureRisk.defenseLevel);
        finalModifier = 'MAX_DEFENSE';
        activeMessage = "LIQUIDITY CRISIS DETECTED";
    }
    // CASE 2: Inflationary Accumulation Override
    else if (eventRisk.defenseLevel === -1) {
        defenseLevel = -1;
        // Keep event status/modifier (AGGRESSIVE)
    }
    // CASE 3: Standard Risk Management (Highest Risk Wins)
    else {
        defenseLevel = Math.max(eventRisk.defenseLevel, structureRisk.defenseLevel);

        // If Structure is riskier, update status text
        if (structureRisk.defenseLevel > eventRisk.defenseLevel) {
            finalStatus = structureRisk.status;
            finalModifier = structureRisk.modifier;
            activeMessage = "Market Structure Override";
        }
    }

    return {
        status: finalStatus,
        modifier: finalModifier,
        defenseLevel: defenseLevel,
        scoreBias: (eventRisk.scoreBias || 0) + (macroSentiment?.scoreBonus || 0), // Combine event fear (-) and macro value (+)
        activeEvent: activeMessage,
        macroZone: macroSentiment?.zone || 'NEUTRAL',
        macroAdvice: macroSentiment?.advice || null
    };
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

    // === GEOPOLITICAL CONTEXT (Corrected & Adaptive) ===
    const geo = checkGeopoliticalContext(regime.regime || 'NEUTRAL', analysis.price, regime.ema200);
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

    // === FINAL SCORE LOGGING ===

    // ENGINEER REQUEST: Visibility Upgrade - Score Breakdown
    // ENGINEER REQUEST: Visibility Upgrade - Score Breakdown
    // P0 FIX: Persist this breakdown to decisions log so user can audit it later
    const breakdownData = {
        total: score.toFixed(1),
        rsi: analysis.rsi.toFixed(1),
        regime: regime.regime,
        obRatio: pressure.ratio.toFixed(2),
        reasons: reasons
    };

    // 1. Log to Console (User Request: Keep it visible in logs)
    console.log(">> [SCORE_BREAKDOWN]", JSON.stringify(breakdownData));

    // 2. Persist to File (Audit Trail)
    logDecision('SCORE_BREAKDOWN', reasons, breakdownData);

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
        recommendation = 'HOLD'; // SPOT-ONLY LOGIC: 45-55 is No Man's Land
        sizeMultiplier = 0.8;
    } else if (score >= 35) {
        recommendation = 'WEAK_SELL'; // Bearish bias, but in Spot this means "Don't Buy"
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

    log('COMPOSITE', `Score: ${score.toFixed(1)} | ${recommendation} | Size: ${sizeMultiplier}x`,
        score >= 60 ? 'success' : (score <= 40 ? 'warning' : 'info'));

    return result;
}

// Store latest composite signal in state
state.compositeSignal = null;

// PHASE 1: Stop-Loss Protection (DISABLED - User believes in long-term crypto upside)
async function checkStopLoss() {
    // DISABLED: User wants to hold through dips, believes crypto is at 20% of potential
    // To re-enable, remove this return statement
    return;

    try {
        const balance = await binance.fetchBalance();
        const totalUSDT = balance.USDT?.total || 0;
        const totalBase = balance[BASE_ASSET]?.total || 0;

        // Calculate REAL total equity based on current holdings
        // P0 FIX: Dynamic Asset Valuation (Sum all known assets)
        // This prevents underestimating equity when running multiple bots (BTC + SOL)
        let baseValue = 0;
        const KNOWN_ASSETS = ['BTC', 'SOL', 'ETH']; // Add others as needed

        for (const asset of KNOWN_ASSETS) {
            const qty = balance[asset]?.total || 0;
            if (qty > 0) {
                // Determine price: Use local price if it's OUR pair, else fetch ticker
                let price = 0;
                if (asset === BASE_ASSET) {
                    price = state.currentPrice || 0;
                } else {
                    try {
                        const ticker = await binance.fetchTicker(`${asset}/USDT`);
                        price = ticker.last || 0;
                    } catch (e) { console.warn(`Failed to valuate ${asset}:`, e.message); }
                }
                baseValue += (qty * price);
            }
        }

        const globalEquity = totalUSDT + baseValue;

        // FIX: Compare ALLOCATED Initial Capital against ALLOCATED Current Equity
        const allocatedEquity = globalEquity * CAPITAL_ALLOCATION;

        // Only calculate drawdown if we have meaningful data
        if (allocatedEquity <= 0) return;

        const drawdown = ((state.initialCapital - allocatedEquity) / state.initialCapital) * 100;

        // Update max drawdown (only if positive, meaning we're down)
        if (drawdown > 0 && drawdown > state.maxDrawdown) {
            state.maxDrawdown = drawdown;
        }

        // DOCTRINE OVERRIDE: Grid bots should BUY dips, not stop during them.
        // Emergency stop disabled per user request (2024-12-13).
        // Drawdown is tracked for UI display only. Flash Crash protection still active.
        // The bot will keep trading through -10%, -20%, etc. and buy cheaper.
        /*
        if (drawdown > 10 && allocatedEquity < state.initialCapital * 0.9) {
            log('EMERGENCY', '🚨 STOP-LOSS TRIGGERED @ -10% DRAWDOWN', 'error');
            log('EMERGENCY', `Initial: $${state.initialCapital.toFixed(2)} | Current: $${allocatedEquity.toFixed(2)}`, 'error');
 
            // Cancel all orders
            await cancelAllOrders();
            state.emergencyStop = true;
            saveState();
 
            io.emit('emergency_stop', {
                drawdown,
                initialCapital: state.initialCapital,
                currentEquity: allocatedEquity
            });
        }
        */
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

// Phase 31: PRODUCTION SAFETY GUARDRAILS
// Prevents over-exposure by limiting BUY orders when USDT is low or inventory is high
// P0 FIX: NOW DYNAMIC based on Geopolitical Defense Level
async function shouldPauseBuys() {
    try {
        // P0 FIX: Use Allocated Financials for correct isolation
        const fin = await getDetailedFinancialsCached(1000);
        if (!fin) return { pause: false }; // Fail open if no data

        const equity = fin.totalEquity; // Allocated Equity
        const currentPrice = state.currentPrice || 0;

        // DYNAMIC LIMITS (Context Aware)
        // ---------------------------------------------------------
        // Level -1 (Inflationary): Floor 2% (Gas only), Cap 98% (All in)
        // Level 0  (Normal):       Floor 15%, Cap 70% (Standard)
        // Level 1  (Defensive):    Floor 25%, Cap 50% (Cautious)
        // Level 2  (Crisis):       Floor 50%, Cap 30% (Cash is King)
        // ---------------------------------------------------------

        // 1. Get Context (Lightweight if possible, fallback to state)
        let defenseLevel = 0;
        try {
            // Try to get cached regime if fresh, else detect
            // We need EMA200 for accurate context
            const regime = await detectMarketRegime();
            const geo = checkGeopoliticalContext(regime.regime, currentPrice, regime.ema200);
            defenseLevel = geo.defenseLevel;
        } catch (e) {
            // Fallback to existing state if detection fails to avoid blocking
            // (Assumes state.marketRegime is reasonably fresh)
            defenseLevel = 0;
        }

        // 2. Set Dynamic Thresholds
        let effectiveFloor = 0.15; // Default (USDT_FLOOR_PERCENT)
        let effectiveCap = 0.70;   // Default (INVENTORY_CAP_PERCENT)

        if (defenseLevel === -1) {
            effectiveFloor = 0.10; // 10% USDT Floor (Raised from 2% to preserve dry powder)
            effectiveCap = 0.90;   // 90% Inventory Cap (Lowered from 98% for balance)
        } else if (defenseLevel === 1) {
            effectiveFloor = 0.25;
            effectiveCap = 0.50;
        } else if (defenseLevel >= 2) {
            effectiveFloor = 0.50;
            effectiveCap = 0.30;
        }

        const freeUSDT = fin.freeUSDT; // Allocated Free USDT
        const baseValueUSDT = fin.btcValueUSDT; // Allocated Base Value
        const realBaseTotal = fin.btcTotal;      // Total coins on exchange
        const dustThreshold = pairPreset.dustThreshold || 0;

        // Guard 1: USDT Floor - Ensure we don't run out of ammo (Dynamic)
        if (freeUSDT < equity * effectiveFloor) {
            // P0 DUST EXCEPTION: If we have NO inventory (or just dust), we SHOULD buy even if USDT is low.
            if (realBaseTotal <= dustThreshold) {
                log('STRATEGY', `⚠️ USDT below floor, but inventory is DUST (${realBaseTotal.toFixed(6)}). Allowing BUY to resume cycle.`, 'warning');
            } else {
                return {
                    pause: true,
                    reason: `USDT_FLOOR_DYNAMIC (Free: $${freeUSDT.toFixed(2)} < Floor: $${(equity * effectiveFloor).toFixed(2)} [${(effectiveFloor * 100).toFixed(0)}% @ Def:${defenseLevel}])`
                };
            }
        }

        // Guard 2: Inventory Cap - Limit exposure to BASE_ASSET (Dynamic)
        if (baseValueUSDT > equity * effectiveCap) {
            return {
                pause: true,
                reason: `INVENTORY_CAP_DYNAMIC (${((baseValueUSDT / equity) * 100).toFixed(1)}% > ${(effectiveCap * 100).toFixed(0)}% [Def: ${defenseLevel}])`
            };
        }

        // Guard 3: SMART DCA - Prevent buying above average cost when underwater
        // Only applies when we have inventory AND price is higher than our avg cost
        // P0 FIX: Ignore if we only have dust (Fixes SOL Block during rallies)
        if (state.inventory && state.inventory.length > 0 && realBaseTotal > dustThreshold) {
            const invReport = calculateInventoryReport();
            const avgCost = invReport.avgCost;

            // DYNAMIC DCA BUFFER: Based on pair's volatility (spacingNormal)
            // Formula: 1 + (spacingNormal * 2.5) 
            // BTC: 1 + (0.005 * 2.5) = 1.0125 → clamped to 1.5%
            // SOL: 1 + (0.010 * 2.5) = 1.025 (2.5%)
            // DOGE: 1 + (0.012 * 2.5) = 1.03 (3%)
            const dynamicBuffer = 1 + (pairPreset.spacingNormal * 2.5);
            let DCA_BUFFER = Math.max(1.015, Math.min(dynamicBuffer, 1.05)); // Clamp between 1.5% and 5%

            // === PROGRESSIVE BUFFER RELAXATION ===
            // In sustained bull markets, gradually relax the buffer to allow accumulation
            // This prevents the bot from being stuck forever when price never returns to avg cost
            if (avgCost > 0 && currentPrice > avgCost * DCA_BUFFER) {
                // Initialize blocking timer if not set
                if (!state.dcaBlockStartTime) {
                    state.dcaBlockStartTime = Date.now();
                }

                const hoursBlocking = (Date.now() - state.dcaBlockStartTime) / (1000 * 60 * 60);

                // Progressive bump: +0.5% per 6 hours of blocking, max +5% total bump
                // 6h = +0.5%, 12h = +1%, 24h = +2%, 2.5 days = +5% (max)
                const stalenessBump = Math.min(hoursBlocking / 12, 5) * 0.01;
                DCA_BUFFER = DCA_BUFFER + stalenessBump;

                // Cap effective buffer at 12% to allow entry in strong rallies
                DCA_BUFFER = Math.min(DCA_BUFFER, 1.12);

                // Log relaxation if significant (> 0.1%)
                if (stalenessBump > 0.001) {
                    log('SMART_DCA', `📈 Bull market adaptation: Buffer relaxed to ${((DCA_BUFFER - 1) * 100).toFixed(1)}% after ${hoursBlocking.toFixed(1)}h blocking`, 'info');
                }
            } else {
                // Price is within acceptable range - reset the blocking timer
                state.dcaBlockStartTime = null;
            }

            // Final check with (potentially relaxed) buffer
            if (avgCost > 0 && currentPrice > avgCost * DCA_BUFFER) {
                // Still above threshold even with relaxation - block the buy
                const pctAbove = ((currentPrice / avgCost) - 1) * 100;
                const bufferPct = ((DCA_BUFFER - 1) * 100).toFixed(1);
                log('SMART_DCA', `⚠️ Price $${formatPriceLog(currentPrice)} is ${pctAbove.toFixed(1)}% above avg cost $${formatPriceLog(avgCost)} (Buffer: ${bufferPct}%) - BLOCKING NEW BUYS`, 'warning');
                return {
                    pause: true,
                    reason: `SMART_DCA (Price ${pctAbove.toFixed(1)}% > AvgCost. Buffer: ${bufferPct}%. Waiting for dip.)`
                };
            } else {
                // Price is now within the (relaxed) buffer - allow buying and reset timer
                state.dcaBlockStartTime = null;
            }
        }

        return { pause: false };
    } catch (e) {
        console.error('>> [ERROR] shouldPauseBuys check failed:', e.message);
        return { pause: false }; // Fail open to not block trading
    }
}

// PHASE 4: Inventory Report (Weekly Metrics)
function calculateInventoryReport() {
    if (!state.inventory || state.inventory.length === 0) {
        return { totalAmount: 0, avgCost: 0, currentValue: 0, unrealizedPnL: 0 };
    }
    const totalAmount = state.inventory.reduce((sum, lot) => sum + (lot.remaining || 0), 0);
    const totalCost = state.inventory.reduce((sum, lot) => sum + ((lot.price || 0) * (lot.remaining || 0)), 0);
    const avgCost = totalAmount > 0 ? totalCost / totalAmount : 0;
    const currentValue = totalAmount * (state.currentPrice || 0);
    const unrealizedPnL = currentValue - totalCost;
    return { totalAmount, avgCost, currentValue, unrealizedPnL };
}

// PHASE 5: AUTOMATIC CAPITAL CHANGE DETECTION
// Detects deposits/withdrawals by comparing current equity to last known value
// Threshold: 3% change without corresponding trades = deposit/withdrawal
async function detectCapitalChange() {
    try {
        const currentEquity = await getGlobalEquity() * CAPITAL_ALLOCATION;
        const now = Date.now();

        // Initialize on first run
        if (!state.lastKnownEquity || !state.lastEquityCheck) {
            state.lastKnownEquity = currentEquity;
            state.lastEquityCheck = now;
            if (!state.capitalHistory) state.capitalHistory = [];
            saveState();
            return null;
        }

        // Calculate change since last check
        const changePct = Math.abs((currentEquity - state.lastKnownEquity) / state.lastKnownEquity);
        const changeAmount = currentEquity - state.lastKnownEquity;

        // Only trigger if change > 3% (significant deposit/withdrawal)
        // and enough time has passed (avoid false positives from volatility)
        const timeSinceLastCheck = now - state.lastEquityCheck;
        const minCheckInterval = 5 * 60 * 1000; // 5 minutes minimum

        if (changePct > 0.03 && timeSinceLastCheck > minCheckInterval) {
            // Calculate expected profit from trades since last check
            const recentTrades = (state.filledOrders || []).filter(
                o => o.timestamp > state.lastEquityCheck && o.side === 'sell'
            );
            const recentProfit = recentTrades.reduce((sum, o) => sum + (o.profit || 0), 0);

            // If change is much larger than profit from trades → deposit/withdrawal
            const unexplainedChange = changeAmount - recentProfit;

            if (Math.abs(unexplainedChange) > currentEquity * 0.02) {
                const eventType = unexplainedChange > 0 ? 'DEPOSIT' : 'WITHDRAWAL';
                const eventAmount = Math.abs(unexplainedChange);

                // Log the event
                console.log(`>> [CAPITAL] ${eventType} DETECTED: $${eventAmount.toFixed(2)} USDT`);
                log('CAPITAL', `📊 ${eventType} detected: $${eventAmount.toFixed(2)} USDT`, 'info');

                // Add to capital history
                if (!state.capitalHistory) state.capitalHistory = [];
                state.capitalHistory.push({
                    type: eventType,
                    amount: eventAmount,
                    timestamp: now,
                    equityBefore: state.lastKnownEquity,
                    equityAfter: currentEquity
                });

                // ADJUST INITIAL CAPITAL for accurate APY
                // Add deposits, subtract withdrawals from initial capital
                if (eventType === 'DEPOSIT') {
                    state.initialCapital = (state.initialCapital || 0) + eventAmount;
                    console.log(`>> [CAPITAL] Initial capital adjusted to: $${state.initialCapital.toFixed(2)}`);
                } else {
                    // For withdrawals: don't reduce below current equity
                    const newInitial = Math.max(currentEquity, (state.initialCapital || 0) - eventAmount);
                    state.initialCapital = newInitial;
                    console.log(`>> [CAPITAL] Initial capital adjusted to: $${state.initialCapital.toFixed(2)}`);
                }

                saveState();
            }
        }

        // Always update last known values
        state.lastKnownEquity = currentEquity;
        state.lastEquityCheck = now;

        return { currentEquity, changePct, changeAmount };

    } catch (e) {
        console.error('>> [ERROR] detectCapitalChange:', e.message);
        return null;
    }
}

// PHASE 5: Time-Weighted APY Calculation
// Considers deposits/withdrawals for accurate APY
function calculateAccurateAPY() {
    const profit = state.totalProfit || 0;
    const initialCapital = state.initialCapital || 100;
    const firstTrade = state.firstTradeTime || state.startTime;
    const daysActive = Math.max(1, (Date.now() - firstTrade) / (1000 * 60 * 60 * 24));

    // Simple ROI
    const roi = (profit / initialCapital) * 100;

    // Annualized APY
    const dailyReturn = roi / daysActive;
    const projectedAnnual = dailyReturn * 365;

    return {
        roi: roi.toFixed(2),
        daysActive: daysActive.toFixed(1),
        dailyAvg: dailyReturn.toFixed(4),
        projectedAPY: projectedAnnual.toFixed(2),
        initialCapital: initialCapital.toFixed(2),
        totalDeposits: (state.capitalHistory || []).filter(e => e.type === 'DEPOSIT').length,
        totalWithdrawals: (state.capitalHistory || []).filter(e => e.type === 'WITHDRAWAL').length
    };
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
                    // CRITICAL: Use average fill price and ACTUAL filled amount
                    // P0 FIX: Type Safety (Strings to Floats)
                    const realFillPrice = parseFloat(info.average || info.price);
                    const filledAmount = parseFloat(info.filled || order.amount);

                    // Merge new data with order metadata
                    await handleOrderFill({ ...order, amount: filledAmount }, realFillPrice);
                }
            } catch (e) {
                // Order might be gone, assume filled if not in openOrders? 
                // Safer to ignore or check trades. For now, skip.
            } finally {
                processingOrders.delete(order.id);
            }
        }

        // FIX: Race Condition - Refetch open orders to catch any created during handleOrderFill
        const openOrdersAfter = await binance.fetchOpenOrders(CONFIG.pair);
        const openIdsAfter = new Set(openOrdersAfter.map(o => o.id));

        // Update active list with FRESH data
        state.activeOrders = state.activeOrders.filter(o => openIdsAfter.has(o.id));
        saveState();
        emitGridState();
        updateBalance(); // Keep balance fresh

    } catch (e) {
        console.error('>> [ERROR] Check Failed:', e.message);
    }
}

async function handleOrderFill(order, fillPrice) {
    if (!order) return;

    // P0 FIX: Strict Type Safety (Prevent NaN pollution)
    const amt = parseFloat(order.amount);
    const px = parseFloat(fillPrice);

    if (!Number.isFinite(amt) || !Number.isFinite(px)) {
        log('ERROR', `Bad fill data: amount=${order.amount} price=${fillPrice}`, 'error');
        return;
    }

    // Assign sanitized values
    order.amount = amt;
    fillPrice = px;

    // P0 FIX: Remove filled order from activeOrders immediately (prevents phantom locked funds)
    state.activeOrders = (state.activeOrders || []).filter(o => o.id !== order.id);
    saveState();

    // FIX: Only SELL orders realize profit. BUY orders are just entries.
    let profit = 0;

    // SCOPE FIX: Declare these at function level for orderRecord access
    let sellAvgCost = null;
    let sellSpreadPct = null;
    let sellMatchedLots = [];
    let sellTotalFees = 0; // FIX: Declare at function scope for orderRecord access
    let sellMatchType = null; // FIX: Store match quality (EXACT/CLOSE/FALLBACK) for UI

    if (order.side === 'buy') {
        // INVENTORY TRACKING: Add new lot
        if (!state.inventory) state.inventory = [];
        // P0 FIX: Normalize Fee to USDT for valid FIFO
        const fee = estimateFeeUSDT(fillPrice, order.amount);
        state.inventory.push({
            id: order.id,
            price: fillPrice,
            amount: order.amount, // Track full amount
            remaining: order.amount, // Amount available to sell
            fee: fee,
            timestamp: Date.now()
        });
        log('INVENTORY', `➕ Added Lot: ${order.amount.toFixed(6)} ${BASE_ASSET} @ $${fillPrice.toFixed(2)}`, 'info');
    }
    else if (order.side === 'sell') {
        // INVENTORY TRACKING: Consume lots (FIFO)
        if (!state.inventory) state.inventory = [];

        let remainingToSell = order.amount;
        let costBasis = 0;
        let entryFees = 0; // Track entry fees from consumed lots
        let consumedLots = 0;
        const matchedLots = []; // Track which lots were consumed for transparency

        // Iterate mutable inventory
        // FILTER: Only consider lots with remaining balance
        // SORT/ITERATION: Depends on ACCOUNTING_METHOD
        // SPREAD_MATCH = Find lot where buyPrice * (1+spread) ≈ sellPrice (Best for Grid)
        // FIFO = Start from Index 0 (Oldest)
        // LIFO = Start from Index Length-1 (Newest)

        const inventoryCandidates = [];
        // Map to indices to modify original array
        state.inventory.forEach((lot, index) => {
            if (lot.remaining > 0.00000001) {
                inventoryCandidates.push({ ...lot, originalIndex: index });
            }
        });

        // === SPREAD_MATCH: Priority Sort by Sell Price Match ===
        // For grid trading, each sell was placed when a buy filled.
        // The sell price = buyPrice * (1 + gridSpacing)
        // So we reverse: expectedBuyPrice = sellPrice / (1 + spacing)
        // Then find the lot closest to that expected buy price.

        if (ACCOUNTING_METHOD === 'SPREAD_MATCH') {
            // Use the order's spacing if available, else default
            const spacing = order.spacing || CONFIG.gridSpacing || 0.01;
            const expectedBuyPrice = fillPrice / (1 + spacing);
            const tolerance = expectedBuyPrice * 0.005; // 0.5% tolerance for rounding

            // Sort by proximity to expected buy price (closest first)
            inventoryCandidates.sort((a, b) => {
                const diffA = Math.abs(a.price - expectedBuyPrice);
                const diffB = Math.abs(b.price - expectedBuyPrice);
                return diffA - diffB;
            });

            // Log the match attempt for transparency
            if (inventoryCandidates.length > 0) {
                const bestMatch = inventoryCandidates[0];
                const priceDiff = Math.abs(bestMatch.price - expectedBuyPrice);
                const matchQuality = priceDiff <= tolerance ? '✅ EXACT' : (priceDiff <= expectedBuyPrice * 0.02 ? '⚠️ CLOSE' : '❌ FALLBACK');
                // Store match type for orderRecord (without emoji)
                sellMatchType = priceDiff <= tolerance ? 'EXACT' : (priceDiff <= expectedBuyPrice * 0.02 ? 'CLOSE' : 'FALLBACK');
                log('SPREAD_MATCH', `Sell @ $${fillPrice.toFixed(2)} → Expected Buy: $${expectedBuyPrice.toFixed(2)} | Best Lot: $${bestMatch.price.toFixed(2)} | ${matchQuality}`, matchQuality.includes('✅') ? 'success' : 'warning');
            }
        } else if (ACCOUNTING_METHOD === 'LIFO') {
            // Newest First (Sort DESC by timestamp)
            inventoryCandidates.sort((a, b) => b.timestamp - a.timestamp);
        } else {
            // FIFO (Default): Oldest First (Sort ASC by timestamp)
            inventoryCandidates.sort((a, b) => a.timestamp - b.timestamp);
        }

        for (const candidate of inventoryCandidates) {
            if (remainingToSell <= 0.00000001) break;

            // Access ACTUAL lot in state by index reference
            const lot = state.inventory[candidate.originalIndex];

            // Double check it wasn't modified by another pass (unlikely in single thread but safe)
            if (lot.remaining <= 0) continue;

            const take = Math.min(remainingToSell, lot.remaining);
            costBasis += (take * lot.price);

            // Calculate proportional entry fee for the amount taken
            if (lot.fee && lot.amount > 0) {
                entryFees += (take / lot.amount) * lot.fee;
            }

            // MATH FIX: Prevent floating point dust
            const remainingAfter = Number((lot.remaining - take).toFixed(8));

            // NEW: Track matched lot for transparency
            matchedLots.push({
                lotId: lot.id,
                buyPrice: lot.price,
                amountTaken: take,
                remainingAfter: remainingAfter,
                timestamp: lot.timestamp
            });

            lot.remaining = remainingAfter;
            remainingToSell = Number((remainingToSell - take).toFixed(8));
            consumedLots++;
        }

        // P0 FIX: Inventory Shortfall Handling
        if (remainingToSell > 0.00000001) {
            log('WARN', `Inventory shortfall: Missing ${remainingToSell.toFixed(8)} ${BASE_ASSET}. Estimating cost basis.`, 'warning');
            // Estimate cost for the missing portion
            const estimatedBuyPrice = fillPrice / (1 + CONFIG.gridSpacing);
            costBasis += (remainingToSell * estimatedBuyPrice);
            entryFees += (remainingToSell * estimatedBuyPrice * CONFIG.tradingFee);
            remainingToSell = 0;
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

            // ENGINEER FIX 3: Recalculate Fees with Estimated Cost Basis (Avoids using stale/zero entry fees)
            const estimatedEntryFees = estimatedCostBasis * CONFIG.tradingFee;
            const estimatedTotalFees = sellFee + estimatedEntryFees;

            const estimatedGross = sellRevenue - estimatedCostBasis;
            profit = estimatedGross - estimatedTotalFees;

            log('WARN', `🔧 Corrected Anomaly: Gross $${estimatedGross.toFixed(4)} - Fees $${estimatedTotalFees.toFixed(4)} = Net $${profit.toFixed(4)}`, 'warning');
        }

        // Calculate spread for visibility and ASSIGN to function-scoped vars
        const avgCost = costBasis / order.amount;
        const spreadPct = ((fillPrice - avgCost) / avgCost * 100);

        // Store in function-scoped variables for orderRecord
        sellAvgCost = avgCost;
        sellSpreadPct = spreadPct;
        sellMatchedLots = matchedLots;
        sellTotalFees = totalFees; // FIX: Store in function-scoped variable

        // TRACEABILITY LOG: Show exactly which lots were consumed
        if (matchedLots.length > 0) {
            const lotDetails = matchedLots.map(l => `#${l.lotId} @ $${l.buyPrice.toFixed(2)} (x${l.amountTaken.toFixed(5)} | Rem: ${l.remainingAfter.toFixed(5)})`).join(' + ');
            log('TRACE', `Matched Lots: ${lotDetails}`, 'info');
        }

        log('PROFIT', `${ACCOUNTING_METHOD} | Cost: $${avgCost.toFixed(2)} → Sell: $${fillPrice.toFixed(2)} | Spread: ${spreadPct.toFixed(2)}% | Fees: $${totalFees.toFixed(4)} | Net: $${profit.toFixed(4)}`, profit > 0 ? 'success' : 'warning');
    }

    // Update State
    state.totalProfit += profit;
    // CRITICAL FIX: Mark as Net Profit so loadState doesn't deduct fees again!
    // NEW: Include cost basis info for Transaction Log transparency
    const orderRecord = {
        ...order,
        fillPrice,
        profit,
        timestamp: Date.now(),
        isNetProfit: true
    };
    // Add cost basis details for sells (using function-scoped vars)
    if (order.side === 'sell' && sellAvgCost !== null) {
        orderRecord.costBasis = sellAvgCost;
        orderRecord.spreadPct = sellSpreadPct;
        orderRecord.matchedLots = sellMatchedLots;
        orderRecord.fees = sellTotalFees; // FIX: Use function-scoped variable
        orderRecord.matchMethod = ACCOUNTING_METHOD; // Store method used
        orderRecord.matchType = sellMatchType; // FIX: Store match quality (EXACT/CLOSE/FALLBACK) for UI
    }
    state.filledOrders.push(orderRecord);

    // MEMORY LEAK PROTECTION: Keep last 1000 orders only
    if (state.filledOrders.length > 1000) {
        const removed = state.filledOrders.slice(0, state.filledOrders.length - 1000);
        const removedProfit = removed.reduce((sum, o) => sum + (o.profit || 0), 0);

        state.accumulatedProfit = (state.accumulatedProfit || 0) + removedProfit;
        log('SYSTEM', `📦 Archived ${removed.length} orders. Moved $${removedProfit.toFixed(4)} profit to Deep Storage.`);

        state.filledOrders = state.filledOrders.slice(-1000);
    }

    state.lastFillTime = Date.now();

    // P0 FIX: Save state immediately to persist profit
    saveState();

    // Enhanced execution log with cost basis for sells (using function-scoped vars)
    if (order.side === 'sell' && sellAvgCost !== null) {
        const profitEmoji = profit > 0 ? '💰' : '📉';
        log('EXECUTION', `${profitEmoji} SELL @ $${fillPrice.toFixed(2)} | Cost: $${sellAvgCost.toFixed(2)} | Spread: ${sellSpreadPct.toFixed(2)}% | Profit: $${profit.toFixed(4)}`, profit > 0 ? 'success' : 'warning');
    } else {
        log('EXECUTION', `📥 BUY FILLED @ $${fillPrice.toFixed(2)}`, 'success');
    }
    io.emit('trade_success', { side: order.side, price: fillPrice, profit });

    // Re-place opposite order
    const newSide = order.side === 'buy' ? 'sell' : 'buy';
    const newPrice = order.side === 'buy'
        ? fillPrice * (1 + (order.spacing || CONFIG.gridSpacing)) // P1 FIX: Respect Persistence
        : fillPrice * (1 - (order.spacing || CONFIG.gridSpacing));

    // === SMART FILTERS USING ALL INDICATORS ===
    const signalScore = state.marketCondition?.signalScore || 0;
    const recommendation = state.marketCondition?.recommendation || 'HOLD';
    const macdSignal = state.marketCondition?.macd?.signal || 'NEUTRAL';
    const stochRSI = state.marketCondition?.stochRSI || 50;

    // BUY FILTER: Don't buy when signals say SELL
    if (newSide === 'buy') {
        // Phase 31: PRODUCTION GUARDRAILS - Check USDT Floor & Inventory Cap
        const guard = await shouldPauseBuys();
        if (guard.pause) {
            log('GUARD', `🛡️ BUY BLOCKED: ${guard.reason}`, 'warning');
            return;
        }

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
        const allOpenOrders = await binance.fetchOpenOrders(CONFIG.pair);

        // CRITICAL P0: Isolation - Only process orders belonging to THIS bot AND THIS PAIR
        const myPrefix = `${BOT_ID}_${PAIR_ID}_`;
        // Use P0 Robust Helper
        const openOrders = allOpenOrders.filter(o => getClientId(o).startsWith(myPrefix));

        const ignoredCount = allOpenOrders.length - openOrders.length;
        if (ignoredCount > 0) {
            console.log(`>> [ISOLATION] Ignored ${ignoredCount} foreign/manual orders.`);
        }

        const openIds = new Set(openOrders.map(o => o.id));

        // 1. Remove local orders that are no longer open on exchange
        // CRITICAL P0 FIXED: Check fillPrice to prevent NaN in profit calculation
        const missingOrders = state.activeOrders.filter(o => !openIds.has(o.id));

        for (const missingOrder of missingOrders) {
            try {
                // Check if it was filled
                const order = await adaptiveHelpers.resilientAPICall(
                    () => binance.fetchOrder(missingOrder.id, CONFIG.pair),
                    3,
                    `Check missing order ${missingOrder.id}`
                );

                if (order.status === 'closed' || order.status === 'filled') {
                    // It was filled! Handle it.
                    log('SYNC', `Order ${missingOrder.id} filled while offline. Processing...`, 'success');

                    // P0 FIX: Ensure fillPrice is defined AND use ACTUAL filled amount
                    const fillPrice = order.average || order.price || missingOrder.price;
                    // P0 FIX: Use filled amount to preserve FIFO accuracy (vs using order.amount which is requested)
                    const filledAmount = order.filled || order.amount || missingOrder.amount;

                    await handleOrderFill({
                        ...missingOrder, // Preserve local metadata (level, spacing)
                        side: order.side,
                        amount: filledAmount,
                        status: 'open',
                        timestamp: order.timestamp || Date.now()
                    }, fillPrice);

                } else if (order.status === 'canceled') {
                    log('SYNC', `Order ${missingOrder.id} was canceled. Removing.`);
                }
            } catch (e) {
                log('WARN', `Could not verify missing order ${missingOrder.id}: ${e.message}`);
            }
        }

        // 2. Rebuild active list while PRESERVING METADATA (P0 Fix)
        // We must keep 'level', 'spacing', and other internal flags that API doesn't return
        // P0 FIX: Re-fetch open orders to include any created by handleOrderFill
        const allOpenOrders2 = await binance.fetchOpenOrders(CONFIG.pair);
        const openOrders2 = allOpenOrders2.filter(o => getClientId(o).startsWith(myPrefix));

        // 2. Rebuild active list while PRESERVING METADATA (P0 Fix)
        // We must keep 'level', 'spacing', and other internal flags that API doesn't return
        const prevOrders = new Map((state.activeOrders || []).map(o => [o.id, o]));
        let adoptedCount = 0;

        state.activeOrders = openOrders2.map(o => {
            const old = prevOrders.get(o.id) || {};

            // Logic Check: If it's NEW (not in prev), it's an adopted orphan
            if (!prevOrders.has(o.id)) {
                adoptedCount++; // P0 Fix: Count orphans correctly during map
            }

            return {
                ...old, // Keep internal state (level, strategy details)
                id: o.id,
                side: o.side,
                price: parseFloat(o.price), // P0 FIX: Sanitize Types
                amount: parseFloat(o.amount), // P0 FIX: Sanitize Types
                status: 'open',
                timestamp: o.timestamp,
                clientOrderId: getClientId(o), // P0 FIX: Robust ID Persistence
                spacing: old.spacing ?? CONFIG.gridSpacing, // P0 FIX: Default Spacing for Orphans
                level: old.level ?? null // P0 FIX: Default Level for Orphans
            };
        });

        if (adoptedCount > 0) {
            log('SYNC', `ADOPTED ${adoptedCount} ORPHAN ORDERS (Restored metadata where possible)`);
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
        // ENGINEER FIX: Increase lookback to 500 to recover "lost" trades after a crash
        const trades = await binance.fetchMyTrades(CONFIG.pair, undefined, 500);
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

                // HONESTY FIX: Don't estimate profits for synced trades
                // Only real-time handleOrderFill() has accurate LIFO profit
                // Synced trades show profit=0; run recalculate_profit.js for totals
                const estimatedProfit = 0;

                // Add to history
                state.filledOrders.push({
                    id: tradeId,
                    side: trade.side,
                    price: trade.price,
                    amount: trade.amount,
                    timestamp: trade.timestamp,
                    profit: estimatedProfit,
                    status: 'filled',
                    isEstimated: true, // Synced from exchange history, not real-time LIFO
                    isNetProfit: false // Estimated, not FIFO-calculated
                });
                knownIds.add(tradeId); // Prevent duplicates in this loop
                addedCount++;
            }
            // NOTE: Removed backfill "repair" that was inventing fake profits
            // Real profit comes from handleOrderFill LIFO or recalculate_profit.js
        }

        if (addedCount > 0) {
            // Sort by date desc
            state.filledOrders.sort((a, b) => b.timestamp - a.timestamp);
            // Keep size manageable (Increased to 1000 for robust 'Yesterday' & Weekly stats)
            if (state.filledOrders.length > 1000) {
                const removed = state.filledOrders.slice(1000);
                const removedProfit = removed.reduce((sum, o) => sum + (o.profit || 0), 0);

                state.accumulatedProfit = (state.accumulatedProfit || 0) + removedProfit;
                if (removedProfit > 0) {
                    log('SYNC', `📦 Archived ${removed.length} orders. Moved $${removedProfit.toFixed(4)} profit to Deep Storage.`);
                }

                state.filledOrders = state.filledOrders.slice(0, 1000);
            }
            log('SYNC', `Imported ${addedCount} historical trades from exchange`, 'success');
            saveState();
            // ENGINEER FIX: Force UI refresh to show recovered profit immediately
            io.emit('init_state', state);
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
        // DEBUG: Check what time the bot THINKS it reset
        const timeSinceResetSec = ((Date.now() - (state.lastGridReset || 0)) / 1000).toFixed(1);
        log('DEBUG', `Checking Grid Health. Last Reset: ${state.lastGridReset} (${timeSinceResetSec}s ago)`);

        // FAILSAFE: If lastGridReset is missing/zero, set it to NOW to stop the loop
        if (!state.lastGridReset || state.lastGridReset === 0) {
            log('WARNING', '⚠️ State corruption detected: lastGridReset is 0. Setting to NOW to prevent infinite loop.');
            state.lastGridReset = Date.now();
            saveState();
        }

        // Check if Buy Protection is active (USDT Floor)
        // This prevents false positive IMBALANCE_LOW_BUYS when no buys is intentional
        const buyStatus = await shouldPauseBuys();
        const adaptiveConfig = {
            driftTolerance: driftTolerance,
            buyProtectionActive: buyStatus.pause
        };

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

    // PHASE 4: Track In-Range vs Out-of-Range for Weekly Metrics
    if (!state.metrics) state.metrics = { ticksInRange: 0, ticksOutOfRange: 0, buyHoldStartPrice: 0, metricsStartTime: 0 };
    if (state.metrics.buyHoldStartPrice === 0 && currentPrice > 0) {
        state.metrics.buyHoldStartPrice = currentPrice;
        state.metrics.metricsStartTime = Date.now();
    }
    const isInRange = currentPrice >= minPrice && currentPrice <= maxPrice;
    if (isInRange) state.metrics.ticksInRange++;
    else state.metrics.ticksOutOfRange++;

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
    // Calculate APY metrics for dashboard
    const apyData = calculateAccurateAPY();

    io.emit('grid_state', {
        entryPrice: state.entryPrice,
        currentPrice: state.currentPrice,
        orders: state.activeOrders,
        profit: state.totalProfit,
        // NEW: APY Metrics for Dashboard
        roi: parseFloat(apyData.roi),
        projectedAPY: parseFloat(apyData.projectedAPY),
        daysActive: parseFloat(apyData.daysActive),
        initialCapital: parseFloat(apyData.initialCapital),
        capitalEvents: (state.capitalHistory || []).length
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
            const totalEquity = await getGlobalEquity();

            if (totalEquity > 0) {
                // Apply CAPITAL_ALLOCATION - this bot's share of total
                state.initialCapital = totalEquity * CAPITAL_ALLOCATION;

                // PHASE 5: Initialize capitalHistory with first entry
                state.capitalHistory = [{
                    amount: state.initialCapital,
                    timestamp: Date.now(),
                    reason: 'INITIAL_CAPITAL'
                }];

                console.log(`>> [AUTO] Universal Equity (USDT+BTC+SOL): $${totalEquity.toFixed(2)}`);
                console.log(`>> [AUTO] Allocation: ${(CAPITAL_ALLOCATION * 100).toFixed(0)}%`);
                console.log(`>> [AUTO] This Pair's Capital: $${state.initialCapital.toFixed(2)}`);
                saveState();
            }
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
        if (isRebalancing) return; // ✅ Anti-Storm Lock
        if (state.isPaused) return; // ✅ Respect Pauses

        if (state.activeOrders.length === 0 && !state.emergencyStop) {
            log('AUTO', 'No active orders detected - Reinitializing grid automatically', 'warning');
            await initializeGrid(true);
        }
    }, 60000); // Check every minute

    // PHASE 5: CAPITAL CHANGE DETECTION (Every 5 minutes)
    // Detects deposits/withdrawals and adjusts APY calculation automatically
    setInterval(async () => {
        await detectCapitalChange();
    }, 5 * 60 * 1000); // Check every 5 minutes

    // === DAILY PERFORMANCE REPORT ===
    const REPORTS_DIR = path.join(__dirname, 'reports');
    if (!fs.existsSync(REPORTS_DIR)) {
        fs.mkdirSync(REPORTS_DIR, { recursive: true });
    }

    function generateDailyReport() {
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const reportFile = path.join(REPORTS_DIR, `daily_report_${BOT_ID}_${PAIR_ID}_${dateStr}.txt`);

        // Calculate today's metrics
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const todayTrades = (state.filledOrders || []).filter(o => o.timestamp >= todayStart);
        const todaySells = todayTrades.filter(o => o.side === 'sell');
        const todayProfit = todaySells.reduce((sum, o) => sum + (o.profit || 0), 0);
        const todayWins = todaySells.filter(o => o.profit > 0).length;
        const todayWinRate = todaySells.length > 0 ? (todayWins / todaySells.length * 100).toFixed(1) : 'N/A';

        // NEW: Match Quality Metrics
        const exactMatches = todaySells.filter(o => o.matchType === 'EXACT' || o.matchMethod === 'SPREAD_MATCH').length;
        const closeMatches = todaySells.filter(o => o.matchType === 'CLOSE').length;
        const fallbackMatches = todaySells.filter(o => o.matchType === 'FALLBACK').length;
        const matchQualityPct = todaySells.length > 0
            ? `${((exactMatches / todaySells.length) * 100).toFixed(0)}% EXACT | ${((closeMatches / todaySells.length) * 100).toFixed(0)}% CLOSE | ${((fallbackMatches / todaySells.length) * 100).toFixed(0)}% FALLBACK`
            : 'N/A';

        // NEW: Fees & Spread Metrics
        const todayFees = todaySells.reduce((sum, o) => sum + (o.fees || 0), 0);
        const avgSpread = todaySells.length > 0
            ? (todaySells.reduce((sum, o) => sum + (o.spreadPct || 0), 0) / todaySells.length).toFixed(2)
            : 'N/A';

        // NEW: Best & Worst Trade
        const sortedByProfit = [...todaySells].sort((a, b) => (b.profit || 0) - (a.profit || 0));
        const bestTrade = sortedByProfit[0];
        const worstTrade = sortedByProfit[sortedByProfit.length - 1];
        const bestTradeStr = bestTrade ? `$${(bestTrade.profit || 0).toFixed(4)} @ $${(bestTrade.fillPrice || bestTrade.price || 0).toFixed(2)}` : 'N/A';
        const worstTradeStr = worstTrade ? `$${(worstTrade.profit || 0).toFixed(4)} @ $${(worstTrade.fillPrice || worstTrade.price || 0).toFixed(2)}` : 'N/A';

        // Overall metrics
        const lifetimeProfit = (state.totalProfit || 0);
        const totalProfit = lifetimeProfit; // P0 FIX: Report Lifetime Profit
        const initialCapital = state.initialCapital || 100;
        const totalROI = ((totalProfit / initialCapital) * 100).toFixed(2);
        const activeOrders = state.activeOrders?.length || 0;
        const inventoryLots = state.inventory?.length || 0;

        // Anomaly detection
        const anomalies = [];
        if (todayTrades.length === 0) anomalies.push('⚠️ No trades today');
        if (state.maxDrawdown > 15) anomalies.push(`⚠️ High drawdown: ${state.maxDrawdown.toFixed(2)}%`);
        if (state.emergencyStop) anomalies.push('🚨 EMERGENCY STOP ACTIVE');
        if (todayProfit < 0) anomalies.push(`⚠️ Negative profit today: $${todayProfit.toFixed(4)}`);

        // PHASE 4: Weekly Metrics Calculations
        const inv = calculateInventoryReport();
        const totalTicks = (state.metrics?.ticksInRange || 0) + (state.metrics?.ticksOutOfRange || 0);
        const inRangePercent = totalTicks > 0 ? ((state.metrics.ticksInRange / totalTicks) * 100).toFixed(1) : 'N/A';
        const buyHoldReturn = state.metrics?.buyHoldStartPrice > 0
            ? (((state.currentPrice - state.metrics.buyHoldStartPrice) / state.metrics.buyHoldStartPrice) * 100).toFixed(2)
            : 'N/A';
        const botBeatsHold = parseFloat(totalROI) > parseFloat(buyHoldReturn || 0);

        const report = `
╔══════════════════════════════════════════════════════════════╗
║       VANTAGE BOT [${CONFIG.pair}] - DAILY PERFORMANCE REPORT       ║
║                    ${dateStr}                                ║
╠══════════════════════════════════════════════════════════════╣
║  TODAY'S PERFORMANCE                                         ║
╠══════════════════════════════════════════════════════════════╣
  Trades Executed:      ${todayTrades.length}
  Sells (Profit Events): ${todaySells.length}
  Today's Profit:       $${todayProfit.toFixed(4)}
  Today's Fees:         $${todayFees.toFixed(4)}
  Win Rate:             ${todayWinRate}%

╠══════════════════════════════════════════════════════════════╣
║  TRADE QUALITY                                               ║
╠══════════════════════════════════════════════════════════════╣
  Match Quality:        ${matchQualityPct}
  Avg Spread:           ${avgSpread}%
  Best Trade:           ${bestTradeStr}
  Worst Trade:          ${worstTradeStr}

╠══════════════════════════════════════════════════════════════╣
║  CUMULATIVE STATS                                            ║
╠══════════════════════════════════════════════════════════════╣
  Total Profit:         $${totalProfit.toFixed(4)}
  Total ROI:            ${totalROI}%
  Max Drawdown:         ${(state.maxDrawdown || 0).toFixed(2)}%
  Initial Capital:      $${initialCapital.toFixed(2)}

╠══════════════════════════════════════════════════════════════╣
║  WEEKLY METRICS (Since ${new Date(state.metrics?.metricsStartTime || Date.now()).toISOString().split('T')[0]})  ║
╠══════════════════════════════════════════════════════════════╣
  % Time In Range:      ${inRangePercent}% (${state.metrics?.ticksInRange || 0}/${totalTicks} cycles)
  Inventory:            ${inv.totalAmount.toFixed(6)} ${CONFIG.pair.split('/')[0]}
  Avg Cost:             $${inv.avgCost.toFixed(2)}
  Unrealized PnL:       $${inv.unrealizedPnL.toFixed(4)}
  Buy & Hold Return:    ${buyHoldReturn}%
  Bot vs Hold:          ${botBeatsHold ? '🏆 BOT WINS' : '📉 HOLD WINS'} (Bot ${totalROI}% vs Hold ${buyHoldReturn}%)

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

    // Local timer variable (Do not persist to state)
    let reportTimer;

    // Schedule daily report at 11:59 PM
    function scheduleDailyReport() {
        const now = new Date();
        const next1159 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 0);

        // If already past 11:59 today, schedule for tomorrow
        if (now >= next1159) {
            next1159.setDate(next1159.getDate() + 1);
        }

        const hoursUntil = (next1159 - now) / (1000 * 60 * 60);
        console.log(`>> [REPORT] Next daily report in ${hoursUntil.toFixed(1)} hours`);

        // Clear any existing timer
        if (reportTimer) clearTimeout(reportTimer);

        reportTimer = setTimeout(() => {
            generateDailyReport();
            scheduleDailyReport(); // Reschedule for next day
        }, next1159 - now);

        log('REPORT', 'Daily report scheduler initialized');
    }

    // Call it
    scheduleDailyReport();
});

// FIX: Graceful Shutdown (Close Streams)
function shutdown() {
    log('SYSTEM', '🛑 Graceful Shutdown Initiated...');
    try {
        if (typeof logStream !== 'undefined' && logStream) logStream.end();
        if (typeof decisionStream !== 'undefined' && decisionStream) decisionStream.end();
    } catch (e) {
        console.error('Error closing logs:', e);
    }
    process.exit(0);
}

// --- DEBUG: MEMORY WATCHDOG (Prevents Silent OOM Kills) ---
setInterval(() => {
    const used = process.memoryUsage().heapUsed / 1024 / 1024;
    const rss = process.memoryUsage().rss / 1024 / 1024;

    // Only log if memory is high to avoid log spam, OR every 10 mins
    if (used > 300 || (Date.now() % 600000 < 60000)) {
        console.log(`>> [MEM] Heap: ${Math.round(used)}MB | RSS: ${Math.round(rss)}MB`);
        // Append to special debug file
        try {
            fs.appendFileSync(path.join(__dirname, 'logs', 'memory_monitor.log'),
                `[${new Date().toISOString()}] Heap: ${Math.round(used)}MB | RSS: ${Math.round(rss)}MB\n`);
        } catch (e) { }
    }
}, 60000); // Check every minute

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

process.on('unhandledRejection', (reason) => {
    const msg = `Unhandled Rejection: ${reason?.message || reason}`;
    console.error(`[CRITICAL] ${msg}`);
    try {
        fs.appendFileSync(path.join(__dirname, 'logs', 'pm2_crash_debug.log'),
            `\n[${new Date().toISOString()}] ${msg}\n`);
    } catch (e) { }
    // Do not exit, might be recoverable
});

process.on('uncaughtException', (err) => {
    const msg = `Uncaught Exception: ${err.message}\n${err.stack}`;
    console.error(`[CRITICAL] ${msg}`);
    try {
        fs.appendFileSync(path.join(__dirname, 'logs', 'pm2_crash_debug.log'),
            `\n[${new Date().toISOString()}] ${msg}\n`);
    } catch (e) { }
    log('ERROR', `Uncaught Exception: ${err.message}`, 'error');
    process.exit(1); // Force exit so PM2 restarts
});
