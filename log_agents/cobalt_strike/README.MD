# Cobalt Strike Beacon Log Forwarder for Clio

This script automatically forwards Cobalt Strike beacon commands to the Clio Logging Platform, creating a comprehensive audit trail of all executed commands during your operations.

## Features

- Real-time monitoring of Cobalt Strike beacon logs
- Automatic date detection to handle logs in date-based directories
- Reliable state persistence to prevent duplicate log entries after restarts
- Historical log processing to backfill logs from previous days
- Resource-efficient monitoring with automatic cleanup of old directories
- Built-in log rotation and stale lock file cleanup
- Error resilience with automatic retries and graceful error handling
- Organized data storage with a dedicated directory for all generated files

## Requirements

- Python 3.6+
- Cobalt Strike team server
- Clio Logging Platform instance with an API key
- Required Python packages: `watchdog`, `requests`

## Installation

1. Download the script to a location of your choice (e.g., the Cobalt Strike root directory).
2. Install the required Python packages:

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

3. Create an API key in your Clio Logging Platform:
   - Log into Clio as an admin
   - Navigate to Admin → API Keys
   - Create a new API key with "logs:write" permission

## Usage

The script is designed to be run from the Cobalt Strike root directory (where the logs folder is located).

### Basic Usage

```bash
# Run from Cobalt Strike's root directory
cd /path/to/cobaltstrike
python3 cs_log_forwarder.py --api-key YOUR_API_KEY --clio-url https://your-clio-server:3000 --insecure-ssl --debug
```

### Full Options

```bash
python3 cs_log_forwarder.py \
  --api-key YOUR_API_KEY \
  --clio-url https://your-clio-server:3000 \
  --historical-days 3 \
  --max-tracked-days 2 \
  --interval 5 \
  --data-dir clio_forwarder \
  --insecure-ssl \
  --debug
```

### Command Line Arguments

- `--api-key` (required): Your Clio API key
- `--clio-url` (required): URL to your Clio instance
- `--historical-days` (default: 1): Number of previous days to process
- `--max-tracked-days` (default: 2): Maximum number of days to actively track (limits resource usage)
- `--interval` (default: 5): Polling interval in seconds
- `--data-dir` (default: "clio_forwarder"): Directory for logs and state files
- `--insecure-ssl`: Disable SSL certificate verification (use for self-signed certs)
- `--debug`: Enable more detailed logging

## Resource Management

The script is designed to efficiently manage system resources:

- Only maintains active monitoring for the most recent days (default: 2 days)
- Automatically cleans up tracking for older log directories 
- Properly manages observer instances to prevent inotify limits from being reached
- Includes log rotation to prevent log files from growing too large
- Cleans up stale lock files at startup

## Running as a System Service

For continuous operation, you can set up the forwarder as a systemd service:

1. Create a service file `/etc/systemd/system/cs_log_forwarder.service` with the following content:

```
[Unit]
Description=Cobalt Strike Beacon Log Forwarder for Clio
After=network.target

[Service]
Type=simple
User=REPLACE_WITH_USERNAME

# Set the working directory to the Cobalt Strike root folder
WorkingDirectory=/path/to/cobaltstrike

# Specify the script path and parameters
ExecStart=/usr/bin/python3 /path/to/cs_log_forwarder.py --api-key YOUR_API_KEY_HERE --clio-url https://your-clio-server:3000 --historical-days 1 --max-tracked-days 2 --interval 5 --data-dir clio_forwarder

# Add --insecure-ssl if needed for self-signed certificates
# ExecStart=... --insecure-ssl

# Restart settings
Restart=always
RestartSec=10

# Output handling
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

2. Update the placeholder values:
   - `REPLACE_WITH_USERNAME`: The user that will run the service
   - `/path/to/cobaltstrike`: Full path to your Cobalt Strike installation
   - `/path/to/cs_log_forwarder.py`: Full path to the forwarder script
   - `YOUR_API_KEY_HERE`: Your Clio API key
   - Uncomment the `--insecure-ssl` option if needed
   - Modify other parameters as needed

3. Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable cs_log_forwarder.service
sudo systemctl start cs_log_forwarder.service
```

4. Monitor the service:

```bash
# Check service status
sudo systemctl status cs_log_forwarder.service

# View service logs
sudo journalctl -u cs_log_forwarder.service -f

# View application logs
tail -f /path/to/cobaltstrike/clio_forwarder/cs_log_forwarder.log
```

## Folder Structure

When run, the script will create the following structure:

```
cobaltstrike/             # Cobalt Strike root directory
├── logs/                 # Existing Cobalt Strike logs folder
│   ├── 2025-03-08/       # Date-based log directories
│   │   └── beacon_*.log  # Beacon logs
│   └── ...
├── cs_log_forwarder.py   # The forwarder script
└── clio_forwarder/       # Generated files folder (configurable)
    ├── cs_log_forwarder.log     # Script logs
    ├── cs_log_forwarder.log.*   # Rotated log files
    └── forwarder_state.pkl      # State persistence file
```

## Troubleshooting

### Common Issues

- **"Logs base directory does not exist"**: Make sure you're running the script from the Cobalt Strike root directory
- **"Error connecting to Clio API"**: Verify your API key and Clio URL are correct
- **SSL Certificate Errors**: Use the `--insecure-ssl` flag if your Clio server uses self-signed certificates
- **No logs appearing in Clio**: Check that the script is detecting beacon logs correctly
- **Script crashes or stops**: Check the log file for detailed error messages

### System Limits (inotify)

If you encounter errors about "inotify instance limit reached", you can increase the system limits:

1. Check your current limits:
```bash
cat /proc/sys/fs/inotify/max_user_watches
cat /proc/sys/fs/inotify/max_user_instances
```

2. Increase the limits by editing `/etc/sysctl.conf` and adding:
```
fs.inotify.max_user_watches=65536
fs.inotify.max_user_instances=256
```

3. Apply the changes:
```bash
sudo sysctl -p
```

### SSL Certificate Verification

By default, the script verifies SSL certificates when connecting to the Clio API. If your Clio server uses self-signed certificates, you have two options:

1. Use the `--insecure-ssl` flag to disable certificate verification (less secure but convenient)
2. Install proper certificates:
   - Add your Clio server's certificate to the system's trusted certificate store
   - Make sure the certificate's Common Name (CN) matches the hostname in your `--clio-url`