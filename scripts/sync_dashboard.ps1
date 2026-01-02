
# sync_dashboard.ps1
# Synchronize data from VPS to Local for Dashboard

$VPS_IP = "167.71.1.124"
$VPS_USER = "root"
$REMOTE_PATH = "/root/arca-bot/data/sessions/*_state.json"
$LOCAL_PATH = "data\sessions\"

Write-Host "Connecting to Arca Bot VPS ($VPS_IP)..." -ForegroundColor Cyan

# Ensure local directory exists
if (!(Test-Path -Path $LOCAL_PATH)) {
    New-Item -ItemType Directory -Force -Path $LOCAL_PATH | Out-Null
}

# SCP Command using standard Windows SCP
Write-Host "Downloading latest bot states..." -ForegroundColor Yellow

try {
    scp "${VPS_USER}@${VPS_IP}:${REMOTE_PATH}" $LOCAL_PATH
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Sync Complete! Refresh your Dashboard HTML." -ForegroundColor Green
    }
    else {
        Write-Host "SCP Failed. Check SSH connection." -ForegroundColor Red
    }
}
catch {
    Write-Host "Error: $_" -ForegroundColor Red
}
