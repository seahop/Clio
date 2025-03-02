#!/bin/bash
set -e

# Only run if SSL is enabled
if [ "$POSTGRES_SSL" = "true" ]; then
    echo "Configuring PostgreSQL for SSL..."
    
    # Create SSL directory
    mkdir -p /var/lib/postgresql/certs
    
    # Copy certificates from the temporary location with correct permissions
    if [ -f /tmp/certs/server.crt ]; then
        cp /tmp/certs/server.crt /var/lib/postgresql/certs/
        cp /tmp/certs/server.key /var/lib/postgresql/certs/
        
        # Set proper permissions and ownership
        chmod 600 /var/lib/postgresql/certs/server.key
        chown postgres:postgres /var/lib/postgresql/certs/server.key
        chown postgres:postgres /var/lib/postgresql/certs/server.crt
        
        echo "SSL certificates configured with proper permissions and ownership"
        
        # Update postgresql.conf
        echo "ssl = on" >> "$PGDATA/postgresql.conf"
        echo "ssl_cert_file = '/var/lib/postgresql/certs/server.crt'" >> "$PGDATA/postgresql.conf"
        echo "ssl_key_file = '/var/lib/postgresql/certs/server.key'" >> "$PGDATA/postgresql.conf"
        
        echo "PostgreSQL configured to use SSL"
    else
        echo "SSL certificates not found - SSL will not be enabled"
    fi
fi