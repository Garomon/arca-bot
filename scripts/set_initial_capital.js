const fs = require('fs');
const path = require('path');

const ARGS = process.argv.slice(2);
const PAIR = ARGS[0]; // e.g., SOL/USDT
const NEW_CAPITAL = parseFloat(ARGS[1]); // e.g., 470.50

if (!PAIR || isNaN(NEW_CAPITAL)) {
    console.error("Usage: node scripts/set_initial_capital.js <PAIR> <AMOUNT>");
    console.error("Example: node scripts/set_initial_capital.js SOL/USDT 470.50");
    process.exit(1);
}

const PAIR_ID = PAIR.replace('/', '').toUpperCase();
const sessionsDir = path.join(__dirname, '..', 'data', 'sessions');

// Find the correct file
const files = fs.readdirSync(sessionsDir);
const targetFile = files.find(f => f.includes(`VANTAGE01_${PAIR_ID}_state.json`)) ||
    files.find(f => f.includes(`${PAIR_ID}_state.json`) && !f.includes('CRASH'));

if (!targetFile) {
    console.error(`>> [ERROR] No state file found for ${PAIR_ID} in ${sessionsDir}`);
    process.exit(1);
}

const filePath = path.join(sessionsDir, targetFile);
console.log(`>> [INFO] Updating file: ${filePath}`);

try {
    const raw = fs.readFileSync(filePath);
    const state = JSON.parse(raw);

    console.log(`>> [INFO] Old Capital: $${state.initialCapital}`);
    state.initialCapital = NEW_CAPITAL;
    console.log(`>> [SUCCESS] New Capital Set: $${state.initialCapital}`);

    fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
    console.log(">> [DONE] State saved.");

} catch (e) {
    console.error(`>> [ERROR] Failed to update state: ${e.message}`);
}
