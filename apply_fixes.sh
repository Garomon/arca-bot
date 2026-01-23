#!/bin/bash

FILE="/root/arca-bot/grid_bot.js"

# Fix 1: Change fee storage for BNB - store original fee amount
# Change: realFeeUSDT = trade.fee.cost * 700; feeCurrency = 'BNB';
# To: Store original and converted separately

sed -i 's/realFeeUSDT = trade.fee.cost \* 700;.*$/originalFeeBNB = trade.fee.cost; realFeeUSDT = trade.fee.cost * 700;/' "$FILE"

# Fix 2: After the line "feeCurrency = 'BNB';" add originalFee storage
# This is tricky, let me do it differently

echo "Fixes need to be applied manually due to complexity"
