# C2 Log Forwarder Configuration Guide

This document provides detailed information about configuring the C2 Log Forwarder for optimal use with your environment and C2 framework.

## Command Line Arguments

The C2 Log Forwarder supports the following command line arguments:

| Argument | Description | Default | Required |
|----------|-------------|---------|----------|
| `--api-key` | Your Clio API key | - | Yes |
| `--clio-url` | URL to your Clio instance | - | Yes |
| `--c2-type` | C2 framework type | `cobalt_strike` | No |
| `--historical-days` | Number of previous days to process | `1` | No |
| `--max-tracked-days` | Maximum number of days to actively track | `2` | No |
| `--interval` | Polling interval in seconds | `5` | No |
| `--data-dir` | Directory for logs and state files | `clio_forwarder` | No |
| `--insecure-ssl` | Disable SSL certificate verification | `False` | No |
| `--debug` | Enable more detailed logging | `False` | No |

### Usage Examples

Basic usage:
```bash
python forwarder.py --api-key YOUR_API_KEY --clio-url https://your-clio-server:3000
```

Extended options:
```bash
python forwarder.py \
  --api-key YOUR_API_KEY \
  --clio-url https://your-clio-server:3000 \
  --c2-type cobalt_strike \
  --historical-days 7 \
  --max-tracked-days 3 \
  --interval 10 \
  --data-dir my_logs \
  --insecure-ssl \
  --debug
```

## Configuration Options in Detail

### API Key (`--api-key`)

The API key is used for authenticating with the Clio API. To create an API key:

1. Log into Clio as an admin
2. Navigate to Admin → API Keys
3. Create a new API key with "logs:write" permission
4. Save this key securely - it will be shown only once

The API key is passed directly through the `X-API-Key` header to Clio on each request.

### Clio URL (`--clio-url`)

The base URL of your Clio instance, including the protocol (http/https) and port if non-standard. For example:
- `https://clio.example.com`
- `https://192.168.1.10:3000`

### C2 Framework Type (`--c2-type`)

Specifies which C2 framework parser to use. Available options:
- `cobalt_strike` (default) - For Cobalt Strike Beacon logs
- Additional frameworks as they are added to the tool

### Historical Days (`--historical-days`)

The number of previous days' logs to process when the tool starts. This is useful for:
- Backfilling data into Clio from past operations
- Ensuring no logs are missed if the tool was temporarily offline

Note: Setting this too high can cause performance issues with large log volumes.

### Max Tracked Days (`--max-tracked-days`)

The maximum number of days of logs to actively track. This setting helps manage system resources by dropping monitoring of very old log directories.

How it works:
- New log files in all tracked days are monitored in real-time
- Directories older than `max_tracked_days` are not actively monitored
- If `historical_days` is larger than `max_tracked_days`, older logs will be processed initially but not monitored afterward

### Polling Interval (`--interval`)

The time in seconds between periodic checks for log changes. This supplements the file system monitoring, which should detect most changes immediately.

- Lower values (e.g., 1-3 seconds) provide more immediate detection but use more resources
- Higher values (e.g., 10-30 seconds) use fewer resources but may delay detection of some logs
- The default of 5 seconds is a good balance for most environments

### Data Directory (`--data-dir`)

The directory where the forwarder stores:
- Log files from its own operation
- State files to track processed log entries
- Lock files to prevent concurrent processing

This directory is created if it doesn't exist. By default, it's created in the current working directory.

### Insecure SSL (`--insecure-ssl`)

When set, SSL certificate verification is disabled when connecting to the Clio API. Use this when:
- Your Clio instance uses a self-signed certificate
- You're using an internal CA that isn't trusted by the system
- You're testing in a development environment

⚠️ **Security Warning**: Disabling SSL verification reduces security. In production environments, it's better to properly configure trusted certificates.

### Debug Mode (`--debug`)

Enables verbose logging, showing detailed information about:
- File detection and monitoring
- Log parsing and entry extraction
- Communication with the Clio API
- Internal state management

Use debug mode when:
- Setting up the forwarder for the first time
- Troubleshooting missing or incorrect log entries
- Developing a new parser

## Environment Variables

The C2 Log Forwarder does not currently use environment variables directly, but they can be used in shell scripts or systemd service files to configure the command line arguments.

Example script using environment variables:
```bash
#!/bin/bash
CLIO_API_KEY="your-api-key"
CLIO_URL="https://your-clio-server:3000"
C2_TYPE="cobalt_strike"

python forwarder.py \
  --api-key "$CLIO_API_KEY" \
  --clio-url "$CLIO_URL" \
  --c2-type "$C2_TYPE"
```

## State File

The forwarder maintains state in a file (default: `clio_forwarder/forwarder_state.pkl`) to track which log entries have been processed. This ensures:
- No duplicate entries are sent to Clio
- Processing can resume after a restart
- Historical log processing works efficiently

The state file contains:
- A map of processed files to line counts
- File metadata including sizes and modification times
- Timestamp of the last run

If you need to reset the processing state (to reprocess all logs), you can:
1. Stop the forwarder
2. Delete the state file
3. Restart the forwarder with the desired `--historical-days` setting

## Log Rotation

The forwarder automatically rotates its own log files when they exceed 5MB. The rotation system:
- Creates timestamped backup files
- Keeps the 5 most recent log files
- Continues logging to a new file with the same name

No configuration is needed for log rotation.

## Rate Limiting and Resource Usage

To prevent excessive resource usage:
- Files are processed with a lock mechanism to prevent concurrent processing
- Observers for very old log directories are automatically removed
- Batch processing is used when sending logs to Clio (25 entries per batch)
- API requests use exponential backoff with a maximum of 3 retries

These settings cannot currently be configured but provide a good balance for most deployments.

## Systemd Service Configuration

For production use, we recommend setting up the forwarder as a systemd service. Here's a detailed example:

```ini
[Unit]
Description=C2 Log Forwarder for Clio
After=network.target
Wants=network-online.target
# Add dependencies on specific services if needed
# Requires=postgresql.service

[Service]
Type=simple
User=youruser
Group=yourgroup

# Working directory must be the C2 framework root
WorkingDirectory=/path/to/cobaltstrike

# Main command
ExecStart=/usr/bin/python3 /path/to/c2-log-forwarder/forwarder.py \
  --api-key YOUR_API_KEY \
  --clio-url https://your-clio-server:3000 \
  --c2-type cobalt_strike \
  --historical-days 3

# Restart configuration
Restart=on-failure
RestartSec=10s
StartLimitInterval=5min
StartLimitBurst=3

# Security settings (recommended for production)
# Hardening options
PrivateTmp=true
ProtectHome=read-only
ProtectSystem=full
NoNewPrivileges=true

# Resource limits
CPUQuota=25%
MemoryLimit=256M

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=c2-log-forwarder

[Install]
WantedBy=multi-user.target
```

Adjustments for your environment:
- Replace `youruser` and `yourgroup` with appropriate values
- Update paths to match your installation
- Adjust `CPUQuota` and `MemoryLimit` based on your server resources
- Modify security settings if more access is needed

## Multi-Framework Configuration

If you need to monitor multiple C2 frameworks simultaneously, you'll need to run multiple instances of the forwarder:

1. Create a separate data directory for each framework:
   ```bash
   mkdir -p /opt/clio/cobalt_strike
   mkdir -p /opt/clio/sliver
   ```

2. Create separate systemd service files:
   ```
   /etc/systemd/system/c2-log-forwarder-cs.service
   /etc/systemd/system/c2-log-forwarder-sliver.service
   ```

3. Configure each instance with its specific:
   - Working directory
   - C2 framework type
   - Data directory