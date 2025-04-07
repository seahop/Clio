#!/bin/bash
# File: ./backend/db/db-entrypoint.sh

echo "===== DB ENTRYPOINT SCRIPT STARTING ====="

# Check for certificate changes
echo "Checking for certificate changes on startup..."
CERT_DIR="/var/lib/postgresql/certs"
TMP_CERT="/tmp/certs/server.crt"
TMP_KEY="/tmp/certs/server.key"
CURRENT_CERT="${CERT_DIR}/server.crt"
CURRENT_KEY="${CERT_DIR}/server.key"

# Ensure directory exists
mkdir -p ${CERT_DIR}

# Update certificates if they exist in the tmp directory
if [ -f "${TMP_CERT}" ] && [ -f "${TMP_KEY}" ]; then
  echo "Copying certificates from mount point..."
  
  # Copy certificates
  cp ${TMP_CERT} ${CURRENT_CERT}
  cp ${TMP_KEY} ${CURRENT_KEY}
  
  # Set permissions
  chown postgres:postgres ${CURRENT_CERT}
  chown postgres:postgres ${CURRENT_KEY}
  chmod 644 ${CURRENT_CERT}
  chmod 600 ${CURRENT_KEY}
  echo "Certificate update complete"
else
  echo "Warning: Certificate files not found in temp directory"
fi

# Function to update postgresql.conf with SSL settings
update_ssl_config() {
  if [ -f "${PGDATA}/postgresql.conf" ]; then
    if grep -q "ssl = on" "${PGDATA}/postgresql.conf"; then
      echo "SSL is already configured in postgresql.conf."
    else
      echo "Adding SSL configuration to postgresql.conf..."
      cat >> "${PGDATA}/postgresql.conf" << EOL
# SSL Configuration added by entrypoint script
ssl = on
ssl_cert_file = '/var/lib/postgresql/certs/server.crt'
ssl_key_file = '/var/lib/postgresql/certs/server.key'
EOL
      echo "SSL configuration added to postgresql.conf"
    fi
  else
    echo "postgresql.conf not found yet. SSL configuration will be handled later."
  fi
}

# Create a file to trigger the init script to check SSL config
mkdir -p /tmp/postgres-init
echo "true" > /tmp/postgres-init/check_ssl_config

# Call the original entrypoint with our wrapper
echo "===== STARTING POSTGRESQL WITH UPDATED CERTIFICATES ====="

# Try to update SSL config but don't fail if the file doesn't exist yet
update_ssl_config || true

# Execute the original entrypoint
exec docker-entrypoint.sh "$@"