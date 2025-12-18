/**
 * ADAPTIVE HELPERS - Phases 2, 3, 4 & GEO-MACRO
 * Helper functions for fully adaptive bot intelligence
 */

// --- GEOPOLITICAL & MACRO CONTEXT (Refined from Video Transcript) ---
const GEOPOLITICAL_EVENTS = [
    {
        name: 'BoJ Policy Meeting (Reactionary)',
        date: '2025-12-18', // Thursday Night / Friday Morning
        duration: 2,
        impact: 'HIGH',     // "Small Scare" expected, not full crash (Already discounted?)
        type: 'LIQUIDITY_SHOCK',
        sentiment: 'BEARISH_SHORT_TERM',
        description: 'Bank of Japan Rate Decision. Consensus: "Sell rumor, Buy news". Expect wicks/scare on Friday, then Rally.'
    },
    {
        name: 'Institutional Manipulation (Recurrent)',
        date: '2025-12-21',
        duration: 1,
        impact: 'MEDIUM',
        type: 'MANIPULATION',
        sentiment: 'VOLATILE',
        description: 'Recurrent manipulation observed: 16:00 UTC and Sunday midnights ("Shake the tree" before moves).'
    }
];

const MACRO_PRICE_ZONES = {
    'BTC/USDT': {
        buyDip: { min: 82000, max: 86300, sentiment: 'STRONG_BUY_DIP' }, // Support: 86k-86.3k. Critical: 82k.
        fairValue: { min: 86301, max: 88500, sentiment: 'NEUTRAL' },      // Tight Range: 86.3k - 88k.
        overextended: { min: 88501, max: 999999, sentiment: 'TAKE_PROFIT' } // Liquidity Hunt at 88.1k -> 90k. Sell into probability.
    }
    // Add other pairs if needed
};

// HELPER: Check for upcoming high-impact events
function evaluateGeopoliticalRisk(currentDate = new Date()) {
    const now = new Date(currentDate);
    let riskLevel = { status: 'NORMAL', modifier: 'NONE', defenseLevel: 0, scoreBias: 0, activeEvent: null };

    // Check specific scheduled events
    for (const event of GEOPOLITICAL_EVENTS) {
        let candidateRisk = null;

        const eventDate = new Date(event.date + 'T00:00:00Z'); // Fix: Force UTC to prevent local timezone shifts
        const eventEnd = new Date(eventDate);
        eventEnd.setDate(eventDate.getDate() + (event.duration || 1)); // Default 1 day

        const timeDiff = eventDate.getTime() - now.getTime();
        const daysToEvent = timeDiff / (1000 * 60 * 60 * 24);

        // Check if we are literally INSIDE the event window (Start <= Now <= End)
        const isDuringEvent = now >= eventDate && now <= eventEnd;

        // 1. Pre-Event Anxiety (3 days before)
        if (!isDuringEvent && daysToEvent > 0 && daysToEvent <= 3) {
            candidateRisk = {
                status: 'MARKET_ANXIETY',
                modifier: 'DEFENSIVE',
                defenseLevel: 1, // Mild caution
                scoreBias: -5,
                activeEvent: `${event.name} in ${daysToEvent.toFixed(1)} days`
            };
        }
        // 2. ACTIVE EVENT (During the window)
        else if (isDuringEvent) {
            const isExtreme = event.impact === 'EXTREME';
            candidateRisk = {
                status: isExtreme ? 'LIQUIDITY_CRISIS' : 'HIGH_VOLATILITY_EVENT',
                modifier: isExtreme ? 'MAX_DEFENSE' : 'PROTECTIVE',
                defenseLevel: isExtreme ? 3 : 2, // Level 3 for EXTREME events
                scoreBias: isExtreme ? -25 : -15,
                activeEvent: `${event.name} ACTIVE NOW`
            };
        }

        // FIX: Prioritization Logic - Only upgrade risk, never downgrade
        if (candidateRisk && candidateRisk.defenseLevel > riskLevel.defenseLevel) {
            riskLevel = candidateRisk;
        }
    }

    return riskLevel;
}

