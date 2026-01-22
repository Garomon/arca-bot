const fs = require('fs');
const path = require('path');
const http = require('http');

// CONFIGURATION
const MXN_USD_RATE = 20.5;
const MILLION_TARGET = 1000000;

// Calculate REAL monthly contribution from deposits.json (like Life Coach)
function calculateRealMonthlyContribution() {
    try {
        const depositsFile = path.join(__dirname, '..', 'data', 'deposits.json');
        if (!fs.existsSync(depositsFile)) return 500; // Default fallback

        const depositsData = JSON.parse(fs.readFileSync(depositsFile, 'utf8'));
        if (!depositsData.deposits || depositsData.deposits.length === 0) return 500;

        let totalDeposits = 0;
        let firstDepositDate = null;

        depositsData.deposits.forEach(d => {
            // Skip rebalances (no actual deposit amount)
            if (d.type === 'rebalance' || !d.amount) return;

            if (d.amount > 0) {
                totalDeposits += d.amount;
                if (!firstDepositDate || d.date < firstDepositDate) {
                    firstDepositDate = d.date;
                }
            }
        });

        if (!firstDepositDate || totalDeposits === 0) return 500;

        // Calculate months active
        const monthsActive = Math.max(1, Math.ceil((Date.now() - new Date(firstDepositDate)) / (1000 * 60 * 60 * 24 * 30)));
        const avgMonthly = Math.round(totalDeposits / monthsActive);

        return avgMonthly;
    } catch (e) {
        return 500; // Default fallback
    }
}

// Use REAL data instead of hardcoded
const MONTHLY_CONTRIBUTION_USD = calculateRealMonthlyContribution();
const MONTHLY_CONTRIBUTION_MXN = MONTHLY_CONTRIBUTION_USD * MXN_USD_RATE;

const BOT_DIR = path.join(__dirname, '..');
const SESSIONS_DIR = path.join(BOT_DIR, 'data', 'sessions');
const DEPOSITS_FILE = path.join(BOT_DIR, 'data', 'deposits.json');

// Bot API ports to try
const BOT_PORTS = [3000, 3001, 3002];

