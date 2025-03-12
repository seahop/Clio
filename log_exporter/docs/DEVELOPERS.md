# Developer Guide: Creating New C2 Framework Parsers

This guide explains how to extend the C2 Log Forwarder to support additional Command and Control (C2) frameworks beyond the ones already included.

## Architecture Overview

The C2 Log Forwarder uses a modular parser system that separates the core log forwarding functionality from the C2-specific log parsing logic. This allows the addition of new C2 frameworks without modifying the core code.

The architecture consists of:

1. **Core Engine** (`core/log_exporter.py`) - Manages file watching, log sending, and state tracking
2. **Event Handlers** (`core/event_handler.py`) - Processes file system events
3. **Parser System** - Framework-specific parsers that extract information from logs
   - `parsers/base_parser.py` - Abstract base class defining the parser interface
   - `parsers/cobalt_strike.py` - Concrete implementation for Cobalt Strike
   - `parsers/your_c2.py` - Your custom parser implementation

## Creating a New Parser

To add support for a new C2 framework, follow these steps:

### 1. Create a New Parser Class

Create a new file in the `parsers` directory named after your C2 framework (e.g., `sliver.py` for Sliver C2):

```python
# parsers/sliver.py
import os
import re
import logging
import traceback
from datetime import datetime, timedelta

from parsers.base_parser import BaseLogParser

class SliverParser(BaseLogParser):
    """Parser for Sliver C2 logs"""
    
    def __init__(self, root_dir, historical_days=1, max_tracked_days=2):
        super().__init__(root_dir, historical_days, max_tracked_days)
        
        # Set up paths relative to the C2 framework root
        self.logs_base_dir = os.path.join(self.root_dir, "logs")  # Adjust path as needed
        
        # Custom regex patterns for your C2 framework's log format
        self.log_pattern = re.compile(r"YOUR_REGEX_PATTERN_HERE")
        
        self.logger.info(f"Initialized Sliver Parser")
        self.logger.info(f"- Logs base directory: {self.logs_base_dir}")
    
    # Required implementations of abstract methods
    
    def get_base_directory(self):
        """Get the base directory that contains all logs"""
        return self.logs_base_dir
    
    def get_log_directories(self):
        """
        Get all log directories to monitor
        
        This method should return a list of directories that contain log files
        to be monitored. The implementation depends on how your C2 framework
        organizes its log files.
        """
        # Example implementation - adjust based on your C2 framework
        log_dirs = []
        
        # Verify the base logs directory exists
        if not os.path.exists(self.logs_base_dir):
            self.logger.error(f"Logs base directory does not exist: {self.logs_base_dir}")
            return []
        
        # Add directories to monitor based on your C2 framework's log organization
        # For example, if logs are organized by date:
        today = datetime.now().date()
        today_str = today.strftime("%Y-%m-%d")
        today_dir = os.path.join(self.logs_base_dir, today_str)
        
        if os.path.exists(today_dir):
            log_dirs.append(today_dir)
        
        # Or if all logs are in the base directory:
        log_dirs.append(self.logs_base_dir)
        
        return log_dirs
    
    def is_valid_log_file(self, file_path):
        """
        Check if a file is a valid log file for this parser
        
        This method should return True only for files that should be processed.
        """
        if not os.path.exists(file_path) or os.path.isdir(file_path):
            return False
            
        # Example: check file extension and naming pattern
        file_name = os.path.basename(file_path)
        if not file_name.endswith('.log'):
            return False
            
        # Example: check if the file name matches your expected pattern
        if not ('command' in file_name.lower() or 'session' in file_name.lower()):
            return False
        
        return True
    
    def parse_log_file(self, log_file, processed_lines):
        """
        Parse a log file and extract command entries
        
        This is the core method that extracts command data from your C2 framework's
        log files. The implementation will depend entirely on your C2 framework's
        log format.
        
        Args:
            log_file: Path to the log file
            processed_lines: Dictionary that tracks the number of processed lines
                            per file. The parser should update this dict.
        
        Returns:
            list: List of dictionaries containing extracted command data
        """
        # Convert to absolute path for consistency
        abs_log_file = os.path.abspath(log_file)
        
        # Get previously processed lines count
        if abs_log_file not in processed_lines:
            processed_lines[abs_log_file] = 0
        
        line_count = 0
        new_entries = []
        
        try:
            with open(abs_log_file, 'r', encoding='utf-8', errors='replace') as f:
                lines = f.readlines()
                
                # Skip already processed lines
                for i in range(processed_lines[abs_log_file], len(lines)):
                    line = lines[i]
                    line_count = i + 1
                    
                    # Match your C2 framework's log format using the regex defined above
                    match = self.log_pattern.match(line)
                    if match:
                        # Extract relevant data from the match
                        # Example (adjust based on your regex groups):
                        # timestamp, session_id, username, hostname, command = match.groups()
                        
                        # Create the log entry with the format expected by Clio
                        entry = {
                            "hostname": "example-host",  # Replace with actual extracted data
                            "username": "example-user",  # Replace with actual extracted data
                            "command": "example-command",  # Replace with actual extracted data
                            "notes": "Example notes",  # Optional
                            "filename": "",  # Optional
                            "status": "",  # Optional
                            "internal_ip": "",  # Optional
                            "external_ip": ""  # Optional
                        }
                        
                        new_entries.append(entry)
            
            # Update processed lines count
            processed_lines[abs_log_file] = line_count
                
            return new_entries
                
        except Exception as e:
            self.logger.error(f"Error parsing log file {abs_log_file}: {str(e)}")
            self.logger.error(traceback.format_exc())
            return []
    
    # Optional: Override other methods if your C2 framework has unique requirements
    
    def is_file_outdated(self, file_path, cutoff_str):
        """
        Custom method to check if a file is too old to process
        
        Override this if your C2 framework organizes logs differently 
        than the default date-based directory structure.
        """
        # Default implementation checks date directories
        return super().is_file_outdated(file_path, cutoff_str)
    
    def is_date_directory(self, directory):
        """
        Custom method to identify date-based directories
        
        Override this if your C2 framework uses a different naming convention
        for date-based directories.
        """
        # Default implementation checks YYYY-MM-DD format
        return super().is_date_directory(directory)
```

