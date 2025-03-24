#!/bin/sh

# Check if Let's Encrypt certificates exist
if [ -f "/etc/nginx/certs/letsencrypt-fullchain.pem" ] && [ -f "/etc/nginx/certs/letsencrypt-privkey.pem" ]; then
    echo "Let's Encrypt certificates found, using them..."
    cp /etc/nginx/configs/nginx-letsencrypt.conf /etc/nginx/conf.d/default.conf
else
    echo "No Let's Encrypt certificates found, using self-signed certificates..."
    cp /etc/nginx/configs/nginx-selfsigned.conf /etc/nginx/conf.d/default.conf
fi

# Start Nginx
exec nginx -g "daemon off;"
