const fs = require('fs');

const bots = ['BTCUSDT', 'SOLUSDT', 'DOGEUSDT'];

for (const pair of bots) {
    console.log('\n=== ' + pair + ' ===');
    const stateFile = '/root/arca-bot/data/sessions/VANTAGE01_' + pair + '_state.json';
    const state = JSON.parse(fs.readFileSync(stateFile));
    
    // Group by base ID (without _recon)
    const byBaseId = {};
    state.inventory.forEach(lot => {
        const baseId = lot.id.toString().replace('_recon', '');
        if (!byBaseId[baseId]) byBaseId[baseId] = [];
        byBaseId[baseId].push(lot);
    });
    
    // Find duplicates
    let dupeCount = 0;
    for (const [baseId, lots] of Object.entries(byBaseId)) {
        if (lots.length > 1) {
            dupeCount++;
            console.log('DUPLICATE ID: ' + baseId);
            lots.forEach(lot => {
                console.log('  -> ' + lot.id + ' | remaining: ' + lot.remaining + ' | price: $' + lot.price);
            });
        }
    }
    
    if (dupeCount === 0) {
        console.log('No duplicates found. Total lots: ' + state.inventory.length);
    } else {
        console.log('\nFound ' + dupeCount + ' duplicate IDs');
    }
}
