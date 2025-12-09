/**
 * VANTAGE // MULTI-CORE ORCHESTRATOR
 * Version: 3.0 (Production Ready)
 * 
 * This orchestrator manages multiple trading pairs by spawning
 * independent bot processes. Each pair runs its own grid_bot instance
 * with isolated state files.
 */

const { fork } = require('child_process');
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
require('dotenv').config();

// --- MULTI-PAIR CONFIGURATION ---
const PORTFOLIO_CONFIG = {
    masterPort: 3001, // Master dashboard
    pairs: [
        {
            id: 'btc_usdt',
            pair: 'BTC/USDT',
            enabled: true,
            capitalPercent: 50,
            port: 3010,
            description: 'Safe Zone - Capital Preservation'
        },
        {
            id: 'sol_usdt',
            pair: 'SOL/USDT',
            enabled: true, // NOW ENABLED
            capitalPercent: 30,
            port: 3011,
            description: 'Cash Printer - High Volatility'
        },
        {
            id: 'eth_btc',
            pair: 'ETH/BTC',
            enabled: false, // Phase 3
            capitalPercent: 20,
            port: 3012,
            description: 'Satoshi Stacker - Long Term'
        }
    ]
};

// --- MASTER DASHBOARD SERVER ---
const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(__dirname));

// Child process registry
const botProcesses = new Map();

