#!/usr/bin/env node
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const util = require('util');
const execPromise = util.promisify(exec);

const createBackup = async (dbConfig, backupDir) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `postgres-backup-${timestamp}`);

  try {
    // Create backup directory if it doesn't exist
    await fs.mkdir(backupPath, { recursive: true });

    // Save database configuration (in secure environment)
    const configInfo = {
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.user,
      ssl: dbConfig.ssl || false,
      timestamp: timestamp,
      notice: 'Keep this configuration file secure and separate from data in production!'
    };

    await fs.writeFile(
      path.join(backupPath, 'db-config.json'),
      JSON.stringify(configInfo, null, 2),
      'utf8'
    );

    // Create PostgreSQL dump command with SSL support if needed
    console.log('Creating PostgreSQL dump...');
    let dumpCommand = `PGPASSWORD="${dbConfig.password}" pg_dump -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -F c -b -v -f "${path.join(backupPath, 'database.dump')}" ${dbConfig.database}`;
    
    // Add SSL options if SSL is enabled
    if (dbConfig.ssl) {
      dumpCommand += ' -o "sslmode=require"';
      
      // If certificate paths are provided, use them
      if (dbConfig.sslCert && dbConfig.sslKey) {
        dumpCommand += ` -o "sslcert=${dbConfig.sslCert}" -o "sslkey=${dbConfig.sslKey}"`;
      }
    }
    
    const { stdout, stderr } = await execPromise(dumpCommand);
    console.log('Dump output:', stdout);
    if (stderr) console.error('Dump errors:', stderr);

    // Save backup info
    await fs.writeFile(
      path.join(backupPath, 'backup-info.json'),
      JSON.stringify({
        timestamp,
        configPresent: true,
        dumpPresent: true,
        ssl: dbConfig.ssl || false,
        tables: ['logs'], // Add any additional tables here
        notice: 'Keep db-config.json secure and separate from data in production!'
      }, null, 2),
      'utf8'
    );

    console.log(`Backup created successfully at ${backupPath}`);
    console.log('IMPORTANT: In production, store the configuration separately from the data backup!');
    
    return backupPath;
  } catch (error) {
    console.error('Backup failed:', error);
    throw error;
  }
};

// Recovery function
const recoverFromBackup = async (backupPath, dbConfig) => {
  try {
    // Check if backup exists
    const backupExists = await fs.access(backupPath)
      .then(() => true)
      .catch(() => false);

    if (!backupExists) {
      throw new Error(`Backup not found at ${backupPath}`);
    }

    // Create database if it doesn't exist
    let createDbCommand = `PGPASSWORD="${dbConfig.password}" psql -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} postgres -c "CREATE DATABASE ${dbConfig.database}"`;
    
    // Add SSL options if SSL is enabled
    if (dbConfig.ssl) {
      createDbCommand += ' -o "sslmode=require"';
      
      // If certificate paths are provided, use them
      if (dbConfig.sslCert && dbConfig.sslKey) {
        createDbCommand += ` -o "sslcert=${dbConfig.sslCert}" -o "sslkey=${dbConfig.sslKey}"`;
      }
    }
    
    try {
      await execPromise(createDbCommand);
      console.log('Database created.');
    } catch (error) {
      console.log('Database might already exist, continuing...');
    }

    // Restore the database from dump with SSL support if needed
    console.log('Restoring database from backup...');
    let restoreCommand = `PGPASSWORD="${dbConfig.password}" pg_restore -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database} -v -c "${path.join(backupPath, 'database.dump')}"`;
    
    // Add SSL options if SSL is enabled
    if (dbConfig.ssl) {
      restoreCommand += ' -o "sslmode=require"';
      
      // If certificate paths are provided, use them
      if (dbConfig.sslCert && dbConfig.sslKey) {
        restoreCommand += ` -o "sslcert=${dbConfig.sslCert}" -o "sslkey=${dbConfig.sslKey}"`;
      }
    }
    
    const { stdout, stderr } = await execPromise(restoreCommand);
    console.log('Restore output:', stdout);
    if (stderr) console.error('Restore warnings/errors:', stderr);

    console.log('Recovery completed successfully');
    return true;
  } catch (error) {
    console.error('Recovery failed:', error);
    throw error;
  }
};

// If run directly from command line
if (require.main === module) {
  const args = process.argv.slice(2);
  const usage = `
    Backup: node backupPostgresData.js backup <host> <port> <database> <user> <password> <backup_dir> [ssl]
    Recover: node backupPostgresData.js recover <backup_path> <host> <port> <database> <user> <password> [ssl]
  `;

  if (args.length < 2) {
    console.log(usage);
    process.exit(1);
  }

  const [command, ...params] = args;

  if (command === 'backup' && (params.length === 6 || params.length === 7)) {
    const [host, port, database, user, password, backupDir, ssl] = params;
    const dbConfig = { 
      host, 
      port, 
      database, 
      user, 
      password, 
      ssl: ssl === 'true' || process.env.POSTGRES_SSL === 'true' 
    };
    createBackup(dbConfig, backupDir)
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  } else if (command === 'recover' && (params.length === 6 || params.length === 7)) {
    const [backupPath, host, port, database, user, password, ssl] = params;
    const dbConfig = { 
      host, 
      port, 
      database, 
      user, 
      password, 
      ssl: ssl === 'true' || process.env.POSTGRES_SSL === 'true' 
    };
    recoverFromBackup(backupPath, dbConfig)
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  } else {
    console.log(usage);
    process.exit(1);
  }
}

module.exports = {
  createBackup,
  recoverFromBackup
};