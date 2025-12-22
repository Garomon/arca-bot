#!/bin/bash
# scripts/apply_audit_fix.sh - AUTOMATED FORENSIC REPAIR

echo "=========================================="
echo "🛡️  STARTING FORENSIC PROFIT REPAIR  🛡️"
echo "=========================================="

# 1. STOP BOTS (Critical to prevent memory overwrite)
echo ">> [1/5] Stopping Bots..."
pm2 stop all

# 2. UPDATE CODE (Ensure latest fix is present)
echo ">> [2/5] Updating Codebase..."
git stash
git pull
echo ">> [INFO] Code updated."

# 3. RUN AUDIT FOR SOL (Recover Profit)
echo ">> [3/5] Auditing SOL/USDT..."
node scripts/recalculate_profit.js SOL/USDT

# 4. RUN AUDIT FOR BTC (Recover Profit)
echo ">> [4/5] Auditing BTC/USDT..."
node scripts/recalculate_profit.js BTC/USDT

# Verify Files
echo ">> [DEBUG] Verifying State Files Content via grep:"
grep "totalProfit" data/sessions/*_state.json

# 5. RESTART BOTS (Load new clean state)
echo ">> [5/5] Restarting Bots..."
pm2 restart all

echo "=========================================="
echo "✅  REPAIR COMPLETE!"
echo "    Check Dashboard now."
echo "=========================================="
