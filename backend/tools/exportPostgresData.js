#!/usr/bin/env node
const { Client } = require('pg');
const fs = require('fs').promises;
const path = require('path');

// Helper function to configure SSL
const configureSsl = (dbConfig) => {
  if (!dbConfig.ssl && process.env.POSTGRES_SSL !== 'true') {
    return undefined;
  }

  // Default SSL configuration with certificate verification disabled
  const sslConfig = {
    rejectUnauthorized: false
  };

  // If certificate paths are provided, use them
  if (dbConfig.sslCert && dbConfig.sslKey) {
    try {
      sslConfig.ca = fs.readFileSync(dbConfig.sslCert, 'utf8');
      sslConfig.key = fs.readFileSync(dbConfig.sslKey, 'utf8');
      sslConfig.cert = fs.readFileSync(dbConfig.sslCert, 'utf8');
    } catch (error) {
      console.warn('Error loading SSL certificates:', error);
    }
  }

  return sslConfig;
};

const exportData = async (dbConfig, outputFile, options = {}) => {
  const client = new Client({
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    password: dbConfig.password,
    ssl: configureSsl(dbConfig)
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Get all logs
    const query = `
      SELECT 
        l.*,
        to_char(l.timestamp, 'YYYY-MM-DD HH24:MI:SS.MS TZ') as formatted_timestamp,
        to_char(l.created_at, 'YYYY-MM-DD HH24:MI:SS.MS TZ') as formatted_created_at,
        to_char(l.updated_at, 'YYYY-MM-DD HH24:MI:SS.MS TZ') as formatted_updated_at
      FROM logs l
      ORDER BY timestamp DESC
    `;

    console.log('Fetching logs...');
    const result = await client.query(query);
    
    // Process the results
    const logs = result.rows.map(row => ({
      ...row,
      timestamp: row.formatted_timestamp,
      created_at: row.formatted_created_at,
      updated_at: row.formatted_updated_at
    }));

    // Create the export directory if it doesn't exist
    const exportDir = path.dirname(outputFile);
    await fs.mkdir(exportDir, { recursive: true });

    // Save metadata
    const metadata = {
      exportDate: new Date().toISOString(),
      totalRecords: logs.length,
      dbVersion: await getDbVersion(client),
      tableSchema: await getTableSchema(client, 'logs'),
      exportOptions: options,
      ssl: dbConfig.ssl || process.env.POSTGRES_SSL === 'true'
    };

    // Format the export data
    const exportData = {
      metadata,
      logs
    };

    // Write to file
    await fs.writeFile(
      outputFile,
      JSON.stringify(exportData, null, 2),
      'utf8'
    );

    console.log(`Exported ${logs.length} records to ${outputFile}`);
    console.log('Export completed successfully');

    return {
      success: true,
      recordCount: logs.length,
      outputFile
    };
  } catch (error) {
    console.error('Export failed:', error);
    throw error;
  } finally {
    await client.end();
  }
};

async function getDbVersion(client) {
  const result = await client.query('SELECT version()');
  return result.rows[0].version;
}

async function getTableSchema(client, tableName) {
  const query = `
    SELECT 
      column_name,
      data_type,
      character_maximum_length,
      column_default,
      is_nullable
    FROM information_schema.columns
    WHERE table_name = $1
    ORDER BY ordinal_position;
  `;
  
  const result = await client.query(query, [tableName]);
  return result.rows;
}

// Import function to help recover data if needed
const importData = async (dbConfig, inputFile) => {
  const client = new Client({
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    password: dbConfig.password,
    ssl: configureSsl(dbConfig)
  });

  try {
    // Read and parse the export file
    const fileContent = await fs.readFile(inputFile, 'utf8');
    const { metadata, logs } = JSON.parse(fileContent);

    await client.connect();
    console.log('Connected to database');

    // Begin transaction
    await client.query('BEGIN');

    console.log(`Importing ${logs.length} records...`);
    for (const log of logs) {
      const {
        internal_ip, external_ip, hostname, domain,
        username, command, notes, filename, status,
        analyst, locked, locked_by
      } = log;

      const query = `
        INSERT INTO logs (
          internal_ip, external_ip, hostname, domain,
          username, command, notes, filename, status,
          analyst, locked, locked_by, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `;

      await client.query(query, [
        internal_ip, external_ip, hostname, domain,
        username, command, notes, filename, status,
        analyst, locked, locked_by, new Date(log.timestamp)
      ]);
    }

    // Commit transaction
    await client.query('COMMIT');

    console.log('Import completed successfully');
    return {
      success: true,
      recordCount: logs.length
    };
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }
    console.error('Import failed:', error);
    throw error;
  } finally {
    if (client) {
      await client.end();
    }
  }
};

// If run directly from command line
if (require.main === module) {
  const args = process.argv.slice(2);
  const usage = `
    Export: node exportPostgresData.js export <host> <port> <database> <user> <password> <output_file> [ssl]
    Import: node exportPostgresData.js import <host> <port> <database> <user> <password> <input_file> [ssl]
  `;

  if (args.length < 2) {
    console.log(usage);
    process.exit(1);
  }

  const [command, ...params] = args;

  if (command === 'export' && (params.length === 6 || params.length === 7)) {
    const [host, port, database, user, password, outputFile, ssl] = params;
    const dbConfig = { 
      host, 
      port, 
      database, 
      user, 
      password, 
      ssl: ssl === 'true' || process.env.POSTGRES_SSL === 'true',
      sslCert: path.join(__dirname, '../../certs/server.crt'),
      sslKey: path.join(__dirname, '../../certs/server.key')
    };
    exportData(dbConfig, outputFile)
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  } else if (command === 'import' && (params.length === 6 || params.length === 7)) {
    const [host, port, database, user, password, inputFile, ssl] = params;
    const dbConfig = { 
      host, 
      port, 
      database, 
      user, 
      password, 
      ssl: ssl === 'true' || process.env.POSTGRES_SSL === 'true',
      sslCert: path.join(__dirname, '../../certs/server.crt'),
      sslKey: path.join(__dirname, '../../certs/server.key')
    };
    importData(dbConfig, inputFile)
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  } else {
    console.log(usage);
    process.exit(1);
  }
}

module.exports = {
  exportData,
  importData
};