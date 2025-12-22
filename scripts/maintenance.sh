#!/bin/bash
# MAINTENANCE: Log Rotation & Cleanup
# Keeps disk usage low (~50MB max per log)

LOG_DIR="/root/.pm2/logs"

echo "🧹 Starting maintenance..."

# 1. Truncate huge PM2 logs (Keep last 50MB)
find $LOG_DIR -name "*.log" -size +50M -exec sh -c 'echo "Truncating {}"; tail -c 50M "{}" > "{}.tmp" && mv "{}.tmp" "{}"' \;

# 2. Flush PM2 internal logs (optional, frees RAM)
pm2 flush

echo "✅ Maintenance complete. Disk usage:"
df -h /
