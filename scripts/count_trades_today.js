#!/usr/bin/env node
/**
 * count_trades_today.js
 * Timezone-aware trade counter for Arca Bot Swarm
 * 
 * FIXED: Now reads from filledOrders in state files (same source as dashboard)
 * instead of log files which can rotate/get cleared.
 * 
 * Usage: node scripts/count_trades_today.js
 */

const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════
//                    CONFIGURATION
// ═══════════════════════════════════════════════════════════════
const TIMEZONE_OFFSET = -6; // Mexico City Standard Time (CST)
const SESSIONS_DIR = path.join(__dirname, '..', 'data', 'sessions');
const BOTS = [
    { id: 'BTCUSDT', name: 'BTC', stateFile: 'VANTAGE01_BTCUSDT_state.json' },
    { id: 'SOLUSDT', name: 'SOL', stateFile: 'VANTAGE01_SOLUSDT_state.json' },
    { id: 'DOGEUSDT', name: 'DOGE', stateFile: 'VANTAGE01_DOGEUSDT_state.json' }
];

// ═══════════════════════════════════════════════════════════════
//                    TIMEZONE HELPERS
// ═══════════════════════════════════════════════════════════════
function getLocalDate(utcTimestamp) {
    const utc = new Date(utcTimestamp);
    const localMs = utc.getTime() + (TIMEZONE_OFFSET * 60 * 60 * 1000);
    return new Date(localMs);
}

function getTodayBoundaries() {
    const now = new Date();
    const localNow = getLocalDate(now.toISOString());

    // Start of today in local time (midnight)
    const localMidnight = new Date(localNow);
    localMidnight.setHours(0, 0, 0, 0);

    // Convert back to UTC
    const utcStart = new Date(localMidnight.getTime() - (TIMEZONE_OFFSET * 60 * 60 * 1000));
    const utcEnd = new Date(utcStart.getTime() + (24 * 60 * 60 * 1000));

    return {
        start: utcStart,
        end: utcEnd,
        localDate: localMidnight.toISOString().split('T')[0]
    };
}

// ═══════════════════════════════════════════════════════════════
//                    STATE FILE PARSER (FIXED!)
// ═══════════════════════════════════════════════════════════════
function countTradesForBot(bot, boundaries) {
    let buys = 0;
    let sells = 0;
    let profit = 0;

    try {
        const stateFilePath = path.join(SESSIONS_DIR, bot.stateFile);
        if (!fs.existsSync(stateFilePath)) {
            return { buys, sells, profit };
        }

        const state = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
        const filledOrders = state.filledOrders || [];

        for (const order of filledOrders) {
            const ts = order.timestamp || order.filledAt;
            if (!ts) continue;

            const orderDate = new Date(ts);
            if (orderDate < boundaries.start || orderDate >= boundaries.end) continue;

            // Count by side
            if (order.side === 'buy') {
                buys++;
            } else if (order.side === 'sell') {
                sells++;
                // Add profit if available
                if (order.profit !== undefined) {
                    profit += order.profit;
                }
            }
        }
    } catch (e) {
        console.error(`Error reading state for ${bot.name}: ${e.message}`);
    }

    return { buys, sells, profit };
}

// ═══════════════════════════════════════════════════════════════
//                    MAIN OUTPUT
// ═══════════════════════════════════════════════════════════════
function main() {
    const boundaries = getTodayBoundaries();

    console.log(`\n📈 TRADES DE HOY [CDMX: ${boundaries.localDate}]`);
    console.log(`   (Rango UTC: ${boundaries.start.toISOString()} → ${boundaries.end.toISOString()})`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    let totalBuys = 0;
    let totalSells = 0;
    let totalProfit = 0;

    for (const bot of BOTS) {
        const stats = countTradesForBot(bot, boundaries);
        totalBuys += stats.buys;
        totalSells += stats.sells;
        totalProfit += stats.profit;

        const profitStr = stats.profit > 0 ? `+$${stats.profit.toFixed(4)}` : `$${stats.profit.toFixed(4)}`;
        console.log(`${bot.name.padEnd(5)}: Buys=${stats.buys} | Sells=${stats.sells} | Profit=${profitStr}`);
    }

    console.log('───────────────────────────────────────────────────────────────');
    const totalProfitStr = totalProfit > 0 ? `+$${totalProfit.toFixed(4)}` : `$${totalProfit.toFixed(4)}`;
    console.log(`TOTAL: Buys=${totalBuys} | Sells=${totalSells} | Profit=${totalProfitStr}\n`);
}

main();
