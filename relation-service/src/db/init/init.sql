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

-- Tags table (mirrored from main database for relationship analysis)
CREATE TABLE IF NOT EXISTS tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    color VARCHAR(7) DEFAULT '#6B7280',
    category VARCHAR(50),
    description TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Junction table for many-to-many relationship between logs and tags
CREATE TABLE IF NOT EXISTS log_tags (
    id SERIAL PRIMARY KEY,
    log_id INTEGER NOT NULL REFERENCES logs(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    tagged_by VARCHAR(100),
    tagged_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(log_id, tag_id)
);

-- Operations table for operation-based data siloing (mirrored from main database)
CREATE TABLE IF NOT EXISTS operations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    tag_id INTEGER REFERENCES tags(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- User-operations junction table for assignments (mirrored from main database)
CREATE TABLE IF NOT EXISTS user_operations (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    operation_id INTEGER NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT false,
    assigned_by VARCHAR(100) NOT NULL,
    assigned_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_accessed TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(username, operation_id)
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
    'host_pattern',
    'tag_cooccurrence',
    'tag_sequence'
);

-- Create relations table for pattern analysis (including tags)
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
    operation_tags INTEGER[] DEFAULT '{}',
    source_log_ids INTEGER[] DEFAULT '{}',
    UNIQUE(source_type, source_value, target_type, target_value)
);

-- File status tracking table
CREATE TABLE IF NOT EXISTS file_status (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(254) NOT NULL,
    status VARCHAR(50) NOT NULL,
    hash_algorithm VARCHAR(50),
    hash_value VARCHAR(128),
    hostname VARCHAR(75),
    internal_ip VARCHAR(45),
    external_ip VARCHAR(45),
    mac_address VARCHAR(17),
    username VARCHAR(75),
    analyst VARCHAR(100) NOT NULL,
    notes TEXT,
    command TEXT,
    secrets TEXT,
    first_seen TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb,
    operation_tags INTEGER[] DEFAULT '{}',
    source_log_ids INTEGER[] DEFAULT '{}'
);

-- Create a composite unique constraint on filename, hostname, and internal_ip
ALTER TABLE file_status 
ADD CONSTRAINT file_status_filename_host_ip_key 
UNIQUE (filename, COALESCE(hostname, ''), COALESCE(internal_ip, ''));

-- File status history table
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
    mac_address VARCHAR(17),
    username VARCHAR(75),
    analyst VARCHAR(100) NOT NULL,
    notes TEXT,
    command TEXT,
    secrets TEXT,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    operation_tags INTEGER[] DEFAULT '{}'
);

-- Tag relationship analysis table
CREATE TABLE IF NOT EXISTS tag_relationships (
    id SERIAL PRIMARY KEY,
    source_tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
    target_tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
    cooccurrence_count INTEGER DEFAULT 1,
    sequence_count INTEGER DEFAULT 0,
    correlation_strength FLOAT DEFAULT 0.0,
    first_seen TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb,
    UNIQUE(source_tag_id, target_tag_id)
);

-- Create indexes for logs
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_analyst ON logs(analyst);
CREATE INDEX IF NOT EXISTS idx_logs_hostname ON logs(hostname);
CREATE INDEX IF NOT EXISTS idx_logs_command ON logs(command);
CREATE INDEX IF NOT EXISTS idx_logs_hash_value ON logs(hash_value);

-- Create indexes for tags
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_tags_category ON tags(category);
CREATE INDEX IF NOT EXISTS idx_log_tags_log_id ON log_tags(log_id);
CREATE INDEX IF NOT EXISTS idx_log_tags_tag_id ON log_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_log_tags_tagged_at ON log_tags(tagged_at);

-- Create indexes for log relationships
CREATE INDEX IF NOT EXISTS idx_relationships_source ON log_relationships(source_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON log_relationships(target_id);

-- Create indexes for pattern relations
CREATE INDEX IF NOT EXISTS idx_relations_source ON relations(source_type, source_value);
CREATE INDEX IF NOT EXISTS idx_relations_target ON relations(target_type, target_value);
CREATE INDEX IF NOT EXISTS idx_relations_last_seen ON relations(last_seen);
CREATE INDEX IF NOT EXISTS idx_relations_metadata ON relations USING gin (metadata);
CREATE INDEX IF NOT EXISTS idx_relations_pattern ON relations(source_type, target_type, pattern_type);
CREATE INDEX IF NOT EXISTS idx_relations_operation_tags ON relations USING gin (operation_tags);
CREATE INDEX IF NOT EXISTS idx_relations_source_log_ids ON relations USING gin (source_log_ids);

-- Tag-specific relation indexes
CREATE INDEX IF NOT EXISTS idx_relations_tag_source ON relations(source_value) 
WHERE source_type = 'tag';
CREATE INDEX IF NOT EXISTS idx_relations_tag_target ON relations(target_value)
WHERE target_type = 'tag';
CREATE INDEX IF NOT EXISTS idx_relations_tag_patterns ON relations(source_type, target_type)
WHERE source_type = 'tag' OR target_type = 'tag';

-- File status indexes
CREATE INDEX IF NOT EXISTS idx_file_status_combined_lookup ON file_status(filename, hostname, internal_ip);
CREATE INDEX IF NOT EXISTS idx_file_status_filename ON file_status(filename);
CREATE INDEX IF NOT EXISTS idx_file_status_status ON file_status(status);
CREATE INDEX IF NOT EXISTS idx_file_status_hostname ON file_status(hostname);
CREATE INDEX IF NOT EXISTS idx_file_status_last_seen ON file_status(last_seen);
CREATE INDEX IF NOT EXISTS idx_file_status_hash_value ON file_status(hash_value);
CREATE INDEX IF NOT EXISTS idx_file_status_mac_address ON file_status(mac_address);
CREATE INDEX IF NOT EXISTS idx_file_status_operation_tags ON file_status USING gin (operation_tags);
CREATE INDEX IF NOT EXISTS idx_file_status_source_log_ids ON file_status USING gin (source_log_ids);

-- File status history indexes
CREATE INDEX IF NOT EXISTS idx_file_status_history_filename ON file_status_history(filename);
CREATE INDEX IF NOT EXISTS idx_file_status_history_host_ip ON file_status_history(hostname, internal_ip);
CREATE INDEX IF NOT EXISTS idx_file_status_history_timestamp ON file_status_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_file_status_history_mac_address ON file_status_history(mac_address);
CREATE INDEX IF NOT EXISTS idx_file_status_history_operation_tags ON file_status_history USING gin (operation_tags);

-- Tag relationship indexes
CREATE INDEX IF NOT EXISTS idx_tag_relationships_source ON tag_relationships(source_tag_id);
CREATE INDEX IF NOT EXISTS idx_tag_relationships_target ON tag_relationships(target_tag_id);
CREATE INDEX IF NOT EXISTS idx_tag_relationships_cooccurrence ON tag_relationships(cooccurrence_count DESC);
CREATE INDEX IF NOT EXISTS idx_tag_relationships_correlation ON tag_relationships(correlation_strength DESC);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for logs table
DROP TRIGGER IF EXISTS update_logs_updated_at ON logs;
CREATE TRIGGER update_logs_updated_at BEFORE UPDATE ON logs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create triggers for tags table
DROP TRIGGER IF EXISTS update_tags_updated_at ON tags;
CREATE TRIGGER update_tags_updated_at BEFORE UPDATE ON tags
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();