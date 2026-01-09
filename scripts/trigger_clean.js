
const io = require('socket.io-client');
const socket = io('http://167.71.1.124:3000');

console.log('Connecting to bot...');

socket.on('connect', () => {
    console.log('Connected! Sending force_deep_clean command...');
    socket.emit('force_deep_clean');

    // Listen for confirmation
    socket.on('log_message', (data) => {
        console.log(`[LOG] ${data.msg}`);
        if (data.msg.includes('DEEP CLEAN COMPLETE')) {
            console.log('SUCCESS! Exiting...');
            // Enable next step
            // process.exit(0); 
        }
    });

    // Wait 5 seconds then exit
    setTimeout(() => {
        console.log('Timeout. Check dashboard manually.');
        process.exit(0);
    }, 5000);
});
