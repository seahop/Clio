// decrypt-util.js
const crypto = require('crypto');
const fs = require('fs');

// Get the encryption key - either from command line or from environment
const keyFromArg = process.argv[2];
const encryptionKey = keyFromArg || process.env.FIELD_ENCRYPTION_KEY;

if (!encryptionKey) {
  console.error('Error: No encryption key provided');
  console.log('Usage: node decrypt-util.js [encryption_key]');
  console.log('Or set FIELD_ENCRYPTION_KEY in your environment');
  process.exit(1);
}

/**
 * Decrypt data using AES-256-GCM
 */
function decrypt(encryptedData, key) {
  try {
    // Convert hex key to Buffer if needed
    let keyBuffer = key;
    if (typeof key === 'string' && key.length === 64) {
      keyBuffer = Buffer.from(key, 'hex');
    }
    
    // Create decipher
    const decipher = crypto.createDecipheriv(
      encryptedData.algorithm || 'aes-256-gcm',
      keyBuffer,
      Buffer.from(encryptedData.iv, 'hex')
    );
    
    // Set auth tag from encrypted data
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
    
    // Decrypt
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    // Convert back to original type if needed
    if (encryptedData.type === 'object') {
      return JSON.parse(decrypted);
    }
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error.message);
    return '[Decryption failed]';
  }
}

// Simple REPL-like interface
console.log('\nField Encryption Decryption Utility');
console.log('==================================');
console.log('Using encryption key:', encryptionKey.substring(0, 8) + '...' + encryptionKey.substring(encryptionKey.length - 8));
console.log('\nOptions:');
console.log('1. Enter encrypted JSON directly (paste between lines and press Enter twice)');
console.log('2. Specify a JSON file containing the encrypted data');
console.log('3. Exit');
console.log('\nEnter your choice (1-3):');

// Set up readline for interactive input
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('', (choice) => {
  switch (choice.trim()) {
    case '1':
      console.log('\nPaste your encrypted JSON below (press Enter twice when done):');
      let jsonInput = '';
      
      rl.on('line', (line) => {
        if (line.trim() === '') {
          if (jsonInput.trim() === '') {
            // Empty line after empty input - do nothing
            return;
          }
          // Empty line after some input - process the input
          try {
            const encryptedData = JSON.parse(jsonInput);
            const decrypted = decrypt(encryptedData, encryptionKey);
            console.log('\nDecryption Result:');
            console.log('------------------');
            console.log(decrypted);
            console.log('------------------');
          } catch (error) {
            console.error('Error parsing JSON:', error.message);
          }
          rl.close();
        } else {
          jsonInput += line;
        }
      });
      break;
      
    case '2':
      rl.question('\nEnter the path to your JSON file: ', (filePath) => {
        try {
          const fileContent = fs.readFileSync(filePath, 'utf8');
          const encryptedData = JSON.parse(fileContent);
          const decrypted = decrypt(encryptedData, encryptionKey);
          console.log('\nDecryption Result:');
          console.log('------------------');
          console.log(decrypted);
          console.log('------------------');
        } catch (error) {
          console.error('Error reading or processing file:', error.message);
        }
        rl.close();
      });
      break;
      
    case '3':
      console.log('Exiting...');
      rl.close();
      break;
      
    default:
      console.log('Invalid choice. Exiting...');
      rl.close();
  }
});