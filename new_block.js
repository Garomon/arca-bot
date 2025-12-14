// ==================================================
// SAFETY & EXECUTION MODULES (TOP-LEVEL, NO NESTING)
// ==================================================

// PHASE 1: Stop-Loss Protection (Doctrine: no auto-stop, but track drawdown)
async function checkStopLoss() {
    if (!state.initialCapital) return;

    try {
        const currentEquity = await getGlobalEquity(); // cached
        const allocatedEquity = currentEquity * CAPITAL_ALLOCATION;
        if (allocatedEquity <= 0) return;

        const drawdown = ((state.initialCapital - allocatedEquity) / state.initialCapital) * 100;

        if (drawdown > 0 && drawdown > (state.maxDrawdown || 0)) {
            state.maxDrawdown = drawdown;
            saveState(); // async
        }
    } catch (e) {
        console.error('>> [ERROR] Stop-loss check failed:', e.message);
    }
}

// PHASE 2: FLASH CRASH BREAKER (Volatility Kill Switch)
async function checkFlashCrash() {
    if (state.emergencyStop || state.isPaused) return;

    const now = Date.now();
    const currentPrice = state.currentPrice;
    if (!currentPrice) return;

    if (!state.priceBuffer) state.priceBuffer = [];
    state.priceBuffer.push({ price: currentPrice, time: now });

    const ONE_MINUTE = 60 * 1000;
    while (state.priceBuffer.length > 0 && (now - state.priceBuffer[0].time > ONE_MINUTE)) {
        state.priceBuffer.shift();
    }

    if (state.priceBuffer.length > 200) {
        state.priceBuffer = state.priceBuffer.slice(-200);
    }

    if (state.priceBuffer.length > 5) {
        const oldest = state.priceBuffer[0];
        const newest = state.priceBuffer[state.priceBuffer.length - 1];

        const percentChange = ((newest.price - oldest.price) / oldest.price) * 100;

        if (percentChange <= -5) {
            log('CRITICAL', `⚡ FLASH CRASH DETECTED: ${percentChange.toFixed(2)}% drop in ${(now - oldest.time) / 1000}s.`, 'error');
            log('CRITICAL', `PAUSING BUY ORDERS FOR 15 MINUTES.`, 'error');

            state.isPaused = true;
            state.pauseUntil = now + (15 * 60 * 1000);
            state.pauseReason = 'FLASH_CRASH_PROTECTION';

            saveState();
            io.emit('flash_crash', { drop: percentChange, pauseUntil: state.pauseUntil });
        }
    }
}

// PHASE 1: Fee-Aware Profit Calculation (utility)
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

        const filled = (state.activeOrders || []).filter(o => !openOrderIds.has(o.id));

        for (const order of filled) {
            if (processingOrders.has(order.id)) continue;
            processingOrders.add(order.id);

            try {
                const info = await binance.fetchOrder(order.id, CONFIG.pair);
                if (info.status === 'closed' || info.status === 'filled') {
                    const realFillPrice = parseFloat(info.average || info.price);
                    const filledAmount = parseFloat(info.filled || order.amount);
                    await handleOrderFill({ ...order, amount: filledAmount }, realFillPrice);
                }
            } catch (e) {
                // non-fatal
            } finally {
                processingOrders.delete(order.id);
            }
        }

        const openOrdersAfter = await binance.fetchOpenOrders(CONFIG.pair);
        const openIdsAfter = new Set(openOrdersAfter.map(o => o.id));
        state.activeOrders = (state.activeOrders || []).filter(o => openIdsAfter.has(o.id));

        saveState();
        emitGridState();
        updateBalance();
    } catch (e) {
        console.error('>> [ERROR] Check Failed:', e.message);
    }
}

