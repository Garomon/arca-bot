Write-Host "eagle: 1. Uppdating Audit Script on VPS..." -ForegroundColor Cyan
scp scripts\full_audit.js root@167.71.1.124:/root/arca-bot/scripts/

Write-Host "eagle: 2. Running Audit Fix for SOL..." -ForegroundColor Cyan
ssh -t root@167.71.1.124 "node /root/arca-bot/scripts/full_audit.js SOL/USDT --fix"

Write-Host "eagle: 3. Restarting SOL Bot..." -ForegroundColor Cyan
ssh -t root@167.71.1.124 "pm2 restart bot-sol"

Write-Host "eagle: Done! The SOL bot should now remain ONLINE without errors." -ForegroundColor Green
