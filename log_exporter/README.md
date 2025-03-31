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

3. **Deploy the log_exporter folder**:
   - Copy the entire `log_exporter` folder into your C2 framework's root directory
   - The folder structure should look like this:
     ```
     /path/to/cobalt_strike/   # C2 framework root
     ├── logs/                 # C2 logs directory
     ├── log_exporter/         # This tool
     │   ├── log_exporter.py   # Main script
     │   ├── core/
     │   ├── parsers/
     │   └── ...
     └── ...
     ```

4. **Run the forwarder for your C2 framework**:

   From inside the log_exporter directory:
   ```bash
   cd /path/to/cobaltstrike/log_exporter
   
   # Start the forwarder
   python log_exporter.py \
     --api-key YOUR_API_KEY \
     --clio-url https://your-clio-server \
     --c2-type cobalt_strike
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

## Advanced Configuration

### Manually Specifying the C2 Root Directory

If your C2 framework structure is different, you can specify the C2 root directory explicitly:

```bash
python log_exporter.py \
  --api-key YOUR_API_KEY \
  --clio-url https://your-clio-server \
  --c2-type cobalt_strike \
  --c2-root /path/to/specific/cobaltstrike
```

### Custom Data Directory

By default, log files and state information are stored in a `clio_forwarder` directory inside the log_exporter directory. You can change this:

```bash
python log_exporter.py \
  --api-key YOUR_API_KEY \
  --clio-url https://your-clio-server \
  --c2-type cobalt_strike \
  --data-dir /path/to/custom/data/directory
```

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
WorkingDirectory=/path/to/cobaltstrike/log_exporter
ExecStart=/usr/bin/python3 log_exporter.py --api-key YOUR_API_KEY --clio-url https://your-clio-server --c2-type cobalt_strike
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
WorkingDirectory=/path/to/sliver/log_exporter
ExecStart=/usr/bin/python3 log_exporter.py --api-key YOUR_API_KEY --clio-url https://your-clio-server --c2-type sliver
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

## Contributing

If you'd like to add support for a new C2 framework, see our [developer guide](docs/DEVELOPERS.md).