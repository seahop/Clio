#!/bin/bash

# Check if Let's Encrypt certificates exist
if [ -f "/etc/nginx/certs/letsencrypt-fullchain.pem" ] && [ -f "/etc/nginx/certs/letsencrypt-privkey.pem" ]; then
    echo "Let's Encrypt certificates found, using them..."
    # Activate the Let's Encrypt configuration
    ln -sf /etc/nginx/conf.d/nginx-letsencrypt.conf /etc/nginx/conf.d/default.conf
else
    echo "Let's Encrypt certificates not found, using self-signed certificates..."
    # Check if self-signed certificates exist, otherwise create them
    if [ ! -f "/etc/nginx/certs/server.crt" ] || [ ! -f "/etc/nginx/certs/server.key" ]; then
        echo "Self-signed certificates not found, generating them..."
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout /etc/nginx/certs/server.key \
            -out /etc/nginx/certs/server.crt \
            -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
    fi
    # Activate the self-signed configuration
    ln -sf /etc/nginx/conf.d/nginx-selfsigned.conf /etc/nginx/conf.d/default.conf
fi

# Start Nginx in foreground
exec nginx -g "daemon off;"