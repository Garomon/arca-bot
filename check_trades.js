const fs = require('fs');

const state = JSON.parse(fs.readFileSync('./data/sessions/VANTAGE01_SOLUSDT_state.json', 'utf8'));

console.log('=== TRADE HISTORY ===');
const history = state.tradeHistory || [];
console.log('Total trades:', history.length);

const sells = history.filter(t => t.side === 'sell');
console.log('Sells:', sells.length);

if (sells.length > 0) {
    console.log('\nEjemplo sell:');
    console.log(JSON.stringify(sells[sells.length-1], null, 2));
}

console.log('\n=== EXECUTED TRADES ===');
const executed = state.executedTrades || [];
console.log('Total:', executed.length);
if (executed.length > 0) {
    const execSells = executed.filter(t => t.side === 'sell');
    console.log('Sells:', execSells.length);
    if (execSells.length > 0) {
        console.log('\nEjemplo executed sell:');
        console.log(JSON.stringify(execSells[execSells.length-1], null, 2));
    }
}

console.log('\n=== COMPLETED CYCLES ===');
const cycles = state.completedCycles || [];
console.log('Total:', cycles.length);
if (cycles.length > 0) {
    console.log('\nEjemplo cycle:');
    console.log(JSON.stringify(cycles[cycles.length-1], null, 2));
}
