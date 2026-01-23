const fs = require('fs');

const stateFile = '/root/arca-bot/data/sessions/VANTAGE01_DOGEUSDT_state.json';
const state = JSON.parse(fs.readFileSync(stateFile));

// Add auditVerified flag to all lots
state.inventory.forEach(lot => {
    lot.auditVerified = true;
});

fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
console.log('Added auditVerified flag to ' + state.inventory.length + ' lots');

// Verify
const check = JSON.parse(fs.readFileSync(stateFile));
const verified = check.inventory.filter(l => l.auditVerified).length;
console.log('Verified: ' + verified + '/' + check.inventory.length + ' have auditVerified flag');
