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
    hash_algorithm VARCHAR(50),
    hash_value VARCHAR(128),
    analyst VARCHAR(100),
    locked BOOLEAN DEFAULT FALSE,
    locked_by VARCHAR(75),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Evidence files table
CREATE TABLE IF NOT EXISTS evidence_files (
    id SERIAL PRIMARY KEY,
    log_id INTEGER NOT NULL REFERENCES logs(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_type VARCHAR(100),
    file_size INTEGER,
    upload_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    uploaded_by VARCHAR(100),
    description TEXT,
    md5_hash VARCHAR(32),
    filepath VARCHAR(255) NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_analyst ON logs(analyst);
CREATE INDEX IF NOT EXISTS idx_logs_hostname ON logs(hostname);
CREATE INDEX IF NOT EXISTS idx_logs_hash_value ON logs(hash_value);

-- Create evidence index
CREATE INDEX IF NOT EXISTS idx_evidence_log_id ON evidence_files(log_id);
CREATE INDEX IF NOT EXISTS idx_evidence_uploaded_by ON evidence_files(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_evidence_upload_date ON evidence_files(upload_date);

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