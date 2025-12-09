/**
 * VANTAGE // MULTI-CORE ORCHESTRATOR
 * Version: 3.0 (Hybrid Mode)
 * 
 * This orchestrator manages multiple trading pairs by spawning
 * independent bot processes. Each pair runs its own grid_bot instance
 * with isolated state files.
 * 
 * HYBRID APPROACH: Instead of rewriting 2000 lines, we fork processes.
 */

const { fork } = require('child_process');
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
require('dotenv').config();

// --- MULTI-PAIR CONFIGURATION ---
const PORTFOLIO_CONFIG = {
    port: 3000,
    masterUIPort: 3001, // Master dashboard showing all pairs
    pairs: [
        {
            id: 'btc_usdt',
            pair: 'BTC/USDT',
            enabled: true,
            capitalPercent: 50, // 50% of total capital
            port: 3010,
            description: 'Safe Zone - Capital Preservation'
        },
        {
            id: 'sol_usdt',
            pair: 'SOL/USDT',
            enabled: false, // Phase 2
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

// Serve a master dashboard
app.get('/master', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>VANTAGE Multi-Core | Portfolio Dashboard</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
                background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%);
                color: #fff;
                font-family: 'Inter', 'Segoe UI', sans-serif;
                min-height: 100vh;
                padding: 20px;
            }
            h1 { 
                text-align: center;
                font-size: 2rem;
                margin-bottom: 30px;
                background: linear-gradient(90deg, #00ff88, #00d4ff);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
            }
            .grid { 
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                gap: 20px;
                max-width: 1200px;
                margin: 0 auto;
            }
            .pair-card {
                background: rgba(255,255,255,0.05);
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 16px;
                padding: 20px;
                transition: all 0.3s;
            }
            .pair-card:hover { 
                transform: translateY(-5px);
                border-color: #00ff88;
            }
            .pair-card.disabled { opacity: 0.5; }
            .pair-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
            .pair-name { font-size: 1.5rem; font-weight: bold; }
            .pair-status { 
                padding: 4px 12px;
                border-radius: 20px;
                font-size: 0.8rem;
                font-weight: bold;
            }
            .pair-status.active { background: #00ff8833; color: #00ff88; }
            .pair-status.pending { background: #ffaa0033; color: #ffaa00; }
            .pair-desc { color: #888; font-size: 0.9rem; margin-bottom: 15px; }
            .pair-allocation {
                background: rgba(0,0,0,0.3);
                padding: 10px;
                border-radius: 8px;
                text-align: center;
            }
            .pair-allocation span { font-size: 2rem; font-weight: bold; color: #00ff88; }
            .pair-link {
                display: block;
                text-align: center;
                margin-top: 15px;
                padding: 10px;
                background: linear-gradient(90deg, #00ff88, #00d4ff);
                color: #000;
                text-decoration: none;
                border-radius: 8px;
                font-weight: bold;
            }
            .pair-link:hover { opacity: 0.8; }
        </style>
    </head>
    <body>
        <h1>🌐 VANTAGE MULTI-CORE | PORTFOLIO DASHBOARD</h1>
        <div class="grid">
            ${PORTFOLIO_CONFIG.pairs.map(p => `
            <div class="pair-card ${!p.enabled ? 'disabled' : ''}">
                <div class="pair-header">
                    <span class="pair-name">${p.pair}</span>
                    <span class="pair-status ${p.enabled ? 'active' : 'pending'}">${p.enabled ? 'ACTIVE' : 'PHASE 2+'}</span>
                </div>
                <div class="pair-desc">${p.description}</div>
                <div class="pair-allocation">
                    <span>${p.capitalPercent}%</span>
                    <div style="font-size:0.8rem;color:#888;">Capital Allocation</div>
                </div>
                ${p.enabled ? `<a class="pair-link" href="http://localhost:${p.port}" target="_blank">Open Dashboard →</a>` : ''}
            </div>
            `).join('')}
        </div>
    </body>
    </html>
    `);
});

// --- START ---
console.log('');
console.log('═══════════════════════════════════════════════════════');
console.log('   🚀 VANTAGE MULTI-CORE ORCHESTRATOR v3.0');
console.log('═══════════════════════════════════════════════════════');
console.log('');

const enabledPairs = PORTFOLIO_CONFIG.pairs.filter(p => p.enabled);
console.log(`>> [ORCHESTRATOR] Portfolio Configuration:`);
PORTFOLIO_CONFIG.pairs.forEach(p => {
    const status = p.enabled ? '✅ ACTIVE' : '⏸️  PENDING';
    console.log(`   ${status} | ${p.pair} | ${p.capitalPercent}% | Port ${p.port}`);
});
console.log('');

// For Phase 1: Just redirect to the original grid_bot.js
if (enabledPairs.length === 1 && enabledPairs[0].id === 'btc_usdt') {
    console.log('>> [ORCHESTRATOR] Single-Pair Mode (Legacy Compatible)');
    console.log('>> [ORCHESTRATOR] Starting BTC/USDT bot on port 3000...');
    console.log('');

    // For now, we just require the original grid_bot to maintain compatibility
    // In Phase 2, we'll fork child processes
    require('./grid_bot.js');
} else {
    // Phase 2+: Spawn independent processes
    console.log('>> [ORCHESTRATOR] Multi-Pair Mode');

    // Start master dashboard
    server.listen(PORTFOLIO_CONFIG.masterUIPort, () => {
        console.log(`>> [ORCHESTRATOR] Master Dashboard @ http://localhost:${PORTFOLIO_CONFIG.masterUIPort}/master`);
    });

    // TODO: Implement child process forking for each pair
    // This requires modifying grid_bot.js to accept pair as env variable
    console.log('>> [ORCHESTRATOR] Multi-pair process forking not yet implemented.');
    console.log('>> [ORCHESTRATOR] Enable only btc_usdt for now.');
}
