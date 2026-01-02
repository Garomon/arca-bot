const fs = require('fs');
const path = require('path');

// Basic Configuration
const SESSIONS_DIR = path.join(__dirname, '..', 'data', 'sessions');
const ROOT_DIR = path.join(__dirname, '..');

// Helper to find all state files
function findAllStateFiles() {
    let files = [];
    const dirs = [SESSIONS_DIR, ROOT_DIR];

    dirs.forEach(dir => {
        if (fs.existsSync(dir)) {
            const f = fs.readdirSync(dir).filter(file =>
                file.endsWith('_state.json') &&
                !file.includes('template') &&
                !file.includes('config')
            );
            f.forEach(file => files.push(path.join(dir, file)));
        }
    });
    return files;
}

function calculateSwarmYield() {
    const files = findAllStateFiles();

    if (files.length === 0) {
        console.log("❌ No active bot states found!");
        return;
    }

    console.log(`\n🦅 ARCA SWARM INTELLIGENCE - AUDIT REPORT`);
    console.log(`=========================================`);
    console.log(`Found ${files.length} active neural cores (bots)...\n`);

    let totalCapital = 0;
    let totalProfit = 0;
    let totalWeightedDailyYield = 0;
    let swarmDaysActive = 0;
    let botCount = 0;

    // Table Header
    console.log(`| ${'BOT ID'.padEnd(10)} | ${'Active'.padEnd(8)} | ${'Capital'.padEnd(10)} | ${'Profit'.padEnd(10)} | ${'Yield/Day'.padEnd(10)} |`);
    console.log(`|${'-'.repeat(12)}|${'-'.repeat(10)}|${'-'.repeat(12)}|${'-'.repeat(12)}|${'-'.repeat(12)}|`);

    files.forEach(file => {
        try {
            const state = JSON.parse(fs.readFileSync(file, 'utf8'));
            const botId = path.basename(file).replace('_state.json', '').replace('USDT', '');

            // Analyze History
            const filledOrders = state.filledOrders || [];
            if (filledOrders.length < 2) return; // Skip new bots

            filledOrders.sort((a, b) => a.timestamp - b.timestamp);
            const firstTrade = filledOrders[0].timestamp;
            const daysActive = (Date.now() - firstTrade) / (1000 * 60 * 60 * 24);

            const capital = state.initialCapital || 0;
            const profit = state.totalProfit || 0;
            const dailyYield = (profit / capital) / daysActive;

            // Log Row
            console.log(`| ${botId.padEnd(10)} | ${daysActive.toFixed(1).padEnd(8)} | $${capital.toFixed(0).padEnd(9)} | $${profit.toFixed(2).padEnd(9)} | ${(dailyYield * 100).toFixed(3)}%    |`);

            // Accumulate for Swarm Average (Weighted by Capital)
            if (daysActive > 1 && capital > 0) {
                totalCapital += capital;
                totalProfit += profit;
                // We sum (Yield * Capital) to weight it, later divide by TotalCapital
                totalWeightedDailyYield += (dailyYield * capital);
                botCount++;
                if (daysActive > swarmDaysActive) swarmDaysActive = daysActive;
            }

        } catch (e) {
            console.error(`Error reading ${file}: ${e.message}`);
        }
    });

    const averageSwarmYield = totalCapital > 0 ? (totalWeightedDailyYield / totalCapital) : 0;
    const projectedMonthly = averageSwarmYield * 30 * 100;
    const projectedAnnual = ((Math.pow(1 + averageSwarmYield, 365) - 1) * 100);

    console.log(`\n=========================================`);
    console.log(`🧠 SWARM METRICS (Weighted Average)`);
    console.log(`   Active Capital:   $${totalCapital.toFixed(2)}`);
    console.log(`   Realized Profit:  $${totalProfit.toFixed(2)} (Cashflow)`);
    console.log(`   True Daily Yield: ${(averageSwarmYield * 100).toFixed(4)}%`);
    console.log(`   APY (Compound):   ${projectedAnnual.toFixed(0)}%`);
    console.log(`=========================================`);

    console.log(`\n🔍 EQUITY DEEP DIVE (Are you winning son?)`);
    console.log(`| ${'BOT'.padEnd(10)} | ${'Invested'.padEnd(10)} | ${'Liquid Value'.padEnd(12)} | ${'Net PnL'.padEnd(10)} | ${'Bag/Float'.padEnd(10)} |`);
    console.log(`|${'-'.repeat(12)}|${'-'.repeat(12)}|${'-'.repeat(14)}|${'-'.repeat(12)}|${'-'.repeat(12)}|`);

    files.forEach(file => {
        try {
            const state = JSON.parse(fs.readFileSync(file, 'utf8'));
            const botId = path.basename(file).replace('_state.json', '').replace('USDT', '');

            // Calculate Equity
            const balanceUSDT = state.balance.usdt || 0;
            // Find coin balance (key != usdt)
            const coinKey = Object.keys(state.balance).find(k => k !== 'usdt');
            let balanceCoin = state.balance[coinKey] || 0;
            const price = state.currentPrice || 0;

            // Sanity Check for Atomic Units (Heuristic)
            // If we have > 1000 coins while invested < 10000, likely atomic units
            // Or if balanceCoin * price is > 10x Invested
            let rawBalance = balanceCoin;
            if (balanceCoin * price > (state.initialCapital * 5) && state.initialCapital > 0) {
                if (coinKey.includes('btc') || coinKey.includes('sat')) balanceCoin = balanceCoin / 1e8;
                if (coinKey.includes('sol') || coinKey.includes('lam')) balanceCoin = balanceCoin / 1e9;
                // Fallback for general madness (if neither, assume 1e18 or just keep raw as finding)
            }

            const liquidationValue = balanceUSDT + (balanceCoin * price);
            const invested = state.initialCapital || 0;
            const totalNetPnL = liquidationValue - invested;
            const realized = state.totalProfit || 0;
            const floatingPnL = totalNetPnL - realized;

            console.log(`| ${botId.padEnd(10)} | $${invested.toFixed(0).padEnd(9)} | $${liquidationValue.toFixed(0).padEnd(11)} | $${totalNetPnL.toFixed(2).padEnd(9)} | $${floatingPnL.toFixed(2).padEnd(9)} |`);

            if (liquidationValue > invested * 5) {
                console.log(`  > ⚠️ ANOMALY FIXED? Raw Bal: ${rawBalance} ${coinKey} -> Used: ${balanceCoin}`);
            }

        } catch (e) { }
    });
    console.log(`\n* Net PnL = (Liquid Value - Invested). If Positive, you are truly winning.`);
    console.log(`* Bag/Float = Impact of holding coins. if Negative, price dropped since entry.`);
    console.log(`=========================================\n`);
}

calculateSwarmYield();
