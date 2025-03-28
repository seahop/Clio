# C2 Log Forwarder for Clio

This tool automatically forwards logs from various Command and Control (C2) frameworks to the Clio Logging Platform, creating a comprehensive audit trail of all executed commands during your operations.

## Overview

The C2 Log Forwarder monitors your C2 framework's log directories in real-time, detects new command entries, and sends them to Clio for centralized logging and analysis. It supports multiple C2 frameworks through a modular parser system that can be extended for any C2 platform.

## Features

- **Real-time monitoring** of C2 framework logs
- **Multiple C2 framework support** through modular design
- **Command filtering** to focus on significant activities
- **State persistence** to prevent duplicate entries after restarts
- **Historical log processing** to backfill logs from previous days
- **Resource-efficient monitoring** with automatic cleanup
- **Error resilience** with automatic retries
- **Secure transmission** to your Clio instance

## Supported C2 Frameworks

Currently supported C2 frameworks:

- **Cobalt Strike** - [Details on Cobalt Strike implementation](docs/COBALT_STRIKE.md)
- **Sliver** - [Details on Sliver implementation](docs/SLIVER.md)

Coming soon:
- Brute Ratel
- Mythic
- (Submit your request via Issues)

## Quick Start

1. **Install the tool**:
   ```bash
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt

   ```

2. **Set up an API key in Clio**:
   - Log into Clio as an admin
   - Navigate to Admin → API Keys
   - Create a new API key with "logs:write" permission

3. **Run the forwarder for your C2 framework**:

   For Cobalt Strike:
   ```bash
   # Navigate to your Cobalt Strike root directory
   cd /path/to/cobaltstrike
   
   # Start the forwarder
   python /path/to/C2Home/log_exporter.py \
     --api-key YOUR_API_KEY \
     --clio-url https://your-clio-server \
     --c2-type cobalt_strike
   ```

   For Sliver:
   ```bash
   # Navigate to your Sliver root directory
   cd /path/to/sliver
   
   # Start the forwarder
   python /path/to/c2-log-forwarder/log_exporter.py \
     --api-key YOUR_API_KEY \
     --clio-url https://your-clio-server \
     --c2-type sliver
   ```

For more detailed options, run:
```bash
python log_exporter.py --help
```

## Command Filtering

The forwarder supports filtering commands to focus on significant activities:

- `--all` - Forward all commands (default behavior)
- `--significant` - Forward only significant commands, filtering out common low-value commands

Examples:
```bash
# Default behavior - forward all commands
python log_exporter.py --api-key YOUR_KEY --clio-url URL --c2-type sliver

# Significant commands only - filter out commands like ls, cd, pwd, etc.
python log_exporter.py --api-key YOUR_KEY --clio-url URL --c2-type sliver --significant
```

For details on customizing which commands are considered significant, see [Command Filtering Guide](docs/COMMAND_FILTERING.md).

## Documentation

- [Cobalt Strike Parser Documentation](docs/COBALT_STRIKE.md)
- [Sliver Parser Documentation](docs/SLIVER.md)
- [Command Filtering Guide](docs/COMMAND_FILTERING.md)
- [Developer Guide: Creating New Parsers](docs/DEVELOPERS.md)
- [Configuration Options](docs/CONFIGURATION.md)
- [Troubleshooting Guide](docs/TROUBLESHOOTING.md)

## Running as a System Service

For continuous operation, you can set up the forwarder as a systemd service:

```bash
# Create a systemd service file
sudo vi /etc/systemd/system/c2-log-forwarder.service
```

Example service file for Cobalt Strike:
```ini
[Unit]
Description=C2 Log Forwarder for Clio - Cobalt Strike
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/cobaltstrike
ExecStart=/usr/bin/python3 /path/to/c2-log-forwarder/log_exporter.py --api-key YOUR_API_KEY --clio-url https://your-clio-server --c2-type cobalt_strike
Restart=on-failure
RestartSec=10s

[Install]
WantedBy=multi-user.target
```

Example service file for Sliver:
```ini
[Unit]
Description=C2 Log Forwarder for Clio - Sliver
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/sliver
ExecStart=/usr/bin/python3 /path/to/c2-log-forwarder/log_exporter.py --api-key YOUR_API_KEY --clio-url https://your-clio-server --c2-type sliver
Restart=on-failure
RestartSec=10s

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable c2-log-forwarder
sudo systemctl start c2-log-forwarder
```

## Framework-Specific Considerations

### Cobalt Strike

The Cobalt Strike parser is designed to extract Beacon commands from Cobalt Strike's date-based log directories. It focuses on operator-issued commands and tracks beacon contexts.

Key characteristics:
- Requires running from the Cobalt Strike root directory
- Processes logs from date-based directories (YYYY-MM-DD format)
- Extracts command patterns from Beacon logs

See [COBALT_STRIKE.md](docs/COBALT_STRIKE.md) for detailed information.

### Sliver

The Sliver parser handles Sliver's more complex logging structure with support for multiple log formats and directory layouts.

Key characteristics:
- Processes multiple log types (session logs, server logs, client logs, JSON logs)
- Tracks session contexts across different log files
- Filters administrative commands to focus on actual operator activities
- Handles both text and JSON formatted logs

See [SLIVER.md](docs/SLIVER.md) for detailed information.

## Contributing

If you'd like to add support for a new C2 framework, see our [developer guide](docs/DEVELOPERS.md).