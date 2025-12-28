#!/bin/bash

# ARCA GAROSSA - UNIVERSAL UPDATE SCRIPT
# Both BTC and SOL bots run from /root/arca-bot (same codebase, different configs)
# This script updates the codebase once and reloads both PM2 processes.

echo "=========================================="
echo "🚀 ARCA BOT - UNIVERSAL DEPLOYMENT SYSTEM"
echo "=========================================="

# Check for --update-env flag
UPDATE_ENV=false
if [ "$1" == "--update-env" ]; then
    UPDATE_ENV=true
fi

echo ""
echo ">> 🛠️ Updating Arca Bot Codebase (/root/arca-bot)..."

if [ -d "/root/arca-bot" ]; then
    cd /root/arca-bot
    
    # Pull latest code
    git fetch --all
    git reset --hard origin/main
    
    # Restore script permissions
    chmod +x scripts/*.sh 2>/dev/null
    
    # Optional: Update environment variables
    if [ "$UPDATE_ENV" = true ]; then
        echo ">> 🔧 Updating environment variables..."
        # Add any env update logic here if needed
    else
        echo "Use --update-env to update environment variables"
    fi
    
    # Reload both bots from the same codebase
    echo ""
    echo ">> 🔄 Reloading PM2 processes..."
    pm2 reload bot-btc && echo ">> ✅ BTC Bot Reloaded"
    pm2 reload bot-sol && echo ">> ✅ SOL Bot Reloaded"
    
else
    echo ">> ❌ CRITICAL ERROR: Directory /root/arca-bot not found!"
    exit 1
fi

echo ""
echo "=========================================="
echo "✅ SYSTEM UPDATE COMPLETE - ALL BOTS SYNCED"
echo "=========================================="
