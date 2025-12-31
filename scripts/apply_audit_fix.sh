#!/bin/bash
# scripts/apply_audit_fix.sh
# AUTOMATED REPAIR FOR ALL BOTS (BTC, SOL & DOGE)

echo "=========================================="
echo "🛡️  STARTING UNIVERSAL PROFIT REPAIR  🛡️"
echo "=========================================="

# 1. STOP BOTS
echo ">> [1/4] Stopping All Bots..."
pm2 stop all
echo ">> [WAIT] Allowing 5s for graceful shutdown..."
sleep 5

# 2. REPAIR ALL BOTS (all run from /root/arca-bot)
if [ -d "/root/arca-bot" ]; then
    echo ""
    echo ">> [2/4] Updating codebase..."
    cd /root/arca-bot
    git stash
    git pull
    
    echo ""
    echo ">> [3/4] Running profit recalculation for all pairs..."
    echo ">> Running Audit for BTC/USDT..."
    node scripts/recalculate_profit.js BTC/USDT
    
    echo ">> Running Audit for SOL/USDT..."
    node scripts/recalculate_profit.js SOL/USDT
    
    echo ">> Running Audit for DOGE/USDT..."
    node scripts/recalculate_profit.js DOGE/USDT
else
    echo ">> ⚠️ /root/arca-bot not found. Cannot proceed."
    exit 1
fi

# 4. RESTART
echo ""
echo ">> [4/4] Restarting Swarm..."
pm2 flush
pm2 restart all

echo "=========================================="
echo "✅  REPAIR COMPLETE - CHECK DASHBOARD"
echo "=========================================="
