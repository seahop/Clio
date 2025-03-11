-- Initialize main logs table first (since relationships depend on it)
CREATE TABLE IF NOT EXISTS logs (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL,
    internal_ip VARCHAR(45),
    external_ip VARCHAR(45),
    hostname VARCHAR(75),
    domain VARCHAR(75),
    username VARCHAR(75),
    command TEXT CHECK (LENGTH(command) <= 254),
    notes TEXT CHECK (LENGTH(notes) <= 254),
    filename VARCHAR(100),
    status VARCHAR(75),
    hash_algorithm VARCHAR(50),
    hash_value VARCHAR(128),
    analyst VARCHAR(100),
    locked BOOLEAN DEFAULT FALSE,
    locked_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create relationship types enum
CREATE TYPE relationship_type AS ENUM (
    'parent_child',
    'linked',
    'dependency',
    'correlation'
);

-- Create relationships table for direct log relationships
CREATE TABLE IF NOT EXISTS log_relationships (
    id SERIAL PRIMARY KEY,
    source_id INTEGER REFERENCES logs(id) ON DELETE CASCADE,
    target_id INTEGER REFERENCES logs(id) ON DELETE CASCADE,
    type relationship_type NOT NULL,
    relationship VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    notes TEXT,
    UNIQUE(source_id, target_id, type)
);

-- Create new relationship types for pattern analysis
CREATE TYPE pattern_type AS ENUM (
    'command_sequence',
    'command_cooccurrence',
    'user_pattern',
    'host_pattern'
);

-- Create relations table for pattern analysis
CREATE TABLE IF NOT EXISTS relations (
    id SERIAL PRIMARY KEY,
    source_type VARCHAR(50) NOT NULL,
    source_value TEXT NOT NULL,
    target_type VARCHAR(50) NOT NULL,
    target_value TEXT NOT NULL,
    strength INTEGER DEFAULT 1,
    connection_count INTEGER DEFAULT 1,
    pattern_type pattern_type,
    first_seen TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb,
    UNIQUE(source_type, source_value, target_type, target_value)
);

-- Create all necessary indexes for logs
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_analyst ON logs(analyst);
CREATE INDEX IF NOT EXISTS idx_logs_hostname ON logs(hostname);
CREATE INDEX IF NOT EXISTS idx_logs_command ON logs(command);
CREATE INDEX IF NOT EXISTS idx_logs_hash_value ON logs(hash_value);

-- Create indexes for log relationships
CREATE INDEX IF NOT EXISTS idx_relationships_source ON log_relationships(source_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON log_relationships(target_id);

-- Create indexes for pattern relations
CREATE INDEX IF NOT EXISTS idx_relations_source ON relations(source_type, source_value);
CREATE INDEX IF NOT EXISTS idx_relations_target ON relations(target_type, target_value);
CREATE INDEX IF NOT EXISTS idx_relations_last_seen ON relations(last_seen);
CREATE INDEX IF NOT EXISTS idx_relations_metadata ON relations USING gin (metadata);
CREATE INDEX IF NOT EXISTS idx_relations_pattern ON relations(source_type, target_type, pattern_type);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for logs table
DROP TRIGGER IF EXISTS update_logs_updated_at ON logs;
CREATE TRIGGER update_logs_updated_at
    BEFORE UPDATE ON logs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create functions for pattern analysis

-- Function to update relation strength
CREATE OR REPLACE FUNCTION update_relation_strength()
RETURNS TRIGGER AS $$
BEGIN
    NEW.strength := NEW.strength + 1;
    NEW.connection_count := COALESCE(NEW.connection_count, 0) + 1;
    NEW.last_seen := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for relations table
DROP TRIGGER IF EXISTS update_relation_strength ON relations;
CREATE TRIGGER update_relation_strength
    BEFORE UPDATE ON relations
    FOR EACH ROW
    WHEN (OLD.source_type = NEW.source_type 
          AND OLD.source_value = NEW.source_value 
          AND OLD.target_type = NEW.target_type 
          AND OLD.target_value = NEW.target_value)
    EXECUTE FUNCTION update_relation_strength();

-- Function to clean up old relations
CREATE OR REPLACE FUNCTION cleanup_old_relations(days INTEGER)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM relations 
    WHERE last_seen < NOW() - (days || ' days')::INTERVAL;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ language 'plpgsql';

-- Add file status tracking table - without unique constraint on filename
CREATE TABLE IF NOT EXISTS file_status (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(254) NOT NULL,
    status VARCHAR(50) NOT NULL,
    hash_algorithm VARCHAR(50),
    hash_value VARCHAR(128),
    hostname VARCHAR(75),
    internal_ip VARCHAR(45),
    external_ip VARCHAR(45),
    username VARCHAR(75),
    analyst VARCHAR(100),
    first_seen TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Create a composite unique constraint on filename, hostname, and internal_ip
-- This allows the same filename to exist on different hosts/IPs
ALTER TABLE file_status 
ADD CONSTRAINT file_status_filename_host_ip_key 
UNIQUE (filename, COALESCE(hostname, ''), COALESCE(internal_ip, ''));

-- Create optimized indexes for file status lookups
CREATE INDEX idx_file_status_combined_lookup ON file_status(filename, hostname, internal_ip);
CREATE INDEX idx_file_status_filename ON file_status(filename);
CREATE INDEX IF NOT EXISTS idx_file_status_status ON file_status(status);
CREATE INDEX IF NOT EXISTS idx_file_status_hostname ON file_status(hostname);
CREATE INDEX IF NOT EXISTS idx_file_status_last_seen ON file_status(last_seen);
CREATE INDEX IF NOT EXISTS idx_file_status_hash_value ON file_status(hash_value);

-- Add file status history table
CREATE TABLE IF NOT EXISTS file_status_history (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(254) NOT NULL,
  status VARCHAR(50) NOT NULL,
  previous_status VARCHAR(50),
  hash_algorithm VARCHAR(50),
  hash_value VARCHAR(128),
  hostname VARCHAR(75),
  internal_ip VARCHAR(45),
  external_ip VARCHAR(45),
  username VARCHAR(75),
  analyst VARCHAR(100) NOT NULL,
  notes TEXT,
  command TEXT,
  secrets TEXT,
  timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_file_status_history_filename ON file_status_history(filename);
CREATE INDEX IF NOT EXISTS idx_file_status_history_host_ip ON file_status_history(hostname, internal_ip);
CREATE INDEX IF NOT EXISTS idx_file_status_history_timestamp ON file_status_history(timestamp);