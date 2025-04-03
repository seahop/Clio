// frontend/src/components/api-keys/apiKeyUtils.js

/**
 * Format date for display
 * @param {string} dateString - Date to format
 * @returns {string} - Formatted date
 */
export const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };
  
  /**
   * Generate a cURL example command for an API key
   * @param {string} apiKey - API key to use in the example
   * @returns {string} - Example cURL command
   */
  export const generateCurlExample = (apiKey) => {
    return `curl -k -X POST https://your-IP-or-Host:3000/ingest/logs \\
    -H "Content-Type: application/json" \\
    -H "X-API-Key: ${apiKey}" \\
    -d '{
      "internal_ip": "192.168.1.100",
      "external_ip": "203.0.113.1",
      "hostname": "victim-host",
      "domain": "example.org",
      "username": "jsmith",
      "command": "cat /etc/passwd",
      "notes": "Privilege escalation attempt",
      "filename": "passwd",
      "status": "ON_DISK"
    }'`;
  };
  
  /**
   * Generate a Python example for an API key
   * @param {string} apiKey - API key to use in the example
   * @returns {string} - Example Python code
   */
  export const generatePythonExample = (apiKey) => {
    return `import requests
  import urllib3
  
  # Disable SSL warnings for self-signed certificates
  urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
  
  url = "https://your-IP-or-Host:3000/ingest/logs"
  headers = {
      "Content-Type": "application/json",
      "X-API-Key": "${apiKey}"
  }
  payload = {
      "internal_ip": "192.168.1.100",
      "external_ip": "203.0.113.1",
      "hostname": "victim-host",
      "domain": "example.org",
      "username": "jsmith",
      "command": "cat /etc/passwd",
      "notes": "Privilege escalation attempt",
      "filename": "passwd",
      "status": "ON_DISK"
  }
  
  response = requests.post(url, headers=headers, json=payload, verify=False)
  print(f"Status code: {response.status_code}")
  print(f"Response: {response.json()}")`;
  };