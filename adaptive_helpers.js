/**
 * ADAPTIVE HELPERS - Phases 2, 3, 4
 * Helper functions for fully adaptive bot intelligence
 */

// PHASE 2: Dynamic Grid Count
function calculateOptimalGridCount(capital, volatility) {
    let baseCount;

    // Scale with capital
    if (capital < 50) baseCount = 5;
    else if (capital < 150) baseCount = 8;
    else if (capital < 500) baseCount = 12;
    else if (capital < 1000) baseCount = 20;   // $50/order
    else if (capital < 2500) baseCount = 30;   // ~$80/order
    else if (capital < 5000) baseCount = 40;   // ~$125/order
    else baseCount = 50;                       // Whale Tier

    // Adjust for volatility
    if (volatility === 'HIGH') {
        baseCount = Math.max(5, Math.floor(baseCount * 0.7)); // Fewer orders in high vol
    } else if (volatility === 'LOW') {
        baseCount = Math.min(60, Math.floor(baseCount * 1.2)); // More orders in low vol
    }

    return baseCount;
}

// PHASE 2: Adaptive RSI Thresholds
function getAdaptiveRSI(marketRegime, volatility) {
    const configs = {
        'STRONG_BULL': { overbought: 80, oversold: 20 },
        'BULL': { overbought: 75, oversold: 25 },
        'WEAK_BULL': { overbought: 72, oversold: 28 },
        'SIDEWAYS': { overbought: 70, oversold: 30 },
        'WEAK_BEAR': { overbought: 68, oversold: 32 },
        'BEAR': { overbought: 65, oversold: 35 },
        'STRONG_BEAR': { overbought: 60, oversold: 40 },
        'UNKNOWN': { overbought: 70, oversold: 30 }
    };

    const config = configs[marketRegime] || configs['UNKNOWN'];

    // Wider bands in high volatility
    if (volatility === 'HIGH') {
        config.overbought += 5;
        config.oversold -= 5;
    }

    return config;
}

// PHASE 2: Adaptive Safety Margin
function getAdaptiveSafetyMargin(volatility, marketRegime) {
    let margin = 0.95; // Base 95%

    // More cautious in high volatility
    if (volatility === 'EXTREME') margin -= 0.10; // 85%
    else if (volatility === 'HIGH') margin -= 0.05; // 90%

    // Extra caution in bear markets
    if (marketRegime === 'STRONG_BEAR') margin -= 0.05;
    else if (marketRegime === 'BEAR') margin -= 0.03;

    // More aggressive in stable bull
    if (marketRegime === 'STRONG_BULL' && volatility === 'LOW') {
        margin = 0.98; // 98%
    }

    return Math.max(margin, 0.80); // Never less than 80%
}

// PHASE 2: Order Size Optimization (Pyramid Strategy)
function calculateOptimalOrderSizes(capital, gridCount, currentPrice, gridLevels) {
    const sizes = [];
    const baseSize = capital / gridCount;

    // Pyramid: bigger orders closer to current price
    for (let i = 0; i < gridLevels.length; i++) {
        const level = gridLevels[i];
        const distanceFromPrice = Math.abs(level.price - currentPrice) / currentPrice;

        // Closer to price = bigger size (up to 1.5x)
        // Further from price = smaller size (down to 0.7x)
        const sizeMultiplier = 1.5 - (distanceFromPrice * 50); // Adjust factor
        const clampedMultiplier = Math.max(0.7, Math.min(1.5, sizeMultiplier));

        sizes.push(baseSize * clampedMultiplier);
    }

    return sizes;
}

