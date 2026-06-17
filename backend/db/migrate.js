// backend/db/migrate.js
//
// Runs numbered SQL migration files from backend/db/migrations/ in order.
// Tracks which migrations have been applied in a schema_migrations table so
// they are never applied twice.
//
// Usage — standalone (K8s Job, manual run):
//   node db/migrate.js
//
// Usage — embedded in server startup:
//   const { runMigrations } = require('./db/migrate');
//   await runMigrations();

'use strict';

const fs   = require('fs');
const path = require('path');
const { Pool } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// Stable integer ID for the PostgreSQL advisory lock.  Any fixed value works;
// this prevents two backend pods starting simultaneously from racing.
const ADVISORY_LOCK_ID = 20240601;

function buildPool() {
  return new Pool({
    user:     process.env.POSTGRES_USER     || 'postgres',
    password: process.env.POSTGRES_PASSWORD,
    host:     process.env.POSTGRES_HOST     || 'localhost',
    database: process.env.POSTGRES_DB       || 'redteamlogger',
    port:     parseInt(process.env.POSTGRES_PORT || '5432', 10),
    // Internal K8s traffic is plain TCP — SSL is disabled via POSTGRES_SSL=false.
    ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
}

async function runMigrations(pool) {
  const ownPool = !pool;
  if (ownPool) pool = buildPool();

  const client = await pool.connect();
  try {
    // Ensure the tracking table exists before acquiring the lock
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version     VARCHAR(255) PRIMARY KEY,
        applied_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Acquire a session-level advisory lock so concurrent pods don't race.
    // pg_try_advisory_lock returns false (non-blocking) if another session
    // already holds it; we wait briefly and retry instead.
    let locked = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      const { rows } = await client.query(
        'SELECT pg_try_advisory_lock($1)', [ADVISORY_LOCK_ID]
      );
      if (rows[0].pg_try_advisory_lock) { locked = true; break; }
      console.log('Waiting for migration lock (attempt %d/10)…', attempt + 1);
      await new Promise(r => setTimeout(r, 1000));
    }
    if (!locked) {
      console.log('Could not acquire migration lock — skipping (another instance is migrating)');
      return;
    }

    // Re-read applied migrations now that we hold the lock
    const { rows: applied } = await client.query(
      'SELECT version FROM schema_migrations ORDER BY version'
    );
    const appliedSet = new Set(applied.map(r => r.version));

    // Collect and sort migration files.  Only .sql files, lexicographic order
    // (so 001-*, 002-*, 003-* sequence is stable regardless of OS locale).
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (appliedSet.has(file)) {
        // Already applied — skip silently
        continue;
      }

      console.log('Applying migration: %s', file);
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)', [file]
        );
        await client.query('COMMIT');
        count++;
        console.log('  ✓ %s', file);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration "${file}" failed: ${err.message}`);
      }
    }

    if (count === 0) {
      console.log('Database schema is up to date (%d migration(s) already applied)', appliedSet.size);
    } else {
      console.log('Migrations complete: %d applied, %d total', count, appliedSet.size + count);
    }
  } finally {
    // Always release the advisory lock, even if something threw
    try { await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]); } catch (_) {}
    client.release();
    if (ownPool) await pool.end();
  }
}

// ── Standalone entry point ────────────────────────────────────────────────────
if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Migration failed:', err.message);
      process.exit(1);
    });
}

module.exports = { runMigrations };
