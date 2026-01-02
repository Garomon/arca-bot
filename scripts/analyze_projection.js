const fs = require('fs');
const path = require('path');

// CONFIGURATION
const MONTHLY_CONTRIBUTION_MXN = 5000;
const MXN_USD_RATE = 20.5; // Approx
const MONTHLY_CONTRIBUTION_USD = MONTHLY_CONTRIBUTION_MXN / MXN_USD_RATE;

const BOT_DIR = path.join(__dirname, '..');
const SESSIONS_DIR = path.join(BOT_DIR, 'data', 'sessions');

function findStateFile() {
    try {
        let dir = SESSIONS_DIR;
        if (!fs.existsSync(dir)) dir = BOT_DIR;

        const files = fs.readdirSync(dir);
        const stateFiles = files.filter(f => f.endsWith('state.json') && !f.includes('template'));

        if (stateFiles.length === 0) return null;

        return stateFiles.map(f => {
            const fullPath = path.join(dir, f);
            return { name: f, time: fs.statSync(fullPath).mtime.getTime(), path: fullPath };
        }).sort((a, b) => b.time - a.time)[0].path;

    } catch (e) {
        return null;
    }
}

function analyzeAndProject() {
    const stateFile = findStateFile();

    if (!stateFile) {
        console.error(`❌ No state file found.`);
        return;
    }

    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    const filledOrders = state.filledOrders || [];

    // Sort trade history
    filledOrders.sort((a, b) => a.timestamp - b.timestamp);
    const firstTrade = filledOrders.length > 0 ? filledOrders[0].timestamp : Date.now();
    const now = Date.now();

    const daysActive = (now - firstTrade) / (1000 * 60 * 60 * 24);
    const totalProfit = state.totalProfit || 0;
    const currentCapital = (state.initialCapital || 0) + totalProfit;

    // 2. Projection Scenarios
    const scenarios = [
        { name: "🏦 BANCO (CETES 10%)", yield: 0.00026 },
        { name: "🐌 REALIDAD HOY (0.20%)", yield: 0.0020 }, // Clean Swarm Audit
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