async function handleOrderFill(order, fillPrice) {
    if (!order) return;

    const amt = parseFloat(order.amount);
    const px = parseFloat(fillPrice);

    if (!Number.isFinite(amt) || !Number.isFinite(px)) {
        log('ERROR', `Bad fill data: amount=${order.amount} price=${fillPrice}`, 'error');
        return;
    }

    order.amount = amt;
    fillPrice = px;

    state.activeOrders = (state.activeOrders || []).filter(o => o.id !== order.id);
    saveState();

    let profit = 0;

    if (order.side === 'buy') {
        if (!state.inventory) state.inventory = [];
        const fee = estimateFeeUSDT(fillPrice, order.amount);

        state.inventory.push({
            id: order.id,
            price: fillPrice,
            amount: order.amount,
            remaining: order.amount,
            fee: fee,
            timestamp: Date.now()
        });

        log('INVENTORY', `➕ Added Lot: ${order.amount.toFixed(6)} ${BASE_ASSET} @ $${fillPrice.toFixed(2)}`, 'info');
    } else if (order.side === 'sell') {
        if (!state.inventory) state.inventory = [];

        let remainingToSell = order.amount;
        let costBasis = 0;
        let entryFees = 0;

        for (let i = 0; i < state.inventory.length; i++) {
            if (remainingToSell <= 0.00000001) break;

            const lot = state.inventory[i];
            if (lot.remaining === undefined) lot.remaining = lot.amount;

            if (lot.remaining > 0) {
                const take = Math.min(remainingToSell, lot.remaining);
                costBasis += (take * lot.price);

                if (lot.fee && lot.amount > 0) {
                    entryFees += (take / lot.amount) * lot.fee;
                }

                lot.remaining = Number((lot.remaining - take).toFixed(8));
                remainingToSell = Number((remainingToSell - take).toFixed(8));
            }
        }

        if (remainingToSell > 0.00000001) {
            log('WARN', `Inventory shortfall: Missing ${remainingToSell.toFixed(8)} ${BASE_ASSET}. Estimating cost basis.`, 'warning');
            const estimatedBuyPrice = fillPrice / (1 + (order.spacing || CONFIG.gridSpacing));
            costBasis += (remainingToSell * estimatedBuyPrice);
            entryFees += (remainingToSell * estimatedBuyPrice * CONFIG.tradingFee);
            remainingToSell = 0;
        }

        state.inventory = state.inventory.filter(l => (l.remaining || 0) > 0.00000001);

        const sellRevenue = fillPrice * order.amount;
        const sellFee = sellRevenue * CONFIG.tradingFee;

        const avgCostPerUnit = (costBasis > 0 && order.amount > 0) ? (costBasis / order.amount) : 0;
        const priceDeviation = avgCostPerUnit / fillPrice;

        if (costBasis === 0 || priceDeviation < 0.5) {
            log('WARN', `⚠️ Suspicious Cost Basis! Avg: $${avgCostPerUnit.toFixed(2)} vs Sell: $${fillPrice.toFixed(2)}. Using estimate.`, 'warning');
            const spacing = order.spacing || CONFIG.gridSpacing;
            const estimatedBuyPrice = fillPrice / (1 + spacing);
            costBasis = estimatedBuyPrice * order.amount;
            entryFees = costBasis * CONFIG.tradingFee;
        }

        const grossProfit = sellRevenue - costBasis;
        const totalFees = sellFee + entryFees;
        profit = grossProfit - totalFees;

        const maxRealisticProfit = sellRevenue * 0.10;
        if (profit > maxRealisticProfit) {
            log('WARN', `🚨 PROFIT ANOMALY: $${profit.toFixed(4)} > 10% cap. Using estimate.`, 'error');
            const spacing = order.spacing || CONFIG.gridSpacing;
            const estimatedBuyPrice = fillPrice / (1 + spacing);
            const estimatedCostBasis = estimatedBuyPrice * order.amount;

            const estimatedEntryFees = estimatedCostBasis * CONFIG.tradingFee;
            const estimatedTotalFees = sellFee + estimatedEntryFees;

            const estimatedGross = sellRevenue - estimatedCostBasis;
            profit = estimatedGross - estimatedTotalFees;

            log('WARN', `🔧 Corrected: Gross $${estimatedGross.toFixed(4)} - Fees $${estimatedTotalFees.toFixed(4)} = Net $${profit.toFixed(4)}`, 'warning');
        }

        log('PROFIT', `FIFO Realized: Rev $${sellRevenue.toFixed(2)} - Cost $${costBasis.toFixed(2)} - Fees $${totalFees.toFixed(4)} = $${profit.toFixed(4)}`, 'success');
    }

    state.totalProfit += profit;
    if (!state.filledOrders) state.filledOrders = [];
    state.filledOrders.push({ ...order, fillPrice, profit, timestamp: Date.now(), isNetProfit: true });

    if (state.filledOrders.length > 1000) {
        state.filledOrders = state.filledOrders.slice(-1000);
    }

    state.lastFillTime = Date.now();

    const profitMsg = profit > 0 ? `| Profit: $${profit.toFixed(4)}` : '';
    log('EXECUTION', `💰 ${order.side.toUpperCase()} FILLED @ $${fillPrice.toFixed(2)} ${profitMsg}`, 'success');
    io.emit('trade_success', { side: order.side, price: fillPrice, profit });

    // Re-place opposite order (filters stay as tú ya los tenías)
    const newSide = order.side === 'buy' ? 'sell' : 'buy';
    const newPrice = order.side === 'buy'
        ? fillPrice * (1 + (order.spacing || CONFIG.gridSpacing))
        : fillPrice * (1 - (order.spacing || CONFIG.gridSpacing));

    const signalScore = state.marketCondition?.signalScore || 0;
    const recommendation = state.marketCondition?.recommendation || 'HOLD';
    const macdSignal = state.marketCondition?.macd?.signal || 'NEUTRAL';
    const stochRSI = state.marketCondition?.stochRSI || 50;

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

    log('AI', `✅ Signal OK: ${recommendation} | MACD: ${macdSignal} | Stoch: ${stochRSI.toFixed(0)}`);
    await placeOrder({ side: newSide, price: newPrice, amount: order.amount, level: order.level });
}

