
const fs = require('fs');
const path = require('path');

const SESSIONS_DIR = path.join(__dirname, '..', 'data', 'sessions');

if (!fs.existsSync(SESSIONS_DIR)) {
    console.error("Sessions directory not found!");
    process.exit(1);
}

const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('_state.json'));
let grandTotal = 0;

files.forEach(file => {
    const filePath = path.join(SESSIONS_DIR, file);
    try {
        const state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const filledOrders = state.filledOrders || [];
        const archivedOrders = state.archivedOrders || [];

        let fileSum = 0;
        filledOrders.forEach(o => fileSum += parseFloat(o.profit || 0));

        let archiveSum = 0;
        archivedOrders.forEach(o => archiveSum += parseFloat(o.profit || 0));

        console.log(`\n--- ${file} ---`);
        console.log(`State Total Prop: $${(state.totalProfit || 0).toFixed(4)}`);
        console.log(`Active Sum: $${fileSum.toFixed(4)}`);
        console.log(`Archive Sum: $${archiveSum.toFixed(4)}`);
        console.log(`Total History: $${(fileSum + archiveSum).toFixed(4)}`);
        console.log(`Orders: Active ${filledOrders.length} | Archived ${archivedOrders.length}`);

        grandTotal += (fileSum + archiveSum);
    } catch (e) {
        console.error(`Error reading ${file}: ${e.message}`);
    }
});

console.log(`\n================================`);
console.log(`GRAND TOTAL (ALL BOTS): $${grandTotal.toFixed(4)}`);
console.log(`================================`);
