#!/bin/bash
# PostgreSQL SSL setup script - place in backend/db/init/00-setup-ssl.sh

# Check if we need to configure SSL
if [ -f "/tmp/postgres-init/check_ssl_config" ]; then
  # SSL configuration check triggered by entrypoint
  
  # Set proper permissions and ownership for SSL files
  echo "Performing SSL setup in initialization script..."
  mkdir -p /var/lib/postgresql/certs
  
  # Check if certificates exist in temporary location
  if [ -f "/tmp/certs/server.crt" ] && [ -f "/tmp/certs/server.key" ]; then
    cp /tmp/certs/server.crt /var/lib/postgresql/certs/
    cp /tmp/certs/server.key /var/lib/postgresql/certs/
    
    # Set proper ownership and permissions
    chown postgres:postgres /var/lib/postgresql/certs/server.crt
    chown postgres:postgres /var/lib/postgresql/certs/server.key
    chmod 600 /var/lib/postgresql/certs/server.key
    chmod 644 /var/lib/postgresql/certs/server.crt
  else
    echo "Warning: SSL certificates not found in /tmp/certs/"
  fi
  
  # Update postgresql.conf to enable SSL if not already done
  if ! grep -q "ssl = on" "${PGDATA}/postgresql.conf"; then
    echo "Configuring SSL in postgresql.conf..."
    cat >> ${PGDATA}/postgresql.conf << EOL
# SSL Configuration added by setup script
ssl = on
ssl_cert_file = '/var/lib/postgresql/certs/server.crt'
ssl_key_file = '/var/lib/postgresql/certs/server.key'
EOL
    echo "SSL configuration added to postgresql.conf"
  else
    echo "SSL is already configured in postgresql.conf"
  fi
  
  echo "PostgreSQL SSL configuration complete"
else
  echo "SSL setup check not requested, skipping"
fi