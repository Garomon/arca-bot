const fs = require('fs');
const state = JSON.parse(fs.readFileSync('/root/arca-bot/data/sessions/VANTAGE01_BTCUSDT_state.json', 'utf8'));
const targetId = '5749968045';
const order = state.filledOrders.find(o => o.id === targetId);
console.log('--- ORDER DEBUG ---');
if (order) {
    console.log(JSON.stringify(order, null, 2));
    console.log('Typs of fees:', typeof order.fees);
    console.log('Value of fee:', order.fee);
    console.log('Value of fees:', order.fees);
} else {
    console.log('Order not found!');
}