// Generate master dashboard HTML
function generateDashboardHTML() {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>VANTAGE Multi-Core | Portfolio Dashboard</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
                background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%);
                color: #fff;
                font-family: 'Inter', 'Segoe UI', sans-serif;
                min-height: 100vh;
                padding: 20px;
            }
            .header {
                text-align: center;
                margin-bottom: 40px;
            }
            h1 { 
                font-size: 2.5rem;
                margin-bottom: 10px;
                background: linear-gradient(90deg, #00ff88, #00d4ff);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
            }
            .subtitle { color: #888; font-size: 1rem; }
            .grid { 
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
                gap: 24px;
                max-width: 1400px;
                margin: 0 auto;
            }
            .pair-card {
                background: rgba(255,255,255,0.03);
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 20px;
                padding: 24px;
                transition: all 0.3s ease;
                position: relative;
                overflow: hidden;
            }
            .pair-card::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 4px;
                background: linear-gradient(90deg, #00ff88, #00d4ff);
                opacity: 0;
                transition: opacity 0.3s;
            }
            .pair-card:hover { 
                transform: translateY(-5px);
                border-color: rgba(0, 255, 136, 0.3);
                box-shadow: 0 20px 40px rgba(0,0,0,0.3);
            }
            .pair-card:hover::before { opacity: 1; }
            .pair-card.disabled { 
                opacity: 0.5;
                filter: grayscale(0.5);
            }
            .pair-header { 
                display: flex; 
                justify-content: space-between; 
                align-items: center; 
                margin-bottom: 16px; 
            }
            .pair-name { 
                font-size: 1.8rem; 
                font-weight: 700;
                letter-spacing: -0.5px;
            }
            .pair-status { 
                padding: 6px 14px;
                border-radius: 20px;
                font-size: 0.75rem;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .pair-status.active { 
                background: rgba(0, 255, 136, 0.15);
                color: #00ff88;
                animation: pulse 2s infinite;
            }
            .pair-status.pending { 
                background: rgba(255, 170, 0, 0.15);
                color: #ffaa00;
            }
            @keyframes pulse {
                0%, 100% { box-shadow: 0 0 0 0 rgba(0, 255, 136, 0.4); }
                50% { box-shadow: 0 0 0 8px rgba(0, 255, 136, 0); }
            }
            .pair-desc { 
                color: #666; 
                font-size: 0.9rem; 
                margin-bottom: 20px;
            }
            .pair-allocation {
                background: rgba(0,0,0,0.4);
                padding: 16px;
                border-radius: 12px;
                text-align: center;
                margin-bottom: 16px;
            }
            .pair-allocation span { 
                font-size: 3rem; 
                font-weight: 700; 
                background: linear-gradient(90deg, #00ff88, #00d4ff);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
            }
            .pair-allocation .label { 
                font-size: 0.8rem;
                color: #666;
                margin-top: 4px;
            }
            .pair-port {
                text-align: center;
                color: #444;
                font-size: 0.8rem;
                margin-bottom: 16px;
            }
            .pair-link {
                display: block;
                text-align: center;
                padding: 14px 20px;
                background: linear-gradient(90deg, #00ff88, #00d4ff);
                color: #000;
                text-decoration: none;
                border-radius: 12px;
                font-weight: 600;
                font-size: 0.95rem;
                transition: all 0.3s;
            }
            .pair-link:hover { 
                transform: scale(1.02);
                box-shadow: 0 10px 30px rgba(0, 255, 136, 0.3);
            }
            .pair-link.disabled {
                background: #333;
                color: #666;
                cursor: not-allowed;
            }
            .footer {
                text-align: center;
                margin-top: 40px;
                color: #444;
                font-size: 0.85rem;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🌐 VANTAGE MULTI-CORE</h1>
            <p class="subtitle">Portfolio Trading Dashboard | v3.0</p>
        </div>
        <div class="grid">
            ${PORTFOLIO_CONFIG.pairs.map(p => `
            <div class="pair-card ${!p.enabled ? 'disabled' : ''}">
                <div class="pair-header">
                    <span class="pair-name">${p.pair}</span>
                    <span class="pair-status ${p.enabled ? 'active' : 'pending'}">${p.enabled ? '● LIVE' : 'PHASE 3'}</span>
                </div>
                <div class="pair-desc">${p.description}</div>
                <div class="pair-allocation">
                    <span>${p.capitalPercent}%</span>
                    <div class="label">Capital Allocation</div>
                </div>
                <div class="pair-port">Port: ${p.port}</div>
                ${p.enabled
            ? `<a class="pair-link" href="http://localhost:${p.port}" target="_blank">Open Dashboard →</a>`
            : `<a class="pair-link disabled">Coming Soon</a>`
        }
            </div>
            `).join('')}
        </div>
        <div class="footer">
            Powered by VANTAGE OS | Multi-Core Edition
        </div>
    </body>
    </html>
    `;
}

app.get('/master', (req, res) => {
    res.send(generateDashboardHTML());
});

app.get('/', (req, res) => {
    res.redirect('/master');
});

// --- SPAWN BOT PROCESSES ---
function spawnBot(pairConfig) {
    console.log(`>> [ORCHESTRATOR] Spawning bot for ${pairConfig.pair} on port ${pairConfig.port}...`);
    console.log(`   Capital Allocation: ${pairConfig.capitalPercent}%`);

    const env = {
        ...process.env,
        TRADING_PAIR: pairConfig.pair,
        BOT_PORT: pairConfig.port.toString(),
        CAPITAL_ALLOCATION: (pairConfig.capitalPercent / 100).toString() // Convert % to decimal
    };

    const child = fork(path.join(__dirname, 'grid_bot.js'), [], {
        env,
        stdio: ['inherit', 'inherit', 'inherit', 'ipc']
    });

    child.on('error', (err) => {
        console.error(`>> [ORCHESTRATOR] Error with ${pairConfig.pair}:`, err.message);
    });

    child.on('exit', (code) => {
        console.log(`>> [ORCHESTRATOR] ${pairConfig.pair} exited with code ${code}`);
        botProcesses.delete(pairConfig.id);

        // Auto-restart after 5 seconds if it crashed
        if (code !== 0) {
            console.log(`>> [ORCHESTRATOR] Restarting ${pairConfig.pair} in 5 seconds...`);
            setTimeout(() => spawnBot(pairConfig), 5000);
        }
    });

    botProcesses.set(pairConfig.id, { process: child, config: pairConfig });
    return child;
}

// --- START ---
console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('       🚀 VANTAGE MULTI-CORE ORCHESTRATOR v3.0');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');

const enabledPairs = PORTFOLIO_CONFIG.pairs.filter(p => p.enabled);
console.log(`>> [ORCHESTRATOR] Portfolio Configuration:`);
PORTFOLIO_CONFIG.pairs.forEach(p => {
    const status = p.enabled ? '✅ ACTIVE' : '⏸️  PENDING';
    console.log(`   ${status} | ${p.pair.padEnd(10)} | ${p.capitalPercent}% | Port ${p.port}`);
});
console.log('');

// Start master dashboard
server.listen(PORTFOLIO_CONFIG.masterPort, () => {
    console.log(`>> [ORCHESTRATOR] Master Dashboard @ http://localhost:${PORTFOLIO_CONFIG.masterPort}/master`);
    console.log('');

    // Spawn bots for each enabled pair
    enabledPairs.forEach(pairConfig => {
        spawnBot(pairConfig);
    });

    console.log('');
    console.log(`>> [ORCHESTRATOR] ${enabledPairs.length} bot(s) launched!`);
    console.log('');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('');
    console.log('>> [ORCHESTRATOR] Shutting down all bots...');
    botProcesses.forEach((bot, id) => {
        console.log(`   Stopping ${id}...`);
        bot.process.kill('SIGTERM');
    });
    process.exit(0);
});

module.exports = { botProcesses, PORTFOLIO_CONFIG };
