#!/bin/sh

# Check if Let's Encrypt certificates exist
if [ -f "/etc/nginx/certs/letsencrypt-fullchain.pem" ] && [ -f "/etc/nginx/certs/letsencrypt-privkey.pem" ]; then
    echo "Let's Encrypt certificates found, using them..."
    SRC=/etc/nginx/configs/nginx-letsencrypt.conf
else
    echo "No Let's Encrypt certificates found, using self-signed certificates..."
    SRC=/etc/nginx/configs/nginx-selfsigned.conf
fi

# HTTPS_REDIRECT_PORT: set to ":PORT" (e.g. ":8443") when HTTPS is not on the
# standard port 443 so that the HTTP→HTTPS redirect goes to the right place.
# Leave unset (default) for standard port 443 deployments.
HTTPS_REDIRECT_PORT="${HTTPS_REDIRECT_PORT:-}"

# envsubst only replaces ${HTTPS_REDIRECT_PORT}; all other nginx $variables
# are left untouched, which is critical for proxy_pass, $host, $request_uri, etc.
envsubst '${HTTPS_REDIRECT_PORT}' < "$SRC" > /etc/nginx/conf.d/default.conf

# Start Nginx
exec nginx -g "daemon off;"
