const fs = require('fs');
const state = JSON.parse(fs.readFileSync('/root/arca-bot/data/sessions/VANTAGE01_DOGEUSDT_state.json'));

console.log('DOGE Inventory - Direct Read');
console.log('Total lots:', state.inventory.length);
console.log('Total remaining:', state.inventory.reduce((s,l) => s + l.remaining, 0));

// Check for duplicates
const idCounts = {};
state.inventory.forEach(lot => {
    const baseId = lot.id.toString().replace('_recon', '');
    idCounts[baseId] = (idCounts[baseId] || 0) + 1;
});

const dupes = Object.entries(idCounts).filter(([id, count]) => count > 1);
if (dupes.length === 0) {
    console.log('\nNO DUPLICATES - All IDs are unique');
} else {
    console.log('\nDUPLICATES FOUND:');
    dupes.forEach(([id, count]) => console.log('  ' + id + ': ' + count + ' times'));
}

console.log('\nAll lot IDs:');
state.inventory.forEach(lot => {
    console.log('  ' + lot.id + ' | rem: ' + lot.remaining + ' | $' + lot.price.toFixed(5));
});
