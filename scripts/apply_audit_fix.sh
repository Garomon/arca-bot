#!/bin/bash
# scripts/apply_audit_fix.sh
# AUTOMATED REPAIR FOR BOTH BOTS (BTC & SOL)

echo "=========================================="
echo "🛡️  STARTING UNIVERSAL PROFIT REPAIR  🛡️"
echo "=========================================="

# 1. STOP BOTS
echo ">> [1/4] Stopping All Bots..."
pm2 stop all
echo ">> [WAIT] Allowing 5s for graceful shutdown..."
sleep 5

# 2. REPAIR BTC BOT (/root/arca-bot)
if [ -d "/root/arca-bot" ]; then
    echo ""
    echo ">> [2/4] Repairing BTC BOT (/root/arca-bot)..."
    cd /root/arca-bot
    git stash
    git pull
    echo ">> Running Audit for BTC/USDT..."
    # Ensure dependencies are installed just in case
    # npm install 
    node scripts/recalculate_profit.js BTC/USDT
    
    # FIX: Repair SOL here too, in case 'bot-sol' is running from this folder (Monolithic Setup)
    echo ">> [INFO] checking for local SOL bot files..."
    if [ -f "data/sessions/VANTAGE01_SOLUSDT_state.json" ] || [ -f "data/sessions/SOLUSDT_state.json" ]; then
         echo ">> [DETECTED] SOL State file found in arca-bot. Running Shadow Repair..."
         node scripts/recalculate_profit.js SOL/USDT
         grep -o '"totalProfit":[0-9.]*' data/sessions/VANTAGE01_SOLUSDT_state.json || echo ">> [WARN] Could not verify SOL profit in arca-bot"
    fi
else
    echo ">> ⚠️ /root/arca-bot not found. Skipping BTC repair."
fi

# 3. REPAIR SOL BOT (/root/bot-sol)
if [ -d "/root/bot-sol" ]; then
    echo ""
    echo ">> [3/4] Repairing SOL BOT (/root/bot-sol)..."
    cd /root/bot-sol
    git stash
    git pull
    echo ">> Running Audit for SOL/USDT..."
    echo ">> Running Audit for SOL/USDT..."
    node scripts/recalculate_profit.js SOL/USDT
    
    # VERIFICATION ON DISK
    echo ">> [VERIFY] Checking disk content for SOL:"
    grep -o '"totalProfit":[0-9.]*' data/sessions/VANTAGE01_SOLUSDT_state.json || echo ">> [ERROR] Could not read profit from file!"
    
else
    echo ">> ⚠️ /root/bot-sol not found. Skipping SOL repair."
fi

# 4. RESTART
echo ""
echo ">> [4/4] Restarting Swarm..."
# Force flushing of any pending PM2 operations
pm2 flush
pm2 restart all

echo "=========================================="
echo "✅  REPAIR COMPLETE - CHECK DASHBOARD"
echo "=========================================="
