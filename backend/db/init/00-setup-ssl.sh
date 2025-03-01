#!/bin/bash
set -e

# Only run if SSL is enabled
if [ "$POSTGRES_SSL" = "true" ]; then
    # Create SSL directory
    mkdir -p /var/lib/postgresql/certs
    
    # Copy certificates from shared volume with correct permissions
    if [ -f /docker-entrypoint-initdb.d/server.crt ]; then
        cp /docker-entrypoint-initdb.d/server.crt /var/lib/postgresql/certs/
        cp /docker-entrypoint-initdb.d/server.key /var/lib/postgresql/certs/
        
        # Set proper permissions
        chmod 600 /var/lib/postgresql/certs/server.key
        chown postgres:postgres /var/lib/postgresql/certs/server.key
        
        echo "SSL certificates configured with proper permissions"
        
        # Update postgresql.conf
        echo "ssl = on" >> "$PGDATA/postgresql.conf"
        echo "ssl_cert_file = '/var/lib/postgresql/certs/server.crt'" >> "$PGDATA/postgresql.conf"
        echo "ssl_key_file = '/var/lib/postgresql/certs/server.key'" >> "$PGDATA/postgresql.conf"
        
        echo "PostgreSQL configured to use SSL"
    else
        echo "SSL certificates not found - SSL will not be enabled"
    fi
fi