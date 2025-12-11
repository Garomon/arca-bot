#!/bin/bash
# Fast Setup Script for Arca Bot
# Run this on your NEW server (Non-US region)

echo "🚀 Starting Fast Setup..."

# 1. Update System
sudo apt update && sudo apt upgrade -y

# 2. Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. Install Tools
npm install pm2 -g
sudo apt install git -y

# 4. Clone Repo
git clone https://github.com/Garomon/arca-bot.git
cd arca-bot
npm install

echo "✅ Setup Complete! Now create your .env file and start with PM2."
