// relation-service/src/server.js
const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const cron = require('node-cron');
const RelationAnalyzer = require('./services/relationAnalyzer');
const batchService = require('./services/batchService');
const relationsRoutes = require('./routes/relations');
const fileStatusRoutes = require('./routes/fileStatus');
const db = require('./db');
const updatesRoutes = require('./routes/updates');

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(cookieParser());
app.use(express.json({ limit: '2mb' })); // Increased limit for larger data

// Enhanced CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'Origin',
    'Cookie',
    'Set-Cookie'
  ],
  exposedHeaders: ['Set-Cookie'],
  maxAge: 86400,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Create a memory-efficient request logger
const requestLogger = (req, res, next) => {
  // Skip detailed logging for health checks and common monitoring endpoints
  if (req.path === '/health' || req.path === '/ping' || req.path === '/status') {
    // For health checks, just log a brief message once per minute
    const now = new Date();
    const minutes = now.getMinutes();
    
    // Only log once per minute (when minute changes)
    if (req.path === '/health' && (!app.locals.lastHealthCheckMinute || app.locals.lastHealthCheckMinute !== minutes)) {
      console.log(`${now.toISOString()} - Health check received`);
      app.locals.lastHealthCheckMinute = minutes;
    }
  } 
  // For non-health check endpoints, continue with normal logging
  else {
    // Use a more memory-efficient logging approach
    const basicInfo = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path
    };
    
    // Only log headers and cookies for non-GET requests to reduce noise
    if (req.method !== 'GET') {
      basicInfo.cookies = Object.keys(req.cookies || {}).length;
      basicInfo.contentType = req.headers['content-type'];
    }
    
    console.log(JSON.stringify(basicInfo));
  }
  next();
};

// Apply optimized request logging
app.use(requestLogger);

// Routes
app.use('/api/relations', relationsRoutes);
app.use('/api/file-status', fileStatusRoutes);
app.use('/api/updates', updatesRoutes);

// Batch-optimized log update notification endpoint
app.post('/api/notify/log-update', async (req, res) => {
  try {
    console.log('Received log update notification, scheduling analysis...');
    
    // Instead of running analysis immediately, add to batch
    // This prevents overloading when many updates come in at once
    const analysisScheduled = await scheduleAnalysis();
    
    res.json({ 
      message: 'Analysis scheduled successfully',
      immediate: analysisScheduled.immediate,
      batchSize: analysisScheduled.batchSize
    });
  } catch (error) {
    console.error('Error handling log update:', error);
    res.status(500).json({ error: 'Failed to process log update' });
  }
});

// Analysis scheduling variables
let analysisQueue = [];
let analysisTimeout = null;
const ANALYSIS_BATCH_DELAY = 3000; // 3 seconds
const MAX_ANALYSIS_QUEUE = 20; // Run analysis after 20 notifications

// Schedule analysis with debouncing
async function scheduleAnalysis() {
  // Add to queue
  analysisQueue.push(Date.now());
  
  // Clear existing timeout if it exists
  if (analysisTimeout) {
    clearTimeout(analysisTimeout);
    analysisTimeout = null;
  }
  
  // If queue is too large, run immediately
  if (analysisQueue.length >= MAX_ANALYSIS_QUEUE) {
    console.log(`Analysis queue reached limit (${analysisQueue.length}), running immediately`);
    analysisQueue = [];
    await RelationAnalyzer.analyzeLogs();
    return { immediate: true, batchSize: MAX_ANALYSIS_QUEUE };
  }
  
  // Otherwise set a timeout to run after delay
  analysisTimeout = setTimeout(async () => {
    const queueSize = analysisQueue.length;
    console.log(`Running scheduled analysis for ${queueSize} updates`);
    analysisQueue = [];
    await RelationAnalyzer.analyzeLogs();
  }, ANALYSIS_BATCH_DELAY);
  
  return { immediate: false, batchSize: analysisQueue.length };
}

// Health check endpoint (simplified)
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

