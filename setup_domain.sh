#!/bin/bash
# setup_domain.sh - Secure Nginx & SSL Setup for Quanteeve.com
# Usage: sudo ./setup_domain.sh

DOMAIN="quanteeve.com"
PORT=3000 # Default port found in main.js
EMAIL="admin@quanteeve.com"

echo "🌐 Setting up $DOMAIN on Port $PORT..."

# 1. Install Nginx & Certbot
echo "📦 Installing Nginx & Certbot..."
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx apache2-utils

# 2. Setup Password Protection
echo "🔒 Setting up Password Protection..."
# Check if .htpasswd exists
if [ ! -f /etc/nginx/.htpasswd ]; then
    echo "Creating admin user. Please enter password:"
    sudo htpasswd -c /etc/nginx/.htpasswd admin
fi

# 3. Create Nginx Configuration
echo "📝 Creating Nginx Config..."
sudo cat > /etc/nginx/sites-available/$DOMAIN <<EOF
server {
    server_name $DOMAIN www.$DOMAIN;

    location / {
        proxy_pass http://localhost:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;

        # Password Protection
        auth_basic "Restricted Area";
        auth_basic_user_file /etc/nginx/.htpasswd;
    }
}
EOF

# 4. Enable Site
echo "🔌 Enabling Site..."
sudo ln -sfn /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
sudo nginx -t

# 5. Restart Nginx
sudo systemctl restart nginx

# 6. Install SSL (Let's Encrypt)
echo "🔒 Requesting SSL Certificate (HTTPS)..."
sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos -m $EMAIL --redirect

echo "✅ DONE! Your bot is live at https://$DOMAIN"
