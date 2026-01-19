#!/bin/bash
# Backup state files every hour - Protection against AMNESIA
BACKUP_DIR="/root/arca-bot/data/backups"
mkdir -p $BACKUP_DIR

DATE=$(date +%Y%m%d_%H%M)

for state in /root/arca-bot/data/sessions/*_state.json; do
    if [ -f "$state" ]; then
        filename=$(basename "$state")
        cp "$state" "$BACKUP_DIR/${filename%.json}_${DATE}.json"
    fi
done

# Keep only last 48 backups per bot (2 days of hourly backups)
for prefix in BTCUSDT SOLUSDT DOGEUSDT; do
    ls -t $BACKUP_DIR/*${prefix}* 2>/dev/null | tail -n +49 | xargs rm -f 2>/dev/null
done

echo "[$(date)] Backup completed"
