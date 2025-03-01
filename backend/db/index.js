// db/index.js
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Configure SSL based on environment variable
const configureSsl = () => {
  if (process.env.POSTGRES_SSL !== 'true') {
    return undefined;
  }

  // Paths to certificate files
  const certPath = path.join(__dirname, '../certs/server.crt');
  const keyPath = path.join(__dirname, '../certs/server.key');

  try {
    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
      return {
        rejectUnauthorized: false, // Allow self-signed certificates
        ca: fs.readFileSync(certPath).toString(),
        key: fs.readFileSync(keyPath).toString(),
        cert: fs.readFileSync(certPath).toString(),
      };
    } else {
      console.warn('SSL is enabled but certificates not found, using default SSL config');
      return {
        rejectUnauthorized: false,
      };
    }
  } catch (error) {
    console.warn('Error loading SSL certificates:', error);
    return {
      rejectUnauthorized: false,
    };
  }
};

const pool = new Pool({
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD,
  host: process.env.POSTGRES_HOST || 'db',
  database: process.env.POSTGRES_DB || 'redteamlogger',
  port: process.env.POSTGRES_PORT || 5432,
  ssl: configureSsl(),
});

// Add event listeners for pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Add event listeners for connection success
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

// Test the connection
const testConnection = async () => {
  try {
    const client = await pool.connect();
    console.log('Database connection successful');
    client.release();
    return true;
  } catch (err) {
    console.error('Database connection error:', err);
    return false;
  }
};

// Test SSL connection
const testSslConnection = async () => {
  try {
    const client = await pool.connect();
    const result = await client.query('SHOW ssl');
    console.log('PostgreSQL SSL Status:', result.rows[0]);
    client.release();
    return result.rows[0].ssl === 'on';
  } catch (err) {
    console.error('Error testing SSL connection:', err);
    return false;
  }
};

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
  testConnection,
  testSslConnection,
};