### 2. Register Your Parser in the Main Script

Update the main `log_exporter.py` file to include your new parser:

```python
# Add a new import for your parser
from parsers.sliver import SliverParser

# In the parse_arguments function:
parser.add_argument("--c2-type", default="cobalt_strike", 
                    choices=["cobalt_strike", "sliver"],  # Add your C2 type here
                    help="C2 framework type")

# In the main function:
# Create the appropriate parser based on C2 type
if args.c2_type == "cobalt_strike":
    parser = CobalStrikeParser(
        os.getcwd(),
        args.historical_days,
        args.max_tracked_days
    )
elif args.c2_type == "sliver":  # Add your C2 type here
    parser = SliverParser(
        os.getcwd(),
        args.historical_days,
        args.max_tracked_days
    )
```

### 3. Test Your Parser

1. **Manual Testing**:
   - Run the script with debug logging enabled:
     ```bash
     python log_exporter.py --api-key YOUR_KEY --clio-url YOUR_URL --c2-type sliver --debug
     ```
   - Check the log output to ensure your parser is correctly identifying and processing log files

2. **Automated Testing**:
   - Create test cases for your parser
   - Test with sample log files from your C2 framework

## Parser Implementation Guidelines

When implementing a parser for a C2 framework, follow these best practices:

### 1. Log Format Analysis

Analyze the C2 framework's log format carefully:
- Where are logs stored?
- Are logs organized by date, session, or another structure?
- What's the format of individual log entries?
- What information needs to be extracted?

### 2. Command Identification

Focus on extracting commands that should be sent to Clio:
- Operator/user commands are usually the most important
- System messages or status updates may not need to be logged

### 3. Data Extraction

Extract the information needed by Clio:
- Required fields: hostname, username, command
- Optional fields: notes, domain, IP addresses, etc.

### 4. Performance Considerations

- Use efficient regex patterns for log parsing
- Keep track of processed lines to avoid reprocessing
- Respect the `max_tracked_days` parameter to manage resource usage

### 5. Error Handling

- Implement robust error handling for file access issues
- Handle unexpected log formats gracefully
- Log errors with enough detail for troubleshooting

## Example: Parsing Different Log Formats

Different C2 frameworks have different log formats. Here are some examples of how to handle them:

### Example 1: Timestamp-based logs

```
[2023-11-01 14:32:45] Session 1234 (user@host) executed: whoami
```

Regex pattern:
```python
self.log_pattern = re.compile(r"\[(.*?)\] Session (\d+) \((.+?)@(.+?)\) executed: (.*)")
```

### Example 2: JSON-formatted logs

```json
{"timestamp":"2023-11-01T14:32:45", "session_id":"1234", "user":"admin", "host":"victim", "command":"whoami"}
```

Parsing approach:
```python
import json

def parse_log_file(self, log_file, processed_lines):
    # ... initialization code ...
    
    with open(log_file, 'r') as f:
        for i, line in enumerate(f):
            if i < processed_lines.get(log_file, 0):
                continue
                
            try:
                # Parse JSON log entry
                log_entry = json.loads(line)
                
                # Create entry for Clio
                entry = {
                    "hostname": log_entry.get("host", ""),
                    "username": log_entry.get("user", ""),
                    "command": log_entry.get("command", ""),
                    # ... other fields ...
                }
                
                new_entries.append(entry)
            except json.JSONDecodeError:
                self.logger.warning(f"Invalid JSON in log file {log_file} at line {i+1}")
                
    # ... update processed_lines and return ...
```

## Conclusion

By following this guide, you should be able to create a parser for any C2 framework and integrate it with the C2 Log Forwarder. Remember that the key is to understand the log format of your C2 framework and extract the necessary information for Clio.

If you develop a parser for a new C2 framework, consider contributing it back to the project to benefit the community!