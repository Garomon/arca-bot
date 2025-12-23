#!/bin/bash

# ARCA GAROSSA - UNIVERSAL UPDATE SCRIPT
# Updates both BTC and SOL bots in one go to ensure synchronization.

echo "=========================================="
echo "🚀 ARCA BOT - UNIVERSAL DEPLOYMENT SYSTEM"
echo "=========================================="

# 1. Update BTC Bot (Primary)
echo ""
echo ">> 🛠️ Updating BTC Bot (/root/arca-bot)..."
if [ -d "/root/arca-bot" ]; then
    cd /root/arca-bot
    git fetch --all
    git reset --hard origin/main
    # Restore permissions just in case
    chmod +x scripts/update_all_bots.sh
    pm2 reload bot-btc
    echo ">> ✅ BTC Bot Updated & Reloaded"
else
    echo ">> ❌ ERROR: Directory /root/arca-bot not found!"
fi

# 2. Update SOL Bot (Secondary)
echo ""
echo ">> 🛠️ Updating SOL Bot (/root/bot-sol)..."
if [ -d "/root/bot-sol" ]; then
    cd /root/bot-sol
    git fetch --all
    git reset --hard origin/main
    pm2 reload bot-sol
    echo ">> ✅ SOL Bot Updated & Reloaded"
else
    echo ">> ❌ ERROR: Directory /root/bot-sol not found!"
fi

echo ""
echo "=========================================="
echo "✅ SYSTEM UPDATE COMPLETE - ALL BOTS SYNCED"
echo "=========================================="
