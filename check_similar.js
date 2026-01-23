const fs = require('fs');

const bots = ['BTCUSDT', 'SOLUSDT', 'DOGEUSDT'];

for (const pair of bots) {
    console.log('\n=== ' + pair + ' ===');
    const stateFile = '/root/arca-bot/data/sessions/VANTAGE01_' + pair + '_state.json';
    const state = JSON.parse(fs.readFileSync(stateFile));
    
    // Group by price (similar price = potential duplicate)
    const byPrice = {};
    state.inventory.forEach(lot => {
        const priceKey = lot.price.toFixed(2);
        if (!byPrice[priceKey]) byPrice[priceKey] = [];
        byPrice[priceKey].push(lot);
    });
    
    // Find similar
    let similarCount = 0;
    for (const [price, lots] of Object.entries(byPrice)) {
        if (lots.length > 1) {
            similarCount++;
            console.log('\nSAME PRICE $' + price + ' (' + lots.length + ' lots):');
            lots.forEach(lot => {
                console.log('  ID: ' + lot.id.toString().padEnd(20) + ' | amount: ' + lot.amount.toFixed(8) + ' | rem: ' + lot.remaining.toFixed(8));
            });
        }
    }
    
    if (similarCount === 0) {
        console.log('All lots have unique prices');
    }
}
