const fs = require('fs');
const path = require('path');

// CONFIGURATION
const MONTHLY_CONTRIBUTION_MXN = 5000;
const MXN_USD_RATE = 20.5; // Approx
const MONTHLY_CONTRIBUTION_USD = MONTHLY_CONTRIBUTION_MXN / MXN_USD_RATE;

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
    let oldestTrade = Date.now();
    let weightedYieldSum = 0;

    stateFiles.forEach(file => {
        try {
            const state = JSON.parse(fs.readFileSync(file, 'utf8'));
            const capital = state.initialCapital || 0;
            const profit = state.totalProfit || 0;
            const filledOrders = state.filledOrders || [];

            totalCapital += capital;
            totalProfit += profit;

            // Find oldest trade
            if (filledOrders.length > 0) {
                filledOrders.sort((a, b) => a.timestamp - b.timestamp);
                if (filledOrders[0].timestamp < oldestTrade) {
                    oldestTrade = filledOrders[0].timestamp;
                }
            }

            // Calculate this bot's daily yield weighted by capital
            const daysActive = Math.max(1, (Date.now() - oldestTrade) / (1000 * 60 * 60 * 24));
            if (capital > 0 && daysActive > 0) {
                const dailyYield = profit / capital / daysActive;
                weightedYieldSum += dailyYield * capital;
            }
        } catch (e) {
            // Skip invalid files
        }
    });

    const daysActive = Math.max(1, (Date.now() - oldestTrade) / (1000 * 60 * 60 * 24));

    // Weighted average yield across all bots
    const realYield = totalCapital > 0 ? weightedYieldSum / totalCapital : 0.0020;

    return { realYield, totalCapital, totalProfit, daysActive };
}

function analyzeAndProject() {
    const { realYield, totalCapital, totalProfit, daysActive } = calculateSwarmMetrics();
    const currentCapital = totalCapital + totalProfit;
    const realYieldPct = (realYield * 100).toFixed(3);

    // Dynamic scenarios based on REAL historical data
    const scenarios = [
        { name: "🏦 BANCO (CETES 10%)", yield: 0.00026 },
        { name: `📊 TU REALIDAD (${realYieldPct}%)`, yield: realYield, highlight: true },
        { name: "🐻 PESIMISTA (0.25%)", yield: 0.0025 },
        { name: "⚖️ REALISTA (0.50%)", yield: 0.0050 },
        { name: "🦄 OPTIMISTA (0.82%)", yield: 0.0082 }
    ];

    const logs = [];
    const log = (msg) => {
        console.log(msg);
        logs.push(msg);
    };

    log(`\n💰 VS BANK COMPARISON (${MONTHLY_CONTRIBUTION_MXN} MXN/mo)`);
    log(`---------------------------------------------------------------`);

    scenarios.forEach(scenario => {
        let balance = currentCapital;
        const initialInvestment = balance;
        let totalMonthlyDeposits = 0;

        for (let month = 1; month <= 60; month++) {
            // Run 30 days of compounding
            for (let d = 0; d < 30; d++) {
                const dailyProfit = balance * scenario.yield;
                balance += dailyProfit;
            }

            // Add monthly contribution
            balance += MONTHLY_CONTRIBUTION_USD;
            totalMonthlyDeposits += MONTHLY_CONTRIBUTION_USD;
        }

        const totalInvestedUSD = initialInvestment + totalMonthlyDeposits;

        // Convert to MXN for final output
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

    fs.writeFileSync('projection_output.txt', logs.join('\n'));
    console.log("✅ Comparison saved to projection_output.txt");
}

analyzeAndProject();