// PHASE 3: Intelligent Rebalancing Triggers
function shouldRebalance(state, analysis, regime, multiTF) {
    const triggers = [];

    // 1. Price drift (>2%)
    if (state.activeOrders.length > 0) {
        const prices = state.activeOrders.map(o => o.price);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const drift = Math.abs(state.currentPrice - ((minPrice + maxPrice) / 2)) / state.currentPrice;

        if (drift > 0.02) triggers.push('PRICE_DRIFT');
    }

    // 2. Volatility regime change
    if (state.lastVolatility && state.lastVolatility !== analysis.volatility) {
        triggers.push('VOLATILITY_SHIFT');
    }

    // 3. Market regime change
    if (state.lastRegime && state.lastRegime !== regime.regime) {
        if ((state.lastRegime.includes('BULL') && regime.regime.includes('BEAR')) ||
            (state.lastRegime.includes('BEAR') && regime.regime.includes('BULL'))) {
            triggers.push('REGIME_CHANGE');
        }
    }

    // 4. All orders filled on one side
    const buyOrders = state.activeOrders.filter(o => o.side === 'buy');
    const sellOrders = state.activeOrders.filter(o => o.side === 'sell');
    if (buyOrders.length === 0 || sellOrders.length === 0) {
        triggers.push('IMBALANCE');
    }

    // 5. Multi-timeframe divergence (low confidence)
    if (multiTF.confidence === 'LOW') {
        // Check if we've been stuck for a while
        const hoursSinceLastFill = (Date.now() - (state.lastFillTime || Date.now())) / (1000 * 60 * 60);
        if (hoursSinceLastFill > 24) {
            triggers.push('STALE_GRID');
        }
    }

    return triggers.length > 0 ? triggers : false;
}

// PHASE 3: Adaptive Technical Indicator Periods
function getAdaptiveIndicatorPeriods(volatility, marketRegime) {
    const configs = {
        'EXTREME': { rsi: 5, ema: 10, bb: 10 },   // Very fast
        'HIGH': { rsi: 7, ema: 20, bb: 10 },
        'NORMAL': { rsi: 14, ema: 50, bb: 20 },    // Standard
        'LOW': { rsi: 21, ema: 100, bb: 30 }       // Slower, smoother
    };

    return configs[volatility] || configs['NORMAL'];
}

// PHASE 3: Profit-Taking Strategy
function manageProfitTaking(totalProfit, initialCapital, state) {
    const profitPercent = (totalProfit / initialCapital) * 100;
    const actions = [];

    // Lock in half at 10%
    if (profitPercent >= 10 && !state.profitLocked10) {
        actions.push({
            type: 'LOCK_PROFIT',
            amount: totalProfit * 0.5,
            reason: '10% milestone - locking 50%'
        });
        state.profitLocked10 = true;
    }

    // Lock in 75% at 25%
    if (profitPercent >= 25 && !state.profitLocked25) {
        actions.push({
            type: 'LOCK_PROFIT',
            amount: totalProfit * 0.75,
            reason: '25% milestone - locking 75%'
        });
        state.profitLocked25 = true;
    }

    // Trailing stop loss on profits
    if (profitPercent >= 15) {
        const trailingStop = profitPercent - 5; // Protect 5% below peak
        if (state.peakProfit && profitPercent < trailingStop) {
            actions.push({
                type: 'TRAILING_STOP',
                reason: `Profit dropped from ${state.peakProfit.toFixed(1)}% to ${profitPercent.toFixed(1)}%`
            });
        }

        // Update peak
        if (!state.peakProfit || profitPercent > state.peakProfit) {
            state.peakProfit = profitPercent;
        }
    }

    return actions;
}

// PHASE 3: Capital Allocation Strategy
function allocateCapital(totalCapital, marketRegime, volatility, multiTF) {
    let gridAllocation = 0.95; // Default

    // Conservative in uncertain conditions
    if (volatility === 'EXTREME') gridAllocation = 0.70;
    else if (volatility === 'HIGH') gridAllocation = 0.85;

    if (marketRegime === 'STRONG_BEAR') gridAllocation = Math.min(gridAllocation, 0.80);
    else if (marketRegime === 'BEAR') gridAllocation = Math.min(gridAllocation, 0.90);

    // Aggressive in high-confidence bull
    if (marketRegime === 'STRONG_BULL' && multiTF.confidence === 'HIGH' && volatility === 'LOW') {
        gridAllocation = 0.98;
    }

    return {
        grid: totalCapital * gridAllocation,
        reserve: totalCapital * (1 - gridAllocation),
        allocation: gridAllocation,
        reason: `Regime: ${marketRegime} | Vol: ${volatility} | MTF: ${multiTF.confidence}`
    };
}

