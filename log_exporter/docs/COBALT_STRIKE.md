# Cobalt Strike Parser Implementation

This document describes how the Cobalt Strike parser works with the C2 Log Forwarder to send Beacon commands to Clio.

## Cobalt Strike Log Structure

Cobalt Strike organizes its logs in a specific way that the parser is designed to handle:

1. **Directory Structure**:
   - Logs are stored in the `logs` directory relative to the Cobalt Strike root
   - Each day has its own subdirectory named in `YYYY-MM-DD` format (e.g., `2025-03-10`)
   - Beacon logs are stored within these daily directories

2. **Log Files**:
   - Beacon logs have filenames that start with `beacon_` or contain the word `beacon`
   - The files have a `.log` extension

3. **Log Entry Format**:
   - Beacon command entries follow this pattern:
     ```
     [HH:MM:SS] Beacon ID (username@hostname): command
     ```
   - Example:
     ```
     [14:32:45] Beacon 1234 (DOMAIN\user@COMP-01): shell whoami
     ```

## Parser Implementation Details

The `CobalStrikeParser` class in `parsers/cobalt_strike.py` implements the following key functionality:

### 1. Identifying Log Directories

The parser identifies which directories to monitor based on:
- Today's date (always monitored)
- Yesterday's date (always monitored if the directory exists)
- Additional historical days specified by the `historical_days` parameter

```python
def get_log_directories(self):
    log_dirs = []
    
    # Today's directory
    today_str = datetime.now().date().strftime("%Y-%m-%d")
    today_dir = os.path.join(self.cs_logs_base_dir, today_str)
    log_dirs.append(today_dir)
    
    # Yesterday's directory
    yesterday = datetime.now().date() - timedelta(days=1)
    yesterday_str = yesterday.strftime("%Y-%m-%d")
    yesterday_dir = os.path.join(self.cs_logs_base_dir, yesterday_str)
    if os.path.exists(yesterday_dir):
        log_dirs.append(yesterday_dir)
    
    # Additional historical days
    # ...
    
    return log_dirs
```

### 2. Identifying Valid Log Files

The parser determines which files to process based on naming patterns:

```python
def is_valid_log_file(self, file_path):
    if not os.path.exists(file_path) or os.path.isdir(file_path):
        return False
        
    file_name = os.path.basename(file_path)
    if not file_name.endswith('.log'):
        return False
        
    if not (file_name.startswith("beacon_") or "beacon" in file_name.lower()):
        return False
    
    return True
```

### 3. Parsing Log Entries

The parser extracts command information using a regular expression:

```python
# Regex pattern for parsing Beacon commands
self.beacon_cmd_regex = re.compile(r"\[(.*?)\]\s+Beacon\s+(\d+)\s+\((.+?)(?:@|\s+)(.+?)\):\s+(.*)")

def parse_log_file(self, log_file, processed_lines):
    # ...
    
    # Process each line
    for line in lines:
        # Match only user commands to beacons
        cmd_match = self.beacon_cmd_regex.match(line)
        if cmd_match:
            timestamp, beacon_id, username, hostname, command = cmd_match.groups()
            
            # Extract domain if present
            domain = ""
            if '\\' in username:
                domain, username = username.split('\\')
            elif '/' in username:
                domain, username = username.split('/')
            
            # Create the log entry for Clio
            entry = {
                "hostname": hostname,
                "username": username,
                "command": command,
                "notes": f"Beacon ID: {beacon_id}, Timestamp: {timestamp}",
                "filename":"",
                "status": "",
                "internal_ip": "",
                "external_ip": ""
            }
            
            # Add domain if present
            if domain:
                entry["domain"] = domain
            
            new_entries.append(entry)
    
    # ...
```

### 4. State Management

The parser maintains state to avoid reprocessing the same log entries:

- It tracks the number of lines processed in each file
- This information is persisted to disk between runs
- When a file is reopened, only new lines are processed

```python
# Get previously processed lines count
if abs_log_file not in processed_lines:
    processed_lines[abs_log_file] = 0

# Skip already processed lines
for i in range(processed_lines[abs_log_file], len(lines)):
    # ... process line ...

# Update processed lines count
processed_lines[abs_log_file] = line_count
```

## Using the Cobalt Strike Parser

To use the Cobalt Strike parser:

1. **Setup**:
   - Run the forwarder from your Cobalt Strike root directory (where the `logs` folder is located)

2. **Command Line**:
   ```bash
   python /path/to/log_exporter.py \
     --api-key YOUR_API_KEY \
     --clio-url https://your-clio-server:3000 \
     --c2-type cobalt_strike \
     --historical-days 3
   ```

3. **Running as a Service**:
   - For continuous operation, set up a systemd service
   - Make sure the `WorkingDirectory` is set to your Cobalt Strike root

## Command Mapping

The parser extracts the following fields from Cobalt Strike logs and maps them to Clio fields:

| Cobalt Strike Log Field | Clio Field |
|-------------------------|------------|
| Timestamp | Included in `notes` field |
| Beacon ID | Included in `notes` field |
| Username | `username` |
| Domain | `domain` (if present) |
| Hostname | `hostname` |
| Command | `command` |

## Best Practices

For optimal operation with Cobalt Strike:

1. **Run from the correct directory**:
   - Always run the forwarder from the Cobalt Strike root directory
   - This ensures log paths are correctly resolved

2. **Historical processing**:
   - Set `--historical-days` appropriately for your operation
   - Typical values are 1-7 days depending on operation length

3. **Continuous operation**:
   - Set up a systemd service for uninterrupted monitoring
   - Make sure the service restarts automatically if it fails

4. **Log rotation**:
   - Cobalt Strike creates new log directories each day
   - The parser automatically detects and monitors new directories
   - Old directories (beyond `max_tracked_days`) are automatically ignored

## Troubleshooting

Common issues with the Cobalt Strike parser:

1. **"Logs base directory does not exist"**:
   - Ensure you're running from the Cobalt Strike root directory
   - Verify that the `logs` directory exists

2. **No logs being forwarded**:
   - Check that you have Beacon logs in the expected format
   - Enable debug logging with `--debug` to see detailed parsing information
   - Verify that Beacon logs have the expected naming pattern

3. **Missing users or domains**:
   - If `domain\user` format isn't being parsed correctly, check the log format
   - The parser handles both backslash and forward slash domain separators

4. **Performance considerations**:
   - Processing many days of historical logs can be resource-intensive
   - Use `--max-tracked-days` to limit resource usage for long-running operations