// HELPER: Check if we are in a specific macro accumulation/distribution zone
function evaluateMacroSentiment(pair, currentPrice) {
    if (!MACRO_PRICE_ZONES[pair]) return null;

    const zones = MACRO_PRICE_ZONES[pair];

    if (currentPrice >= zones.buyDip.min && currentPrice <= zones.buyDip.max) {
        return {
            zone: 'BUY_DIP',
            sentiment: 'STRONG_BUY',
            scoreBonus: 20, // Significant boost to buy signals
            advice: 'Accumulate aggressively (Institutional Zone)'
        };
    }

    if (currentPrice >= zones.overextended.min) {
        return {
            zone: 'OVEREXTENDED',
            sentiment: 'SELL',
            scoreBonus: -10,
            advice: 'Take profits, reduced exposure'
        };
    }

    return { zone: 'NEUTRAL', sentiment: 'NEUTRAL', scoreBonus: 0, advice: 'Trade ranges' };
}

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

    const config = { ...(configs[marketRegime] || configs['UNKNOWN']) };

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
// PHASE 3: Intelligent Rebalancing Triggers
function shouldRebalance(state, analysis, regime, multiTF, config = {}) {
    const triggers = [];

    // 1. Price drift (Dynamic Tolerance)
    // Default to 2% if not provided, but usually comes from grid_bot.js logic
    const driftThreshold = config.driftTolerance || 0.02;

    if (state.activeOrders.length > 0) {
        const prices = state.activeOrders.map(o => o.price);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const centerPrice = (minPrice + maxPrice) / 2;
        const drift = Math.abs(state.currentPrice - centerPrice) / state.currentPrice;

        if (drift > driftThreshold) {
            triggers.push(`PRICE_DRIFT (Drift: ${(drift * 100).toFixed(2)}% > Tol: ${(driftThreshold * 100).toFixed(2)}%)`);
        }
    }

    // 2. Volatility regime change
    // FIX: use state.volatilityRegime, as 'analysis' does not contain discrete volatility label
    const currentVol = state.volatilityRegime || 'NORMAL';

    // COOLDOWN CHECK: Don't trigger if we just rebalanced due to volatility
    const lastRebalanceTime = state.lastRebalance && state.lastRebalance.timestamp ? state.lastRebalance.timestamp : 0;
    const cooldownMs = 20 * 60 * 1000; // 20 min cooldown (matches grid_bot.js)
    const timeSinceReset = Date.now() - lastRebalanceTime;

    if (state.lastVolatility && state.lastVolatility !== currentVol) {
        if (timeSinceReset > cooldownMs) {
            triggers.push(`VOLATILITY_SHIFT (${state.lastVolatility} -> ${currentVol})`);
        }
    }

    // 3. Market regime change
    if (state.lastRegime && state.lastRegime !== regime.regime) {
        if ((state.lastRegime.includes('BULL') && regime.regime.includes('BEAR')) ||
            (state.lastRegime.includes('BEAR') && regime.regime.includes('BULL'))) {
            triggers.push('REGIME_CHANGE');
        }
    }

    // 4. Imbalance (Smart Inventory Check)
    const buyOrders = state.activeOrders.filter(o => o.side === 'buy');
    const sellOrders = state.activeOrders.filter(o => o.side === 'sell');

    // Check if we effectively HAVE inventory/capital to support the missing side
    // If we have < 0.0001 BTC (dust), we can't place sells anyway, so 0 sells is NOT an imbalance, it's reality.
    const hasInventory = state.inventory && state.inventory.reduce((sum, lot) => sum + lot.remaining, 0) > 0.0001;

    // Logic:
    // If NO BUY orders: Imbalance ONLY if we have capital to buy (implied usually true for bot) AND price dropped below range
    // If NO SELL orders: Imbalance ONLY if we HAVE inventory to sell AND price rose above range

    if (buyOrders.length === 0) {
        // If price is below all sells (we are holding bags), we need to rebalance to add buys below
        // But if we just have NO orders at all, that's different.
        if (sellOrders.length > 0 && state.currentPrice < Math.min(...sellOrders.map(o => o.price))) {
            // FIX: Cooldown for Low Buys (Prevents Budget-Skip Loops)
            // Use state.lastGridReset because state.lastRebalance is not reliably updated on reset
            const timeSinceGridReset = Date.now() - (state.lastGridReset || 0);

            if (timeSinceGridReset > 300000) { // 5 minutes
                triggers.push('IMBALANCE_LOW_BUYS');
            } else {
                console.log(`>> [DEBUG] COOLDOWN ACTIVE: Skipping IMBALANCE_LOW_BUYS. Time since reset: ${(timeSinceGridReset / 1000).toFixed(1)}s < 300s`);
            }
        }
    } else if (sellOrders.length === 0) {
        // If we have inventory but no sell orders, something is wrong -> Rebalance
        // UNLESS we are in "HODL Mode" (Propfit Guard blocking sells)

        // Calculate Average Entry Price
        let avgEntryPrice = 0;
        if (state.inventory && state.inventory.length > 0) {
            const totalCost = state.inventory.reduce((sum, lot) => sum + (lot.price * lot.remaining), 0);
            const totalAmount = state.inventory.reduce((sum, lot) => sum + lot.remaining, 0);
            if (totalAmount > 0) avgEntryPrice = totalCost / totalAmount;
        }

        // INTELLIGENT EXCEPTION: If Current Price < Avg Entry, we EXPECT no sells (Profit Guard).
        // Only trigger imbalance if price is ABOVE entry but we still have no sells.
        const isHostingBag = avgEntryPrice > 0 && state.currentPrice < avgEntryPrice;

        if (hasInventory && !isHostingBag) {
            triggers.push('IMBALANCE_NO_SELLS');
        }
    }

    // 5. Multi-timeframe divergence (low confidence) - Stale Grid Check
    if (multiTF.confidence === 'LOW') {
        const lastFillTime = state.lastFillTime || Date.now();
        const lastRebalanceTime = state.lastRebalance?.timestamp || 0;

        // Use the LATEST activity (Fill OR Reset)
        const lastActivityTime = Math.max(lastFillTime, lastRebalanceTime);
        const hoursSinceActivity = (Date.now() - lastActivityTime) / (1000 * 60 * 60);

        // Only trigger if truly stale (> 24h since ANY activity)
        if (hoursSinceActivity > 24) {
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

// PHASE 4: Dynamic Grid Spacing
function calculateOptimalGridSpacing(atr, currentPrice, volatility, geopoliticalStatus) {
    if (!atr || !currentPrice) return { spacing: 0.01, multiplier: 1.0, rawAtrPercent: 0.01 }; // Default

    const atrPercent = atr / currentPrice;
    let atrMultiplier = 1.0;

    // Adjust multiplier based on volatility
    if (volatility === 'EXTREME') atrMultiplier = 2.0;       // Wide spacing
    else if (volatility === 'HIGH') atrMultiplier = 1.5;
    else if (volatility === 'LOW') atrMultiplier = 0.8;      // Tight spacing

    // Geopolitical Override
    if (geopoliticalStatus === 'MARKET_ANXIETY' || geopoliticalStatus === 'HIGH_VOLATILITY_EVENT') {
        atrMultiplier *= 1.5; // INCREASE SPACING by 50%
    }

    // Calculate dynamic spacing
    // Cap at 0.1% min and 5% max (increased from 3% for SOL volatility)
    const spacing = Math.max(0.001, Math.min(0.05, atrPercent * atrMultiplier));

    return {
        spacing,
        multiplier: atrMultiplier,
        rawAtrPercent: atrPercent
    };
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
// PHASE 3: Capital Allocation Strategy
function allocateCapital(totalCapital, marketRegime, volatility, multiTF, geoContext = { defenseLevel: 0 }) {
    let gridAllocation = 0.95; // Default

    // Conservative in uncertain conditions
    if (volatility === 'EXTREME') gridAllocation = 0.70;
    else if (volatility === 'HIGH') gridAllocation = 0.85;

    // GEOPOLITICAL OVERRIDE (Cash is King during War/Crisis)
    if (geoContext.defenseLevel >= 3) {
        gridAllocation = 0.50; // EXTREME: Keep 50% in USDT reserve
    } else if (geoContext.defenseLevel >= 2) {
        gridAllocation = 0.75; // HIGH RISK: Keep 25% reserve
    }

    if (marketRegime === 'STRONG_BEAR') gridAllocation = Math.min(gridAllocation, 0.80);
    else if (marketRegime === 'BEAR') gridAllocation = Math.min(gridAllocation, 0.90);

    // Aggressive in high-confidence bull (Only if no Geo Risk)
    if (marketRegime === 'STRONG_BULL' && multiTF.confidence === 'HIGH' && volatility === 'LOW' && geoContext.defenseLevel === 0) {
        gridAllocation = 0.98;
    }

    return {
        grid: totalCapital * gridAllocation,
        reserve: totalCapital * (1 - gridAllocation),
        allocation: gridAllocation,
        reason: `Regime: ${marketRegime} | Vol: ${volatility} | GeoDef: ${geoContext.defenseLevel}`
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

/**
 * Checks if a grid order is worth placing given fees and spacing.
 * HOTFIX (Phase 9): Input is now `orderValueUSDT` (Price * Amount), NOT raw amount.
 * Prevents double-multiplication bug.
 */
function isOrderWorthPlacing(orderValueUSDT, gridSpacing, currentPrice, tradingFee = 0.001) {
    if (!orderValueUSDT || orderValueUSDT <= 0) return false;

    // 1. Calculate Expected profit per grid (Gross)
    // If spacing is 1% (0.01), a $50 order makes $0.50 gross
    const expectedGrossProfit = orderValueUSDT * gridSpacing;

    // 2. Calculate Round-trip fees
    // Buy Fee + Sell Fee (approx 2x)
    const roundTripFees = orderValueUSDT * (tradingFee * 2);

    // 3. Net Profit
    const expectedNet = expectedGrossProfit - roundTripFees;

    // 4. Threshold: Must make at least positive net profit
    // AND must cover fees by at least 1.5x to be worth the risk
    const isProfitable = expectedNet > 0 && (expectedGrossProfit > roundTripFees * 1.5);

    return {
        worth: isProfitable,
        reason: isProfitable ? 'Profitable' : `Net Profit too low: $${expectedNet.toFixed(4)}`,
        gross: expectedGrossProfit,
        fees: roundTripFees,
        net: expectedNet
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
    calculateOptimalGridSpacing,
    calculatePerformanceMetrics,
    resilientAPICall,
    isOrderWorthPlacing,

    // Geo & Macro
    evaluateGeopoliticalRisk,
    evaluateMacroSentiment
};
