// relation-service/src/db/index.js
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Configure SSL based on environment variable
const configureSsl = () => {
  if (process.env.REDIS_SSL !== 'true') {
    return undefined;
  }

  // Paths to certificate files - note the relative path is different for relation-service
  const certPath = path.join(__dirname, '../../certs/redis.crt');
  const keyPath = path.join(__dirname, '../../certs/redis.key');
  const caPath = path.join(__dirname, '../../certs/server.crt');

  try {
    if (fs.existsSync(certPath) && fs.existsSync(keyPath) && fs.existsSync(caPath)) {
      return {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath),
        ca: fs.readFileSync(caPath),
        rejectUnauthorized: false // For self-signed certificates
      };
    } else {
      console.warn('SSL certificates not found, using basic SSL');
      return true; // Basic SSL configuration
    }
  } catch (error) {
    console.error('Error loading Redis SSL certificates:', error);
    return true; // Fallback to basic SSL
  }
};

const pool = new Pool({
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DB,
  port: process.env.POSTGRES_PORT || 5432,
  ssl: configureSsl()
});

// Initialize database function
const initializeDatabase = async () => {
  try {
    const initSqlPath = path.join(__dirname, 'init', 'init.sql');
    const initSql = fs.readFileSync(initSqlPath, 'utf-8');
    
    console.log('Initializing relations database...');
    await pool.query(initSql);
    console.log('Database initialization completed successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
};

// Error handling
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Connection event
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

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

// Export pool and initialization
module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
  initializeDatabase,
  testSslConnection
};