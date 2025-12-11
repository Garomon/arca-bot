// ============================================
// BLACK BOX RECORDER (Crash Handler)
// ============================================
const fs = require('fs');
const path = require('path');

const CRASH_LOG = path.join(__dirname, 'crash_report.log');

process.on('uncaughtException', (err) => {
    const crashMsg = `\n[${new Date().toISOString()}] CRITICAL CRASH: ${err.message}\nStack: ${err.stack}\n`;
    fs.appendFileSync(CRASH_LOG, crashMsg);
    console.error(crashMsg);
    // Ideally we should exit, but PM2 will restart us.
    // We let it crash so PM2 knows it failed.
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    const crashMsg = `\n[${new Date().toISOString()}] UNHANDLED REJECTION: ${reason}\n`;
    fs.appendFileSync(CRASH_LOG, crashMsg);
    console.error(crashMsg);
});
