const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const forge = require('node-forge');

// Parse command line arguments
const args = process.argv.slice(2);
const frontendUrl = args[0] || 'https://localhost:3000';

// Validate URL format
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

if (!isValidUrl(frontendUrl)) {
    console.error('\x1b[31m%s\x1b[0m', 'Error: Invalid URL format provided');
    console.log('Usage: node generate-env.js [frontend-url]');
    console.log('Example: node generate-env.js https://myapp.example.com');
    console.log('If no URL is provided, https://localhost:3000 will be used');
    process.exit(1);
}

const generateSecureKey = (bytes) => crypto.randomBytes(bytes).toString('hex');
const generateSecurePassword = (bytes) => crypto.randomBytes(bytes).toString('base64');

const ENV_FILE = '.env';

function generateCertificate(commonName) {
    // Generate a key pair
    const keys = forge.pki.rsa.generateKeyPair(2048);

    // Create a certificate
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

    const attrs = [{
        name: 'commonName',
        value: commonName
    }, {
        name: 'countryName',
        value: 'US'
    }, {
        name: 'organizationName',
        value: 'Red Team Logger Development'
    }];

    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.setExtensions([{
        name: 'basicConstraints',
        cA: true
    }, {
        name: 'keyUsage',
        keyCertSign: true,
        digitalSignature: true,
        nonRepudiation: true,
        keyEncipherment: true,
        dataEncipherment: true
    }, {
        name: 'extKeyUsage',
        serverAuth: true,
        clientAuth: true
    }, {
        name: 'subjectAltName',
        altNames: [{
            type: 2, // DNS
            value: commonName
        }, {
            type: 2,
            value: 'localhost'
        }, {
            // Include all service hostnames
            type: 2,
            value: 'backend'
        }, {
            type: 2,
            value: 'frontend'
        }, {
            type: 2,
            value: 'relation-service'
        }, {
            type: 2,
            value: 'db'  // Add PostgreSQL hostname
        }, {
            type: 2,
            value: 'redis'  // Add Redis hostname
        }]
    }]);

    // Self-sign the certificate
    cert.sign(keys.privateKey, forge.md.sha256.create());

    return {
        privateKey: forge.pki.privateKeyToPem(keys.privateKey),
        certificate: forge.pki.certificateToPem(cert)
    };
}

function generateCertificates() {
    console.log('\x1b[36m%s\x1b[0m', 'Generating SSL certificate...');
    
    const certsDir = path.join(__dirname, 'certs');
    if (!fs.existsSync(certsDir)) {
        fs.mkdirSync(certsDir);
    }

    // Get hostname from frontend URL
    const frontendHostname = new URL(frontendUrl).hostname;

    // Generate a single certificate for all services
    const certs = generateCertificate(frontendHostname);

    // Save the certificate and key with proper permissions
    const keyPath = path.join(certsDir, 'server.key');
    fs.writeFileSync(keyPath, certs.privateKey);
    fs.chmodSync(keyPath, 0o644); // Set permissions to 644 (readable by all)
    
    const certPath = path.join(certsDir, 'server.crt');
    fs.writeFileSync(certPath, certs.certificate);
    fs.chmodSync(certPath, 0o644); // Set permissions to 644 (readable by all)

    // Create symbolic links or copy files for service-specific names with correct permissions
    ['frontend', 'backend', 'db', 'redis', 'relation-service'].forEach(service => {
        const serviceKeyPath = path.join(certsDir, `${service}.key`);
        fs.copyFileSync(keyPath, serviceKeyPath);
        fs.chmodSync(serviceKeyPath, 0o644); // Set permissions to 644 (readable by all)
        
        const serviceCertPath = path.join(certsDir, `${service}.crt`);
        fs.copyFileSync(certPath, serviceCertPath);
        fs.chmodSync(serviceCertPath, 0o644); // Set permissions to 644 (readable by all)
    });

    // For extra safety, make entire certs directory readable
    if (process.platform !== 'win32') {
        try {
            require('child_process').execSync(`chmod -R a+r ${certsDir}`);
        } catch (error) {
            console.warn('Could not set read permissions on certs directory:', error.message);
        }
    }

    console.log('\x1b[32m%s\x1b[0m', 'SSL certificate generated successfully');
    console.log('\x1b[32m%s\x1b[0m', 'All certificates have been set with proper permissions (644)');
}