// PHASE 4: Performance Analytics
function calculatePerformanceMetrics(state, initialCapital) {
    const filledOrders = state.filledOrders || [];
    const successfulTrades = filledOrders.filter(o => o.profit > 0);
    const totalTrades = filledOrders.length;

    const winRate = totalTrades > 0 ? (successfulTrades.length / totalTrades) * 100 : 0;
    const avgProfit = totalTrades > 0 ? state.totalProfit / totalTrades : 0;

    const daysPassed = (Date.now() - (state.startTime || Date.now())) / (1000 * 60 * 60 * 24);
    const dailyROI = daysPassed > 0 ? (state.totalProfit / initialCapital / daysPassed) * 100 : 0;

    const grossProfit = successfulTrades.reduce((sum, t) => sum + t.profit, 0);
    const grossLoss = filledOrders.filter(o => o.profit < 0).reduce((sum, t) => sum + Math.abs(t.profit), 0);
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    return {
        winRate: winRate.toFixed(1),
        totalTrades,
        avgProfit: avgProfit.toFixed(4),
        dailyROI: dailyROI.toFixed(2),
        profitFactor: profitFactor === Infinity ? '∞' : profitFactor.toFixed(2),
        maxDrawdown: state.maxDrawdown.toFixed(2)
    };
}

// PHASE 4: Robust API Call with Retries
async function resilientAPICall(fn, maxRetries = 3, context = '') {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (e) {
            if (i === maxRetries - 1) {
                console.error(`>> [ERROR] ${context} failed after ${maxRetries} retries:`, e.message);
                throw e;
            }

            const waitTime = 1000 * Math.pow(2, i); // Exponential backoff
            console.log(`>> [RETRY] ${context} attempt ${i + 1}/${maxRetries}. Waiting ${waitTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
}

// PHASE 4: Fee Optimization (Skip Unprofitable Orders)
// Now uses PERCENTAGE-BASED minimum, works with ANY capital
function isOrderWorthPlacing(orderSize, gridSpacing, currentPrice, tradingFee) {
    const orderValue = orderSize * currentPrice;
    const expectedGross = orderValue * gridSpacing;
    const fees = orderValue * (tradingFee * 2); // buy + sell cycles
    const expectedNet = expectedGross - fees;

    // Minimum profit = 0.05% of order value OR net must be positive
    // This scales with capital - $100 order needs $0.05 profit, $1000 needs $0.50
    const minimumProfit = Math.max(0.01, orderValue * 0.0005); // 0.05% of order, min $0.01

    // Only skip if we would LOSE money (net < 0)
    // Small profits are OK - they compound over time
    if (expectedNet < 0) {
        return {
            worth: false,
            reason: `Would lose money: fees $${fees.toFixed(3)} > gross $${expectedGross.toFixed(3)}`,
            gross: expectedGross,
            fees,
            net: expectedNet
        };
    }

    return {
        worth: true,
        gross: expectedGross,
        fees,
        net: expectedNet,
        profitPercent: (expectedNet / orderValue * 100).toFixed(3)
    };
}

module.exports = {
    // Phase 2
    calculateOptimalGridCount,
    getAdaptiveRSI,
    getAdaptiveSafetyMargin,
    calculateOptimalOrderSizes,

    // Phase 3
    shouldRebalance,
    getAdaptiveIndicatorPeriods,
    manageProfitTaking,
    allocateCapital,

    // Phase 4
    calculatePerformanceMetrics,
    resilientAPICall,
    isOrderWorthPlacing
};
