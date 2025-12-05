-- Add operation_id to api_keys table to scope API keys to specific operations

ALTER TABLE api_keys
ADD COLUMN IF NOT EXISTS operation_id INTEGER REFERENCES operations(id) ON DELETE SET NULL;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_api_keys_operation_id ON api_keys(operation_id);

-- Add comment
COMMENT ON COLUMN api_keys.operation_id IS 'Links API key to a specific operation for automatic operation scoping';
