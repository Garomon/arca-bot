#!/bin/bash
# Auto backup script for ARCA bot data
# Runs daily via cron

BACKUP_DIR="/root/arca-bot/backups"
DATA_DIR="/root/arca-bot/data/sessions"
DATE=$(date +%Y%m%d_%H%M%S)
MAX_BACKUPS=30  # Keep last 30 backups

# Create backup
mkdir -p "$BACKUP_DIR"
cp -r "$DATA_DIR" "$BACKUP_DIR/sessions_bak_$DATE"

# Clean old backups (keep only last MAX_BACKUPS)
cd "$BACKUP_DIR"
ls -dt sessions_bak_* 2>/dev/null | tail -n +$((MAX_BACKUPS + 1)) | xargs rm -rf 2>/dev/null

echo "[$(date)] Backup completed: sessions_bak_$DATE"
