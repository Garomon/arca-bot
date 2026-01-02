const fs = require('fs');
const path = require('path');

// CONFIGURATION
const MONTHLY_CONTRIBUTION_MXN = 10000;
const MXN_USD_RATE = 20.5; // Approx
const MONTHLY_CONTRIBUTION_USD = MONTHLY_CONTRIBUTION_MXN / MXN_USD_RATE;

const BOT_DIR = path.join(__dirname, '..');

function findStateFile() {
    try {
        const files = fs.readdirSync(BOT_DIR);
        // Find any file starting with 'grid_state' and ending with '.json'
        // Prefer one that isn't 'grid_state_template.json' if it exists
        const stateFiles = files.filter(f => f.startsWith('grid_state') && f.endsWith('.json') && !f.includes('template'));

        if (stateFiles.length === 0) return null;

        // Return the most recently modified state file
        return stateFiles.map(f => {
            const fullPath = path.join(BOT_DIR, f);
            return { name: f, time: fs.statSync(fullPath).mtime.getTime(), path: fullPath };
        }).sort((a, b) => b.time - a.time)[0].path;

    } catch (e) {
        return null;
    }
}

function analyzeAndProject() {
    const stateFile = findStateFile();

    if (!stateFile) {
        console.error(`❌ No state file found in ${BOT_DIR}. Looking for 'grid_state*.json'.`);
        return;
    }

    console.log(`✅ Using state file: ${path.basename(stateFile)}`);
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));

    // 1. Calculate Real Historical Performance
    const filledOrders = state.filledOrders || [];
    if (filledOrders.length === 0) {
        console.log("⚠️ No historical trades found in state. Cannot calculate average.");
        return;
    }

    // Sort trade history to find start date
    filledOrders.sort((a, b) => a.timestamp - b.timestamp);
    const firstTrade = filledOrders[0].timestamp;
    const lastTrade = filledOrders[filledOrders.length - 1].timestamp;
    const now = Date.now();

    const daysActive = (now - firstTrade) / (1000 * 60 * 60 * 24);
    const totalProfit = state.totalProfit || 0;
    const currentCapital = state.initialCapital + totalProfit; // Simplified equity approximation or read from state if available

    // Average Daily Profit (Realized) based on history
    // Simple average: Total Profit / Days
    // Better: CAGR but let's stick to simple daily avg yield relative to avg capital
    // Let's use: (Total Profit / Initial Capital) / Days * 100

    const initialCap = state.initialCapital || 400; // Fallback
    const totalROI = (totalProfit / initialCap);
    const dailyYield = daysActive > 0 ? totalROI / daysActive : 0;
    const dailyYieldPct = dailyYield * 100;

    console.log(`\n🦅 ARCA BOT - REAL DATA PROJECTION`);
    console.log(`===================================`);
    console.log(`📊 HISTORICAL ANALYSIS`);
    console.log(`   Days Active:      ${daysActive.toFixed(1)} days`);
    console.log(`   Transactions:     ${filledOrders.length}`);
    console.log(`   Realized Profit:  $${totalProfit.toFixed(2)}`);
    console.log(`   Initial Capital:  $${initialCap.toFixed(2)}`);
    console.log(`   Avg Daily Yield:  ${dailyYieldPct.toFixed(3)}%  (Real Data)`);
    console.log(`   Monthly Yield:    ~${(dailyYieldPct * 30).toFixed(2)}%`);
    console.log(`\n💰 YOUR STRATEGY`);
    console.log(`   Monthly Deposit:  $${MONTHLY_CONTRIBUTION_USD.toFixed(2)} (${MONTHLY_CONTRIBUTION_MXN} MXN)`);
    console.log(`   Reinvestment:     100% (Compound Interest)`);
    console.log(`===================================`);

    // 2. Projection
    let balance = currentCapital;
    console.log(`\n🚀 PROJECTION TO LAMBO (Based on YOUR bot's actual ${dailyYieldPct.toFixed(2)}% daily)`);
    console.log(`Day 0: $${balance.toFixed(2)}`);

    const milestones = [6, 12, 24, 36]; // Months
    let currentDay = 0;

    for (let month = 1; month <= 36; month++) {
        // Run 30 days of compounding
        for (let d = 0; d < 30; d++) {
            const dailyProfit = balance * dailyYield;
            balance += dailyProfit;
            currentDay++;
        }

        // Add monthly contribution
        balance += MONTHLY_CONTRIBUTION_USD;

        if (milestones.includes(month)) {
            const mxnBalance = balance * MXN_USD_RATE;
            console.log(`📅 Month ${month}:  $${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD  (≈ $${mxnBalance.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} MXN)`);
        }
    }
    console.log(`===================================`);
}

analyzeAndProject();
