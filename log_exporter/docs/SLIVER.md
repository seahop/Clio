# Sliver Parser Implementation

This document describes how the Sliver parser works with the C2 Log Forwarder to send Sliver commands to Clio.

## Sliver Log Structure

Sliver organizes its logs differently from other C2 frameworks, with several different formats that the parser is designed to handle:

1. **Directory Structure**:
   - Logs are stored in the `logs` directory relative to the Sliver root
   - May include date-based subdirectories in `YYYY-MM-DD` format (e.g., `2025-03-10`)
   - Session-specific logs may be in a `sessions` subdirectory
   - Additional directories might include `operators`, `clients`, and other Sliver-specific folders

2. **Log Files**:
   - Session logs named with session UUIDs: e.g., `76d9f9e3-c995-4d18-9d35-ba46430e855b.log`
   - General server logs: `sliver-server.log`
   - Client/console logs: `operator-admin.log`, `console.log`
   - JSON format logs: `sliver-server.json.log`

3. **Log Entry Formats**:
   - Text format: `[timestamp] [level] [component] message`
   - JSON format: `{"timestamp": "...", "level": "...", "component": "...", "msg": "..."}`
   - Various command patterns: 
     - `Executing command: command`
     - `[client] shell command`
     - `[console] command`

## Parser Implementation Details

The `SliverParser` class in `parsers/sliver.py` implements specialized functionality to handle Sliver's log format:

### 1. Identifying Log Directories

The parser identifies log directories using a more flexible approach than other C2 parsers:

```python
def get_log_directories(self):
    log_dirs = []
    
    # Check for date-based directories
    today_str = datetime.now().date().strftime("%Y-%m-%d")
    today_dir = os.path.join(self.sliver_logs_base_dir, today_str)
    if os.path.exists(today_dir):
        log_dirs.append(today_dir)
        # Also add historical date directories if present
        # ...
    
    # Always add the base logs directory
    log_dirs.append(self.sliver_logs_base_dir)
    
    # Check for common subdirectories like "sessions", "operators", etc.
    for subdir in ["sessions", "operators", "clients", "beacons", "implants"]:
        dir_path = os.path.join(self.sliver_logs_base_dir, subdir)
        if os.path.exists(dir_path):
            log_dirs.append(dir_path)
            # Also add any UUID-named subdirectories
            # ...
    
    return log_dirs
```

### 2. Identifying Valid Log Files

The parser determines which files to process using multiple criteria:

```python
def is_valid_log_file(self, file_path):
    # Check file extensions (.log or .json)
    file_name = os.path.basename(file_path)
    if not (file_name.endswith('.log') or file_name.endswith('.json')):
        return False
        
    # Skip files that are clearly not command logs
    skip_patterns = ['debug', 'error', 'system', 'startup', 'shutdown', 'heartbeat']
    if any(pattern in file_name.lower() for pattern in skip_patterns):
        return False
        
    # Check if filename contains a session ID or matches common log names
    if re.search(self.session_id_regex, file_name) or any(name in file_name.lower() for name in ['session', 'client', 'operator', 'console', 'sliver-server']):
        return True
        
    # If necessary, check file content for command indicators
    # ...
```

### 3. Multiple Parsing Strategies

The parser uses different strategies based on the log file type:

```python
def parse_log_file(self, log_file, processed_lines):
    # Determine log type
    file_name = os.path.basename(abs_log_file)
    is_session_log = 'session' in file_name.lower() or re.search(self.session_id_regex, file_name)
    is_client_log = any(name in file_name.lower() for name in ['client', 'operator', 'console'])
    is_json_log = file_name.endswith('.json') or file_name.endswith('.json.log')
    
    # Process each line with the appropriate parser
    for line in lines:
        # Extract session metadata
        self.extract_session_metadata(line)
        
        # Parse using the appropriate method based on log type
        if is_json_log or line.startswith('{'):
            entry = self.parse_json_entry(line)
        elif is_session_log:
            entry = self.parse_session_line(line)
        elif is_client_log:
            entry = self.parse_client_line(line)
        else:
            entry = self.parse_generic_line(line)
            
        if entry and not self.should_exclude_entry(entry):
            new_entries.append(entry)
```

### 4. Session Metadata Tracking

The parser maintains a mapping of session IDs to hostname/IP data to enrich log entries:

