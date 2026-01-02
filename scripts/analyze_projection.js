const fs = require('fs');
const path = require('path');

// CONFIGURATION
const MONTHLY_CONTRIBUTION_MXN = 5000;
const MXN_USD_RATE = 20.5;
const MONTHLY_CONTRIBUTION_USD = MONTHLY_CONTRIBUTION_MXN / MXN_USD_RATE;
const MILLION_TARGET = 1000000;

const BOT_DIR = path.join(__dirname, '..');
const SESSIONS_DIR = path.join(BOT_DIR, 'data', 'sessions');

function findAllStateFiles() {
    try {
        let dir = SESSIONS_DIR;
        if (!fs.existsSync(dir)) dir = BOT_DIR;
        const files = fs.readdirSync(dir);
        const stateFiles = files.filter(f => f.endsWith('state.json') && !f.includes('template'));
        return stateFiles.map(f => path.join(dir, f));
    } catch (e) {
        return [];
    }
}

function calculateSwarmMetrics() {
    const stateFiles = findAllStateFiles();

    if (stateFiles.length === 0) {
        return { realYield: 0.0020, totalCapital: 1000, totalProfit: 0, daysActive: 1 };
    }

    let totalCapital = 0;
    let totalProfit = 0;
    let weightedYieldSum = 0;
    let globalOldestTrade = Date.now();

    stateFiles.forEach(file => {
        try {
            const state = JSON.parse(fs.readFileSync(file, 'utf8'));
            const capital = state.initialCapital || 0;
            const profit = state.totalProfit || 0;
            const filledOrders = state.filledOrders || [];

            totalCapital += capital;
            totalProfit += profit;

            let botOldestTrade = Date.now();
            if (filledOrders.length > 0) {
                filledOrders.sort((a, b) => a.timestamp - b.timestamp);
                botOldestTrade = filledOrders[0].timestamp;
                if (botOldestTrade < globalOldestTrade) {
                    globalOldestTrade = botOldestTrade;
                }
            }

            const botDaysActive = Math.max(1, (Date.now() - botOldestTrade) / (1000 * 60 * 60 * 24));
            if (capital > 0 && botDaysActive > 0) {
                const botDailyYield = profit / capital / botDaysActive;
                weightedYieldSum += botDailyYield * capital;
            }
        } catch (e) { /* Skip */ }
    });

    const daysActive = Math.max(1, (Date.now() - globalOldestTrade) / (1000 * 60 * 60 * 24));
    const realYield = totalCapital > 0 ? weightedYieldSum / totalCapital : 0.0020;

    return { realYield, totalCapital, totalProfit, daysActive };
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
    const { realYield, totalCapital, totalProfit, daysActive } = calculateSwarmMetrics();
    const currentCapital = totalCapital + totalProfit;
    const realYieldPct = (realYield * 100).toFixed(3);
    const APY = ((Math.pow(1 + realYield, 365) - 1) * 100).toFixed(0);

    const logs = [];
    const log = (msg) => { console.log(msg); logs.push(msg); };

    // ═══════════════════════════════════════════════════════════
    // ROAD TO $1M - NEW SECTION
    // ═══════════════════════════════════════════════════════════
    log(`\n💎 ═══════════════════════════════════════════════════════════`);
    log(`                    ROAD TO $1,000,000 USD`);
    log(`═══════════════════════════════════════════════════════════`);

    log(`\n📊 TU SITUACIÓN ACTUAL:`);
    log(`   Capital Actual:     $${currentCapital.toLocaleString('en-US', { maximumFractionDigits: 2 })} USD`);
    log(`   Profit Realizado:   $${totalProfit.toLocaleString('en-US', { maximumFractionDigits: 2 })} USD`);
    log(`   Días Activo:        ${daysActive.toFixed(1)} días`);
    log(`   Yield Diario:       ${realYieldPct}%`);
    log(`   APY Proyectado:     ${APY}%`);
    log(`   Aportes Mensuales:  $${MONTHLY_CONTRIBUTION_USD.toFixed(0)} USD (${MONTHLY_CONTRIBUTION_MXN} MXN)`);

    // Time to milestones
    const to100k = timeToTarget(currentCapital, realYield, MONTHLY_CONTRIBUTION_USD, 100000);
    const to500k = timeToTarget(currentCapital, realYield, MONTHLY_CONTRIBUTION_USD, 500000);
    const to1M = timeToTarget(currentCapital, realYield, MONTHLY_CONTRIBUTION_USD, MILLION_TARGET);

    log(`\n⏱️ TIEMPO ESTIMADO PARA METAS:`);
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
    const progression = getProgressionTable(currentCapital, realYield, MONTHLY_CONTRIBUTION_USD);
    log(`\n📈 PROYECCIÓN ANUAL (con ${realYieldPct}%/día):`);
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
        { name: `📊 TU REALIDAD (${realYieldPct}%)`, yield: realYield, highlight: true },
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
    // DISCLAIMER
    // ═══════════════════════════════════════════════════════════
    log(`\n⚠️ DISCLAIMER:`);
    log(`   - Proyecciones basadas en yield histórico (${daysActive.toFixed(0)} días de datos)`);
    log(`   - Crypto es volátil, yield puede variar significativamente`);
    log(`   - No es consejo financiero, es matemática compuesta 🧮`);

    fs.writeFileSync('projection_output.txt', logs.join('\n'));
    console.log("\n✅ Comparison saved to projection_output.txt");
}

analyzeAndProject();
