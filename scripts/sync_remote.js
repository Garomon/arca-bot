const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// --- CONFIGURATION ---
const REMOTE_USER = 'root';
const REMOTE_DIR = '/root/arca-bot';
const DEFAULT_IP = '167.71.1.124';
const KEY_PATH = 'VPS_SECRET.txt';

// --- HELPERS ---
function getRemoteIP() {
    try {
        if (fs.existsSync(KEY_PATH)) {
            const content = fs.readFileSync(KEY_PATH, 'utf8');
            // Try to find IP pattern
            const match = content.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
            if (match) return match[0];
        }
    } catch (e) { }
    return DEFAULT_IP;
}

function runCommand(command, args) {
    return new Promise((resolve, reject) => {
        console.log(`\n> ${command} ${args.join(' ')}`);

        const proc = spawn(command, args, { stdio: 'inherit', shell: true });

        proc.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Command failed with code ${code}`));
        });
    });
}

// --- COMMANDS ---
async function pullData() {
    console.log('⬇️  PULLING LIVE DATA FROM VPS (VPS -> LOCAL)...');
    console.log('    (Requires VPS Password if no SSH key set)');
    const ip = getRemoteIP();

    try {
        // 1. Pull Sessions (State)
        // Using -r for recursive directory copy
        await runCommand('scp', ['-r', `${REMOTE_USER}@${ip}:${REMOTE_DIR}/data/sessions/*`, './data/sessions/']);

        // 2. Pull Logs (Recent activity)
        await runCommand('scp', [`${REMOTE_USER}@${ip}:${REMOTE_DIR}/logs/*.log`, './logs/']);

        // 3. Pull AI Brain (Decisions)
        await runCommand('scp', [`${REMOTE_USER}@${ip}:${REMOTE_DIR}/decisions.log`, './decisions.log']);

        console.log('\n✅ SYNC COMPLETE: Local data is now identical to live VPS.');
    } catch (err) {
        console.error('\n❌ SYNC FAILED:', err.message);
    }
}

async function pushCode() {
    console.log('⬆️  PUSHING CODE TO VPS (LOCAL -> VPS)...');
    console.log('    ⚠️  WARNING: This will overwrite scripts on the server.');
    console.log('    (Data files and .env are EXCLUDED from overwrite)');
    const ip = getRemoteIP();

    try {
        const uploadList = [
            '*.js',
            'dashboard.html',
            'public/',
            'scripts/',
            'package.json'
        ];

        // Construct a single scp command or loop? 
        // scp allows multiple sources but it's tricky with recursion mixing files and dirs.
        // Safer to do one by one or grouped.

        // 1. Root JS files
        console.log('   > Uploading Root JS...');
        await runCommand('scp', ['*.js', `${REMOTE_USER}@${ip}:${REMOTE_DIR}/`]);

        // 2. Dashboard
        console.log('   > Uploading Dashboard...');
        await runCommand('scp', ['dashboard.html', `${REMOTE_USER}@${ip}:${REMOTE_DIR}/`]);

        // 3. Public Assets (Recursive)
        console.log('   > Uploading Public Assets...');
        await runCommand('scp', ['-r', 'public/', `${REMOTE_USER}@${ip}:${REMOTE_DIR}/`]);

        // 4. Scripts (Recursive)
        console.log('   > Uploading Scripts...');
        await runCommand('scp', ['-r', 'scripts/', `${REMOTE_USER}@${ip}:${REMOTE_DIR}/`]);

        console.log('\n✅ DEPLOY COMPLETE: Code updated on VPS.');
        console.log('   👉 Suggestion: Run "ssh root@' + ip + ' \"pm2 restart all\"" to apply changes.');
    } catch (err) {
        console.error('\n❌ DEPLOY FAILED:', err.message);
    }
}

// --- RECOVER CODE FROM VPS (Safety Sync) ---
async function pullCode() {
    console.log('⬇️  RECOVERING CODE FROM VPS (VPS -> LOCAL)...');
    console.log('    ⚠️  WARNING: This will properties overwrite LOCAL files.');
    const ip = getRemoteIP();

    try {
        // 1. Recover Root JS (grid_bot.js, adaptive_helpers.js, etc.)
        console.log('   < Downloading Root JS...');
        await runCommand('scp', [`${REMOTE_USER}@${ip}:${REMOTE_DIR}/*.js`, './']);

        // 2. Recover Dashboard
        console.log('   < Downloading Dashboard...');
        await runCommand('scp', [`${REMOTE_USER}@${ip}:${REMOTE_DIR}/dashboard.html`, './']);

        // 3. Recover Public Assets (Recursive)
        console.log('   < Downloading Public Assets...');
        await runCommand('scp', ['-r', `${REMOTE_USER}@${ip}:${REMOTE_DIR}/public/*`, './public/']);

        // 4. Recover Scripts (Recursive)
        console.log('   < Downloading Scripts...');
        await runCommand('scp', ['-r', `${REMOTE_USER}@${ip}:${REMOTE_DIR}/scripts/*`, './scripts/']);

        console.log('\n✅ RECOVERY COMPLETE: Local code is now identical to VPS.');
    } catch (err) {
        console.error('\n❌ RECOVERY FAILED:', err.message);
    }
}

// --- MAIN ---
const mode = process.argv[2];

if (mode === 'pull') {
    pullData();
} else if (mode === 'push') {
    pushCode();
} else if (mode === 'pull-code') {
    pullCode();
} else {
    console.log('Usage: node scripts/sync_remote.js [pull|push|pull-code]');
    console.log('  pull      -> Downloads Data/Logs/Brain ONLY');
    console.log('  push      -> Uploads Code/Assets to VPS');
    console.log('  pull-code -> Downloads Code/Assets FROM VPS (Dangerous Overwrite)');
}
