const fs = require('fs');
const path = require('path');

const REPORTS_DIR = '/root/arca-bot/reports';
const HISTORY_FILE = '/root/arca-bot/data/financial_history.json';
const OUTPUT_FILE = '/root/arca-bot/data/financial_history_recovered.json';

console.log('📜 Starting History Recovery from Reports...');

if (!fs.existsSync(REPORTS_DIR)) {
    console.error('❌ Reports directory not found.');
    process.exit(1);
}

// 1. Scan Reports
const files = fs.readdirSync(REPORTS_DIR).filter(f => f.startsWith('daily_report_') && f.endsWith('.txt'));
console.log(`Found ${files.length} daily reports.`);

// Group by Date
// Filename format: daily_report_VANTAGE01_DOGEUSDT_2026-01-03.txt
// Regex to extract Date and Pair
const regex = /daily_report_VANTAGE01_([A-Z]+)USDT_(\d{4}-\d{2}-\d{2})\.txt/;

const historyByDate = {}; // { '2026-01-03': { profit: 0, equity: 0, capital: 0, reportCount: 0 } }

files.forEach(file => {
    const match = file.match(regex);
    if (!match) return;

    const pair = match[1]; // BTC, SOL, DOGE
    const date = match[2];

    if (!historyByDate[date]) {
        historyByDate[date] = {
            profit: 0,
            equity: 0,
            capital: 0,
            unrealized: 0,
            reportCount: 0,
            pairs: []
        };
    }

    const content = fs.readFileSync(path.join(REPORTS_DIR, file), 'utf8');

    // Parse Metrics
    // Total Profit:         $3.7218
    // Initial Capital:      $236.83
    // Unrealized PnL:       $1.1653

    const profitMatch = content.match(/Total Profit:\s+\$([\d\.]+)/);
    const capitalMatch = content.match(/Initial Capital:\s+\$([\d\.]+)/);
    const unrealizedMatch = content.match(/Unrealized PnL:\s+\$([\d\.\-]+)/);

    const profit = profitMatch ? parseFloat(profitMatch[1]) : 0;
    const capital = capitalMatch ? parseFloat(capitalMatch[1]) : 0;
    const unrealized = unrealizedMatch ? parseFloat(unrealizedMatch[1]) : 0;

    // Equity Estimation for this bot: Capital + Profit + Unrealized
    // Note: If user added funds, Capital increases. Consistent.
    const estimatedBotEquity = capital + profit + unrealized;

    historyByDate[date].profit += profit;
    historyByDate[date].equity += estimatedBotEquity;
    historyByDate[date].capital += capital;
    historyByDate[date].reportCount++;
    historyByDate[date].pairs.push(pair);
});

console.log('📅 Processed Dates:', Object.keys(historyByDate).sort());

// 2. Load Existing History
let existingHistory = [];
if (fs.existsSync(HISTORY_FILE)) {
    try {
        existingHistory = JSON.parse(fs.readFileSync(HISTORY_FILE));
    } catch (e) { console.error('Error reading existing history', e); }
}

// 3. Merge Strategies
// We want to KEEP existing recent data (Integral) but BACKFILL older dates.
// Or OVERWRITE if date matches? 
// The integrity guard snapshots are high res (hourly). These reports are DAILY (One per day).
// We should insert a record for T23:59:59 of that day.

const newRecords = [];

Object.keys(historyByDate).sort().forEach(date => {
    const dayData = historyByDate[date];

    // Check if we already have data for this day?
    // Integrity guard logs timestamp.
    // If we have records for this date, maybe we skip? 
    // BUT reports are official "End of Day".
    // Let's add them as specific snapshots.

    // Fix Equity Overestimation? 
    // We summed equities: capital + profit + unrealized.
    // If bots share account, Capital might be "Virtual Allocation" (Correct).
    // So summing Virtual Allocations IS Correct for Total Equity (if strictly partitioned).
    // Unlike 'fetchBalance' which sees the Whole Account 3 times.
    // So this Reconstructed Equity might be MORE ACCURATE than the "Triple Account" bug!

    newRecords.push({
        ts: new Date(`${date}T23:59:59Z`).getTime(),
        date: `${date}T23:59:59.000Z`,
        equity: dayData.equity, // Sum of allocations
        profit: dayData.profit,
        capital: dayData.capital,
        source: 'RECOVERED_FROM_REPORTS'
    });
});

// Combine
const combined = [...existingHistory, ...newRecords];

// Deduplicate: If multiple on same day, keep IntegrityGuard (Realtime) or Report?
// IntegrityGuard started TODAY. So old dates are safe to add.
// Sort by TS
combined.sort((a, b) => a.ts - b.ts);

// Save
fs.writeFileSync(HISTORY_FILE, JSON.stringify(combined, null, 2));

console.log(`✅ Recovered ${newRecords.length} historical days. Saved to ${HISTORY_FILE}.`);
