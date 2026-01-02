#!/usr/bin/env node
/**
 * count_trades_today.js
 * Timezone-aware trade counter for Arca Bot Swarm
 * 
 * Counts trades that occurred during "today" in Mexico City time (UTC-6/UTC-5 DST)
 * Usage: node scripts/count_trades_today.js
 */

const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════
//                    CONFIGURATION
// ═══════════════════════════════════════════════════════════════
const TIMEZONE_OFFSET = -6; // Mexico City Standard Time (CST)
const LOGS_DIR = path.join(__dirname, '..', 'logs');
const BOTS = [
    { id: 'BTCUSDT', name: 'BTC' },
    { id: 'SOLUSDT', name: 'SOL' },
    { id: 'DOGEUSDT', name: 'DOGE' }
];

// ═══════════════════════════════════════════════════════════════
//                    TIMEZONE HELPERS
// ═══════════════════════════════════════════════════════════════
function getLocalDate(utcTimestamp) {
    // Convert UTC timestamp to Mexico time
    const utc = new Date(utcTimestamp);
    const localMs = utc.getTime() + (TIMEZONE_OFFSET * 60 * 60 * 1000);
    return new Date(localMs);
}

function getTodayBoundaries() {
    // Get "today" in Mexico time as UTC boundaries
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

function isTimestampToday(isoTimestamp, boundaries) {
    const ts = new Date(isoTimestamp);
    return ts >= boundaries.start && ts < boundaries.end;
}

// ═══════════════════════════════════════════════════════════════
//                    LOG PARSER
// ═══════════════════════════════════════════════════════════════
function countTradesForBot(botId, boundaries) {
    const pattern = new RegExp(`VANTAGE01_${botId}_activity.*\\.log$`);

    let buys = 0;
    let sells = 0;
    let profit = 0;

    try {
        const files = fs.readdirSync(LOGS_DIR).filter(f => pattern.test(f));

        for (const file of files) {
            const content = fs.readFileSync(path.join(LOGS_DIR, file), 'utf8');
            const lines = content.split('\n');

            for (const line of lines) {
                // Extract timestamp from log line: [2026-01-02T08:35:03.365Z]
                const tsMatch = line.match(/^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\]/);
                if (!tsMatch) continue;

                const timestamp = tsMatch[1];
                if (!isTimestampToday(timestamp, boundaries)) continue;

                // Count BUYs (Added Lot)
                if (line.includes('Added Lot')) {
                    buys++;
                }

                // Count SELLs and extract profit (PROFIT log)
                if (line.includes('[PROFIT]')) {
                    sells++;
                    // Extract profit: Net: $0.1234
                    const profitMatch = line.match(/Net:\s*\$(-?[\d.]+)/);
                    if (profitMatch) {
                        profit += parseFloat(profitMatch[1]);
                    }
                }
            }
        }
    } catch (e) {
        console.error(`Error reading logs for ${botId}: ${e.message}`);
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
        const stats = countTradesForBot(bot.id, boundaries);
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