```python
def extract_session_metadata(self, line):
    # Find session ID
    session_match = self.session_id_regex.search(line)
    if session_match:
        session_id = session_match.group(1)
        
        # Initialize if this is a new session
        if session_id not in self.session_metadata:
            self.session_metadata[session_id] = {}
        
        # Extract hostname, IP, username
        # ...
        
def add_session_context(self, entry, session_id):
    """Add session context to an entry if available"""
    if session_id in self.session_metadata:
        metadata = self.session_metadata[session_id]
        if "hostname" in metadata:
            entry["hostname"] = metadata["hostname"]
        if "ip" in metadata:
            entry["internal_ip"] = metadata["ip"]
        if "username" in metadata:
            entry["username"] = metadata["username"]
```

### 5. Command Filtering

The parser excludes certain types of messages to focus on actual commands:

```python
def should_exclude_entry(self, entry):
    # Exclude specific commands
    excluded_commands = [
        'session backgrounded',
        'session terminated',
        'interactive mode',
        'download complete',
    ]
    
    if any(excluded in entry["command"].lower() for excluded in excluded_commands):
        return True
        
    # Exclude 'use' commands (which select a session)
    if entry["command"].startswith("use "):
        return True
```

## Command Mapping

The parser extracts the following fields from Sliver logs and maps them to Clio fields:

| Sliver Log Field | Clio Field |
|------------------|------------|
| Command | `command` |
| Hostname | `hostname` |
| Username | `username` |
| IP Address | `internal_ip` |
| Filename (for file operations) | `filename` |
| Timestamp | Included in `notes` field |
| Session ID | Included in `notes` field |

## Key Differences from Cobalt Strike Parser

The Sliver parser differs from the Cobalt Strike parser in several key ways:

1. **More Complex Log Structure**: 
   - Handles multiple log formats (text and JSON)
   - Supports various directory layouts
   - Processes logs from multiple components (server, client, console, session)

2. **Command Patterns**:
   - Uses multiple regex patterns to identify commands in different contexts
   - Extracts commands from various log message formats
   - Filters out status messages and administrative commands

3. **Session Context**:
   - Maintains a session metadata store to track session-to-host relationships
   - Enriches command entries with context from session metadata
   - Correlates logs across different files related to the same session

4. **Filtering Logic**:
   - Excludes specific administrative commands and status messages
   - Has more complex logic to identify what is a command vs output

5. **JSON Support**:
   - Includes specialized parsing for JSON-formatted logs
   - Extracts fields from structured JSON data

## Using the Sliver Parser

To use the Sliver parser:

1. **Setup**:
   - Run the forwarder from your Sliver root directory (where the `logs` folder is located)

2. **Command Line**:
   ```bash
   python /path/to/log_exporter.py \
     --api-key YOUR_API_KEY \
     --clio-url https://your-clio-server:3000 \
     --c2-type sliver \
     --historical-days 3
   ```

3. **Running as a Service**:
   - For continuous operation, set up a systemd service
   - Make sure the `WorkingDirectory` is set to your Sliver root directory

## Best Practices

For optimal operation with Sliver:

1. **Run from the correct directory**:
   - Always run the forwarder from the Sliver root directory
   - This ensures all log paths are correctly resolved

2. **Session Context**:
   - To get the most complete log entries, ensure your Sliver logs include session establishment information
   - This allows the parser to associate commands with the correct hostname/IP

3. **Log Format Consistency**:
   - The parser works best with the default Sliver log format
   - Customized log formats may require adjustments to the parser

4. **Command Focus**:
   - The parser prioritizes actual commands executed on target systems
   - Administrative commands like session switching are filtered out
   - Status messages are ignored to focus on operator actions

## Troubleshooting

Common issues specific to the Sliver parser:

1. **Missing Session Context**:
   - If hostnames or IPs are not showing up in logs, check if session establishment logs are available
   - The parser needs to see the "New session established from..." messages to link sessions to hosts

2. **Filtered Commands**:
   - Some administrative commands (use, session backgrounded, etc.) are intentionally excluded
   - If you need these commands logged, modify the `should_exclude_entry` method

3. **JSON Parsing Issues**:
   - If using custom JSON log formats, ensure they match the expected structure
   - The parser expects certain fields like "msg", "component", and "timestamp"

4. **Command Recognition**:
   - If certain commands aren't being logged, check the regex patterns in the parser
   - You may need to add additional patterns for custom or non-standard commands