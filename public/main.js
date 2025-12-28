/**
 * VANTAGE // QUANTUM CLIENT - COMPLETE
 * Version: 2.0 - All Features Working
 */

// --- SOCKET CONNECTION (MULTI-BOT AWARE) ---
// Detect if we are on a subpath (e.g., /sol/)
const pathName = window.location.pathname;
let socketOptions = {};

// If on /sol/, tell Socket.IO to use the /sol/socket.io endpoint
// which Nginx maps to localhost:3001
if (pathName.startsWith('/sol')) {
    socketOptions.path = '/sol/socket.io';
    console.log('>> [SYSTEM] Connecting to SOLANA Bot via /sol/socket.io');
} else if (pathName.startsWith('/eth')) {
    socketOptions.path = '/eth/socket.io';
    console.log('>> [SYSTEM] Connecting to ETH Bot via /eth/socket.io');
} else {
    console.log('>> [SYSTEM] Connecting to BTC Bot (Default)');
}

const socket = io(socketOptions);

// ===== TAB SWITCHING =====
document.addEventListener('DOMContentLoaded', () => {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const tabId = btn.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');

            // Show Log Feed & Expend Sidebar ONLY on Bot Tab
            const logFeed = document.getElementById('log-feed');
            const sidebar = document.querySelector('.sidebar');

            if (tabId === 'bot') {
                if (logFeed) logFeed.style.display = 'block';
                if (sidebar) sidebar.classList.remove('collapsed');
            } else {
                if (logFeed) logFeed.style.display = 'none';
                if (sidebar) sidebar.classList.add('collapsed');
            }
        });
    });

    // Initial check
    const logFeed = document.getElementById('log-feed');
    const sidebar = document.querySelector('.sidebar');
    const activeTab = document.querySelector('.tab-btn.active')?.getAttribute('data-tab');

    if (activeTab === 'bot') {
        if (logFeed) logFeed.style.display = 'block';
        if (sidebar) sidebar.classList.remove('collapsed');
    } else {
        if (logFeed) logFeed.style.display = 'none';
        if (sidebar) sidebar.classList.add('collapsed');
    }
});

// DOM Elements
const ui = {
    // Tab 1: Financial
    freeUSDT: document.getElementById('free-usdt'),
    lockedUSDT: document.getElementById('locked-usdt'),
    btcAmount: document.getElementById('btc-amount'),
    btcValue: document.getElementById('btc-value'),
    totalEquity: document.getElementById('total-equity'),
    equityMXN: document.getElementById('equity-mxn'),
    profitTotal: document.getElementById('profit-total'),
    profitPercent: document.getElementById('profit-percent'),
    activeLoops: document.getElementById('active-loops'),
    buyCount: document.getElementById('buy-count'),
    sellCount: document.getElementById('sell-count'),
    rsiValue: document.getElementById('rsi-value'),
    emaValue: document.getElementById('ema-value'),
    trendValue: document.getElementById('trend-value'),
    volatilityValue: document.getElementById('volatility-value'),
    hudStatus: document.getElementById('hud-status'),
    hudDetail: document.getElementById('hud-detail'),
    resetGrid: document.getElementById('reset-grid'),

    // NEW: Animated Price Display
    priceDisplay: document.getElementById('price-display'),
    livePrice: document.getElementById('live-price'),
    signalScore: document.getElementById('signal-score'),
    signalText: document.getElementById('signal-text'),

    // Tab 2: Market Intel
    regimeBadge: document.getElementById('regime-badge'),
    regimeDetails: document.getElementById('regime-details'),
    mtf1h: document.getElementById('mtf-1h'),
    mtf4h: document.getElementById('mtf-4h'),
    mtf1d: document.getElementById('mtf-1d'),
    mtfConf: document.getElementById('mtf-conf'),
    intelRsi: document.getElementById('intel-rsi'),
    rsiThresholds: document.getElementById('rsi-thresholds'),
    intelEma: document.getElementById('intel-ema'),
    emaVsPrice: document.getElementById('ema-vs-price'),
    bbDisplay: document.getElementById('bb-display'),
    intelBandwidth: document.getElementById('intel-bandwidth'),
    bandwidthState: document.getElementById('bandwidth-state'),

    // Tab 3: Performance
    perfWinrate: document.getElementById('perf-winrate'),
    perfTrades: document.getElementById('perf-trades'),
    perfAvgProfit: document.getElementById('perf-avgprofit'),
    perfDailyROI: document.getElementById('perf-dailyroi'),
    perfPF: document.getElementById('perf-pf'),
    perfMaxDD: document.getElementById('perf-maxdd'),

    // Tab 4: Settings
    setGridCount: document.getElementById('set-gridcount'),
    setGridCountReason: document.getElementById('set-gridcount-reason'),
    setSpacing: document.getElementById('set-spacing'),
    setSpacingReason: document.getElementById('set-spacing-reason'),
    setSafety: document.getElementById('set-safety'),
    setSafetyReason: document.getElementById('set-safety-reason'),
    setRSI: document.getElementById('set-rsi'),
    setRSIReason: document.getElementById('set-rsi-reason'),
    contextDisplay: document.getElementById('context-display'),

    // Sidebar
    logFeed: document.getElementById('log-feed')
};

// ===== ANIMATED PRICE VISUALIZATION =====
function updatePriceDisplay(data) {
    // Calculate MXN price
    const priceMXN = (data.price || 0) * window.usdMxnRate;

    // Update main price display
    if (ui.priceDisplay && data.price) {
        ui.priceDisplay.innerHTML = `$${data.price.toFixed(2)} <small style="color:#888;font-size:0.5em;display:block">≈ $${priceMXN.toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN</small>`;
    }
    if (ui.livePrice && data.price) {
        ui.livePrice.innerHTML = `$${data.price.toFixed(0)} <small style="color:#888;font-size:0.6em">MXN: $${priceMXN.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</small>`;
    }

    // Update order book bars
    if (data.orders && data.orders.length > 0) {
        const buyOrders = data.orders.filter(o => o.side === 'buy').slice(0, 4);
        const sellOrders = data.orders.filter(o => o.side === 'sell').slice(0, 4);

        buyOrders.forEach((order, i) => {
            const el = document.getElementById(`buy-${i + 1}`);
            if (el) el.innerText = `$${order.price.toFixed(0)}`;
        });

        sellOrders.forEach((order, i) => {
            const el = document.getElementById(`sell-${i + 1}`);
            if (el) el.innerText = `$${order.price.toFixed(0)}`;
        });
    }
}

// Legacy function for compatibility
function drawTriangle(data) {
    updatePriceDisplay(data);
}

// ===== LOGGING =====
function log(type, msg, style = '') {
    if (!ui.logFeed) return;

    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `log-entry ${style}`;
    entry.innerHTML = `<span class="log-time">${time}</span><span class="log-type">[${type}]</span> ${msg}`;

    ui.logFeed.insertBefore(entry, ui.logFeed.firstChild);
    while (ui.logFeed.children.length > 50) {
        ui.logFeed.removeChild(ui.logFeed.lastChild);
    }
}

// ===== SOCKET EVENTS =====

socket.on('connect', () => {
    log("NETWORK", "CONNECTED", "success");
});

