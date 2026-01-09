
const fs = require('fs');
const path = require('path');

const PAIR_ID = 'BTCUSDT';
const STATE_FILE = `/root/arca-bot/data/sessions/VANTAGE01_${PAIR_ID}_state.json`;

if (!fs.existsSync(STATE_FILE)) {
    console.error(`❌ State file not found: ${STATE_FILE}`);
    process.exit(1);
}

console.log(`🧹 Cleaning duplicates in ${STATE_FILE}...`);

const raw = fs.readFileSync(STATE_FILE);
const state = JSON.parse(raw);

const initialCount = state.filledOrders.length;
console.log(`Initial Orders: ${initialCount}`);

// ROBUST CLEANUP: Group by Timestamp + Price (looser key to catch missing 'side' duplicates)
const uniqueMap = new Map();

// Sort input: Put Real orders (not estimated) first, and those with 'side' first
state.filledOrders.sort((a, b) => {
    // Priority 1: Has 'side'
    if (a.side && !b.side) return -1;
    if (!a.side && b.side) return 1;
    // Priority 2: Real is better than Estimated
    if (a.isEstimated && !b.isEstimated) return 1;
    if (!a.isEstimated && b.isEstimated) return -1;
    // Priority 3: More data is better
    return Object.keys(b).length - Object.keys(a).length;
});

state.filledOrders.forEach(o => {
    // Normalize 'fee' to 'fees' (Fixes Zero Fee issue)
    if (o.fee && !o.fees) o.fees = o.fee;
    if (!o.fees) o.fees = 0; // Ensure it exists

    // Normalize other fields for Transaction Log
    if (!o.costBasis) o.costBasis = 0;
    if (!o.spreadPct) o.spreadPct = 0;
    if (!o.matchType) o.matchType = (o.side === 'buy') ? 'INVENTORY' : 'UNKNOWN';

    // Create a key based on timestamp + price (ignore side to catch malformed duplicates)
    const key = `${o.timestamp}_${o.price}`;

    if (!uniqueMap.has(key)) {
        uniqueMap.set(key, o);
    } else {
        // If existing one is 'estimated' or missing side, and current one is better?
        // We sorted best-first, so the first one we see is the best.
        // But we might want to merge data? pattern: keep best, maybe copy ID if weird?
        // For now, First-Winner-Take-All strategy with pre-sort is sufficient.
    }
});

const uniqueOrders = Array.from(uniqueMap.values());
const finalCount = uniqueOrders.length;
console.log(`Final Orders: ${finalCount} (Removed ${initialCount - finalCount})`);

// Sort desc by timestamp
uniqueOrders.sort((a, b) => b.timestamp - a.timestamp);

state.filledOrders = uniqueOrders;

// Clean Weird Backups found in diagnostics
const weirdBackup = STATE_FILE.replace('.json', '_backup_profits.json9.json');
if (fs.existsSync(weirdBackup)) {
    console.log(`🗑 Deleting weird backup: ${weirdBackup}`);
    fs.unlinkSync(weirdBackup);
}

// Backup (FORCE DELETE OLD BACKUPS)
if (fs.existsSync(STATE_FILE + '.tmp')) fs.unlinkSync(STATE_FILE + '.tmp');
if (fs.existsSync(STATE_FILE + '.bak')) fs.unlinkSync(STATE_FILE + '.bak');

// NUCLEAR OPTION: Delete original file before writing to ensure inode replacement
if (fs.existsSync(STATE_FILE)) {
    console.log(`💥 Nuclear Delete: ${STATE_FILE}`);
    fs.unlinkSync(STATE_FILE);
}

// Save New State
fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
const stats = fs.statSync(STATE_FILE);
console.log(`✅ State saved (Cleaning complete). File size: ${stats.size} bytes`);

