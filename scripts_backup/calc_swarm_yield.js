const fs = require('fs');
const path = require('path');
const http = require('http');

// Basic Configuration
const SESSIONS_DIR = path.join(__dirname, '..', 'data', 'sessions');
const ROOT_DIR = path.join(__dirname, '..');

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

// Helper to find all state files
function findAllStateFiles() {
    let files = [];
    const dirs = [SESSIONS_DIR, ROOT_DIR];

    dirs.forEach(dir => {
        if (fs.existsSync(dir)) {
            const f = fs.readdirSync(dir).filter(file =>
                file.endsWith('_state.json') &&
                !file.includes('template') &&
                !file.includes('config') &&
                file !== 'BTCUSDT_state.json'
            );
            f.forEach(file => files.push(path.join(dir, file)));
        }
    });
    return files;
}

async function calculateSwarmYield() {
    const files = findAllStateFiles();

    if (files.length === 0) {
        console.log("❌ No active bot states found!");
        return;
    }

    // Get REAL equity from Binance API
    const binanceEquity = await getRealBinanceEquity();

    console.log(`\n🦅 ARCA SWARM INTELLIGENCE - AUDIT REPORT`);
    console.log(`=========================================`);
    console.log(`Found ${files.length} active neural cores (bots)...\n`);

    let totalProfit = 0;
    let weightedYieldSum = 0;
    let swarmDaysActive = 0;
    let botCount = 0;
    let totalAllocatedEquity = 0;

    // Table Header
    console.log(`| ${'BOT ID'.padEnd(14)} | ${'Active'.padEnd(8)} | ${'Profit'.padEnd(10)} | ${'Yield/Day'.padEnd(10)} |`);
    console.log(`|${'-'.repeat(16)}|${'-'.repeat(10)}|${'-'.repeat(12)}|${'-'.repeat(12)}|`);

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

            const profit = state.totalProfit || 0;
            const capital = state.initialCapital || 100; // For yield calc only
            const dailyYield = (profit / capital) / daysActive;

            // Log Row
            console.log(`| ${botId.padEnd(14)} | ${daysActive.toFixed(1).padEnd(8)} | $${profit.toFixed(2).padEnd(9)} | ${(dailyYield * 100).toFixed(3)}%    |`);

            // Accumulate
            if (daysActive > 1) {
                totalProfit += profit;
                weightedYieldSum += (dailyYield * capital);
                totalAllocatedEquity += capital;
                botCount++;
                if (daysActive > swarmDaysActive) swarmDaysActive = daysActive;
            }

        } catch (e) {
            console.error(`Error reading ${file}: ${e.message}`);
        }
    });

    // Use Binance equity if available, otherwise fallback
    const displayEquity = binanceEquity || totalAllocatedEquity;
    const averageSwarmYield = totalAllocatedEquity > 0 ? (weightedYieldSum / totalAllocatedEquity) : 0;
    const projectedAnnual = ((Math.pow(1 + averageSwarmYield, 365) - 1) * 100);

    console.log(`\n=========================================`);
    console.log(`🧠 SWARM METRICS`);
    if (binanceEquity) {
        console.log(`   💰 Binance Total: $${binanceEquity.toFixed(2)} (REAL from API)`);
    } else {
        console.log(`   ⚠️  Could not fetch Binance balance (bots offline?)`);
        console.log(`   💰 Est. Capital:  $${totalAllocatedEquity.toFixed(2)} (from state files)`);
    }
    console.log(`   📈 Realized Profit: $${totalProfit.toFixed(2)}`);
    console.log(`   📊 Daily Yield:     ${(averageSwarmYield * 100).toFixed(4)}%`);
    console.log(`   🚀 APY (Compound):  ${projectedAnnual.toFixed(0)}%`);
    console.log(`=========================================`);

    // Equity breakdown
    console.log(`\n🔍 EQUITY DEEP DIVE`);
    console.log(`| ${'BOT'.padEnd(14)} | ${'Profit'.padEnd(10)} | ${'Unrealized'.padEnd(10)} | ${'Net PnL'.padEnd(10)} |`);
    console.log(`|${'-'.repeat(16)}|${'-'.repeat(12)}|${'-'.repeat(12)}|${'-'.repeat(12)}|`);

    files.forEach(file => {
        try {
            const state = JSON.parse(fs.readFileSync(file, 'utf8'));
            const botId = path.basename(file).replace('_state.json', '').replace('USDT', '');

            const inventory = state.inventory || [];
            const price = state.currentPrice || 0;
            const realized = state.totalProfit || 0;

            let inventoryQty = 0;
            let inventoryCost = 0;
            inventory.forEach(lot => {
                const qty = lot.qty || lot.amount || lot.remaining || 0;
                inventoryQty += qty;
                inventoryCost += qty * (lot.price || 0);
            });

            const inventoryValue = inventoryQty * price;
            const unrealizedPnL = inventoryValue - inventoryCost;
            const totalNetPnL = realized + unrealizedPnL;

            console.log(`| ${botId.padEnd(14)} | $${realized.toFixed(2).padEnd(9)} | $${unrealizedPnL.toFixed(2).padEnd(9)} | $${totalNetPnL.toFixed(2).padEnd(9)} |`);

        } catch (e) { }
    });
    console.log(`\n* Binance Total = Your REAL balance (USDT + BTC + SOL + DOGE + ETH)`);
    console.log(`* Net PnL = Realized + Unrealized profit per bot`);
    console.log(`=========================================\n`);
}

calculateSwarmYield();
