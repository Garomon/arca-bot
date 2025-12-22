#!/bin/bash
# SETUP SWAP MEMORY (2GB)
# Prevents OOM crashes on 1GB VPS

SWAP_FILE="/swapfile"
SWAP_SIZE="2G"

if [ -f "$SWAP_FILE" ]; then
    echo "✅ Swap file already exists."
else
    echo "Creating $SWAP_SIZE swap file..."
    fallocate -l $SWAP_SIZE $SWAP_FILE
    chmod 600 $SWAP_FILE
    mkswap $SWAP_FILE
    swapon $SWAP_FILE
    echo "$SWAP_FILE none swap sw 0 0" | tee -a /etc/fstab
    echo "✅ Swap created successfully."
fi

# Optimization for server use
sysctl vm.swappiness=10
echo "vm.swappiness=10" >> /etc/sysctl.conf

free -h
