const fs = require('fs');

const auditPath = '/root/arca-bot/scripts/full_audit.js';
let content = fs.readFileSync(auditPath, 'utf8');

// Backup original
fs.writeFileSync(auditPath + '.backup', content);
console.log('Backup created: full_audit.js.backup');

// Find the section where inventory lots are created and add tradeId
// Original: inventory.push({ orderId, price, amount, ...
// New: inventory.push({ orderId, tradeId: String(trade.id), price, amount, ...

// Also need to track trade.id in the processing loop

// 1. Modify the lot creation to include tradeId
const originalLotPush = `inventory.push({
                        orderId,
                        price,
                        amount,
                        remaining: amount,
                        fee: feeUSDT,
                        timestamp
                    });`;

const newLotPush = `inventory.push({
                        orderId,
                        tradeId: String(trade.id), // PATCH: Store actual Binance trade ID
                        price,
                        amount,
                        remaining: amount,
                        fee: feeUSDT,
                        timestamp
                    });`;

if (content.includes(originalLotPush)) {
    content = content.replace(originalLotPush, newLotPush);
    console.log('Patched: lot creation to include tradeId');
} else {
    console.log('WARNING: Could not find lot creation pattern');
}

// 2. Modify the inventory write to use tradeId as the id
// Find where cappedInventory is created and modify to use tradeId

const originalCappedPush = `cappedInventory.unshift({
                        ...lot,
                        remaining: take,
                        amount: lot.amount
                    });`;

const newCappedPush = `cappedInventory.unshift({
                        ...lot,
                        id: lot.tradeId || lot.orderId, // PATCH: Use trade ID, fallback to orderId
                        remaining: take,
                        amount: lot.amount
                    });`;

if (content.includes(originalCappedPush)) {
    content = content.replace(originalCappedPush, newCappedPush);
    console.log('Patched: capped inventory to use tradeId');
} else {
    console.log('WARNING: Could not find capped inventory pattern');
}

fs.writeFileSync(auditPath, content);
console.log('\nfull_audit.js has been patched!');