const initializeDatabase = async () => {
  try {
    // First create the relations table
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
        UNIQUE(source_type, source_value, target_type, target_value)
      );

      -- Basic indices for all relation types
      CREATE INDEX IF NOT EXISTS idx_relations_source ON relations(source_type, source_value);
      CREATE INDEX IF NOT EXISTS idx_relations_target ON relations(target_type, target_value);
      CREATE INDEX IF NOT EXISTS idx_relations_last_seen ON relations(last_seen);
      CREATE INDEX IF NOT EXISTS idx_relations_compound ON relations(source_type, source_value, target_type, target_value);
      CREATE INDEX IF NOT EXISTS idx_relations_metadata_gin ON relations USING GIN (metadata);
      
      -- Specialized indices for MAC address relations
      CREATE INDEX IF NOT EXISTS idx_relations_mac_address_source ON relations(source_value) 
      WHERE source_type = 'mac_address';
      
      CREATE INDEX IF NOT EXISTS idx_relations_mac_address_target ON relations(target_value)
      WHERE target_type = 'mac_address';
      
      -- Specialized indices for command sequence analysis
      CREATE INDEX IF NOT EXISTS idx_relations_command_sequence ON relations(source_type, target_type, source_value, target_value)
      WHERE source_type = 'command' AND target_type = 'command';
      
      -- Add GIN index for metadata.type to make command sequence queries more efficient
      CREATE INDEX IF NOT EXISTS idx_relations_metadata_type_gin ON relations USING GIN ((metadata -> 'type'));
      
      -- Add index for confidence score to make sorting by confidence more efficient
      CREATE INDEX IF NOT EXISTS idx_relations_confidence ON relations((metadata->>'confidence') DESC NULLS LAST)
      WHERE metadata->>'type' = 'command_sequence';
      
      -- Add an index for username in metadata to improve filtering
      CREATE INDEX IF NOT EXISTS idx_relations_metadata_username ON relations((metadata->>'username'))
      WHERE metadata->>'type' = 'command_sequence';
      
      -- Add an index for occurrence timestamp to improve temporal analysis
      CREATE INDEX IF NOT EXISTS idx_relations_last_seen_command_sequence ON relations(last_seen DESC)
      WHERE metadata->>'type' = 'command_sequence';
      
      -- Add an index for hostname to improve filtering by hostname
      CREATE INDEX IF NOT EXISTS idx_relations_metadata_hostname ON relations((metadata->>'hostname'))
      WHERE metadata->>'type' = 'command_sequence';
    `);
    
    // Create file_status table without any unique constraints
    await db.query(`
      CREATE TABLE IF NOT EXISTS file_status (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(100) NOT NULL,
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
        metadata JSONB DEFAULT '{}'::jsonb
      );
    `);
    
    // Attempt to drop the problematic constraint if it exists
    try {
      await db.query(`
        ALTER TABLE file_status DROP CONSTRAINT IF EXISTS file_status_filename_key;
      `);
    } catch (err) {
      console.log('Note: No filename constraint to drop or already dropped');
    }
    
    // Try to add the new compound constraint - but catch errors if it already exists
    try {
      await db.query(`
        ALTER TABLE file_status 
        ADD CONSTRAINT file_status_composite_key 
        UNIQUE (filename, hostname, internal_ip);
      `);
      console.log('Added composite constraint on filename, hostname, and internal_ip');
    } catch (err) {
      // If error is about duplicate constraint, that's fine - otherwise log it
      if (!err.message.includes('already exists')) {
        console.log('Note: Could not add composite constraint:', err.message);
      } else {
        console.log('Composite constraint already exists');
      }
    }
    
    // Create or update indexes
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_file_status_filename ON file_status(filename);
      CREATE INDEX IF NOT EXISTS idx_file_status_status ON file_status(status);
      CREATE INDEX IF NOT EXISTS idx_file_status_hostname ON file_status(hostname);
      CREATE INDEX IF NOT EXISTS idx_file_status_last_seen ON file_status(last_seen);
      CREATE INDEX IF NOT EXISTS idx_file_status_hash_value ON file_status(hash_value);
      CREATE INDEX IF NOT EXISTS idx_file_status_combined ON file_status(filename, hostname, internal_ip);
      CREATE INDEX IF NOT EXISTS idx_file_status_mac_address ON file_status(mac_address);
    `);
    
    // Create file status history table
    await db.query(`
      CREATE TABLE IF NOT EXISTS file_status_history (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(100) NOT NULL,
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
        timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_file_status_history_filename ON file_status_history(filename);
      CREATE INDEX IF NOT EXISTS idx_file_status_history_timestamp ON file_status_history(timestamp);
      CREATE INDEX IF NOT EXISTS idx_file_status_history_mac_address ON file_status_history(mac_address);
    `);
    
    console.log('Database tables initialized with optimized indexes including MAC address support');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
};

