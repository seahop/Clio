-- Migration: Add operations-based filtering to relations and file status
-- Date: 2025-12-05
-- Description: This migration adds operation tag tracking to relations and file_status tables
--              to enable proper data siloing based on operations

-- Start transaction
BEGIN;

-- Ensure operations tables exist (they should already exist in main DB, but adding for safety)
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

-- Add operation_tags array column to relations table
-- This stores all operation tags from the source logs that created this relation
ALTER TABLE relations
ADD COLUMN IF NOT EXISTS operation_tags INTEGER[] DEFAULT '{}';

-- Add index for operation_tags array queries
CREATE INDEX IF NOT EXISTS idx_relations_operation_tags
ON relations USING GIN (operation_tags);

-- Add operation_tags array column to file_status table
-- This stores all operation tags from the logs that reference this file
ALTER TABLE file_status
ADD COLUMN IF NOT EXISTS operation_tags INTEGER[] DEFAULT '{}';

-- Add index for operation_tags array queries
CREATE INDEX IF NOT EXISTS idx_file_status_operation_tags
ON file_status USING GIN (operation_tags);

-- Add operation_tags array column to file_status_history table
ALTER TABLE file_status_history
ADD COLUMN IF NOT EXISTS operation_tags INTEGER[] DEFAULT '{}';

-- Add index for file_status_history operation_tags
CREATE INDEX IF NOT EXISTS idx_file_status_history_operation_tags
ON file_status_history USING GIN (operation_tags);

-- Add log_id tracking to relations for better traceability and cleanup
-- This will help with cascade deletes when logs are removed
ALTER TABLE relations
ADD COLUMN IF NOT EXISTS source_log_ids INTEGER[] DEFAULT '{}';

-- Add index for source_log_ids array
CREATE INDEX IF NOT EXISTS idx_relations_source_log_ids
ON relations USING GIN (source_log_ids);

-- Add comment explaining the new columns
COMMENT ON COLUMN relations.operation_tags IS
'Array of tag IDs from operation tags (tags with category=operation) that are associated with the source logs';

COMMENT ON COLUMN relations.source_log_ids IS
'Array of log IDs that contributed to creating this relation, used for cascade cleanup';

COMMENT ON COLUMN file_status.operation_tags IS
'Array of tag IDs from operation tags that are associated with logs referencing this file';

-- Commit transaction
COMMIT;

-- Note: After running this migration, you should run the re-analysis job to populate
-- operation_tags for existing relations and file statuses
