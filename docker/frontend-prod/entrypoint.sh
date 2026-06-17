#!/bin/sh
# Substitute BACKEND_URL into the nginx config template, then start nginx.
# Only BACKEND_URL is substituted; all other nginx $variables are preserved.
BACKEND_URL="${BACKEND_URL:-http://clio-backend:3001}"
export BACKEND_URL

envsubst '${BACKEND_URL}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

exec nginx -g "daemon off;"
