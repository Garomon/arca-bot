#!/bin/bash
# fix_fleet.sh - Global state repair for ALL bots
# Stops the entire fleet, repairs state for every pair, and restarts.

echo "🦅 ARCA FLEET MAINTENANCE PROTOCOL"
echo "══════════════════════════════════"

echo "🛑 [1/3] STOPPING ALL BOTS (Preventing Overwrites)..."
pm2 stop all

echo "🔧 [2/3] EXECUTING STATE REPAIRS..."

echo "   👉 [BTC/USDT] Auditing & Fixing..."
node scripts/full_audit.js BTC/USDT --fix

echo "   👉 [SOL/USDT] Auditing & Fixing..."
node scripts/full_audit.js SOL/USDT --fix

echo "   👉 [DOGE/USDT] Auditing & Fixing..."
node scripts/full_audit.js DOGE/USDT --fix

echo "🚀 [3/3] RESTARTING FLEET..."
pm2 restart all

echo "✅ FLEET MAINTENANCE COMPLETE."
echo "   All bots are back online with clean states."
