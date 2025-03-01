#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');
const RedisEncryption = require('../lib/redisEncryption');

const decryptFile = async (encryptionKey, inputFile, outputFile) => {
  try {
    // Initialize decryption with the provided key
    const encryption = new RedisEncryption(encryptionKey);

    // Read the Redis dump
    const data = await fs.readFile(inputFile, 'utf8');
    const entries = data.split('\n').filter(line => line.trim());

    const decrypted = [];
    
    // Decrypt each entry
    for (const entry of entries) {
      try {
        const parsed = JSON.parse(entry);
        if (parsed.encrypted && parsed.iv && parsed.authTag) {
          const decryptedData = encryption.decrypt(parsed);
          decrypted.push({
            original: parsed,
            decrypted: decryptedData
          });
        } else {
          decrypted.push({
            original: parsed,
            decrypted: 'Not an encrypted entry'
          });
        }
      } catch (e) {
        decrypted.push({
          original: entry,
          error: e.message
        });
      }
    }

    // Write decrypted data to output file
    await fs.writeFile(
      outputFile,
      JSON.stringify(decrypted, null, 2),
      'utf8'
    );

    console.log(`Successfully decrypted data to ${outputFile}`);
    return true;
  } catch (error) {
    console.error('Decryption failed:', error);
    return false;
  }
};

// If run directly from command line
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 3) {
    console.log('Usage: node decryptRedisData.js <encryption_key> <input_file> <output_file>');
    process.exit(1);
  }

  const [key, input, output] = args;
  decryptFile(key, input, output)
    .then(success => process.exit(success ? 0 : 1));
}

module.exports = decryptFile;