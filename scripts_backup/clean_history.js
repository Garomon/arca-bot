const fs = require('fs');
const FILE = '/root/arca-bot/data/financial_history.json';

try {
    if (fs.existsSync(FILE)) {
        let history = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        const originalCount = history.length;

        // Filter out records with Equity > 2000 (Triple Count Error)
        history = history.filter(r => r.equity < 2000);

        const newCount = history.length;
        console.log(`🧹 Cleaned History: Removed ${originalCount - newCount} records (Equity > 2000).`);

        fs.writeFileSync(FILE, JSON.stringify(history, null, 2));
    } else {
        console.log('❌ History file not found.');
    }
} catch (e) {
    console.error('❌ Error cleaning history:', e.message);
}
