const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SESSIONS_DIR = path.join(__dirname, '..', 'data', 'sessions');
const ROOT_DIR = path.join(__dirname, '..');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function findStateFiles() {
    let files = [];
    [SESSIONS_DIR, ROOT_DIR].forEach(dir => {
        if (fs.existsSync(dir)) {
            const f = fs.readdirSync(dir).filter(file => file.endsWith('_state.json'));
            f.forEach(file => files.push({ path: path.join(dir, file), name: file }));
        }
    });
    return files;
}

// Main Logic
const files = findStateFiles();

console.log('\n👻 GHOST BUSTER PROTOCOL (Detecting Duplicates)');
console.log('=============================================');

const groups = {}; // Group by PAIR (e.g. BTCUSDT) to find duplicates

files.forEach(f => {
    // Normalize name: VANTAGE01_BTCUSDT -> BTCUSDT, BTCUSDT -> BTCUSDT
    let cleanName = f.name.replace('VANTAGE01_', '').replace('_state.json', '');
    if (!groups[cleanName]) groups[cleanName] = [];
    groups[cleanName].push(f);
});

let foundGhosts = false;

Object.keys(groups).forEach(pair => {
    if (groups[pair].length > 1) {
        foundGhosts = true;
        console.log(`\n⚠️  DUPLICATE DETECTED FOR PAIR: ${pair}`);
        console.log(`You have ${groups[pair].length} active brains for this coin. This causes DOUBLE COUNTING.`);

        groups[pair].forEach((f, idx) => {
            const stats = fs.statSync(f.path);
            console.log(`   [${idx}] ${f.name} (Last Update: ${stats.mtime.toLocaleString()})`);
        });

        console.log(`\nRecommendation: Keep the one matching your current CONFIG (probably VANTAGE01 prefix).`);
    }
});

if (!foundGhosts) {
    console.log("✅ No ghosts found. Your capital count is accurate.");
    process.exit(0);
} else {
    console.log('\nTo fix "Active Capital" mismatch, you should delete the old/unused file.');
    console.log('Example: If "BTCUSDT_state.json" is old, delete it.');
    console.log('Command: rm data/sessions/BTCUSDT_state.json');
}

rl.close();
