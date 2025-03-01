#!/usr/bin/env node
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const util = require('util');
const execPromise = util.promisify(exec);

const createBackup = async (redisPassword, encryptionKey, backupDir) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `redis-backup-${timestamp}`);

  try {
    // Create backup directory if it doesn't exist
    await fs.mkdir(backupPath, { recursive: true });

    // Save encryption key (in secure environment)
    await fs.writeFile(
      path.join(backupPath, 'encryption-key.txt'),
      encryptionKey,
      'utf8'
    );

    // Create Redis dump using redis-cli with TLS
    console.log('Creating Redis dump...');
    const sslOptions = process.env.REDIS_SSL === 'true' ? 
      '--tls --cert ../certs/redis.crt --key ../certs/redis.key --cacert ../certs/server.crt' : '';
    
    await execPromise(`redis-cli ${sslOptions} -a "${redisPassword}" --rdb "${path.join(backupPath, 'dump.rdb')}"`);

    // Save backup info
    await fs.writeFile(
      path.join(backupPath, 'backup-info.json'),
      JSON.stringify({
        timestamp,
        encryptionKeyPresent: true,
        rdbPresent: true,
        notice: 'Keep encryption-key.txt secure and separate from data in production!'
      }, null, 2),
      'utf8'
    );

    console.log(`Backup created successfully at ${backupPath}`);
    console.log('IMPORTANT: In production, store the encryption key separately from the data backup!');
    
    return backupPath;
  } catch (error) {
    console.error('Backup failed:', error);
    throw error;
  }
};

// Recovery function
const recoverFromBackup = async (backupPath, redisPassword) => {
  try {
    // Check if backup exists
    const backupExists = await fs.access(backupPath)
      .then(() => true)
      .catch(() => false);

    if (!backupExists) {
      throw new Error(`Backup not found at ${backupPath}`);
    }

    // Stop Redis server (if running)
    console.log('Stopping Redis server...');
    await execPromise('redis-cli -a "${redisPassword}" shutdown');

    // Replace Redis dump
    const dumpPath = path.join(backupPath, 'dump.rdb');
    await fs.copyFile(dumpPath, '/data/dump.rdb');

    console.log('Starting Redis server...');
    await execPromise('redis-server --requirepass "${redisPassword}"');

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
    Backup: node backupRedisData.js backup <redis_password> <encryption_key> <backup_dir>
    Recover: node backupRedisData.js recover <backup_path> <redis_password>
  `;

  if (args.length < 2) {
    console.log(usage);
    process.exit(1);
  }

  const [command, ...params] = args;

  if (command === 'backup' && params.length === 3) {
    createBackup(...params)
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  } else if (command === 'recover' && params.length === 2) {
    recoverFromBackup(...params)
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