-- Add missing columns to existing tables for operations filtering
-- This script is safe to run multiple times (uses IF NOT EXISTS where possible)

BEGIN;

-- Add columns to relations table
DO $$
BEGIN
    -- Add operation_tags column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'relations' AND column_name = 'operation_tags'
    ) THEN
        ALTER TABLE relations ADD COLUMN operation_tags INTEGER[] DEFAULT '{}';
        CREATE INDEX idx_relations_operation_tags ON relations USING GIN (operation_tags);
        RAISE NOTICE 'Added operation_tags column to relations table';
    ELSE
        RAISE NOTICE 'operation_tags column already exists in relations table';
    END IF;

    -- Add source_log_ids column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'relations' AND column_name = 'source_log_ids'
    ) THEN
        ALTER TABLE relations ADD COLUMN source_log_ids INTEGER[] DEFAULT '{}';
        CREATE INDEX idx_relations_source_log_ids ON relations USING GIN (source_log_ids);
        RAISE NOTICE 'Added source_log_ids column to relations table';
    ELSE
        RAISE NOTICE 'source_log_ids column already exists in relations table';
    END IF;
END $$;

-- Add columns to file_status table
DO $$
BEGIN
    -- Add operation_tags column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'file_status' AND column_name = 'operation_tags'
    ) THEN
        ALTER TABLE file_status ADD COLUMN operation_tags INTEGER[] DEFAULT '{}';
        CREATE INDEX idx_file_status_operation_tags ON file_status USING GIN (operation_tags);
        RAISE NOTICE 'Added operation_tags column to file_status table';
    ELSE
        RAISE NOTICE 'operation_tags column already exists in file_status table';
    END IF;

    -- Add source_log_ids column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'file_status' AND column_name = 'source_log_ids'
    ) THEN
        ALTER TABLE file_status ADD COLUMN source_log_ids INTEGER[] DEFAULT '{}';
        CREATE INDEX idx_file_status_source_log_ids ON file_status USING GIN (source_log_ids);
        RAISE NOTICE 'Added source_log_ids column to file_status table';
    ELSE
        RAISE NOTICE 'source_log_ids column already exists in file_status table';
    END IF;
END $$;

-- Add columns to file_status_history table
DO $$
BEGIN
    -- Add operation_tags column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'file_status_history' AND column_name = 'operation_tags'
    ) THEN
        ALTER TABLE file_status_history ADD COLUMN operation_tags INTEGER[] DEFAULT '{}';
        CREATE INDEX idx_file_status_history_operation_tags ON file_status_history USING GIN (operation_tags);
        RAISE NOTICE 'Added operation_tags column to file_status_history table';
    ELSE
        RAISE NOTICE 'operation_tags column already exists in file_status_history table';
    END IF;
END $$;

COMMIT;

-- Display completion message
DO $$
BEGIN
    RAISE NOTICE '✓ All operations filtering columns added successfully!';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Restart the relation-service container';
    RAISE NOTICE '2. Trigger re-analysis to populate operation_tags for existing data';
END $$;
