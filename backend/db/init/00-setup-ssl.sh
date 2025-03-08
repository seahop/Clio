#!/bin/bash
# PostgreSQL SSL setup script - place in backend/db/init/00-setup-ssl.sh

# Set proper permissions and ownership for SSL files
mkdir -p /var/lib/postgresql/certs
cp /tmp/certs/server.crt /var/lib/postgresql/certs/
cp /tmp/certs/server.key /var/lib/postgresql/certs/

# Set proper ownership and permissions
chown postgres:postgres /var/lib/postgresql/certs/server.crt
chown postgres:postgres /var/lib/postgresql/certs/server.key
chmod 600 /var/lib/postgresql/certs/server.key
chmod 644 /var/lib/postgresql/certs/server.crt

# Update postgresql.conf to enable SSL
cat >> ${PGDATA}/postgresql.conf << EOL
# SSL Configuration added by setup script
ssl = on
ssl_cert_file = '/var/lib/postgresql/certs/server.crt'
ssl_key_file = '/var/lib/postgresql/certs/server.key'
EOL

echo "PostgreSQL SSL configuration complete"