// Helper to fetch from bot API
function fetchFromBot(port, endpoint) {
    return new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${port}${endpoint}`, { timeout: 3000 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
}

// Get REAL total equity from Binance via bot API
async function getRealBinanceEquity() {
    for (const port of BOT_PORTS) {
        try {
            const data = await fetchFromBot(port, '/api/balance');
            if (data && data.totalEquity > 0) {
                return data.totalEquity;
            }
        } catch (e) { /* try next port */ }
    }
    return null;
}

function findAllStateFiles() {
    try {
        let dir = SESSIONS_DIR;
        if (!fs.existsSync(dir)) dir = BOT_DIR;
        const files = fs.readdirSync(dir);
        const stateFiles = files.filter(f => f.endsWith('state.json') && f.startsWith('VANTAGE01_') && !f.includes('template') && !f.includes('backup'));
        return stateFiles.map(f => path.join(dir, f));
    } catch (e) {
        return [];
    }
}

// TWR Logic Ported from Dashboard/GridBot is NOT NEEDED HERE if we use simple TWR logic for projection
// Actually, we DO need it to calculate the "Effective Capital" for Yield Accuracy
function calculateTWRCapital(deposits, endDate = Date.now()) {
    if (!deposits || deposits.length === 0) return 0;

    const sortedDeposits = [...deposits].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let totalWeightedCapital = 0;
    let totalDays = 0;
    let runningCapital = 0;

    for (let i = 0; i < sortedDeposits.length; i++) {
        const deposit = sortedDeposits[i];
        const depositDate = new Date(deposit.date).getTime();
        const nextDate = (i < sortedDeposits.length - 1) ? new Date(sortedDeposits[i + 1].date).getTime() : endDate;

        runningCapital += (parseFloat(deposit.amount) || 0);

        const periodDuration = Math.max(0, nextDate - depositDate);
        const periodDays = periodDuration / (1000 * 60 * 60 * 24);

        totalWeightedCapital += runningCapital * periodDays;
        totalDays += periodDays;
    }

    return totalDays > 0 ? (totalWeightedCapital / totalDays) : runningCapital;
}

async function calculateSwarmMetrics() {
    const stateFiles = findAllStateFiles();
    let totalInvested = 0;
    let twrCapital = 0;
    let depositsList = [];

    // 1. Get REAL Total Invested from deposits.json (SOURCE OF TRUTH for Capital)
    try {
        if (fs.existsSync(DEPOSITS_FILE)) {
            const depositsData = JSON.parse(fs.readFileSync(DEPOSITS_FILE, 'utf8'));
            if (depositsData.deposits && Array.isArray(depositsData.deposits)) {
                depositsList = depositsData.deposits;
                totalInvested = depositsList.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);

                // Calculate TWR Capital
                twrCapital = calculateTWRCapital(depositsList);
            }
        }
    } catch (e) { console.error("Error reading deposits.json:", e.message); }

    // Fallback if no deposits file
    let fallbackCapital = 0;
    let totalProfit = 0;
    let globalOldestTrade = Date.now();
    let oldestDepositDate = Date.now();

    // Also get oldest deposit date from deposits.json
    if (depositsList.length > 0) {
        const dates = depositsList.map(d => new Date(d.date).getTime());
        oldestDepositDate = Math.min(...dates);
    }

    stateFiles.forEach(file => {
        try {
            const state = JSON.parse(fs.readFileSync(file, 'utf8'));

            const profit = state.totalProfit || 0;
            const filledOrders = state.filledOrders || [];
            const capital = state.initialCapital || 100;

            fallbackCapital += capital;
            totalProfit += profit;

            if (filledOrders.length > 0) {
                filledOrders.sort((a, b) => a.timestamp - b.timestamp);
                const botOldest = filledOrders[0].timestamp;
                if (botOldest < globalOldestTrade) {
                    globalOldestTrade = botOldest;
                }
            }
        } catch (e) { /* Skip */ }
    });

    // If totalInvested is 0 (missing file), use fallback
    if (totalInvested === 0) {
        totalInvested = fallbackCapital;
        twrCapital = fallbackCapital; // No history, assume constant
    }

    // Use oldest trade OR oldest deposit (whichever is earlier) for days active
    const startTimeByTrades = globalOldestTrade;
    const startTimeByDeposits = oldestDepositDate;
    const effectiveStartTime = Math.min(startTimeByTrades, startTimeByDeposits);
    const daysActive = Math.max(1, (Date.now() - effectiveStartTime) / (1000 * 60 * 60 * 24));

    // 2. Get REAL equity from Binance API (SOURCE OF TRUTH for Current Value)
    const binanceEquity = await getRealBinanceEquity();

    // 3. Calculate metrics
    const currentEquity = binanceEquity || (totalInvested + totalProfit);

    // A) NET EQUITY YIELD (Hard Mode)
    // Formula: (Final / TWR_Capital)^(1/days) - 1 ?? No, standard CAGR uses Initial.
    // However, for "Yield Performance", TWR is best.
    // If we use TWR Capital as the denominator, we get the true performance yield.

    let netEquityYield = 0.0001;
    if (twrCapital > 0 && currentEquity > 0) {
        // Simple ROI over TWR Capital
        const totalNetROI = (currentEquity - totalInvested) / twrCapital;
        const dailyNetROI = totalNetROI / daysActive;
        netEquityYield = dailyNetROI;

        // Alternatively, classic TWR compounding calc:
        // (End/Start)^(1/n) but Start varies. 
        // We stick to: Daily Yield = (Total Profit / TWR Capital) / Days
    }

    // B) CASH FLOW YIELD (The Engine)
    // This represents the "printing power" of the bots
    let cashFlowYield = 0.0001;
    if (twrCapital > 0 && daysActive > 0) {
        cashFlowYield = totalProfit / twrCapital / daysActive;
    }

    return {
        netEquityYield,
        cashFlowYield,
        totalCapital: currentEquity,
        totalProfit,
        daysActive,
        totalInvested,
        twrCapital // Export for logging
    };
}

// Calculate time to reach target with compound interest + monthly contributions
function timeToTarget(startBalance, dailyYield, monthlyContrib, target) {
    let balance = startBalance;
    let months = 0;
    const maxMonths = 600; // 50 years cap

    while (balance < target && months < maxMonths) {
        // Compound daily for a month
        for (let d = 0; d < 30; d++) {
            balance += balance * dailyYield;
        }
        balance += monthlyContrib;
        months++;
    }

    if (months >= maxMonths) return null;

    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    return { months, years, remainingMonths, finalBalance: balance };
}

// Get progression milestones
function getProgressionTable(startBalance, dailyYield, monthlyContrib) {
    const milestones = [];
    let balance = startBalance;

    for (let year = 1; year <= 10; year++) {
        for (let month = 0; month < 12; month++) {
            for (let d = 0; d < 30; d++) {
                balance += balance * dailyYield;
            }
            balance += monthlyContrib;
        }
        milestones.push({ year, balance });
    }

    return milestones;
}

async function analyzeAndProject() {
    const { netEquityYield, cashFlowYield, totalCapital, totalProfit, daysActive, totalInvested, twrCapital } = await calculateSwarmMetrics();

    // Alias for backward compatibility with rest of script
    const currentCapital = totalCapital;

    // UNIFIED: Use TWR APY (same as Life Coach) for consistency
    // TWR APY = (totalProfit / twrCapital) * (365 / daysActive) * 100
    const twrAPY = (totalProfit / twrCapital) * (365 / daysActive) * 100;
    const netTwrAPY = ((totalCapital - totalInvested) / twrCapital) * (365 / daysActive) * 100;

    // Derive daily yield FROM TWR APY (for consistent projections)
    // dailyYield = (1 + APY)^(1/365) - 1
    const projectionYield = Math.pow(1 + twrAPY / 100, 1 / 365) - 1;
    const projectionYieldPct = (projectionYield * 100).toFixed(3);

    const logs = [];
    const log = (msg) => { console.log(msg); logs.push(msg); };

    // ═══════════════════════════════════════════════════════════
    // ROAD TO $1,000,000 USD
    // ═══════════════════════════════════════════════════════════
    log(`\n💎 ═══════════════════════════════════════════════════════════`);
    log(`                    ROAD TO $1,000,000 USD`);
    log(`═══════════════════════════════════════════════════════════`);

    log(`\n📊 TU SITUACIÓN ACTUAL:`);
    log(`   Capital Invertido:  $${totalInvested.toLocaleString('en-US', { maximumFractionDigits: 2 })} USD`);
    log(`   Capital TWR (Avg):  $${twrCapital.toLocaleString('en-US', { maximumFractionDigits: 2 })} USD (Time-Weighted)`);
    log(`   Capital Actual:     $${totalCapital.toLocaleString('en-US', { maximumFractionDigits: 2 })} USD (Binance)`);
    log(`   Profit Realizado:   $${totalProfit.toLocaleString('en-US', { maximumFractionDigits: 2 })} USD (Cash Flow)`);
    log(`   Días Activo:        ${daysActive.toFixed(1)} días`);
    log(`   -----------------------------------------------------------`);
    log(`   🔥 TWR APY: ${twrAPY.toFixed(0)}% (Cash Flow) -> Daily: ${projectionYieldPct}%`);
    log(`   🧊 TWR APY: ${netTwrAPY.toFixed(0)}% (Net Equity)`);

    log(`\n👉 USANDO TWR APY (${twrAPY.toFixed(0)}%) PARA PROYECCIÓN:`);
    log(`   (Consistente con Life Coach - método financiero estándar)`);

    // Time to milestones
    const to100k = timeToTarget(totalCapital, projectionYield, MONTHLY_CONTRIBUTION_USD, 100000);
    const to500k = timeToTarget(totalCapital, projectionYield, MONTHLY_CONTRIBUTION_USD, 500000);
    const to1M = timeToTarget(totalCapital, projectionYield, MONTHLY_CONTRIBUTION_USD, MILLION_TARGET);

    log(`\n⏱️ TIEMPO ESTIMADO PARA METAS (Con $${MONTHLY_CONTRIBUTION_USD.toFixed(0)}/mes):`);
    if (to100k) {
        log(`   🥉 $100,000 USD:    ${to100k.years} años ${to100k.remainingMonths} meses`);
    }
    if (to500k) {
        log(`   🥈 $500,000 USD:    ${to500k.years} años ${to500k.remainingMonths} meses`);
    }
    if (to1M) {
        log(`   🥇 $1,000,000 USD:  ${to1M.years} años ${to1M.remainingMonths} meses 🎉`);
    } else {
        log(`   🥇 $1,000,000 USD:  >50 años (necesitas más yield o capital)`);
    }

    // Progression Table
    const progression = getProgressionTable(totalCapital, projectionYield, MONTHLY_CONTRIBUTION_USD);
    log(`\n📈 PROYECCIÓN ANUAL (con ${projectionYieldPct}%/día):`);
    log(`   ┌────────┬─────────────────────┐`);
    log(`   │  Año   │  Balance Estimado   │`);
    log(`   ├────────┼─────────────────────┤`);
    progression.forEach(m => {
        const balanceStr = `$${m.balance.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
        const marker = m.balance >= MILLION_TARGET ? ' 🎉' : '';
        log(`   │  ${m.year.toString().padStart(2)}    │  ${balanceStr.padStart(17)}${marker} │`);
    });
    log(`   └────────┴─────────────────────┘`);

    // ═══════════════════════════════════════════════════════════
    // VS BANK COMPARISON
    // ═══════════════════════════════════════════════════════════
    const scenarios = [
        { name: "🏦 BANCO (CETES 10%)", yield: 0.00026 },
        { name: `📊 TU REALIDAD (${projectionYieldPct}%)`, yield: projectionYield, highlight: true },
        { name: "🐻 PESIMISTA (0.25%)", yield: 0.0025 },
        { name: "⚖️ REALISTA (0.50%)", yield: 0.0050 },
        { name: "🦄 OPTIMISTA (0.82%)", yield: 0.0082 }
    ];

    log(`\n💰 VS BANK COMPARISON (${MONTHLY_CONTRIBUTION_MXN} MXN/mo) [5 AÑOS]`);
    log(`---------------------------------------------------------------`);

    scenarios.forEach(scenario => {
        let balance = currentCapital;
        let totalMonthlyDeposits = 0;

        for (let month = 1; month <= 60; month++) {
            for (let d = 0; d < 30; d++) {
                balance += balance * scenario.yield;
            }
            balance += MONTHLY_CONTRIBUTION_USD;
            totalMonthlyDeposits += MONTHLY_CONTRIBUTION_USD;
        }

        const totalInvestedUSD = currentCapital + totalMonthlyDeposits;
        const finalBalanceMXN = balance * MXN_USD_RATE;
        const totalInvestedMXN = totalInvestedUSD * MXN_USD_RATE;
        const netProfitMXN = finalBalanceMXN - totalInvestedMXN;
        const roi = ((finalBalanceMXN / totalInvestedMXN) - 1) * 100;

        log(`\n👉 ${scenario.name}`);
        log(`   💵 Tú Haz Puesto:  $${totalInvestedMXN.toLocaleString('en-US', { maximumFractionDigits: 0 })} MXN`);
        log(`   💎 Valor Total:    $${finalBalanceMXN.toLocaleString('en-US', { maximumFractionDigits: 0 })} MXN`);
        log(`   📈 Tu Ganancia:    $${netProfitMXN.toLocaleString('en-US', { maximumFractionDigits: 0 })} MXN`);
        log(`   🔥 ROI Total:      ${roi.toFixed(0)}%`);

        if (scenario.name.includes("BANCO")) {
            log(`   ⚠️ NOTA: Apenas cubres inflación.`);
        }
    });

    // ═══════════════════════════════════════════════════════════
    // 🛡️ PERFIL DEL TECNOMANTE (RPG STATUS)
    // ═══════════════════════════════════════════════════════════

    // Fetch RPG data from running bot API for sync with dashboard UX
    let rpgData = null;
    try {
        const { execSync } = require('child_process');
        const rpgJson = execSync('curl -s http://localhost:3000/api/rpg 2>/dev/null || curl -s http://localhost:3001/api/rpg 2>/dev/null || curl -s http://localhost:3002/api/rpg 2>/dev/null', { timeout: 5000 }).toString().trim();
        if (rpgJson && rpgJson.startsWith('{')) {
            rpgData = JSON.parse(rpgJson);
        }
    } catch (e) { /* Fallback to manual calculation */ }

    // Use API data if available, otherwise calculate manually
    let currentXP, currentLevel, title, nextLevelXP;

    if (rpgData && rpgData.xp) {
        // SYNCED with dashboard UX
        currentXP = rpgData.xp;
        currentLevel = rpgData.level;
        title = rpgData.title;
        nextLevelXP = rpgData.nextLevelXp;
    } else {
        // Fallback: manual calculation
        const baseXP = 810;
        const xpHit_Profit = totalProfit * 50;
        const xpHit_Time = daysActive * 20;
        currentXP = Math.floor(baseXP + xpHit_Profit + xpHit_Time);

        const LEVEL_DATA = [
            // TIER 1: DESPERTAR (Primeros pasos)
            { level: 1, xp: 0, title: "Soñador" },
            { level: 2, xp: 100, title: "Aprendiz del Grid" },
            { level: 3, xp: 250, title: "Iniciado" },
            { level: 4, xp: 500, title: "Explorador de Mercados" },
            { level: 5, xp: 800, title: "Guardián del Capital" },
            // TIER 2: CRECIMIENTO (Construyendo base)
            { level: 6, xp: 1200, title: "Estratega Novato" },
            { level: 7, xp: 1800, title: "Domador de Volatilidad" },
            { level: 8, xp: 2500, title: "Mercader Errante" },
            { level: 9, xp: 3500, title: "Señor de la Forja" },
            { level: 10, xp: 5000, title: "Maestro del Spread" },
            // TIER 3: DOMINIO (Control del arte)
            { level: 11, xp: 7000, title: "Arcano Financiero" },
            { level: 12, xp: 10000, title: "Campeón del Grid" },
            { level: 13, xp: 14000, title: "Leyenda Cripto" },
            { level: 14, xp: 19000, title: "Titán del Mercado" },
            { level: 15, xp: 25000, title: "Oráculo de Precios" },
            // TIER 4: ASCENSIÓN (Riqueza creciente)
            { level: 16, xp: 35000, title: "Conquistador Financiero" },
            { level: 17, xp: 50000, title: "Emperador del Capital" },
            { level: 18, xp: 70000, title: "Arquitecto de Fortunas" },
            { level: 19, xp: 100000, title: "Señor del Compuesto" },
            { level: 20, xp: 140000, title: "Inmortal del Trading" },
            // TIER 5: TRASCENDENCIA (Elite millonaria)
            { level: 21, xp: 200000, title: "Dios del Grid" },
            { level: 22, xp: 300000, title: "Tejedor del Destino" },
            { level: 23, xp: 450000, title: "El Eterno" },
            { level: 24, xp: 700000, title: "Creador de Legados" },
            { level: 25, xp: 1000000, title: "TRASCENDIDO - Cuna de Oro" }
        ];

        let currentLevelData = LEVEL_DATA[0];
        let nextLevelData = LEVEL_DATA[1];
        for (let i = 0; i < LEVEL_DATA.length; i++) {
            if (currentXP >= LEVEL_DATA[i].xp) {
                currentLevelData = LEVEL_DATA[i];
                nextLevelData = LEVEL_DATA[i + 1] || { level: 99, xp: 99999999, title: "Ascendido" };
            }
        }
        currentLevel = currentLevelData.level;
        title = currentLevelData.title;
        nextLevelXP = nextLevelData.xp;
    }

    // Quest System (Dynamic based on equity/days)
    let activeQuest, questStatus, questObjective, questProgress;
    if (currentCapital >= 1500) {
        activeQuest = "El Rito de Fortalecimiento";
        questObjective = "Mantener el sistema activo por 30 días";
        questProgress = `${Math.min(daysActive, 30).toFixed(0)}/30 días`;
        questStatus = daysActive >= 30 ? "COMPLETADA" : "EN PROGRESO";
    } else {
        activeQuest = "El Cruce del Valle";
        questObjective = "Alcanzar $1,500 USD de capital";
        questProgress = `${currentCapital.toFixed(0)}/$1,500 (${((currentCapital/1500)*100).toFixed(0)}%)`;
        questStatus = currentCapital >= 1500 ? "COMPLETADA" : "EN PROGRESO";
    }

    // ASCII XP Bar
    const barLength = 20;
    const fillPercent = Math.min(1, currentXP / nextLevelXP);
    const filledChars = Math.floor(barLength * fillPercent);
    const emptyChars = barLength - filledChars;
    const xpBar = "█".repeat(filledChars) + "░".repeat(emptyChars);

    log("");
    log("🛡️  PERFIL DEL TECNOMANTE (RPG STATUS)");
    log("   ═════════════════════════════════════════════");
    log(`   👤 Jugador:      Garossa`);
    log(`   🏅 Nivel:        ${currentLevel} [${title}]`);
    log(`   ✨ XP Actual:    ${currentXP} / ${nextLevelXP}`);
    log(`      Progreso:     [${xpBar}] ${(fillPercent * 100).toFixed(1)}%`);
    log("   ═════════════════════════════════════════════");
    log(`   📜 Misión Activa: ${activeQuest}`);
    log(`   🎯 Objetivo:      ${questObjective}`);
    log(`   📊 Progreso:      ${questProgress}`);
    log(`   ✅ Estado:        ${questStatus}`);
    log("   ═════════════════════════════════════════════");

    // ═══════════════════════════════════════════════════════════
    // 🚀 WEALTH ROADMAP: CAMINO A LA ÉLITE 0.001%
    // ═══════════════════════════════════════════════════════════
    log(`\n🚀 ═══════════════════════════════════════════════════════════`);
    log(`              WEALTH ROADMAP: SNOWBALL STRATEGY`);
    log(`═══════════════════════════════════════════════════════════`);
    log(`\n   El bot es tu MÁQUINA DE CASH FLOW. Pero para ser millonario`);
    log(`   más rápido, diversifica y REINVIERTE TODO en el bot.`);
    log(`\n   ┌─────────────┬────────────────────────────────────────────┐`);
    log(`   │   EQUITY    │   ACCIÓN ESTRATÉGICA                       │`);
    log(`   ├─────────────┼────────────────────────────────────────────┤`);
    log(`   │  $0-$5k     │ 🎯 100% al bot. No toques nada.            │`);
    log(`   │             │    Solo acumula y deja componer.           │`);
    log(`   ├─────────────┼────────────────────────────────────────────┤`);
    log(`   │  $5k-$10k   │ 📚 Abre cuenta GBM+/Kuspit.                │`);
    log(`   │             │    Aprende sobre VOO/VTI (S&P 500).        │`);
    log(`   ├─────────────┼────────────────────────────────────────────┤`);
    log(`   │  $10k-$25k  │ 📈 10-15% de profits → Index Funds.        │`);
    log(`   │             │    Dividendos regresan al bot = SNOWBALL.  │`);
    log(`   ├─────────────┼────────────────────────────────────────────┤`);
    log(`   │  $25k-$50k  │ 🏠 Enganche para PRIMER DEPA (~$20k).      │`);
    log(`   │             │    Renta ~$600/mes → regresa al bot.       │`);
    log(`   │             │    El inquilino paga tu hipoteca.          │`);
    log(`   ├─────────────┼────────────────────────────────────────────┤`);
    log(`   │  $50k-$100k │ 🏘️ Segunda propiedad + más Index Funds.    │`);
    log(`   │             │    3 fuentes: Bot + Renta + Dividendos.    │`);
    log(`   │             │    Todo regresa al bot = BOLA DE NIEVE.    │`);
    log(`   ├─────────────┼────────────────────────────────────────────┤`);
    log(`   │  $100k-500k │ 🌟 ÉLITE: 50% reinvierte, 25% propiedades, │`);
    log(`   │             │    25% ETFs. Múltiples ríos de dinero.     │`);
    log(`   ├─────────────┼────────────────────────────────────────────┤`);
    log(`   │  $500k+     │ 👑 MAGNATE: 3+ propiedades, $200k+ ETFs.   │`);
    log(`   │             │    El dinero trabaja para TI.              │`);
    log(`   ├─────────────┼────────────────────────────────────────────┤`);
    log(`   │  $1M+       │ 🏆 MILLONARIO: Libertad financiera total.  │`);
    log(`   │             │    Top 0.001% del planeta.                 │`);
    log(`   └─────────────┴────────────────────────────────────────────┘`);
    log(`\n   💡 LA CLAVE: Cada peso que generes de CUALQUIER fuente`);
    log(`      (renta, dividendos, negocio) → REGRESA AL BOT.`);
    log(`      Interés compuesto + múltiples fuentes = IMPARABLE.`);

    // Show current position on the roadmap
    let currentPhase = '';
    if (currentCapital < 5000) currentPhase = '🎯 FASE: Acumulación pura';
    else if (currentCapital < 10000) currentPhase = '📚 FASE: Preparando diversificación';
    else if (currentCapital < 25000) currentPhase = '📈 FASE: Index Funds activos';
    else if (currentCapital < 50000) currentPhase = '🏠 FASE: Real Estate unlock';
    else if (currentCapital < 100000) currentPhase = '🏘️ FASE: Multi-asset snowball';
    else if (currentCapital < 500000) currentPhase = '🌟 FASE: Élite mode';
    else if (currentCapital < 1000000) currentPhase = '👑 FASE: Magnate status';
    else currentPhase = '🏆 FASE: MILLONARIO - Lo lograste';

    log(`\n   📍 TU POSICIÓN ACTUAL: ${currentPhase}`);
    log(`      Capital: $${currentCapital.toLocaleString('en-US', { maximumFractionDigits: 0 })} USD`);

    // ═══════════════════════════════════════════════════════════
    // DISCLAIMER
    // ═══════════════════════════════════════════════════════════
    log(`\n⚠️ DISCLAIMER:`);
    log(`   - Proyecciones basadas en yield histórico (${daysActive.toFixed(0)} días de datos)`);
    log(`   - TWR APY ajustado por peso temporal de depósitos`);
    log(`   - No es consejo financiero, es matemática compuesta 🧮`);

    fs.writeFileSync('projection_output.txt', logs.join('\n'));
    console.log("\n✅ Comparison saved to projection_output.txt");
}

analyzeAndProject().catch(e => console.error("CRITICAL SCRIPT ERROR:", e));