// Verify database SSL connection if enabled
const checkDatabaseSsl = async () => {
  if (process.env.POSTGRES_SSL === 'true') {
    try {
      const sslEnabled = await db.testSslConnection();
      if (!sslEnabled) {
        console.warn('WARNING: PostgreSQL SSL is enabled but not active on the server!');
      } else {
        console.log('PostgreSQL SSL connection verified');
      }
      return sslEnabled;
    } catch (error) {
      console.error('Error checking PostgreSQL SSL status:', error);
      return false;
    }
  }
  return false;
};

// HTTPS configuration
const httpsOptions = {
  key: fs.readFileSync(path.join(__dirname, '../certs/backend.key')),
  cert: fs.readFileSync(path.join(__dirname, '../certs/backend.crt'))
};

const server = https.createServer(httpsOptions, app);

// Improved cron scheduling for relation analysis
// User commands analysis - runs every 10 minutes
cron.schedule('*/10 * * * *', async () => {
  console.log('Running scheduled relation analysis (user commands)...');
  try {
    // Fetch logs from the past hour for analysis
    const logs = await db.query(`
      SELECT * FROM logs 
      WHERE timestamp > NOW() - INTERVAL '1 hour'
      ORDER BY timestamp DESC
      LIMIT 1000
    `);
    
    // Use analyzeSpecificLogs with user type
    await RelationAnalyzer.analyzeSpecificLogs(logs.rows, { 
      types: ['user'] 
    });
    console.log('Scheduled user command analysis completed successfully');
  } catch (error) {
    console.error('Error in scheduled user command analysis:', error);
  }
});

// IP and hostname analysis - runs at 5, 25, and 45 minutes past the hour
cron.schedule('5,25,45 * * * *', async () => {
  console.log('Running scheduled relation analysis (IP/hostname/MAC)...');
  try {
    // Analyze IP, hostname, and MAC relations in this job
    const logs = await db.query(`
      SELECT * FROM logs 
      WHERE timestamp > NOW() - INTERVAL '1 hour'
      ORDER BY timestamp DESC
      LIMIT 1000
    `);
    
    // Use analyzeSpecificLogs with multiple types including MAC address
    await RelationAnalyzer.analyzeSpecificLogs(logs.rows, { 
      types: ['ip', 'hostname', 'mac_address'] 
    });
    
    console.log('Scheduled IP/hostname/MAC analysis completed successfully');
  } catch (error) {
    console.error('Error in scheduled IP/hostname/MAC analysis:', error);
  }
});

// Domain and file status analysis - runs at 10 and 40 minutes past the hour
cron.schedule('10,40 * * * *', async () => {
  console.log('Running scheduled relation analysis (domain/files)...');
  try {
    // Analyze domain relations and file statuses in this job
    const logs = await db.query(`
      SELECT * FROM logs 
      WHERE timestamp > NOW() - INTERVAL '1 hour'
      ORDER BY timestamp DESC
      LIMIT 1000
    `);
    
    // Use analyzeSpecificLogs with domain and file types
    await RelationAnalyzer.analyzeSpecificLogs(logs.rows, { 
      types: ['domain', 'file'] 
    });
    
    console.log('Scheduled domain/files analysis completed successfully');
  } catch (error) {
    console.error('Error in scheduled domain/files analysis:', error);
  }
});

// Flush pending batches - runs every 2 minutes
cron.schedule('*/2 * * * *', async () => {
  try {
    await batchService.flushAllBatches();
  } catch (error) {
    console.error('Error flushing batch service:', error);
  }
});

// Start server
const PORT = process.env.PORT || 3002;

const startServer = async () => {
  try {
    await initializeDatabase();
    await checkDatabaseSsl();
    
    server.listen(PORT, () => {
      console.log(`Relation service running on port ${PORT}`);
      console.log(`PostgreSQL SSL: ${process.env.POSTGRES_SSL === 'true' ? 'Enabled' : 'Disabled'}`);
      
      // Run initial analysis for fresh data - without command_sequence
      RelationAnalyzer.analyzeLogs({ 
        targetedTypes: ['ip', 'hostname', 'domain', 'username', 'user', 'mac_address'] 
      })
        .then(() => console.log('Initial relation analysis completed'))
        .catch(error => console.error('Error in initial analysis:', error));
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received. Shutting down gracefully...');
  
  // Flush any pending batches
  await batchService.flushAllBatches();
  
  // Close the server
  server.close(() => {
    console.log('HTTP server closed');
    
    // Close the database connection
    db.pool.end().then(() => {
      console.log('Database connections closed');
      process.exit(0);
    });
  });
  
  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
});

startServer();