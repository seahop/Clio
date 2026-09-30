// backend/services/relations/initRelationTables.js
// Creates the five relation-analysis tables if they don't yet exist.
// All DDL uses IF NOT EXISTS — safe to run on fresh installs and existing deployments.
// Called once during backend startup in server.js initialize().

const db = require('../../db');

async function initRelationTables() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS relations (
        id SERIAL PRIMARY KEY,
        source_type VARCHAR(50) NOT NULL,
        source_value TEXT NOT NULL,
        target_type VARCHAR(50) NOT NULL,
        target_value TEXT NOT NULL,
        strength INTEGER DEFAULT 1,
        connection_count INTEGER DEFAULT 1,
        first_seen TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        last_seen TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        metadata JSONB DEFAULT '{}'::jsonb,
        operation_tags INTEGER[] DEFAULT '{}',
        source_log_ids INTEGER[] DEFAULT '{}'
      );

      -- Values can be long commands, which exceed the ~2.7 KB B-tree entry
      -- limit: uniqueness is on md5() of the values and equality lookups use
      -- hash indexes (migration 004 converts existing installs). The ON
      -- CONFLICT clauses in models/relations.js target relations_values_unique.
      CREATE UNIQUE INDEX IF NOT EXISTS relations_values_unique
        ON relations (source_type, md5(source_value), target_type, md5(target_value));
      CREATE INDEX IF NOT EXISTS idx_relations_source_value ON relations USING hash (source_value);
      CREATE INDEX IF NOT EXISTS idx_relations_target_value ON relations USING hash (target_value);
      CREATE INDEX IF NOT EXISTS idx_relations_types ON relations(source_type, target_type);
      CREATE INDEX IF NOT EXISTS idx_relations_last_seen ON relations(last_seen);

      -- Retire the pre-1.0.15 B-tree uniqueness on the raw values, which
      -- fails for values over ~2.7 KB. Done here rather than in migration
      -- 004 because the previous backend (still running while the Helm
      -- pre-upgrade Job migrates) depends on it; by the time this code runs,
      -- the old backend has stopped. Idempotent.
      DO $$
      DECLARE c record;
      BEGIN
        FOR c IN
          SELECT conname FROM pg_constraint
           WHERE conrelid = 'relations'::regclass AND contype = 'u'
             AND pg_get_constraintdef(oid) = 'UNIQUE (source_type, source_value, target_type, target_value)'
        LOOP
          EXECUTE format('ALTER TABLE relations DROP CONSTRAINT %I', c.conname);
        END LOOP;
      END $$;
      DROP INDEX IF EXISTS idx_relations_source;
      DROP INDEX IF EXISTS idx_relations_target;
      DROP INDEX IF EXISTS idx_relations_compound;
      DROP INDEX IF EXISTS idx_relations_command_sequence;
      CREATE INDEX IF NOT EXISTS idx_relations_metadata_gin ON relations USING GIN (metadata);
      CREATE INDEX IF NOT EXISTS idx_relations_operation_tags ON relations USING GIN (operation_tags);
      CREATE INDEX IF NOT EXISTS idx_relations_source_log_ids ON relations USING GIN (source_log_ids);
      CREATE INDEX IF NOT EXISTS idx_relations_mac_address_source ON relations(source_value) WHERE source_type = 'mac_address';
      CREATE INDEX IF NOT EXISTS idx_relations_mac_address_target ON relations(target_value) WHERE target_type = 'mac_address';
      CREATE INDEX IF NOT EXISTS idx_relations_metadata_type_gin ON relations USING GIN ((metadata -> 'type'));
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS file_status (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(254) NOT NULL,
        status VARCHAR(50) NOT NULL,
        hostname VARCHAR(75),
        internal_ip VARCHAR(45),
        external_ip VARCHAR(45),
        mac_address VARCHAR(17),
        username VARCHAR(75),
        analyst VARCHAR(100),
        hash_algorithm VARCHAR(50),
        hash_value VARCHAR(128),
        first_seen TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        last_seen TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        metadata JSONB DEFAULT '{}'::jsonb,
        operation_tags INTEGER[] DEFAULT '{}',
        source_log_ids INTEGER[] DEFAULT '{}'
      );
    `);

    try {
      await db.query(`ALTER TABLE file_status DROP CONSTRAINT IF EXISTS file_status_filename_key;`);
    } catch (err) {
      // ignore
    }

    try {
      await db.query(`ALTER TABLE file_status ADD CONSTRAINT file_status_composite_key UNIQUE (filename, hostname, internal_ip);`);
    } catch (err) {
      if (!err.message.includes('already exists')) {
        console.log('Note: Could not add composite constraint:', err.message);
      }
    }

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_file_status_filename ON file_status(filename);
      CREATE INDEX IF NOT EXISTS idx_file_status_status ON file_status(status);
      CREATE INDEX IF NOT EXISTS idx_file_status_hostname ON file_status(hostname);
      CREATE INDEX IF NOT EXISTS idx_file_status_last_seen ON file_status(last_seen);
      CREATE INDEX IF NOT EXISTS idx_file_status_hash_value ON file_status(hash_value);
      CREATE INDEX IF NOT EXISTS idx_file_status_combined ON file_status(filename, hostname, internal_ip);
      CREATE INDEX IF NOT EXISTS idx_file_status_mac_address ON file_status(mac_address);
      CREATE INDEX IF NOT EXISTS idx_file_status_operation_tags ON file_status USING GIN (operation_tags);
      CREATE INDEX IF NOT EXISTS idx_file_status_source_log_ids ON file_status USING GIN (source_log_ids);
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS file_status_history (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(254) NOT NULL,
        status VARCHAR(50) NOT NULL,
        previous_status VARCHAR(50),
        hostname VARCHAR(75),
        internal_ip VARCHAR(45),
        external_ip VARCHAR(45),
        mac_address VARCHAR(17),
        username VARCHAR(75),
        analyst VARCHAR(100) NOT NULL,
        notes TEXT,
        command TEXT,
        secrets TEXT,
        hash_algorithm VARCHAR(50),
        hash_value VARCHAR(128),
        timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        operation_tags INTEGER[] DEFAULT '{}'
      );

      CREATE INDEX IF NOT EXISTS idx_file_status_history_filename ON file_status_history(filename);
      CREATE INDEX IF NOT EXISTS idx_file_status_history_timestamp ON file_status_history(timestamp);
      CREATE INDEX IF NOT EXISTS idx_file_status_history_mac_address ON file_status_history(mac_address);
      CREATE INDEX IF NOT EXISTS idx_file_status_history_operation_tags ON file_status_history USING GIN (operation_tags);
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS log_relationships (
        id SERIAL PRIMARY KEY,
        source_id INTEGER REFERENCES logs(id) ON DELETE CASCADE,
        target_id INTEGER REFERENCES logs(id) ON DELETE CASCADE,
        relationship VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        created_by VARCHAR(100),
        notes TEXT,
        UNIQUE(source_id, target_id)
      );

      CREATE INDEX IF NOT EXISTS idx_log_relationships_source ON log_relationships(source_id);
      CREATE INDEX IF NOT EXISTS idx_log_relationships_target ON log_relationships(target_id);
    `);

    console.log('Relation tables initialised successfully');
  } catch (error) {
    console.error('Error initialising relation tables:', error);
    throw error;
  }
}

module.exports = initRelationTables;