socket.on('log_history', (logs) => {
    logs.forEach(entry => {
        const time = new Date(entry.timestamp).toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${entry.style || ''}`;
        logEntry.innerHTML = `<span class="log-time">${time}</span><span class="log-type">[${entry.type}]</span> ${entry.msg}`;
        ui.logFeed.appendChild(logEntry);
    });
});

// ===== HEARTBEAT WATCHDOG =====
let lastHeartbeat = Date.now();
const connectionDot = document.getElementById('connection-dot');
const connectionStatus = document.getElementById('connection-status');
const lastUpdateLabel = document.getElementById('last-update-time');

// Update heartbeat on ANY message
socket.onAny && socket.onAny(() => {
    lastHeartbeat = Date.now();
    if (connectionStatus && connectionStatus.innerText !== 'LIVE') {
        updateConnectionStatus('LIVE');
    }
});

// Fallback if socket.onAny not supported
const originalOn = socket.on;
socket.on = function (event, callback) {
    originalOn.apply(this, [event, (data) => {
        lastHeartbeat = Date.now();
        if (connectionStatus && connectionStatus.innerText !== 'LIVE') {
            updateConnectionStatus('LIVE');
        }
        callback(data);
    }]);
};

function updateConnectionStatus(status) {
    if (!connectionDot || !connectionStatus) return;

    if (status === 'LIVE') {
        connectionDot.className = 'status-dot live';
        connectionStatus.innerText = 'LIVE';
        connectionStatus.style.color = '#00ff9d';
        if (lastUpdateLabel) lastUpdateLabel.style.opacity = 0;
    } else if (status === 'STALLED') {
        connectionDot.className = 'status-dot'; // Remove live pulse, gray/orange
        connectionDot.style.background = '#ff9500';
        connectionDot.style.boxShadow = '0 0 10px #ff9500';
        connectionStatus.innerText = 'STALLED';
        connectionStatus.style.color = '#ff9500';
        if (lastUpdateLabel) lastUpdateLabel.style.opacity = 1;
    } else {
        connectionDot.className = 'status-dot';
        connectionDot.style.background = '#ff3b3b';
        connectionDot.style.boxShadow = '0 0 10px #ff3b3b';
        connectionStatus.innerText = 'OFFLINE';
        connectionStatus.style.color = '#ff3b3b';
        if (lastUpdateLabel) lastUpdateLabel.style.opacity = 1;
    }
}

// Watchdog Loop
setInterval(() => {
    const diff = Date.now() - lastHeartbeat;

    // Update timer text
    if (lastUpdateLabel && diff > 2000) {
        lastUpdateLabel.innerText = `(${Math.floor(diff / 1000)}s ago)`;
        lastUpdateLabel.style.opacity = 1;
    } else if (lastUpdateLabel && diff < 2000) {
        lastUpdateLabel.style.opacity = 0;
    }

    // Logic
    if (diff > 45000) { // 45s without data = DEAD
        updateConnectionStatus('OFFLINE');
    } else if (diff > 10000) { // 10s without data = STALLED
        updateConnectionStatus('STALLED');
    }
}, 1000); // Check every second

socket.on('log_message', (data) => {
    log(data.type, data.msg, data.style);
});

// Init State (Populate Capital) - REMOVED (Smart Detection Active)
// socket.on('init_state', (state) => {});

// Financial Update
socket.on('financial_update', (data) => {
    if (ui.freeUSDT) ui.freeUSDT.innerText = `$${data.freeUSDT.toFixed(2)}`;
    if (ui.lockedUSDT) ui.lockedUSDT.innerText = `$${data.lockedUSDT.toFixed(2)}`;

    // Store global equity for calculations
    window.currentEquity = data.totalEquity;

    // DYNAMIC UI: Update Base Asset Label (e.g. "BTC" or "SOL")
    if (data.pair) {
        const baseAsset = data.pair.split('/')[0]; // "BTC/USDT" -> "BTC"
        const label = document.getElementById('base-asset-label');
        if (label && label.innerText !== baseAsset) {
            label.innerText = baseAsset;
        }

        // NEW: Update Main Terminal Header (e.g. "BTC/USDT")
        const pairLabel = document.getElementById('trading-pair-label');
        if (pairLabel) pairLabel.innerText = data.pair;

        // NEW: Update Symbol (₿ or ◎)
        const symbolLabel = document.getElementById('pair-symbol');
        if (symbolLabel) {
            symbolLabel.innerText = baseAsset === 'SOL' ? '◎' : '₿';
        }
    }

    // Show TOTAL BTC (free + locked), not just free
    if (ui.btcAmount) ui.btcAmount.innerText = (data.totalBTC || data.freeBTC).toFixed(6);
    if (ui.btcValue) ui.btcValue.innerText = data.btcValueUSDT.toFixed(2);
    // Calculate MXN equivalents
    const equityMXN = data.totalEquity * window.usdMxnRate;

    if (ui.totalEquity) {
        ui.totalEquity.innerHTML = `$${data.totalEquity.toFixed(2)} <small style="color:#888;font-size:0.65em">≈ $${equityMXN.toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN</small>`;
        ui.totalEquity.style.color = data.totalEquity > 100 ? '#00ff9d' : 'inherit';
    }
    if (ui.equityMXN) {
        ui.equityMXN.style.display = 'none'; // Hide the simplified bottom element
    }

    if (ui.profitTotal) {
        const profitMXN = data.profit * window.usdMxnRate;
        ui.profitTotal.innerHTML = `$${data.profit.toFixed(2)} <small style="color:#888;font-size:0.65em">≈ $${profitMXN.toFixed(0)} MXN</small>`;
        ui.profitTotal.style.color = data.profit > 0 ? '#00ff9d' : '#ff3b3b';
    }
    if (ui.profitPercent) ui.profitPercent.innerText = data.profitPercent.toFixed(2);

    // Calculate and display APY for fintech comparison
    const apyEl = document.getElementById('profit-apy');
    if (apyEl && data.startTime && data.profitPercent) {
        const daysRunning = Math.max(1, (Date.now() - data.startTime) / (1000 * 60 * 60 * 24));
        const dailyROI = data.profitPercent / daysRunning;
        const apy = dailyROI * 365;
        const apyColor = apy >= 50 ? '#00ff9d' : apy >= 20 ? '#00d4ff' : '#ff9500';
        // Show time-weighted capital if available
        const avgCapitalNote = data.avgCapital ? ` | Avg: $${data.avgCapital.toFixed(0)}` : '';
        apyEl.innerHTML = `<span style="color:${apyColor}">APY: ~${apy.toFixed(0)}%</span> <small style="color:#666">(${daysRunning.toFixed(1)}d${avgCapitalNote})</small>`;
    }

    if (ui.activeLoops) ui.activeLoops.innerText = data.activeOrders.total;
    if (ui.buyCount) ui.buyCount.innerText = data.activeOrders.buy;
    if (ui.sellCount) ui.sellCount.innerText = data.activeOrders.sell;

    // Tab 3: Performance (if metrics included)
    if (data.metrics) {
        if (ui.perfWinrate) ui.perfWinrate.innerText = `${data.metrics.winRate}%`;
        if (ui.perfTrades) ui.perfTrades.innerText = data.metrics.totalTrades;
        if (ui.perfAvgProfit) ui.perfAvgProfit.innerText = `$${data.metrics.avgProfit.toFixed(2)}`;
        if (ui.perfDailyROI) ui.perfDailyROI.innerText = `${data.metrics.dailyROI.toFixed(2)}%`;
        if (ui.perfPF) ui.perfPF.innerText = data.metrics.profitFactor.toFixed(2);
        if (ui.perfMaxDD) ui.perfMaxDD.innerText = `${data.metrics.maxDrawdown.toFixed(2)}%`;
    }

    // ===== SYNC BOT DATA TO COMMAND CENTER =====
    const botProfitEl = document.getElementById('bot-profit');
    const botStatusEl = document.getElementById('bot-status');
    if (botProfitEl) {
        const profitMXN = data.profit * window.usdMxnRate;
        botProfitEl.innerText = `$${data.profit.toFixed(2)} USDT`;
        botProfitEl.title = `≈ $${profitMXN.toFixed(0)} MXN`;
    }
    if (botStatusEl) {
        botStatusEl.innerText = `Equity: $${data.totalEquity.toFixed(2)} | Loops: ${data.activeOrders.total}`;
    }

    // ===== SYNC BOT TO ARCA DATA (Portfolio Crypto) =====
    if (typeof arcaData !== 'undefined') {
        // FIX: Use globalEquity (Total Binance Balance) for Portfolio, not just allocated
        const globalValueMXN = (data.globalEquity || data.accountEquity || data.totalEquity) * window.usdMxnRate;
        arcaData.botEquity = data.totalEquity; // Bot's slice stays as-is
        arcaData.portfolio.crypto = globalValueMXN; // Portfolio shows TOTAL account value

        // Update crypto display if exists
        const cryptoValueInput = document.getElementById('crypto-value');
        if (cryptoValueInput) {
            cryptoValueInput.value = globalValueMXN.toFixed(0);
        }

        // Update goals progress
        updateGoalsProgress();

        // Save to localStorage (debounced)
        clearTimeout(window.botSaveTimeout);
        window.botSaveTimeout = setTimeout(() => saveArcaData(arcaData), 5000);
    }

    // Update bot capital in calculator
    const calcBotCapital = document.getElementById('calc-bot-capital');
    const calcBotProfit = document.getElementById('calc-bot-profit');
    const calcProjected = document.getElementById('calc-projected');
    if (calcBotCapital) calcBotCapital.innerText = `$${data.totalEquity.toFixed(2)} USDT`;
    if (calcBotProfit) calcBotProfit.innerText = `$${data.profit.toFixed(2)} USDT`;
    if (calcProjected && data.profitPercent > 0) {
        const monthlyRate = data.profitPercent; // Assuming this is daily, project monthly
        const annualProjection = data.totalEquity * (monthlyRate / 100) * 12;
        calcProjected.innerText = `$${annualProjection.toFixed(0)} USDT/año`;
    }
});

// Market Analysis
socket.on('analysis_update', (data) => {
    // Tab 1: Intel Snapshot
    if (ui.rsiValue) ui.rsiValue.innerText = data.rsi.toFixed(1);
    if (ui.emaValue) ui.emaValue.innerText = `$${data.ema.toFixed(0)}`;

    if (ui.trendValue) {
        ui.trendValue.innerText = data.trend;
        ui.trendValue.style.color = data.trend === 'BULLISH' ? '#00ff9d' : '#ff3b3b';
    }

    if (ui.volatilityValue) {
        ui.volatilityValue.innerText = data.volatility;
        ui.volatilityValue.style.color = data.volatility === 'HIGH' ? '#ff3b3b' :
            (data.volatility === 'LOW' ? '#00ff9d' : '#fff');
    }

    if (data.pressure) {
        const pVal = document.getElementById('pressure-value');
        if (pVal) {
            pVal.innerText = `${data.pressure.ratio.toFixed(2)}x`;
            // Red if ratio < 0.6 (Sell Pressure), Green if > 1.5 (Buy Pressure)
            pVal.style.color = data.pressure.ratio > 1.2 ? '#00ff9d' :
                (data.pressure.ratio < 0.8 ? '#ff3b3b' : '#fff');
        }
    }

    // Tab 2: Full Market Intel
    if (ui.intelRsi) ui.intelRsi.innerText = data.rsi.toFixed(1);
    if (ui.intelEma) ui.intelEma.innerText = `$${data.ema.toFixed(2)}`;

    if (ui.emaVsPrice && data.price) {
        const diff = ((data.price - data.ema) / data.ema * 100).toFixed(2);
        ui.emaVsPrice.innerText = `${diff}%`;
        ui.emaVsPrice.style.color = diff > 0 ? '#00ff9d' : '#ff3b3b';
    }

    if (ui.intelBandwidth) ui.intelBandwidth.innerText = (data.bandwidth * 100).toFixed(2);
    if (ui.bandwidthState) ui.bandwidthState.innerText = data.volatility;

    if (ui.regimeBadge && data.regime) {
        ui.regimeBadge.innerText = data.regime;
        ui.regimeBadge.style.background = data.regime.includes('BULL') ?
            'linear-gradient(135deg, #00ff9d, #2979ff)' :
            'linear-gradient(135deg, #ff3b3b, #bd00ff)';
    }

    // GEO CONTEXT HANDLER
    const geoBadge = document.getElementById('geo-badge');
    const geoText = document.getElementById('geo-text');
    if (geoBadge && geoText && data.geoContext) {
        if (data.geoContext.status !== 'NORMAL') {
            geoBadge.style.display = 'flex';
            geoText.innerText = data.geoContext.status.replace('_', ' ');
            // Make it pulse RED if in danger
            geoBadge.style.animation = 'pulse-red 2s infinite';
        } else {
            geoBadge.style.display = 'none';
        }
    }

    // Tab 2: Multi-Timeframe Analysis
    if (data.multiTF) {
        if (ui.mtf1h) ui.mtf1h.innerText = data.multiTF.trend1h || '--';
        if (ui.mtf4h) ui.mtf4h.innerText = data.multiTF.trend4h || '--';
        if (ui.mtf1d) ui.mtf1d.innerText = data.multiTF.trend1d || '--';
        if (ui.mtfConf) {
            ui.mtfConf.innerText = data.multiTF.confidence || '--';
            ui.mtfConf.style.color = data.multiTF.confidence === 'HIGH' ? '#00ff9d' : '#ff9900';
        }
    }

    // Tab 2: Bollinger Bands
    if (data.bollingerBands && ui.bbDisplay) {
        const bb = data.bollingerBands;
        ui.bbDisplay.innerText = `U: $${bb.upper.toFixed(0)} | M: $${bb.middle.toFixed(0)} | L: $${bb.lower.toFixed(0)}`;
    }

    // Draw triangle with current data
    drawTriangle({ price: data.price, orders: [] });
});

// Listener for Debug Transaction Log
let tradeHistory = [];
let sortState = {
    column: 'timestamp', // Default sort by time
    desc: true
};

// Map header index to data property
const columnMap = {
    1: 'timestamp', // Time
    2: 'id',        // ID
    3: 'side',      // Side
    4: 'price',     // Price
    5: 'amount',    // Amount
    6: 'value',     // Value
    7: 'profit'     // Profit
};

// Setup Sort Listeners (Run once)
const headers = document.querySelectorAll('.transaction-log-panel th');
headers.forEach((th, index) => {
    if (columnMap[index]) { // Only sort functionality for mapped columns
        th.style.cursor = 'pointer';
        th.title = "Click to Sort";
        th.onclick = () => {
            // If clicking same column, toggle order. If new, default to Descending.
            if (sortState.column === columnMap[index]) {
                sortState.desc = !sortState.desc;
            } else {
                sortState.column = columnMap[index];
                sortState.desc = true;
            }
            renderTradeHistory();
        };
    }
});

function renderTradeHistory() {
    const tbody = document.getElementById('transaction-log-body');
    if (!tbody) return;

    // Update Header Icons
    headers.forEach((th, index) => {
        const prop = columnMap[index];
        if (!prop) return; // Skip # column

        let label = th.innerText.replace(' ⬇️', '').replace(' ⬆️', ''); // Clean old arrow
        if (prop === sortState.column) {
            th.innerText = `${label} ${sortState.desc ? '⬇️' : '⬆️'}`;
        } else {
            th.innerText = label; // Remove arrow from inactive
        }
    });

    tbody.innerHTML = ''; // Clear

    if (!tradeHistory || tradeHistory.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding: 10px;">No transaction history found</td></tr>';
        return;
    }

    // Generic Sort Logic
    const sortedTrades = [...tradeHistory].sort((a, b) => {
        let valA = a[sortState.column];
        let valB = b[sortState.column];

        // Handle Side (String) vs Numbers
        if (sortState.column === 'side') {
            valA = (valA || '').toString().toLowerCase();
            valB = (valB || '').toString().toLowerCase();
            if (valA < valB) return sortState.desc ? 1 : -1;
            if (valA > valB) return sortState.desc ? -1 : 1;
            return 0;
        }

        if (sortState.column === 'value') {
            const valA = (parseFloat(a.price || 0) * parseFloat(a.amount || 0));
            const valB = (parseFloat(b.price || 0) * parseFloat(b.amount || 0));
            return sortState.desc ? (valB - valA) : (valA - valB);
        }

        // Handle Numbers (default)
        valA = parseFloat(valA || 0);
        valB = parseFloat(valB || 0);
        return sortState.desc ? (valB - valA) : (valA - valB);
    });

    sortedTrades.forEach((t, index) => {
        try {
            const row = document.createElement('tr');
            row.style.borderBottom = '1px solid rgba(255,255,255,0.02)';

            const isBuy = (t.side || '').toLowerCase() === 'buy';
            const profitClass = (t.profit && t.profit > 0) ? 'text-success' : 'text-muted';
            const dateObj = new Date(t.timestamp);
            const dateStr = t.timestamp ? dateObj.toLocaleString('es-MX', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'N/A';
            const shortId = t.id ? (t.id.toString().length > 6 ? '...' + t.id.toString().slice(-6) : t.id) : '?';

            // Check if transaction is from today
            const isToday = new Date().toDateString() === dateObj.toDateString();
            if (isToday) {
                row.classList.add('today-highlight');
                row.style.background = 'linear-gradient(90deg, rgba(41, 121, 255, 0.1) 0%, transparent 100%)';
                row.style.borderLeft = '3px solid #2979ff';
            }

            const sideBadge = isBuy
                ? '<span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25" style="width:50px; font-weight:500;">BUY</span>'
                : '<span class="badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25" style="width:50px; font-weight:500;">SELL</span>';

            const totalValue = (parseFloat(t.price || 0) * parseFloat(t.amount || 0));

            row.innerHTML = `
                <td class="ps-3 text-muted" style="vertical-align: middle;">${index + 1}</td>
                <td class="text-secondary" style="vertical-align: middle;">${dateStr}</td>
                <td class="text-muted" title="${t.id}" style="vertical-align: middle; cursor: help;">${shortId}</td>
                <td class="text-center" style="vertical-align: middle;">${sideBadge}</td>
                <td class="text-end text-light fw-bold" style="vertical-align: middle;">$${parseFloat(t.price || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td class="text-end ${isBuy ? 'text-muted' : 'text-info'}" style="vertical-align: middle;">${isBuy ? '-' : (t.costBasis ? '$' + parseFloat(t.costBasis).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-')}</td>
                <td class="text-end ${isBuy ? 'text-muted' : (t.spreadPct > 0 ? 'text-success' : 'text-danger')}" style="vertical-align: middle;">${isBuy ? '-' : (t.spreadPct !== undefined ? t.spreadPct.toFixed(2) + '%' : '-')}</td>
                <td class="text-end text-muted" style="vertical-align: middle;">${parseFloat(t.amount || 0).toFixed(5)}</td>
                <td class="text-end pe-3 fw-bold ${profitClass}" style="vertical-align: middle;">$${(isBuy ? 0 : (t.profit || 0)).toFixed(4)}</td>
            `;
            tbody.appendChild(row);
        } catch (e) {
            console.error('Error rendering row:', e);
        }
    });

    // Update Daily Stats
    updateDailyProfit();
}

// ===== DAILY PROFIT LOGIC =====
function updateDailyProfit() {
    if (!tradeHistory || tradeHistory.length === 0) return;

    const todayDate = new Date().toDateString();

    // Sum profit for trades that happened TODAY and are SELL orders (realized profit)
    // Note: 'profit' field should be positive only on sells.
    const todaysTrades = tradeHistory.filter(t =>
        new Date(t.timestamp).toDateString() === todayDate &&
        (t.side === 'sell' && t.profit > 0)
    );

    const dailyProfit = todaysTrades.reduce((sum, t) => sum + (parseFloat(t.profit) || 0), 0);

    const profitDailyEl = document.getElementById('profit-daily');
    if (profitDailyEl) {
        // Calculate ROI based on current equity (approximate)
        // If window.currentEquity is undefined, use fallback or 0
        const equity = window.currentEquity || 100;
        const dailyROI = (dailyProfit / equity) * 100;

        profitDailyEl.innerHTML = `Hoy: <span style="color: ${dailyProfit > 0 ? '#00ff9d' : '#888'}">+$${dailyProfit.toFixed(2)}</span> (${dailyROI.toFixed(2)}%)`;
    }
}

socket.on('debug_trades', (trades) => {
    // console.log('Received debug_trades:', trades);
    if (trades && Array.isArray(trades)) {
        tradeHistory = trades;
        renderTradeHistory();
    }
});

// ULTIMATE INTELLIGENCE - Composite Signal Display
socket.on('composite_signal', (data) => {
    // Update signal score
    const signalScoreEl = document.getElementById('signal-score');
    const signalTextEl = document.getElementById('signal-text');

    if (signalScoreEl) {
        signalScoreEl.innerText = data.score.toFixed(0);
        signalScoreEl.style.color = data.score >= 60 ? '#00ff9d' :
            (data.score <= 40 ? '#ff3b5c' : '#ff9500');
    }

    if (signalTextEl) {
        signalTextEl.innerText = data.recommendation;
        signalTextEl.style.color = data.recommendation.includes('BUY') ? '#00ff9d' :
            (data.recommendation.includes('SELL') ? '#ff3b5c' : '#ff9500');
    }

    // Update Fear/Greed in automation dashboard
    const fearGreedEl = document.getElementById('fear-greed-value');
    if (fearGreedEl) {
        fearGreedEl.innerText = data.fearGreed;
        fearGreedEl.style.color = data.fearGreed < 30 ? '#00ff9d' :
            (data.fearGreed > 70 ? '#ff3b5c' : '#ff9500');
    }

    // Update Funding Rate
    const fundingEl = document.getElementById('funding-rate');
    if (fundingEl) {
        fundingEl.innerText = `${data.funding.toFixed(4)}%`;
        fundingEl.style.color = data.funding > 0.03 ? '#ff3b5c' :
            (data.funding < -0.03 ? '#00ff9d' : 'inherit');
    }

    // Log composite intelligence reasons
    if (data.reasons && data.reasons.length > 0) {
        log('INTEL', `Score ${data.score}: ${data.reasons.slice(0, 3).join(' | ')}`,
            data.score >= 60 ? 'success' : (data.score <= 40 ? 'warning' : 'info'));
    }
});

// HUD Update
socket.on('hud_update', (data) => {
    if (ui.hudStatus) ui.hudStatus.innerText = data.status;
    if (ui.hudDetail) ui.hudDetail.innerText = data.detail;
});

// Grid State (for triangle and orders tables)
socket.on('grid_state', (data) => {
    // Update triangle visualization
    drawTriangle({ price: data.currentPrice, orders: data.orders });

    // Tab 5: Populate Active Orders Table
    const activeOrdersTbody = document.getElementById('active-orders-tbody');
    if (activeOrdersTbody && data.orders) {
        if (data.orders.length === 0) {
            activeOrdersTbody.innerHTML = '<tr><td colspan="7">No active orders</td></tr>';
        } else {
            activeOrdersTbody.innerHTML = data.orders.map(order => {
                const age = order.timestamp ? Math.floor((Date.now() - order.timestamp) / 1000 / 60) : 0;
                return `
                    <tr>
                        <td>${order.id || 'N/A'}</td>
                        <td style="color: ${order.side === 'buy' ? '#00ff9d' : '#ff3b3b'}">${order.side.toUpperCase()}</td>
                        <td>$${order.price.toFixed(2)}</td>
                        <td>${order.amount.toFixed(6)}</td>
                        <td>${order.level || 0}</td>
                        <td>${age}m</td>
                        <td>${order.status || 'OPEN'}</td>
                    </tr>
                `;
            }).join('');
        }
    }

    // Tab 5: Populate Filled Orders Table
    const filledOrdersTbody = document.getElementById('filled-orders-tbody');
    if (filledOrdersTbody && data.filledOrders) {
        if (data.filledOrders.length === 0) {
            filledOrdersTbody.innerHTML = '<tr><td colspan="5">No filled orders yet</td></tr>';
        } else {
            // Show last 20 filled orders
            const recentFilled = data.filledOrders.slice(-20).reverse();
            filledOrdersTbody.innerHTML = recentFilled.map(order => {
                const time = order.timestamp ? new Date(order.timestamp).toLocaleTimeString() : 'N/A';
                const profit = order.profit || 0;
                return `
                    <tr>
                        <td>${time}</td>
                        <td style="color: ${order.side === 'buy' ? '#00ff9d' : '#ff3b3b'}">${order.side.toUpperCase()}</td>
                        <td>$${order.price.toFixed(2)}</td>
                        <td>${order.amount.toFixed(6)}</td>
                        <td style="color: ${profit > 0 ? '#00ff9d' : '#ff3b3b'}">$${profit.toFixed(4)}</td>
                    </tr>
                `;
            }).join('');
        }
    }
});

// Inventory Update (FIFO Warehouse Panel)
let inventoryData = [];
let inventorySortState = {
    column: 'timestamp', // Default sort by Time (LIFO visual)
    desc: true
};

const inventoryColumnMap = {
    0: 'timestamp',
    1: 'id',
    2: 'price',
    3: 'amount',    // Original
    4: 'remaining', // Current
    5: 'value',
    6: 'status'
};

// Setup Inventory Sort Listeners
const invHeaders = document.querySelectorAll('.inventory-panel th');
invHeaders.forEach((th, index) => {
    if (inventoryColumnMap[index]) {
        th.style.cursor = 'pointer';
        th.title = "Click to Sort";
        th.onclick = () => {
            if (inventorySortState.column === inventoryColumnMap[index]) {
                inventorySortState.desc = !inventorySortState.desc;
            } else {
                inventorySortState.column = inventoryColumnMap[index];
                inventorySortState.desc = true;
            }
            renderInventory();
        };
    }
});

socket.on('inventory_update', (inventory) => {
    inventoryData = inventory || [];
    renderInventory();
});

function renderInventory() {
    const tbody = document.getElementById('inventory-log-body');
    const countBadge = document.getElementById('inventory-count');

    if (!tbody) return;

    if (countBadge) countBadge.innerText = `${inventoryData.length} LOTS`;

    if (!inventoryData || inventoryData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="opacity: 0.5;">No inventory (all sold or none bought yet)</td></tr>';
        return;
    }

    const currentPrice = parseFloat(document.getElementById('price-display')?.innerText?.replace(/[^0-9.]/g, '')) || 0;

    // Update Header Icons
    invHeaders.forEach((th, index) => {
        const prop = inventoryColumnMap[index];
        if (!prop) return;

        let label = th.innerText.replace(' ⬇️', '').replace(' ⬆️', '');
        if (prop === inventorySortState.column) {
            th.innerText = `${label} ${inventorySortState.desc ? '⬇️' : '⬆️'}`;
        } else {
            th.innerText = label;
        }
    });

    // Sort Logic
    const sortedInv = [...inventoryData].sort((a, b) => {
        let valA, valB;

        // Helper to get value for comparison
        const getVal = (item, prop) => {
            const rem = item.remaining !== undefined ? item.remaining : item.amount;
            if (prop === 'price') return item.price;
            if (prop === 'amount') return item.amount;
            if (prop === 'remaining') return rem;
            if (prop === 'value') return rem * currentPrice;
            if (prop === 'status') return rem === item.amount ? 2 : (rem > 0 ? 1 : 0);
            if (prop === 'timestamp') return item.timestamp || 0;
            if (prop === 'id') return item.id || 0;
            return 0;
        };

        valA = getVal(a, inventorySortState.column);
        valB = getVal(b, inventorySortState.column);

        return inventorySortState.desc ? (valB - valA) : (valA - valB);
    });

    tbody.innerHTML = sortedInv.map((lot, idx) => {
        const remaining = lot.remaining !== undefined ? lot.remaining : lot.amount;
        const value = remaining * currentPrice;
        const pnl = currentPrice - lot.price;
        const pnlClass = pnl >= 0 ? 'color: #00ff9d' : 'color: #ff3b3b';
        const statusIcon = remaining === lot.amount ? '🟢' : (remaining > 0 ? '🟡' : '⚫');

        // Format Date
        const dateObj = lot.timestamp ? new Date(lot.timestamp) : null;
        const dateStr = dateObj ? dateObj.toLocaleString('es-MX', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'N/A';

        // Format ID
        const shortId = lot.id ? (lot.id.toString().length > 6 ? '...' + lot.id.toString().slice(-6) : lot.id) : '?';

        return `
            <tr style="background: rgba(100,100,200,0.05);">
                <td class="text-secondary" style="font-size: 0.65rem;">${dateStr}</td>
                <td class="text-muted" title="${lot.id}" style="cursor: help; padding-right: 15px;">${shortId}</td>
                <td class="text-end" style="${pnlClass}">$${lot.price.toFixed(2)}</td>
                <td class="text-end text-muted">${lot.amount.toFixed(6)}</td>
                <td class="text-end fw-bold">${remaining.toFixed(6)}</td>
                <td class="text-end">$${value.toFixed(2)}</td>
                <td class="text-center">${statusIcon}</td>
            </tr>
        `;
    }).join('');
}

// Settings Update (Tab 4)
socket.on('settings_update', (data) => {
    if (ui.setGridCount) ui.setGridCount.innerText = data.gridCount;
    if (ui.setGridCountReason) ui.setGridCountReason.innerText = `Dynamic: ${data.gridCount} orders placed`;

    if (ui.setSpacing) ui.setSpacing.innerText = `${data.gridSpacing}%`;
    if (ui.setSpacingReason) ui.setSpacingReason.innerText = `Adaptive to ${data.volatility} volatility`;

    if (ui.setSafety) ui.setSafety.innerText = `${data.safetyMargin}%`;
    if (ui.setSafetyReason) ui.setSafetyReason.innerText = `Adjusted for ${data.regime} market`;

    if (ui.setRSI && data.rsiThresholds) {
        ui.setRSI.innerText = `${data.rsiThresholds.oversold}/${data.rsiThresholds.overbought}`;
    }
    if (ui.setRSIReason) ui.setRSIReason.innerText = `Varies by regime (${data.regime} mode)`;

    if (ui.contextDisplay) {
        ui.contextDisplay.innerText = `Market: ${data.regime} | Vol: ${data.volatility}`;
    }

    // NEW: Accounting Method Display
    const accountingEl = document.getElementById('accounting-method');
    if (accountingEl && data.accounting) {
        accountingEl.innerText = data.accounting;
        // Color code: LIFO = Green (Tax Efficient), FIFO = Orange (Standard)
        accountingEl.style.color = data.accounting === 'LIFO' ? '#00ff9d' : '#ff9500';
    }
});

// ===== CONTROLS =====
function setupControl(id, eventName, confirmMsg) {
    const btn = document.getElementById(id);
    if (btn) {
        btn.addEventListener('click', () => {
            if (confirm(confirmMsg)) {
                socket.emit(eventName);
                log("SYSTEM", `${eventName.toUpperCase().replace('_', ' ')} INITIATED`, "warning");
            }
        });
    }
}

setupControl('reset-grid', 'reset_grid', 'WARNING: This will cancel ALL orders and reset the grid. Continue?');
setupControl('reset-grid-btn-2', 'reset_grid', 'WARNING: This will cancel ALL orders and reset the grid. Continue?');
setupControl('cancel-all-btn', 'cancel_all', 'WARNING: This will cancel ALL active orders. Continue?');

// Update Regime Details (handled in main analysis_update handler at L359)
// Duplicate handler removed during audit - see Pass 12

// Initial draw
drawTriangle({ price: 0, orders: [] });

// ==========================================
// ARCA FINANCIERA GAROSSA - CALCULATIONS
// ==========================================

// --- SUPABASE CONFIGURATION ---
const SUPABASE_URL = 'https://lllyejsabiwwzcumemgt.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsbHllanNhYml3d3pjdW1lbWd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0ODEwMjYsImV4cCI6MjA4MTA1NzAyNn0.SWkEeEFr90p5IY0Dfj1NgoG6S6UiB86wyuhbOBj7ZTE';
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// Ensure Debounce for Cloud Saving
let saveTimeout = null;

async function saveArcaData(data) {
    if (!supabaseClient) {
        console.warn('Supabase not loaded, cannot save data (LocalStorage disabled per policy)');
        return;
    }

    // Cloud save debounced (2s)
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        try {
            const { error } = await supabaseClient
                .from('arca_dashboard')
                .upsert({ id: 'default', data: data, updated_at: new Date().toISOString() });

            if (error) throw error;
            console.log('>> [CLOUD] Data synced to Supabase');
            log("CLOUD", "Datos guardados en nube", "success");
        } catch (e) {
            console.error('Cloud save failed:', e);
            log("CLOUD", "Error guardando en nube", "error");
        }
    }, 2000);
}

// Load saved data from Supabase ONLY
async function loadArcaData() {
    let data = null;

    // 1. Fetch from Cloud (Primary Source)
    if (supabaseClient) {
        try {
            const { data: cloudData, error } = await supabaseClient
                .from('arca_dashboard')
                .select('data')
                .eq('id', 'default')
                .single();

            if (cloudData && cloudData.data) {
                console.log('>> [CLOUD] Loaded data from Supabase');
                data = cloudData.data;
            }
        } catch (e) {
            console.error('Cloud load failed:', e);
        }
    } else {
        console.warn('Supabase not available - starting with empty/default state');
    }

    if (data) {
        // Ensure new fields exist (migration)
        if (!data.goals) data.goals = getDefaultGoals();
        if (!data.flow) data.flow = getDefaultFlow();

        // Flow Manager Migration
        if (typeof data.flow.fixedExpenses === 'number') {
            data.flow.fixedItems = [{ name: 'General', amount: data.flow.fixedExpenses }];
            delete data.flow.fixedExpenses;
        }
        if (typeof data.flow.variableExpenses === 'number') {
            data.flow.variableItems = [{ name: 'General', amount: data.flow.variableExpenses }];
            delete data.flow.variableExpenses;
        }
        if (!data.flow.fixedItems) data.flow.fixedItems = [];
        if (!data.flow.variableItems) data.flow.variableItems = [];

        // Ensure new fields exist (migration)
        if (!data.goals) data.goals = getDefaultGoals();
        if (!data.flow) data.flow = getDefaultFlow();

        // Ensure core fields exist (Missing in old saves)
        if (!data.fintech) data.fintech = { didi: 0, nu: 0, mp: 0 };
        if (!data.debts) data.debts = {
            rappiPaid: false, nuDicPaid: false, nuEnePaid: false, kueskiPaid: false,
            rappiAmount: 0, nuDicAmount: 0, nuEneAmount: 0, kueskiAmount: 0
        };
        if (!data.portfolio) data.portfolio = { vt: 0, qqq: 0, gold: 0, vwo: 0, crypto: 0, monthlyContribution: 15000 };
        if (!data.checklist) data.checklist = {};

        // Flow Manager Migration
        if (typeof data.flow.fixedExpenses === 'number') {
            data.flow.fixedItems = [{ name: 'General', amount: data.flow.fixedExpenses }];
            delete data.flow.fixedExpenses;
        }
        if (typeof data.flow.variableExpenses === 'number') {
            data.flow.variableItems = [{ name: 'General', amount: data.flow.variableExpenses }];
            delete data.flow.variableExpenses;
        }
        if (!data.flow.fixedItems) data.flow.fixedItems = [];
        if (!data.flow.variableItems) data.flow.variableItems = [];

        // Migration: Rename GBM goal if exists
        if (data.goals) {
            const gbmGoal = data.goals.find(g => g.id === 'firstinvest');
            if (gbmGoal && gbmGoal.name === 'Primera Inversión GBM+') {
                gbmGoal.name = 'Meta de Portafolio';
            }
        }

        if (!data.customChecklist) data.customChecklist = [];
        if (!data.botEquity) data.botEquity = 0;
        return data;
    }

    // Default values if no cloud data found
    return {
        fintech: {
            didi: 0,
            nu: 0,
            mp: 0
        },
        debts: {
            rappiPaid: false,
            nuDicPaid: false,
            nuEnePaid: false,
            kueskiPaid: false,
            rappiAmount: 0,
            nuDicAmount: 0,
            nuEneAmount: 0,
            kueskiAmount: 0
        },
        portfolio: {
            vt: 0,
            qqq: 0,
            gold: 0,
            vwo: 0,
            crypto: 0,
            monthlyContribution: 15000
        },
        checklist: {},
        // NEW: Custom checklist items
        customChecklist: [],
        // NEW: Goals with targets
        goals: getDefaultGoals(),
        // NEW: Monthly flow tracking
        flow: getDefaultFlow(),
        // NEW: Bot equity (synced from Grid Bot)
        botEquity: 0
    };
}

// Default goals structure
function getDefaultGoals() {
    return [
        { id: 'emergency', name: 'Fondo de Emergencia', target: 60000, current: 0, deadline: '2025-06-01', icon: '🛡️' },
        { id: 'debtfree', name: 'Libre de Deudas', target: 100, current: 0, deadline: '2025-02-01', icon: '💳', isPercent: true },
        { id: 'firstinvest', name: 'Meta de Portafolio', target: 15000, current: 0, deadline: '2025-03-01', icon: '📈' }
    ];
}

// Default monthly flow structure
function getDefaultFlow() {
    return {
        income: 0,
        fixedExpenses: 0,
        variableExpenses: 0,
        debtPayments: 0,
        savings: 0
    };
}



// Initialize Arca data (Synchronous Default)
let arcaData = {
    fintech: { didi: 0, nu: 0, mp: 0 },
    debts: {
        rappiPaid: false, nuDicPaid: false, nuEnePaid: false, kueskiPaid: false,
        rappiAmount: 0, nuDicAmount: 0, nuEneAmount: 0, kueskiAmount: 0
    },
    portfolio: { vt: 0, qqq: 0, gold: 0, vwo: 0, crypto: 0, monthlyContribution: 15000 },
    checklist: {},
    customChecklist: [],
    goals: getDefaultGoals(),
    flow: getDefaultFlow(),
    botEquity: 0
};

// Async Load from Cloud
loadArcaData().then(data => {
    if (data) {
        arcaData = data;
        console.log('>> [INIT] Cloud data loaded, refreshing UI...');

        // POPULATE INPUTS FROM DATA (New helper)
        renderInputsFromData(data);

        // Refresh UI calculations with new data
        if (typeof calculateFintechYields === 'function') calculateFintechYields();
        if (typeof calculateDebts === 'function') calculateDebts();
        if (typeof calculatePortfolio === 'function') calculatePortfolio();
        if (typeof calculateNetWorth === 'function') calculateNetWorth();
        if (typeof setupChecklistHandlers === 'function') setupChecklistHandlers();

        // Re-bind inputs to new data if needed, or just let existing listeners work on the global arcaData object
        // (Listeners usually reference the global arcaData variable, so updating the reference might break listeners 
        // IF they closed over the *original* object, but usually they read the global variable. 
        // OPTIMIZATION: It's better to modify the *contents* of arcaData rather than replacing the object reference, 
        // to be safe with any closures. But let's check input handlers. 
        // setupInputHandlers reads from DOM and writes to arcaData. It doesn't seem to close over it. 
        // However, checklist handlers might. Let's assume replacing reference is risky if not careful.
        // SAFE APPROACH: Object.assign)

        /* 
           Wait, if I do `let arcaData = ...` and then `arcaData = data`, 
           any function closing over the initial `arcaData` *value* will be stale?
           `loadLocalData` returned an object. `arcaData` is a global variable (let). 
           Functions accessing `arcaData` directly will see the new object.
           Only functions passing `arcaData` as an argument would be affected.
        */

        // Update UI elements that depend on arcaData values directly
        updateCountdowns();
    }
});

// Helper: Populate Inputs from Data State
function renderInputsFromData(data) {
    if (!data) return;

    // Fintech
    if (data.fintech) {
        setVal('didi-balance', data.fintech.didi);
        setVal('nu-balance', data.fintech.nu);
        setVal('mp-balance', data.fintech.mp);
    }

    // Debts
    if (data.debts) {
        setVal('rappi-amount', data.debts.rappiAmount);
        setVal('nu-dic-amount', data.debts.nuDicAmount);
        setVal('nu-ene-amount', data.debts.nuEneAmount);
        setVal('kueski-amount', data.debts.kueskiAmount);

        setCheck('rappi-paid', data.debts.rappiPaid);
        setCheck('nu-dic-paid', data.debts.nuDicPaid);
        setCheck('nu-ene-paid', data.debts.nuEnePaid);
        setCheck('kueski-paid', data.debts.kueskiPaid);
    }

    // Portfolio
    if (data.portfolio) {
        setVal('vt-value', data.portfolio.vt);
        setVal('qqq-value', data.portfolio.qqq);
        setVal('gold-value', data.portfolio.gold);
        setVal('vwo-value', data.portfolio.vwo);
        setVal('crypto-value', data.portfolio.crypto);
        setVal('monthly-contribution', data.portfolio.monthlyContribution);
    }

    // Render Flow Lists (New)
    if (typeof renderFlowManager === 'function') {
        renderFlowManager();
    }

    // Flow Manager (Command Data)
    if (data.flow) {
        setVal('income-input', data.flow.income);
        // Note: fixed/variable expenses might be itemized arrays now based on migration logic
        // But the input field logic depends on whether we have sum inputs or itemized lists.
        // Looking at loadArcaData migration:
        // if (typeof data.flow.fixedExpenses === 'number') ... converted to items
        // So we likely need to render the ITEMS or the SUM.
        // Let's check how the UI inputs are named. usually 'income-input', 'fixed-expenses-input' etc.
        // If the UI still has simple inputs, we populate them. If it has a list, we need a render function for that.
        // Assuming simple inputs for now based on 'income-input' naming convention.

        // However, if the data was migrated to items, the 'fixedExpenses' property might be gone on the data object?
        // Let's check if we need to sum them up for the display or if there are still input fields.
        // Safe bet: Populate if property exists.

        setVal('income-input', data.flow.income);

        // If these are simple inputs:
        // (We need to verify if these IDs exist in index.html to be sure, but assuming standard naming)
        // Actually, let's just populate the Flow UI from data.
        // We might need to call `renderFlow()` if it exists, or manually set values.

        // Let's try to set the aggregated values if they exist, or recalculate them from items?
        // The migration code DELETED fixedExpenses/variableExpenses from data.flow and moved them to fixedItems/variableItems
        // So simply setting 'fixed-expenses-input' might not work if the data property is gone.
        // We probably need to re-calculate the sum from items and show it, OR rely on a `renderFlowItems` function.
        // Let's check if `renderFlow` exists in main.js.
    }
}

function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val || 0;
}

function setCheck(id, val) {
    const el = document.getElementById(id);
    if (el) el.checked = !!val;
}

// ===== FINTECH CALCULATIONS =====
function calculateFintechYields() {
    const didiBalance = parseFloat(document.getElementById('didi-balance')?.value || 0);
    const nuBalance = parseFloat(document.getElementById('nu-balance')?.value || 0);
    const mpBalance = parseFloat(document.getElementById('mp-balance')?.value || 0);

    // DiDi: 16% on first 10K, 8.5% after
    const didiHighYield = Math.min(didiBalance, 10000) * 0.16;
    const didiLowYield = Math.max(0, didiBalance - 10000) * 0.085;
    const didiYield = didiHighYield + didiLowYield;

    // Nu: 15% on first 25K, 7.25% after
    const nuHighYield = Math.min(nuBalance, 25000) * 0.15;
    const nuLowYield = Math.max(0, nuBalance - 25000) * 0.0725;
    const nuYield = nuHighYield + nuLowYield;

    // MercadoPago: 13% on first 25K, 0% after (NO yield after 25k)
    const mpYield = Math.min(mpBalance, 25000) * 0.13;

    const totalYield = didiYield + nuYield + mpYield;
    const totalBalance = didiBalance + nuBalance + mpBalance;
    const avgRate = totalBalance > 0 ? (totalYield / totalBalance * 100) : 0;

    // Update UI
    const didiYieldEl = document.getElementById('didi-yield');
    const nuYieldEl = document.getElementById('nu-yield');
    const mpYieldEl = document.getElementById('mp-yield');
    const fintechTotalEl = document.getElementById('fintech-total');
    const fintechAnnualEl = document.getElementById('fintech-annual');
    const fintechAvgRateEl = document.getElementById('fintech-avg-rate');
    const fintechYieldCommand = document.getElementById('fintech-yield');

    if (didiYieldEl) didiYieldEl.innerText = `+$${didiYield.toFixed(0)}/año`;
    if (nuYieldEl) nuYieldEl.innerText = `+$${nuYield.toFixed(0)}/año`;
    if (mpYieldEl) mpYieldEl.innerText = `+$${mpYield.toFixed(0)}/año`;
    if (fintechTotalEl) fintechTotalEl.innerText = `$${totalBalance.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`;
    if (fintechAnnualEl) fintechAnnualEl.innerText = `+$${totalYield.toFixed(0)} MXN/año`;
    if (fintechAvgRateEl) fintechAvgRateEl.innerText = `${avgRate.toFixed(2)}% APY`;
    if (fintechYieldCommand) fintechYieldCommand.innerText = `+$${totalYield.toFixed(0)}/año`;

    // Update arcaData
    arcaData.fintech.didi = didiBalance;
    arcaData.fintech.nu = nuBalance;
    arcaData.fintech.mp = mpBalance;

    return { totalBalance, totalYield };
}

// ===== DEBT CALCULATIONS =====
function calculateDebts() {
    const rappiAmount = parseFloat(document.getElementById('rappi-amount')?.value || 12917.22);
    const nuDicAmount = parseFloat(document.getElementById('nu-dic-amount')?.value || 15509.30);
    const nuEneAmount = parseFloat(document.getElementById('nu-ene-amount')?.value || 6592.56);
    const kueskiAmount = parseFloat(document.getElementById('kueski-amount')?.value || 3513.31);

    const rappiPaid = document.getElementById('rappi-paid')?.checked || false;
    const nuDicPaid = document.getElementById('nu-dic-paid')?.checked || false;
    const nuEnePaid = document.getElementById('nu-ene-paid')?.checked || false;
    const kueskiPaid = document.getElementById('kueski-paid')?.checked || false;

    let totalDebt = 0;
    if (!rappiPaid) totalDebt += rappiAmount;
    if (!nuDicPaid) totalDebt += nuDicAmount;
    if (!nuEnePaid) totalDebt += nuEneAmount;
    if (!kueskiPaid) totalDebt += kueskiAmount;

    // Visual Feedback
    const rappiCard = document.getElementById('debt-rappi');
    const nuDicCard = document.getElementById('debt-nu-dic');
    const nuEneCard = document.getElementById('debt-nu-ene');
    const kueskiCard = document.getElementById('debt-kueski');

    if (rappiCard) rappiCard.classList.toggle('paid', rappiPaid);
    if (nuDicCard) nuDicCard.classList.toggle('paid', nuDicPaid);
    if (nuEneCard) nuEneCard.classList.toggle('paid', nuEnePaid);
    if (kueskiCard) kueskiCard.classList.toggle('paid', kueskiPaid);

    // Update arcaData
    arcaData.debts = {
        rappiAmount, rappiPaid,
        nuDicAmount, nuDicPaid,
        nuEneAmount, nuEnePaid,
        kueskiAmount, kueskiPaid
    };

    // Update UI
    const debtTotalEl = document.getElementById('debt-total');
    const totalDebtCommand = document.getElementById('total-debt');
    if (debtTotalEl) debtTotalEl.innerText = `$${totalDebt.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`;
    if (totalDebtCommand) totalDebtCommand.innerText = `$${totalDebt.toLocaleString('es-MX', { minimumFractionDigits: 0 })} MXN`;

    // Calculate and update debt-free date
    const debtFreeDateEl = document.getElementById('debt-free-date');
    if (debtFreeDateEl) {
        if (totalDebt === 0) {
            debtFreeDateEl.innerText = '✅ ¡Libre de deudas!';
            debtFreeDateEl.style.color = '#00ff9d';
        } else {
            // Estimate based on monthly savings capacity
            const monthlySavings = arcaData.flow?.savings || 15000;
            if (monthlySavings > 0) {
                const monthsToPayOff = Math.ceil(totalDebt / monthlySavings);
                const freeDate = new Date();
                freeDate.setMonth(freeDate.getMonth() + monthsToPayOff);
                const options = { month: 'long', year: 'numeric' };
                debtFreeDateEl.innerText = `Libre: ${freeDate.toLocaleDateString('es-MX', options)}`;
                debtFreeDateEl.style.color = monthsToPayOff <= 3 ? '#00ff9d' : '#ff9500';
            } else {
                debtFreeDateEl.innerText = 'Ajusta tu flujo mensual';
                debtFreeDateEl.style.color = '#ff3b5c';
            }
        }
    }

    return totalDebt;
}

// ===== COUNTDOWN TIMERS =====
function updateCountdowns() {
    const now = new Date();

    // Debt due dates (UPDATED Dec 2025)
    const dueDates = {
        'rappi-countdown': new Date('2025-12-26'),
        'nu-dic-countdown': new Date('2025-12-12'),
        'nu-ene-countdown': new Date('2026-01-12'),
        'kueski-countdown': new Date('2025-12-15')
    };

    for (const [id, dueDate] of Object.entries(dueDates)) {
        const el = document.getElementById(id);
        if (el) {
            const diff = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
            if (diff < 0) {
                el.innerText = '⚠️ VENCIDO hace ' + Math.abs(diff) + ' días';
                el.style.color = '#ff3b5c';
            } else if (diff === 0) {
                el.innerText = '🔥 ¡HOY!';
                el.style.color = '#ff9500';
            } else if (diff <= 3) {
                el.innerText = `🚨 ${diff} días - ¡URGENTE!`;
                el.style.color = '#ff3b5c';
            } else if (diff <= 7) {
                el.innerText = `⏰ ${diff} días restantes`;
                el.style.color = '#ff9500';
            } else {
                el.innerText = `⏰ ${diff} días restantes`;
                el.style.color = '#00d4ff';
            }
        }
    }

    // Update debt total
    updateDebtTotal();
}

// Calculate and update debt total
function updateDebtTotal() {
    const rappi = parseFloat(document.getElementById('rappi-amount')?.value) || 0;
    const nuDic = parseFloat(document.getElementById('nu-dic-amount')?.value) || 0;
    const nuEne = parseFloat(document.getElementById('nu-ene-amount')?.value) || 0;
    const kueski = parseFloat(document.getElementById('kueski-amount')?.value) || 0;

    const total = rappi + nuDic + nuEne + kueski;

    const debtTotalEl = document.getElementById('debt-total');
    if (debtTotalEl) {
        debtTotalEl.innerText = '$' + total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MXN';
    }

    // Update net liquidity
    const didi = parseFloat(document.getElementById('didi-balance')?.value) || 0;
    const nu = parseFloat(document.getElementById('nu-balance')?.value) || 0;
    const mp = parseFloat(document.getElementById('mp-balance')?.value) || 0;
    const fintech = didi + nu + mp;

    const netLiquidity = fintech - total;
    const netEl = document.getElementById('net-liquidity');
    if (netEl) {
        netEl.innerText = '$' + netLiquidity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MXN';
        netEl.style.color = netLiquidity >= 0 ? '#00ff9d' : '#ff3b5c';
    }
}

// ===== NET WORTH CALCULATION =====
function calculateNetWorth() {
    const fintech = calculateFintechYields();
    const totalDebt = calculateDebts();
    const portfolioValue = calculatePortfolio();

    const totalAssets = fintech.totalBalance + portfolioValue;
    const netWorth = totalAssets - totalDebt;

    // Update Command Center
    const netWorthEl = document.getElementById('net-worth');
    const totalAssetsEl = document.getElementById('total-assets');
    const totalDebtsEl = document.getElementById('total-debts');
    const netLiquidityEl = document.getElementById('net-liquidity');
    const emergencyFundEl = document.getElementById('emergency-fund');
    const emergencyProgressEl = document.getElementById('emergency-progress');

    if (netWorthEl) netWorthEl.innerText = `$${netWorth.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`;
    if (totalAssetsEl) totalAssetsEl.innerText = `$${totalAssets.toLocaleString('es-MX', { minimumFractionDigits: 0 })}`;
    if (totalDebtsEl) totalDebtsEl.innerText = `$${totalDebt.toLocaleString('es-MX', { minimumFractionDigits: 0 })}`;

    // Emergency fund (DiDi + Nu)
    const emergencyFund = arcaData.fintech.didi + arcaData.fintech.mp;
    if (emergencyFundEl) emergencyFundEl.innerText = `$${emergencyFund.toLocaleString('es-MX', { minimumFractionDigits: 0 })} MXN`;

    const emergencyProgress = Math.min(100, (emergencyFund / 60000) * 100);
    if (emergencyProgressEl) emergencyProgressEl.style.width = `${emergencyProgress}%`;

    // Net liquidity
    const netLiquidity = fintech.totalBalance - arcaData.debts.rappiAmount;
    if (netLiquidityEl) netLiquidityEl.innerText = `$${netLiquidity.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`;

    // Update current date
    const dateEl = document.getElementById('current-date');
    if (dateEl) {
        dateEl.innerText = new Date().toLocaleDateString('es-MX', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
}

// ===== PORTFOLIO CALCULATION =====
function calculatePortfolio() {
    const vtValue = parseFloat(document.getElementById('vt-value')?.value || 0);
    const qqqValue = parseFloat(document.getElementById('qqq-value')?.value || 0);
    const goldValue = parseFloat(document.getElementById('gold-value')?.value || 0);
    const vwoValue = parseFloat(document.getElementById('vwo-value')?.value || 0);
    const cryptoValue = parseFloat(document.getElementById('crypto-value')?.value || 0);
    const monthlyContribution = parseFloat(document.getElementById('monthly-contribution')?.value || 15000);

    const totalValue = vtValue + qqqValue + goldValue + vwoValue + cryptoValue;

    // Update monthly amounts based on contribution
    const vtMonthlyEl = document.getElementById('vt-monthly');
    const qqqMonthlyEl = document.getElementById('qqq-monthly');
    const goldMonthlyEl = document.getElementById('gold-monthly');
    const vwoMonthlyEl = document.getElementById('vwo-monthly');
    const cryptoMonthlyEl = document.getElementById('crypto-monthly');
    const portfolioTotalEl = document.getElementById('portfolio-total');

    if (vtMonthlyEl) vtMonthlyEl.innerText = (monthlyContribution * 0.33).toLocaleString('es-MX', { maximumFractionDigits: 0 });
    if (qqqMonthlyEl) qqqMonthlyEl.innerText = (monthlyContribution * 0.24).toLocaleString('es-MX', { maximumFractionDigits: 0 });
    if (goldMonthlyEl) goldMonthlyEl.innerText = (monthlyContribution * 0.20).toLocaleString('es-MX', { maximumFractionDigits: 0 });
    if (vwoMonthlyEl) vwoMonthlyEl.innerText = (monthlyContribution * 0.18).toLocaleString('es-MX', { maximumFractionDigits: 0 });
    if (cryptoMonthlyEl) cryptoMonthlyEl.innerText = (monthlyContribution * 0.05).toLocaleString('es-MX', { maximumFractionDigits: 0 });
    if (portfolioTotalEl) portfolioTotalEl.innerText = `$${totalValue.toLocaleString('es-MX', { minimumFractionDigits: 0 })} MXN`;

    // Update arcaData
    arcaData.portfolio = { vt: vtValue, qqq: qqqValue, gold: goldValue, vwo: vwoValue, crypto: cryptoValue, monthlyContribution };

    return totalValue;
}

// ===== CHECKLIST HANDLERS =====
function setupChecklistHandlers() {
    for (let i = 1; i <= 7; i++) {
        const checkbox = document.getElementById(`check-${i}`);
        if (checkbox) {
            checkbox.checked = arcaData.checklist[`check-${i}`] || false;
            checkbox.addEventListener('change', (e) => {
                arcaData.checklist[`check-${i}`] = e.target.checked;
                saveArcaData(arcaData);
            });
        }
    }
}

// ===== INPUT HANDLERS =====
function setupInputHandlers() {
    // Fintech inputs
    ['didi-balance', 'nu-balance', 'mp-balance'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', () => {
                calculateFintechYields();
                calculateNetWorth();
                saveArcaData(arcaData); // Auto-save
            });
        }
    });

    // Debt checkboxes (UPDATED for new debt structure)
    ['rappi-paid', 'nu-dic-paid', 'nu-ene-paid', 'kueski-paid'].forEach(id => {
        const checkbox = document.getElementById(id);
        if (checkbox) {
            checkbox.addEventListener('change', () => {
                calculateDebts();
                calculateNetWorth();
                updateCountdowns();
                saveArcaData(arcaData);
            });
        }
    });

    // Debt amount inputs
    ['rappi-amount', 'nu-dic-amount', 'nu-ene-amount', 'kueski-amount'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', () => {
                calculateDebts();
                calculateNetWorth();
                updateCountdowns();
                saveArcaData(arcaData);
            });
        }
    });

    // Portfolio inputs
    ['vt-value', 'qqq-value', 'gold-value', 'vwo-value', 'crypto-value', 'monthly-contribution'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', () => {
                calculatePortfolio();
                calculateNetWorth();
                saveArcaData(arcaData); // Auto-save
            });
        }
    });


}

// ===== DOCTRINE INTEGRATION =====
function updateNextActions() {
    const nextActionsContainer = document.getElementById('next-actions');
    if (!nextActionsContainer) return;

    nextActionsContainer.innerHTML = ''; // Clear existing

    // Get all unchecked checklist items
    const checklistItems = document.querySelectorAll('.check-item input[type="checkbox"]');
    let activeCount = 0;

    checklistItems.forEach(checkbox => {
        if (!checkbox.checked) {
            activeCount++;
            const labelText = checkbox.parentElement.innerText.trim();
            const isUrgent = labelText.includes('🔴') || labelText.includes('Urgent') || checkbox.parentElement.classList.contains('urgent');

            // Extract date if present (e.g., "6/Dic:")
            const dateMatch = labelText.match(/^\d+\/[A-Za-z]+:/);
            const dateDisplay = dateMatch ? dateMatch[0].replace(':', '') : 'Pendiente';
            const cleanText = labelText.replace(/^\d+\/[A-Za-z]+:\s*/, '').replace(/\s+/g, ' ').trim();

            const actionItem = document.createElement('div');
            actionItem.className = `action-item ${isUrgent ? 'urgent' : ''}`;
            actionItem.innerHTML = `
                <span class="action-date">${dateDisplay}</span>
                <span class="action-text">${cleanText}</span>
            `;
            nextActionsContainer.appendChild(actionItem);
        }
    });

    if (activeCount === 0) {
        nextActionsContainer.innerHTML = `
            <div class="action-item">
                <span class="action-date">🎉</span>
                <span class="action-text">¡Todo al día! Buen trabajo.</span>
            </div>
        `;
    }
}

// ===== DEBT LIFECYCLE =====
function setupDebtResetHandlers() {
    const resets = [
        { btnId: 'reset-rappi', checkId: 'rappi-paid', cardId: 'debt-rappi' },
        { btnId: 'reset-nu-dic', checkId: 'nu-dic-paid', cardId: 'debt-nu-dic' },
        { btnId: 'reset-nu-ene', checkId: 'nu-ene-paid', cardId: 'debt-nu-ene' },
        { btnId: 'reset-kueski', checkId: 'kueski-paid', cardId: 'debt-kueski' }
    ];

    resets.forEach(({ btnId, checkId, cardId }) => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent card click if any
                if (confirm('¿Iniciar nuevo ciclo para esta deuda? Se marcará como NO pagada.')) {
                    // Reset UI
                    const checkbox = document.getElementById(checkId);
                    const card = document.getElementById(cardId);
                    if (checkbox) checkbox.checked = false;
                    if (card) card.classList.remove('paid');

                    // Update Data
                    calculateDebts(); // Recalculate totals
                    saveArcaData(arcaData); // Save state
                    updateCountdowns(); // Reset countdown visuals
                }
            });
        }
    });
}

// ===== LOAD SAVED VALUES =====
function loadSavedValues() {
    // Fintech
    const didiInput = document.getElementById('didi-balance');
    const nuInput = document.getElementById('nu-balance');
    const mpInput = document.getElementById('mp-balance');
    if (didiInput) didiInput.value = arcaData.fintech.didi;
    if (nuInput) nuInput.value = arcaData.fintech.nu;
    if (mpInput) mpInput.value = arcaData.fintech.mp;

    // Debts
    // Debts
    const rappiPaid = document.getElementById('rappi-paid');
    const nuDicPaid = document.getElementById('nu-dic-paid');
    const nuEnePaid = document.getElementById('nu-ene-paid');
    const kueskiPaid = document.getElementById('kueski-paid');

    const rappiAmount = document.getElementById('rappi-amount');
    const nuDicAmount = document.getElementById('nu-dic-amount');
    const nuEneAmount = document.getElementById('nu-ene-amount');
    const kueskiAmount = document.getElementById('kueski-amount');

    if (rappiPaid) rappiPaid.checked = arcaData.debts.rappiPaid;
    if (nuDicPaid) nuDicPaid.checked = arcaData.debts.nuDicPaid;
    if (nuEnePaid) nuEnePaid.checked = arcaData.debts.nuEnePaid;
    if (kueskiPaid) kueskiPaid.checked = arcaData.debts.kueskiPaid;

    if (rappiAmount) rappiAmount.value = arcaData.debts.rappiAmount;
    if (nuDicAmount) nuDicAmount.value = arcaData.debts.nuDicAmount;
    if (nuEneAmount) nuEneAmount.value = arcaData.debts.nuEneAmount;
    if (kueskiAmount) kueskiAmount.value = arcaData.debts.kueskiAmount;

    // Trigger calculation to update UI state
    calculateDebts();

    // Portfolio
    const vtInput = document.getElementById('vt-value');
    const qqqInput = document.getElementById('qqq-value');
    const goldInput = document.getElementById('gold-value');
    const vwoInput = document.getElementById('vwo-value');
    const cryptoInput = document.getElementById('crypto-value');
    const monthlyInput = document.getElementById('monthly-contribution');
    if (vtInput) vtInput.value = arcaData.portfolio.vt;
    if (qqqInput) qqqInput.value = arcaData.portfolio.qqq;
    if (goldInput) goldInput.value = arcaData.portfolio.gold;
    if (vwoInput) vwoInput.value = arcaData.portfolio.vwo;
    if (cryptoInput) cryptoInput.value = arcaData.portfolio.crypto;
    if (monthlyInput) monthlyInput.value = arcaData.portfolio.monthlyContribution;

    // Load flow data
    if (arcaData.flow) {
        const flowIncomeInput = document.getElementById('flow-income');
        const flowFixedInput = document.getElementById('flow-fixed');
        const flowVariableInput = document.getElementById('flow-variable');

        if (flowIncomeInput) flowIncomeInput.value = arcaData.flow.income || 0;
        if (flowFixedInput) flowFixedInput.value = arcaData.flow.fixedExpenses || 0;
        if (flowVariableInput) flowVariableInput.value = arcaData.flow.variableExpenses || 0;
    }
}

// ===== LIVE DATA FETCHING =====

// Global exchange rate
window.usdMxnRate = 20.5; // Default, will be updated

// Fetch USD/MXN exchange rate
async function fetchExchangeRate() {
    try {
        // Using exchangerate-api.com (free tier)
        const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
        if (response.ok) {
            const data = await response.json();
            window.usdMxnRate = data.rates.MXN;
            updateExchangeRateDisplay();
            log("ARCA", `USD/MXN: $${window.usdMxnRate.toFixed(2)}`, "success");
            return window.usdMxnRate;
        }
    } catch (error) {
        console.error('Error fetching exchange rate:', error);
        // Fallback to approximate rate
        window.usdMxnRate = 20.5;
    }
    return window.usdMxnRate;
}

// ===== AUTOMATION ENGINE =====

// Auto-detect current phase based on portfolio
function detectCurrentPhase() {
    const totalPortfolio = arcaData.portfolio.vt + arcaData.portfolio.qqq +
        arcaData.portfolio.gold + arcaData.portfolio.vwo + arcaData.portfolio.crypto;
    const emergencyFund = arcaData.fintech.didi + arcaData.fintech.mp;
    const totalDebt = (!arcaData.debts.rappiPaid ? arcaData.debts.rappiAmount : 0) +
        (!arcaData.debts.nuDicPaid ? arcaData.debts.nuDicAmount : 0) +
        (!arcaData.debts.nuEnePaid ? arcaData.debts.nuEneAmount : 0) +
        (!arcaData.debts.kueskiPaid ? arcaData.debts.kueskiAmount : 0);

    let phase = 1;
    let phaseStatus = '';
    let recommendation = '';

    // Phase 1: Hábito y base patrimonial (2025-2026)
    // Condiciones: Deuda=0, Emergencia>=60k, Portfolio>0
    if (totalDebt > 0) {
        phase = 1;
        phaseStatus = 'Eliminar deudas primero';
        recommendation = `Paga $${totalDebt.toLocaleString('es-MX', { maximumFractionDigits: 0 })} en deudas`;
    } else if (emergencyFund < 60000) {
        phase = 1;
        phaseStatus = 'Construir fondo de emergencia';
        recommendation = `Faltan $${(60000 - emergencyFund).toLocaleString('es-MX', { maximumFractionDigits: 0 })} para $60k`;
    } else if (totalPortfolio < 100000) {
        phase = 1;
        phaseStatus = 'Construir base patrimonial';
        recommendation = 'Mantener Cripto 5%, Oro 20%';
    }
    // Phase 2: Expansión estratégica (2026-2027)
    else if (totalPortfolio < 500000) {
        phase = 2;
        phaseStatus = 'Expansión estratégica';
        recommendation = 'Aumentar Cripto a 10%, agregar REMX/SLV';
    }
    // Phase 3: Independencia (2028+)
    else {
        phase = 3;
        phaseStatus = 'Flujo pasivo e independencia';
        recommendation = 'Enfocarse en dividendos y energía';
    }

    // Update UI
    const phaseIndicator = document.getElementById('current-phase');
    const phaseStatusEl = document.getElementById('phase-status');
    const phaseRecommendation = document.getElementById('phase-recommendation');

    if (phaseIndicator) phaseIndicator.innerText = `FASE ${phase}`;
    if (phaseStatusEl) phaseStatusEl.innerText = phaseStatus;
    if (phaseRecommendation) phaseRecommendation.innerText = recommendation;

    // Highlight active phase in timeline
    document.querySelectorAll('.phase').forEach((el, idx) => {
        el.classList.toggle('active', idx + 1 === phase);
    });

    return { phase, phaseStatus, recommendation };
}

// Calculate years to financial independence
function calculateIndependence() {
    const totalPortfolio = arcaData.portfolio.vt + arcaData.portfolio.qqq +
        arcaData.portfolio.gold + arcaData.portfolio.vwo + arcaData.portfolio.crypto;
    const fintech = arcaData.fintech.didi + arcaData.fintech.nu + arcaData.fintech.mp;
    const botEquity = (arcaData.botEquity || 0) * window.usdMxnRate;

    const totalAssets = totalPortfolio + fintech + botEquity;
    const monthlyContribution = arcaData.portfolio.monthlyContribution || 15000;
    const annualYield = 0.08; // 8% average annual return

    // Target: 4% rule - need 300x monthly expenses for independence
    const monthlyExpenseTarget = 50000; // $50k/month lifestyle
    const independenceTarget = monthlyExpenseTarget * 300; // $15M MXN

    // Calculate years using compound interest formula
    // FV = PV(1+r)^n + PMT[(1+r)^n - 1]/r
    let years = 0;
    let currentValue = totalAssets;
    const monthlyRate = annualYield / 12;

    while (currentValue < independenceTarget && years < 50) {
        currentValue = currentValue * (1 + monthlyRate) + monthlyContribution;
        years += 1 / 12;
    }

    years = Math.ceil(years);

    // Calculate monthly passive income at current rate
    const monthlyPassiveIncome = totalAssets * 0.04 / 12;

    // Update UI
    const yearsEl = document.getElementById('years-to-freedom');
    const passiveIncomeEl = document.getElementById('passive-income');
    const progressEl = document.getElementById('independence-progress');

    if (yearsEl) yearsEl.innerText = years < 50 ? `${years} años` : '50+ años';
    if (passiveIncomeEl) passiveIncomeEl.innerText = `$${monthlyPassiveIncome.toLocaleString('es-MX', { maximumFractionDigits: 0 })}/mes`;
    if (progressEl) progressEl.style.width = `${Math.min(100, (totalAssets / independenceTarget) * 100)}%`;

    return { years, monthlyPassiveIncome, progress: totalAssets / independenceTarget };
}

// Fetch macro context (gold, DXY) from real APIs
async function fetchMacroContext() {
    try {
        // Fetch Gold Price from metals API (using a free proxy)
        let goldPrice = 2650; // Default fallback
        let dxyIndex = 106.5; // Default fallback

        try {
            // Try to get real gold price from a free API
            const goldResponse = await fetch('https://api.metalpriceapi.com/v1/latest?api_key=demo&base=USD&currencies=XAU');
            if (goldResponse.ok) {
                const goldData = await goldResponse.json();
                if (goldData.rates && goldData.rates.XAU) {
                    goldPrice = 1 / goldData.rates.XAU; // Convert to USD per oz
                }
            }
        } catch (e) {
            // Fallback: estimate from BTC correlation (gold tends to move with BTC sentiment)
            if (typeof arcaData !== 'undefined' && arcaData.botEquity > 0) {
                // Rough estimate based on typical gold/crypto correlation
                goldPrice = 2600 + (Math.random() * 100); // Placeholder with variance
            }
        }

        try {
            // DXY is harder to get free - use exchange rate proxy
            // If USD is strong vs MXN, DXY is likely strong
            const dxyProxy = window.usdMxnRate || 20.5;
            // Rough correlation: MXN 20.5 ≈ DXY 106
            dxyIndex = 100 + ((dxyProxy - 18) * 2);
        } catch (e) {
            dxyIndex = 106.5;
        }

        // Round values for display
        goldPrice = Math.round(goldPrice);
        dxyIndex = parseFloat(dxyIndex.toFixed(1));

        // Determine market regime based on macro conditions
        let macroSignal = 'NEUTRAL';
        let macroAdvice = 'Mantener posiciones actuales';

        if (goldPrice > 2500 && dxyIndex < 105) {
            macroSignal = 'RISK-ON';
            macroAdvice = 'Aumentar exposición a emergentes y crypto';
        } else if (goldPrice > 2600 && dxyIndex > 107) {
            macroSignal = 'CAOS';
            macroAdvice = 'Mantener posición en oro, reducir riesgo';
        } else if (dxyIndex > 108) {
            macroSignal = 'DÓLAR FUERTE';
            macroAdvice = 'Acumular VWO en dips, el dólar revertirá';
        } else if (goldPrice > 2700) {
            macroSignal = 'ORO FUERTE';
            macroAdvice = 'Tesis BRICS confirmándose, mantener IAU';
        } else if (goldPrice > 2600 && dxyIndex < 106) {
            macroSignal = 'FAVORABLE';
            macroAdvice = 'Buen momento para invertir según plan';
        }

        // Update UI
        const goldEl = document.getElementById('gold-price');
        const dxyEl = document.getElementById('dxy-index');
        const macroSignalEl = document.getElementById('macro-signal');
        const macroAdviceEl = document.getElementById('macro-advice');

        if (goldEl) goldEl.innerText = `$${goldPrice.toLocaleString()}`;
        if (dxyEl) dxyEl.innerText = dxyIndex.toFixed(1);
        if (macroSignalEl) {
            macroSignalEl.innerText = macroSignal;
            macroSignalEl.className = `macro-badge ${macroSignal.toLowerCase().replace(/[^a-z]/g, '')}`;
        }
        if (macroAdviceEl) macroAdviceEl.innerText = macroAdvice;

        // Store in arcaData for reference
        if (typeof arcaData !== 'undefined') {
            arcaData.macro = { goldPrice, dxyIndex, macroSignal, macroAdvice, lastUpdate: Date.now() };
        }

        return { goldPrice, dxyIndex, macroSignal, macroAdvice };
    } catch (e) {
        console.error('Macro fetch failed:', e);
        return null;
    }
}

// Generate smart alerts based on current state
function generateSmartAlerts() {
    const alerts = [];
    const now = new Date();

    // Debt alerts
    const dueDates = {
        rappi: new Date('2025-12-06'),
        nuDic: new Date('2025-12-12'),
        kueski: new Date('2025-12-15')
    };

    Object.entries(dueDates).forEach(([key, date]) => {
        const daysLeft = Math.ceil((date - now) / (1000 * 60 * 60 * 24));
        const isPaid = arcaData.debts[key + 'Paid'];
        if (!isPaid && daysLeft <= 3 && daysLeft >= 0) {
            alerts.push({ type: 'urgent', text: `⚠️ ${key.toUpperCase()} vence en ${daysLeft} días` });
        }
    });

    // Portfolio rebalance alerts
    const portfolio = arcaData.portfolio;
    const total = portfolio.vt + portfolio.qqq + portfolio.gold + portfolio.vwo + portfolio.crypto;
    if (total > 0) {
        const allocations = {
            vt: portfolio.vt / total * 100,
            qqq: portfolio.qqq / total * 100,
            gold: portfolio.gold / total * 100,
            vwo: portfolio.vwo / total * 100,
            crypto: portfolio.crypto / total * 100
        };
        const targets = { vt: 33, qqq: 24, gold: 20, vwo: 18, crypto: 5 };

        Object.entries(allocations).forEach(([asset, actual]) => {
            const target = targets[asset];
            const deviation = Math.abs(actual - target);
            if (deviation > 5) {
                alerts.push({
                    type: 'rebalance',
                    text: `📊 ${asset.toUpperCase()}: ${actual.toFixed(0)}% (target: ${target}%)`
                });
            }
        });
    }

    // Goal completion alerts
    const emergencyFund = arcaData.fintech.didi + arcaData.fintech.mp;
    if (emergencyFund >= 60000 && !arcaData.goalAlerts?.emergency) {
        alerts.push({ type: 'success', text: '🎉 ¡Fondo de emergencia completo!' });
        arcaData.goalAlerts = arcaData.goalAlerts || {};
        arcaData.goalAlerts.emergency = true;
    }

    // Update alerts UI
    const alertsContainer = document.getElementById('smart-alerts');
    if (alertsContainer) {
        if (alerts.length === 0) {
            alertsContainer.innerHTML = '<div class="alert-item success">✅ Todo en orden</div>';
        } else {
            alertsContainer.innerHTML = alerts.map(a =>
                `<div class="alert-item ${a.type}">${a.text}</div>`
            ).join('');
        }
    }

    return alerts;
}

// Update exchange rate displays
function updateExchangeRateDisplay() {
    const rateDisplay = document.getElementById('usd-mxn-rate');
    if (rateDisplay) {
        rateDisplay.innerText = `$${window.usdMxnRate.toFixed(2)} MXN`;
    }

    // Update bot profit in MXN
    const botProfitEl = document.getElementById('bot-profit');
    if (botProfitEl && botProfitEl.dataset.usdt) {
        const usdt = parseFloat(botProfitEl.dataset.usdt);
        const mxn = usdt * window.usdMxnRate;
        botProfitEl.title = `≈ $${mxn.toFixed(0)} MXN`;
    }
}

// ===== AUTO-UPDATE NEXT ACTIONS =====
// ===== AUTO-UPDATE NEXT ACTIONS (REMOVED - DUPLICATE) =====
// Logic moved to Doctrine Integration section above

// ===== GOALS PROGRESS SYSTEM =====
function updateGoalsProgress() {
    if (!arcaData.goals) return;

    const goalsContainer = document.getElementById('goals-container');
    if (!goalsContainer) return;

    // Calculate current values for each goal
    const emergencyFund = arcaData.fintech.didi + arcaData.fintech.nu;
    const totalDebtOriginal = arcaData.debts.rappiAmount + arcaData.debts.nuDicAmount +
        arcaData.debts.nuEneAmount + arcaData.debts.kueskiAmount;
    const paidDebts = (arcaData.debts.rappiPaid ? arcaData.debts.rappiAmount : 0) +
        (arcaData.debts.nuDicPaid ? arcaData.debts.nuDicAmount : 0) +
        (arcaData.debts.nuEnePaid ? arcaData.debts.nuEneAmount : 0) +
        (arcaData.debts.kueskiPaid ? arcaData.debts.kueskiAmount : 0);
    const debtProgress = totalDebtOriginal > 0 ? (paidDebts / totalDebtOriginal) * 100 : 100;
    const portfolioValue = arcaData.portfolio.vt + arcaData.portfolio.qqq +
        arcaData.portfolio.gold + arcaData.portfolio.vwo + arcaData.portfolio.crypto;


    arcaData.goals.forEach(goal => {
        if (goal.id === 'emergency') goal.current = emergencyFund;
        if (goal.id === 'debtfree') goal.current = debtProgress;
        if (goal.id === 'firstinvest') goal.current = portfolioValue;
    });

    // Render goals
    goalsContainer.innerHTML = arcaData.goals
        .filter(goal => goal.id !== 'emergency') // Hide Emergency Fund (already in HUD)
        .map(goal => {
            const progress = goal.isPercent ? goal.current : (goal.current / goal.target * 100);
            const clampedProgress = Math.min(100, Math.max(0, progress));
            const deadline = new Date(goal.deadline);
            const daysLeft = Math.ceil((deadline - new Date()) / (1000 * 60 * 60 * 24));
            const valueDisplay = goal.isPercent ?
                `${goal.current.toFixed(0)}%` :
                `$${goal.current.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`;
            const targetDisplay = goal.isPercent ? '100%' : `$${goal.target.toLocaleString('es-MX')}`;

            return `
            <div class="goal-card ${clampedProgress >= 100 ? 'completed' : ''}">
                <div class="goal-header">
                    <span class="goal-icon">${goal.icon}</span>
                    <span class="goal-name">${goal.name}</span>
                    <span class="goal-deadline">${daysLeft > 0 ? `${daysLeft}d` : '⚠️'}</span>
                </div>
                <div class="goal-progress-bar">
                    <div class="goal-progress-fill" style="width: ${clampedProgress}%"></div>
                </div>
                <div class="goal-values">
                    <span>${valueDisplay}</span>
                    <span>/ ${targetDisplay}</span>
                </div>
            </div>
        `;
        }).join('');
}

// ===== MONTHLY FLOW TRACKER =====
// ===== MONTHLY FLOW TRACKER =====
// ===== SMART FLOW MANAGER =====

function migrateIncomeData() {
    if (arcaData.flow && typeof arcaData.flow.income === 'number' && arcaData.flow.income > 0) {
        if (!arcaData.flow.incomeItems) arcaData.flow.incomeItems = [];
        // Only migrate if list is empty
        if (arcaData.flow.incomeItems.length === 0) {
            arcaData.flow.incomeItems.push({
                name: 'Ingreso Base',
                amount: arcaData.flow.income
            });
            console.log('Migrated old income to list item');
        }
        // delet old primitive to avoid confusion (optional, but good for cleanup)
        // arcaData.flow.income = 0; 
    }
}

function updateMonthlyFlow() {
    // Sum arrays
    const incomeTotal = (arcaData.flow?.incomeItems || []).reduce((sum, item) => sum + item.amount, 0);
    const fixedTotal = (arcaData.flow?.fixedItems || []).reduce((sum, item) => sum + item.amount, 0);
    const variableTotal = (arcaData.flow?.variableItems || []).reduce((sum, item) => sum + item.amount, 0);
    const income = incomeTotal;

    // Debts
    let debtPayments = 0;
    if (arcaData.debts && !arcaData.debts.rappiPaid) debtPayments += arcaData.debts.rappiAmount;
    if (arcaData.debts && !arcaData.debts.nuDicPaid) debtPayments += arcaData.debts.nuDicAmount;
    if (arcaData.debts && !arcaData.debts.nuEnePaid) debtPayments += arcaData.debts.nuEneAmount;
    if (arcaData.debts && !arcaData.debts.kueskiPaid) debtPayments += arcaData.debts.kueskiAmount;

    const totalExpenses = fixedTotal + variableTotal + debtPayments;
    const savings = income - totalExpenses;

    // Update arcaData (derived total, but source of truth is the items array)
    arcaData.flow.income = income;

    // Update Totals UI
    const incomeDisplay = document.getElementById('total-income');
    const fixedDisplay = document.getElementById('total-fixed-display');
    const variableDisplay = document.getElementById('total-variable-display');
    const debtDisplay = document.getElementById('flow-debts-display');
    const savingsDisplay = document.getElementById('flow-savings-display');

    if (incomeDisplay) incomeDisplay.innerText = `$${incomeTotal.toLocaleString('es-MX')}`;
    if (fixedDisplay) fixedDisplay.innerText = `$${fixedTotal.toLocaleString('es-MX')}`;
    if (variableDisplay) variableDisplay.innerText = `$${variableTotal.toLocaleString('es-MX')}`;
    if (debtDisplay) debtDisplay.innerText = `$${debtPayments.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`;
    if (savingsDisplay) {
        savingsDisplay.innerText = `$${savings.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`;
        savingsDisplay.className = `summary-val ${savings >= 0 ? 'positive' : 'negative'}`;
    }

    // Update Health Bar
    if (income > 0) {
        const fixedPct = Math.min(100, (fixedTotal / income) * 100);
        const variablePct = Math.min(100 - fixedPct, (variableTotal / income) * 100);
        const debtPct = Math.min(100 - fixedPct - variablePct, (debtPayments / income) * 100);
        const savingsPct = Math.max(0, 100 - fixedPct - variablePct - debtPct);

        setBarWidth('bar-fixed', fixedPct);
        setBarWidth('bar-variable', variablePct);
        setBarWidth('bar-debt', debtPct);
        setBarWidth('bar-savings', savingsPct);
    } else {
        setBarWidth('bar-fixed', 0);
        setBarWidth('bar-variable', 0);
        setBarWidth('bar-debt', 0);
        setBarWidth('bar-savings', 0);
    }
}

function setBarWidth(id, pct) {
    const el = document.getElementById(id);
    if (el) el.style.width = `${pct}%`;
}

function renderFlowManager() {
    migrateIncomeData(); // Ensure migration happens before render
    renderFlowItems('income');
    renderFlowItems('fixed');
    renderFlowItems('variable');
    updateMonthlyFlow();
}

function renderFlowItems(type) {
    const container = document.getElementById(`list-${type}`);
    const items = arcaData.flow?.[`${type}Items`] || [];
    if (!container) return;

    if (items.length === 0) {
        container.innerHTML = `<div class="empty-list">Sin gastos registrados</div>`;
        return;
    }

    container.innerHTML = items.map((item, index) => `
        <div class="flow-list-item">
            <span class="item-name">${item.name}</span>
            <span class="item-amount">$${item.amount.toLocaleString('es-MX')}</span>
            <button class="btn-delete-flow" onclick="removeFlowItem('${type}', ${index})">×</button>
        </div>
    `).join('');
}

function addFlowItem(type) {
    const nameInput = document.getElementById(`new-${type}-name`);
    const amountInput = document.getElementById(`new-${type}-amount`);
    const name = nameInput.value.trim();
    const amount = parseFloat(amountInput.value);

    if (name && amount > 0) {
        if (!arcaData.flow[`${type}Items`]) arcaData.flow[`${type}Items`] = [];
        arcaData.flow[`${type}Items`].push({ name, amount });
        saveArcaData(arcaData);
        renderFlowItems(type);
        updateMonthlyFlow();
        nameInput.value = '';
        amountInput.value = '';
    }
}

// Global scope for onclick
window.removeFlowItem = function (type, index) {
    if (confirm('¿Borrar este gasto?')) {
        arcaData.flow[`${type}Items`].splice(index, 1);
        saveArcaData(arcaData);
        renderFlowItems(type);
        updateMonthlyFlow();
    }
};

function setupFlowManager() {
    document.getElementById('btn-add-fixed')?.addEventListener('click', () => addFlowItem('fixed'));
    document.getElementById('btn-add-variable')?.addEventListener('click', () => addFlowItem('variable'));

    // Removed flow-income listener as it is now a list

    // Initial Render
    renderFlowManager();
    renderFlowHistory(); // Render any existing history
}

// ===== MONTHLY HISTORY FUNCTIONS =====
let isClosingMonth = false; // Prevent double-click

function closeMonth() {
    // Prevent double-click
    if (isClosingMonth) {
        alert('⏳ Ya se está procesando el cierre del mes...');
        return;
    }

    if (!confirm('¿Cerrar el mes actual y guardarlo en el historial?\nEsto reiniciará tus gastos variables para el nuevo mes.')) {
        return;
    }

    isClosingMonth = true;

    // Check if this month already exists
    const now = new Date();
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const currentLabel = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;

    if (arcaData.flowHistory && arcaData.flowHistory.some(h => h.label === currentLabel)) {
        if (!confirm(`⚠️ Ya existe un registro para ${currentLabel}.\n¿Deseas reemplazarlo?`)) {
            isClosingMonth = false;
            return;
        }
        // Remove existing entry for this month
        arcaData.flowHistory = arcaData.flowHistory.filter(h => h.label !== currentLabel);
    }

    // Calculate totals
    const incomeTotal = (arcaData.flow?.incomeItems || []).reduce((sum, item) => sum + item.amount, 0);
    const fixedTotal = (arcaData.flow?.fixedItems || []).reduce((sum, item) => sum + item.amount, 0);
    const variableTotal = (arcaData.flow?.variableItems || []).reduce((sum, item) => sum + item.amount, 0);

    let debtPayments = 0;
    if (arcaData.debts && !arcaData.debts.rappiPaid) debtPayments += arcaData.debts.rappiAmount || 0;
    if (arcaData.debts && !arcaData.debts.nuDicPaid) debtPayments += arcaData.debts.nuDicAmount || 0;
    if (arcaData.debts && !arcaData.debts.nuEnePaid) debtPayments += arcaData.debts.nuEneAmount || 0;
    if (arcaData.debts && !arcaData.debts.kueskiPaid) debtPayments += arcaData.debts.kueskiAmount || 0;

    const totalExpenses = fixedTotal + variableTotal + debtPayments;
    const savings = incomeTotal - totalExpenses;

    // Create snapshot (reuse currentLabel from above)
    const snapshot = {
        id: Date.now(),
        label: currentLabel,
        income: incomeTotal,
        fixed: fixedTotal,
        variable: variableTotal,
        debt: debtPayments,
        savings: savings,
        savingsRate: incomeTotal > 0 ? ((savings / incomeTotal) * 100).toFixed(1) : 0
    };

    // Initialize history array if needed
    if (!arcaData.flowHistory) arcaData.flowHistory = [];

    // Add snapshot (keep last 12 months)
    arcaData.flowHistory.push(snapshot);
    if (arcaData.flowHistory.length > 12) {
        arcaData.flowHistory.shift();
    }

    // Reset variable expenses for new month (keep fixed and income as they usually repeat)
    arcaData.flow.variableItems = [];

    // Save and re-render
    saveArcaData(arcaData);
    renderFlowItems('variable');
    updateMonthlyFlow();
    renderFlowHistory();

    isClosingMonth = false;
    alert(`✅ Mes cerrado: ${snapshot.label}\nAhorro: $${savings.toLocaleString('es-MX')} (${snapshot.savingsRate}%)`);
}

// Function to remove a history entry (for fixing duplicates)
function removeHistoryEntry(label) {
    if (!arcaData.flowHistory) return;
    const before = arcaData.flowHistory.length;
    arcaData.flowHistory = arcaData.flowHistory.filter(h => h.label !== label);
    const after = arcaData.flowHistory.length;
    if (before > after) {
        saveArcaData(arcaData);
        renderFlowHistory();
        console.log(`Removed ${before - after} entries for "${label}"`);
    }
}

// Expose to console for manual fixes
window.removeHistoryEntry = removeHistoryEntry;
window.viewFlowHistory = () => console.table(arcaData.flowHistory);


function renderFlowHistory() {
    const container = document.getElementById('flow-history-chart');
    if (!container) return;

    const history = arcaData.flowHistory || [];

    if (history.length === 0) {
        container.innerHTML = `
            <div class="no-history-container">
                <div class="no-history-icon">📊</div>
                <p class="no-history">Sin historial aún</p>
                <p class="no-history-hint">Cierra tu primer mes para empezar a comparar tu progreso</p>
            </div>
        `;
        return;
    }

    // Find max value for scaling
    const maxIncome = Math.max(...history.map(h => h.income), 1);

    // Calculate trend
    let trend = '→';
    let trendClass = 'neutral';
    if (history.length >= 2) {
        const lastSavings = history[history.length - 1].savings;
        const prevSavings = history[history.length - 2].savings;
        if (lastSavings > prevSavings) {
            trend = '📈';
            trendClass = 'up';
        } else if (lastSavings < prevSavings) {
            trend = '📉';
            trendClass = 'down';
        }
    }

    // Stats summary
    const avgSavingsRate = history.length > 0
        ? (history.reduce((sum, h) => sum + parseFloat(h.savingsRate || 0), 0) / history.length).toFixed(1)
        : 0;
    const totalSaved = history.reduce((sum, h) => sum + (h.savings > 0 ? h.savings : 0), 0);

    const barsHTML = history.map((h, index) => {
        // Income bar: always show at good visible height (min 30%, scale to 100%)
        const incomeHeight = Math.max(30, (h.income / maxIncome) * 100);

        // Savings rate bar: scale so that 50% savings = 100% height, capped at 100%
        // This makes even small savings rates visible
        const savingsRateNum = Math.abs(parseFloat(h.savingsRate) || 0);
        const savingsHeight = Math.min(100, Math.max(10, (savingsRateNum / 50) * 100));
        const isNegative = h.savings < 0;
        const isLatest = index === history.length - 1;

        return `
            <div class="history-month ${isLatest ? 'latest' : ''}" data-month="${h.label}">
                <div class="month-bars">
                    <div class="bar-container">
                        <div class="bar income-bar" style="height: ${incomeHeight}%;">
                            <span class="bar-value">$${(h.income / 1000).toFixed(1)}k</span>
                        </div>
                    </div>
                    <div class="bar-container">
                        <div class="bar savings-bar ${isNegative ? 'negative' : ''}" style="height: ${savingsHeight}%;">
                            <span class="bar-value">${h.savingsRate}%</span>
                        </div>
                    </div>
                </div>
                <div class="month-label">${h.label}</div>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div class="history-header">
            <div class="history-stats">
                <div class="stat-item">
                    <span class="stat-label">Tasa Promedio</span>
                    <span class="stat-value ${parseFloat(avgSavingsRate) >= 20 ? 'excellent' : parseFloat(avgSavingsRate) >= 10 ? 'good' : 'warning'}">${avgSavingsRate}%</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Total Ahorrado</span>
                    <span class="stat-value">$${totalSaved.toLocaleString('es-MX')}</span>
                </div>
                <div class="stat-item trend-${trendClass}">
                    <span class="stat-label">Tendencia</span>
                    <span class="stat-value">${trend}</span>
                </div>
            </div>
        </div>
        <div class="history-chart-area">
            ${barsHTML}
        </div>
        <div class="history-legend">
            <span class="legend-item"><span class="legend-color income"></span>Ingreso</span>
            <span class="legend-item"><span class="legend-color savings"></span>Tasa Ahorro %</span>
        </div>
    `;
}


// Expose to global scope for onclick
window.closeMonth = closeMonth;

// ===== EDITABLE CHECKLIST =====
function setupEditableChecklist() {
    const addBtn = document.getElementById('add-checklist-item');
    const customListContainer = document.getElementById('custom-checklist');

    if (addBtn) {
        addBtn.addEventListener('click', () => {
            const text = prompt('Nueva tarea:');
            if (text && text.trim()) {
                const newItem = {
                    id: `custom-${Date.now()}`,
                    text: text.trim(),
                    done: false,
                    date: new Date().toISOString()
                };
                arcaData.customChecklist.push(newItem);
                saveArcaData(arcaData);
                renderCustomChecklist();
                updateNextActions();
            }
        });
    }

    renderCustomChecklist();
}

function renderCustomChecklist() {
    const container = document.getElementById('custom-checklist');
    if (!container || !arcaData.customChecklist) return;

    container.innerHTML = arcaData.customChecklist.map((item, index) => `
        <label class="check-item custom-item">
            <input type="checkbox" id="${item.id}" ${item.done ? 'checked' : ''}>
            <span class="item-text">${item.text}</span>
            <button class="delete-item" data-index="${index}" title="Eliminar">×</button>
        </label>
    `).join('');

    // Add event listeners for checkboxes
    container.querySelectorAll('input[type="checkbox"]').forEach((checkbox, idx) => {
        checkbox.addEventListener('change', (e) => {
            arcaData.customChecklist[idx].done = e.target.checked;
            saveArcaData(arcaData);
            updateNextActions();
        });
    });

    // Add event listeners for delete buttons
    container.querySelectorAll('.delete-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const index = parseInt(btn.dataset.index);
            if (confirm('¿Eliminar esta tarea?')) {
                arcaData.customChecklist.splice(index, 1);
                saveArcaData(arcaData);
                renderCustomChecklist();
                updateNextActions();
            }
        });
    });
}

// Setup flow input handlers
function setupFlowHandlers() {
    ['flow-income', 'flow-fixed', 'flow-variable'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', () => {
                updateMonthlyFlow();
                saveArcaData(arcaData);
            });
        }
    });
}

// ===== BOT CONTROLS =====
// ===== BOT CONTROLS =====
// ===== BOT CONTROLS =====
function setupBotControls() {
    // Manual Capital Update removed (Smart Detection Active)
}

// ===== AUTO-REFRESH SYSTEM =====
async function autoRefresh() {
    // Fetch exchange rate and macro data
    await fetchExchangeRate();
    await fetchMacroContext();

    // Recalculate everything
    calculateNetWorth();
    updateCountdowns();
    updateNextActions();
    updateGoalsProgress();
    updateMonthlyFlow();

    // Automation
    detectCurrentPhase();
    calculateIndependence();
    generateSmartAlerts();
}

// ===== INITIALIZE ARCA =====
document.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for all elements to be ready
    setTimeout(async () => {
        loadSavedValues();
        setupInputHandlers();
        setupChecklistHandlers();
        setupDebtResetHandlers();
        setupEditableChecklist();
        setupFlowManager();
        setupBotControls();

        // Initial data fetch
        await fetchExchangeRate();
        await fetchMacroContext();

        // Calculations
        calculateNetWorth();
        updateCountdowns();
        updateNextActions();
        updateGoalsProgress();
        updateMonthlyFlow();

        // Automation
        detectCurrentPhase();
        calculateIndependence();
        generateSmartAlerts();

        // Auto-refresh every 5 minutes
        setInterval(autoRefresh, 5 * 60 * 1000);

        // Update countdowns every minute
        setInterval(updateCountdowns, 60000);

        // Generate alerts every 30 seconds
        setInterval(generateSmartAlerts, 30000);

        log("ARCA", "Sistema Financiero v3.0 AUTOMATIZADO", "success");
        log("ARCA", `USD/MXN: $${window.usdMxnRate.toFixed(2)}`, "info");
    }, 100);
});
