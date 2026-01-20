#\!/bin/bash
BACKUP_DIR="/root/arca-bot/data/backups"
mkdir -p $BACKUP_DIR
DATE=$(date +%Y%m%d_%H%M)

for state in /root/arca-bot/data/sessions/*_state.json; do
    [ -f "$state" ] && cp "$state" "$BACKUP_DIR/$(basename $state .json)_${DATE}.json"
done

# Keep last 48 backups per bot (2 days)
for p in BTCUSDT SOLUSDT DOGEUSDT; do
    ls -t $BACKUP_DIR/*${p}* 2>/dev/null | tail -n +49 | xargs rm -f 2>/dev/null
done
echo "[$(date)] Backup done"