async function syncWithExchange() {
    log('SYSTEM', 'SYNCING WITH EXCHANGE...');
    try {
        const allOpenOrders = await binance.fetchOpenOrders(CONFIG.pair);

        const myPrefix = `${BOT_ID}_${PAIR_ID}_`;
        const openOrders = allOpenOrders.filter(o => getClientId(o).startsWith(myPrefix));

        const ignoredCount = allOpenOrders.length - openOrders.length;
        if (ignoredCount > 0) console.log(`>> [ISOLATION] Ignored ${ignoredCount} foreign/manual orders.`);

        const openIds = new Set(openOrders.map(o => o.id));
        const missingOrders = (state.activeOrders || []).filter(o => !openIds.has(o.id));

        for (const missingOrder of missingOrders) {
            try {
                const order = await adaptiveHelpers.resilientAPICall(
                    () => binance.fetchOrder(missingOrder.id, CONFIG.pair),
                    3,
                    `Check missing order ${missingOrder.id}`
                );

                if (order.status === 'closed' || order.status === 'filled') {
                    log('SYNC', `Order ${missingOrder.id} filled while offline. Processing...`, 'success');

                    const fillPrice = order.average || order.price || missingOrder.price;
                    const filledAmount = order.filled || order.amount || missingOrder.amount;

                    await handleOrderFill({
                        ...missingOrder,
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

        const allOpenOrders2 = await binance.fetchOpenOrders(CONFIG.pair);
        const openOrders2 = allOpenOrders2.filter(o => getClientId(o).startsWith(myPrefix));

        const prevOrders = new Map((state.activeOrders || []).map(o => [o.id, o]));
        let adoptedCount = 0;

        state.activeOrders = openOrders2.map(o => {
            const old = prevOrders.get(o.id) || {};
            if (!prevOrders.has(o.id)) adoptedCount++;

            return {
                ...old,
                id: o.id,
                side: o.side,
                price: parseFloat(o.price),
                amount: parseFloat(o.amount),
                status: 'open',
                timestamp: o.timestamp,
                clientOrderId: getClientId(o),
                spacing: old.spacing ?? CONFIG.gridSpacing,
                level: old.level ?? null
            };
        });

        if (adoptedCount > 0) {
            log('SYNC', `ADOPTED ${adoptedCount} ORPHAN ORDERS (Restored metadata where possible)`);
            saveState();
            emitGridState();
        } else {
            log('SYNC', 'STATE IS IN SYNC');
        }

        await syncHistoricalTrades();
    } catch (e) {
        log('ERROR', `Sync Failed: ${e.message}`, 'error');
    }
}

async function syncHistoricalTrades() {
    try {
        const trades = await binance.fetchMyTrades(CONFIG.pair, undefined, 50);
        let addedCount = 0;

        if (!state.filledOrders) state.filledOrders = [];

        const initialLength = state.filledOrders.length;
        state.filledOrders = state.filledOrders.filter(o => o.id);
        if (state.filledOrders.length < initialLength) {
            log('SYSTEM', `Cleaned ${initialLength - state.filledOrders.length} corrupt history entries.`, 'warning');
        }

        const knownIds = new Set(state.filledOrders.map(o => o.id));

        for (const trade of trades) {
            const tradeId = trade.orderId || trade.order || trade.id;
            if (!knownIds.has(tradeId)) {
                let estimatedProfit = 0;
                if (trade.side === 'sell') {
                    estimatedProfit = (trade.amount * trade.price) * CONFIG.gridSpacing;
                }

                state.filledOrders.push({
                    id: tradeId,
                    side: trade.side,
                    price: trade.price,
                    amount: trade.amount,
                    timestamp: trade.timestamp,
                    profit: estimatedProfit,
                    status: 'filled',
                    isNetProfit: false
                });

                knownIds.add(tradeId);
                addedCount++;
            }
        }

        if (addedCount > 0) {
            state.filledOrders.sort((a, b) => b.timestamp - a.timestamp);
            if (state.filledOrders.length > 200) state.filledOrders = state.filledOrders.slice(0, 200);
            log('SYNC', `Imported ${addedCount} historical trades from exchange`, 'success');
            saveState();
        }

        io.emit('debug_trades', [...state.filledOrders].sort((a, b) => b.timestamp - a.timestamp));
    } catch (e) {
        console.error('>> [WARN] History sync failed (API permission?):', e.message);
    }
}

async function checkGridHealth(analysis, regime, multiTF) {
    if (!state.activeOrders || state.activeOrders.length === 0) return;
    const currentPrice = state.currentPrice;
    if (!currentPrice) return;

    const multiplier = PAIR_PRESETS[CONFIG.pair]?.toleranceMultiplier || 10;
    const currentSpacing = CONFIG.gridSpacing;
    const driftTolerance = currentSpacing * multiplier;

    if (analysis && regime && multiTF) {
        const adaptiveConfig = { driftTolerance: driftTolerance };
        const triggers = adaptiveHelpers.shouldRebalance(state, analysis, regime, multiTF, adaptiveConfig);

        if (triggers && triggers.length > 0) {
            log('ADAPTIVE', `Rebalance Triggered by: ${triggers.join(', ')}`, 'warning');
            await initializeGrid(true);
            return;
        }
    }

    const prices = state.activeOrders.map(o => o.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    const lowerBound = minPrice * (1 - driftTolerance);
    const upperBound = maxPrice * (1 + driftTolerance);

    if (state.activeOrders.length < 3) return;

    if (currentPrice < lowerBound || currentPrice > upperBound) {
        log('WARN', `PRICE DRIFT ($${currentPrice.toFixed(2)} vs Range $${minPrice.toFixed(2)}-$${maxPrice.toFixed(2)}). REBALANCING...`, 'error');
        log('DEBUG', `Bounds: Low ${lowerBound.toFixed(2)} | High ${upperBound.toFixed(2)} | Tol: ${(driftTolerance * 100).toFixed(2)}% (${multiplier}x Spacing)`);
        await initializeGrid(true);
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
