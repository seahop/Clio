-- First check and configure SSL if enabled
DO $$
BEGIN
    IF current_setting('environment_variables.POSTGRES_SSL', true) = 'true' THEN
        -- The second parameter 'true' above makes it ignore missing variables instead of raising an error
        RAISE NOTICE 'Configuring PostgreSQL for SSL';
        ALTER SYSTEM SET ssl = 'on';
        ALTER SYSTEM SET ssl_cert_file = '/var/lib/postgresql/certs/server.crt';
        ALTER SYSTEM SET ssl_key_file = '/var/lib/postgresql/certs/server.key';
        PERFORM pg_reload_conf();
    ELSE
        RAISE NOTICE 'SSL not enabled, skipping SSL configuration';
    END IF;
END $$;

-- Then initialize the database schema
CREATE TABLE IF NOT EXISTS logs (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL,
    internal_ip VARCHAR(45),
    external_ip VARCHAR(45),
    hostname VARCHAR(75),
    domain VARCHAR(75),
    username VARCHAR(75),
    command TEXT CHECK (LENGTH(command) <= 150),
    notes TEXT CHECK (LENGTH(notes) <= 254),
    filename VARCHAR(100),
    status VARCHAR(75),
    secrets TEXT CHECK (LENGTH(secrets) <= 150),
    analyst VARCHAR(100),
    locked BOOLEAN DEFAULT FALSE,
    locked_by VARCHAR(75),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_analyst ON logs(analyst);
CREATE INDEX IF NOT EXISTS idx_logs_hostname ON logs(hostname);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger
DROP TRIGGER IF EXISTS update_logs_updated_at ON logs;
CREATE TRIGGER update_logs_updated_at
    BEFORE UPDATE ON logs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();