async function main() {
    // Check if .env exists
    if (!fs.existsSync(ENV_FILE)) {
        const postgresPassword = generateSecurePassword(32);

        const envContent = `# Security Keys
REDIS_ENCRYPTION_KEY=${generateSecureKey(32)}
JWT_SECRET=${generateSecureKey(64)}
ADMIN_PASSWORD=${generateSecurePassword(12)}
USER_PASSWORD=${generateSecurePassword(12)}
REDIS_PASSWORD=${generateSecurePassword(16)}
REDIS_SSL=true

# PostgreSQL Configuration
POSTGRES_USER=postgres
POSTGRES_PASSWORD=${postgresPassword}
POSTGRES_DB=redteamlogger
POSTGRES_HOST=db
POSTGRES_PORT=5432
POSTGRES_SSL=true

# Server Configuration
PORT=3001
NODE_ENV=development
FRONTEND_URL=${frontendUrl}
HTTPS=true
SSL_CRT_FILE=certs/server.crt
SSL_KEY_FILE=certs/server.key

# Generated on: ${new Date().toISOString()}
# IMPORTANT: Keep this file secure and never commit it to version control`;

        await fsp.writeFile(ENV_FILE, envContent);
        console.log('\x1b[32m%s\x1b[0m', 'Generated new .env file with secure keys');
        
        // Output the keys for first-time setup
        console.log('\x1b[33m%s\x1b[0m', '\nInitial Credentials (save these somewhere secure):');
        console.log('\x1b[36m%s\x1b[0m', 'Admin Credentials:');
        console.log(`ADMIN_PASSWORD=${/ADMIN_PASSWORD=(.*)/.exec(envContent)[1]}`);
        
        console.log('\n\x1b[36m%s\x1b[0m', 'User Credentials:');
        console.log(`USER_PASSWORD=${/USER_PASSWORD=(.*)/.exec(envContent)[1]}`);
        
        console.log('\n\x1b[36m%s\x1b[0m', 'Database Credentials:');
        console.log(`POSTGRES_PASSWORD=${/POSTGRES_PASSWORD=(.*)/.exec(envContent)[1]}`);
        
        console.log('\n\x1b[36m%s\x1b[0m', 'Redis Credentials:');
        console.log(`REDIS_PASSWORD=${/REDIS_PASSWORD=(.*)/.exec(envContent)[1]}`);
        
        // Generate a backup of credentials
        const credentialsBackup = `# Backup of Initial Credentials - Created on ${new Date().toISOString()}
# IMPORTANT: Store this file securely and then delete it after saving the credentials!

Admin Password: ${/ADMIN_PASSWORD=(.*)/.exec(envContent)[1]}
User Password: ${/USER_PASSWORD=(.*)/.exec(envContent)[1]}
Database Password: ${/POSTGRES_PASSWORD=(.*)/.exec(envContent)[1]}
Redis Password: ${/REDIS_PASSWORD=(.*)/.exec(envContent)[1]}
Redis Encryption Key: ${/REDIS_ENCRYPTION_KEY=(.*)/.exec(envContent)[1]}
Redis SSL: true
JWT Secret: ${/JWT_SECRET=(.*)/.exec(envContent)[1]}`;

        const backupFileName = `credentials-backup-${Date.now()}.txt`;
        await fsp.writeFile(backupFileName, credentialsBackup);
        console.log('\n\x1b[31m%s\x1b[0m', `IMPORTANT: A backup of credentials has been saved to ${backupFileName}`);
        console.log('\x1b[31m%s\x1b[0m', 'Store this file securely and delete it after saving the credentials!');
    } else {
        console.log('\x1b[33m%s\x1b[0m', '.env file already exists, skipping generation');
    }

    // Generate certificates regardless of whether .env exists
    try {
        generateCertificates();
    } catch (error) {
        console.error('Error generating certificates:', error);
        process.exit(1);
    }

    // Add .env, certificates, and credentials backup to .gitignore
    const gitignorePath = '.gitignore';
    const gitignoreEntries = [
        '.env',
        'credentials-backup-*.txt',
        '*/node_modules/*',
        'backend/data/logs.json',
        'backend/data/auth_logs.json',
        'certs/*'
    ];

    if (fs.existsSync(gitignorePath)) {
        const currentGitignore = await fsp.readFile(gitignorePath, 'utf8');
        const newEntries = gitignoreEntries.filter(entry => !currentGitignore.includes(entry));
        
        if (newEntries.length > 0) {
            await fsp.appendFile(gitignorePath, '\n' + newEntries.join('\n') + '\n');
            console.log('\x1b[32m%s\x1b[0m', 'Updated .gitignore with new entries');
        }
    } else {
        await fsp.writeFile(gitignorePath, gitignoreEntries.join('\n') + '\n');
        console.log('\x1b[32m%s\x1b[0m', 'Created .gitignore with necessary entries');
    }

    // Create frontend .env file for HTTPS
    const frontendEnvPath = path.join(__dirname, 'frontend', '.env');
    const frontendEnvContent = `HTTPS=true
SSL_CRT_FILE=../certs/server.crt
SSL_KEY_FILE=../certs/server.key
REACT_APP_API_URL=${frontendUrl.replace('3000', '3001')}`;

    await fsp.writeFile(frontendEnvPath, frontendEnvContent);
    console.log('\x1b[32m%s\x1b[0m', 'Created frontend .env file for HTTPS');

    // Create the Redis connection test script
    const testScriptPath = path.join(__dirname, 'backend', 'tools', 'testRedisConnection.js');
    const testScriptContent = `#!/usr/bin/env node
const Redis = require('redis');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../..', '.env') });

async function testRedisConnection() {
  const redisPassword = process.env.REDIS_PASSWORD;
  const useTls = process.env.REDIS_SSL === 'true';

  if (!redisPassword) {
    console.error('REDIS_PASSWORD environment variable is required');
    process.exit(1);
  }

  // Configure SSL options for Redis client
  const getSslOptions = () => {
    if (!useTls) return undefined;
    
    try {
      const certPath = path.join(__dirname, '../../certs/redis.crt');
      const keyPath = path.join(__dirname, '../../certs/redis.key');
      const caPath = path.join(__dirname, '../../certs/server.crt');
      
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

  const redisClient = Redis.createClient({
    socket: {
      host: 'localhost', // Use redis for Docker connections, localhost for local testing
      port: 6379,
      tls: getSslOptions(),
    },
    password: redisPassword,
  });

  // Add event listeners
  redisClient.on('error', (err) => {
    console.error('Redis connection error:', err);
  });
  
  redisClient.on('connect', () => {
    console.log('Redis connection successful');
  });

  redisClient.on('ready', async () => {
    console.log('Redis client ready');
    
    try {
      // Test setting and getting a value
      await redisClient.set('test_key', 'Connection successful - ' + new Date().toISOString());
      const value = await redisClient.get('test_key');
      console.log('Test value retrieved:', value);
      
      // Close the connection
      await redisClient.quit();
      console.log('Redis connection test completed successfully');
    } catch (error) {
      console.error('Redis operation failed:', error);
    }
  });

  // Connect to Redis
  try {
    console.log('Connecting to Redis...');
    console.log('TLS enabled:', useTls);
    await redisClient.connect();
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
  }
}

testRedisConnection().catch(console.error);
`;

    // Create directory if it doesn't exist
    const testScriptDir = path.dirname(testScriptPath);
    if (!fs.existsSync(testScriptDir)) {
        await fsp.mkdir(testScriptDir, { recursive: true });
    }
    
    // Write the test script
    await fsp.writeFile(testScriptPath, testScriptContent);
    fs.chmodSync(testScriptPath, 0o755); // Make it executable
    console.log('\x1b[32m%s\x1b[0m', 'Created Redis connection test script');

    // Create a warning message for development
    console.log('\n\x1b[33m%s\x1b[0m', 'Next steps:');
    console.log('1. Save the credentials from the backup file to a secure location');
    console.log('2. Delete the credentials backup file');
    console.log('3. Run docker-compose up --build to start the application');
    console.log('4. Accept the self-signed certificate in your browser when prompted');
    console.log('5. Login with the admin credentials to set up initial access');
    console.log('6. To test Redis TLS connection: node backend/tools/testRedisConnection.js');
    console.log('\nFrontend URL configured as:', frontendUrl);
    console.log('Backend URL will be:', frontendUrl.replace('3000', '3001'), '\n');
}

main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
});