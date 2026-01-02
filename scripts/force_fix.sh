#!/bin/bash
# force_fix.sh - Stops bot, fixes state, restarts bot (Prevents Overwrites)
# Usage: ./force_fix.sh [PAIR] [PM2_ID_OR_NAME]
# Example: ./force_fix.sh DOGE/USDT bot-doge

# ENSURE CORRECT DIRECTORY
cd /root/arca-bot || exit 1

PAIR=$1
BOT_ID=$2

if [ -z "$PAIR" ] || [ -z "$BOT_ID" ]; then
    echo "Usage: ./force_fix.sh [PAIR] [PM2_ID_OR_NAME]"
    exit 1
fi

echo "🛑 STOPPING $BOT_ID to prevent state overwrite..."
pm2 stop $BOT_ID

echo "🔧 RUNNING FIX for $PAIR..."
node scripts/full_audit.js $PAIR --fix

echo "✅ Audit Complete."
echo "🚀 RESTARTING $BOT_ID..."
pm2 start $BOT_ID

echo "🔍 VERIFYING fix persistence..."
sleep 5
node scripts/full_audit.js $PAIR | grep "Audit Inventory (Cap)"
