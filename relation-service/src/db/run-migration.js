// relation-service/src/db/run-migration.js
const fs = require('fs');
const path = require('path');
const db = require('../db');

/**
 * Simple migration runner for the relation service
 * Runs all SQL migration files in the migrations directory
 */
async function runMigrations() {
  const migrationsDir = path.join(__dirname, 'migrations');

  console.log('Starting migration process...');
  console.log(`Migrations directory: ${migrationsDir}`);

  try {
    // Read all migration files
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Sort to ensure migrations run in order

    if (files.length === 0) {
      console.log('No migration files found.');
      return;
    }

    console.log(`Found ${files.length} migration file(s):`);
    files.forEach(file => console.log(`  - ${file}`));

    // Run each migration
    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      console.log(`\nRunning migration: ${file}`);

      // Read the SQL file
      const sql = fs.readFileSync(filePath, 'utf8');

      // Execute the migration
      await db.query(sql);

      console.log(`✓ Successfully applied: ${file}`);
    }

    console.log('\n✓ All migrations completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Restart the relation-service to pick up schema changes');
    console.log('2. Trigger re-analysis to populate operation_tags for existing data');
    console.log('   POST /api/relations/analyze (admin only)');

  } catch (error) {
    console.error('\n✗ Migration failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    // Close the database connection
    await db.end();
  }
}

// Run migrations if this file is executed directly
if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('\nMigration process completed.');
      process.exit(0);
    })
    .catch(error => {
      console.error('Migration process failed:', error);
      process.exit(1);
    });
}

module.exports = { runMigrations };
