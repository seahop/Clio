import os
import re
import json
import logging
import traceback
from datetime import datetime, timedelta

from parsers.base_parser import BaseLogParser

class SliverParser(BaseLogParser):
    """
    Parser for Sliver C2 logs
    
    This parser is optimized to extract only actual commands sent to sessions/beacons,
    filtering out noise and system messages to reduce verbosity.
    """
    
    def __init__(self, root_dir, historical_days=1, max_tracked_days=2, filter_mode="all"):
        super().__init__(root_dir, historical_days, max_tracked_days, filter_mode)
        
        # Set up paths relative to the Sliver root
        self.sliver_logs_base_dir = os.path.join(self.root_dir, "logs")
        
        # Define a mapping of session IDs to hostnames/IPs for context enrichment
        self.session_metadata = {}  # Format: {session_id: {'hostname': X, 'ip': Y, 'username': Z}}
        
        # Regex for UUID-style session IDs
        self.session_id_regex = re.compile(r'([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})')
        
        # Pattern for "Executing command: X" in session logs
        self.executing_cmd_regex = re.compile(r'Executing command: (.*?)(?:\s+(?:completed|finished|output|on|against|in|with).*|$)')
        
        # Pattern for file operations
        self.file_operation_regex = re.compile(r'(Starting file (?:download|upload)): (.+?)(?:\s|$)')
        
        # Pattern for client/console commands (to match only actual commands)
        # Modified to exclude 'use' commands
        self.client_cmd_regex = re.compile(r'\[(client|console)\] ((?:shell|ls|cd|pwd|rm|download|upload|screenshot|execute|ps|mkdir|cat|kill) .+?)$')
        
        # Pattern to identify commands that are just output or status messages
        # Updated to include more types of output messages
        self.command_output_regex = re.compile(r'(?:File listing:|Command (?:completed|output)|Downloaded|Screenshot saved|Welcome to|NT AUTHORITY|uid=|Session (?:terminated|backgrounded)|Interactive mode|Taking screenshot|use\s+[a-f0-9-]+|download complete|File download complete)')
        
        # We now use the command_filters.py module for exclusions
        
        # Initialize the parser
        self.logger.info(f"Initialized Sliver Parser")
        self.logger.info(f"- Working directory: {os.getcwd()}")
        self.logger.info(f"- Logs base directory: {self.sliver_logs_base_dir}")
        self.logger.info(f"- Historical days to process: {self.historical_days}")
        self.logger.info(f"- Max tracked days: {self.max_tracked_days}")
    
    # We now use the centralized command_filters.py module instead of local definition
    # The base class will handle loading the Sliver-specific commands for us
    
    def get_base_directory(self):
        """Get the base directory that contains all logs"""
        return self.sliver_logs_base_dir
    
    def get_log_directories(self):
        """Get all log directories to monitor, including historical ones if specified"""
        log_dirs = []
        
        # Verify the base logs directory exists
        if not os.path.exists(self.sliver_logs_base_dir):
            self.logger.error(f"Logs base directory does not exist: {self.sliver_logs_base_dir}")
            self.logger.error(f"Make sure you're running this script from the Sliver root directory.")
            return []
        
        # With Sliver, logs might be organized differently:
        # - Some logs might be in the base logs directory
        # - Others might be in session-specific subdirectories
        # - Some might be in date-based directories like YYYY-MM-DD
        
        # Start by checking if there are any date-based directories
        today = datetime.now().date()
        has_date_dirs = False
        
        # Check if today's directory exists (to detect date-based structure)
        today_str = today.strftime("%Y-%m-%d")
        today_dir = os.path.join(self.sliver_logs_base_dir, today_str)
        if os.path.exists(today_dir) and os.path.isdir(today_dir):
            log_dirs.append(today_dir)
            has_date_dirs = True
            
            # If we have date-based directories, add historical ones too
            yesterday = today - timedelta(days=1)
            yesterday_str = yesterday.strftime("%Y-%m-%d")
            yesterday_dir = os.path.join(self.sliver_logs_base_dir, yesterday_str)
            if os.path.exists(yesterday_dir):
                log_dirs.append(yesterday_dir)
            
            # Add more historical directories if requested
            if self.historical_days > 1:
                additional_days = min(self.historical_days - 1, self.max_tracked_days - 1)
                if additional_days > 0:
                    for i in range(2, additional_days + 2):  # Start from 2 days ago
                        past_date = today - timedelta(days=i)
                        past_dir = os.path.join(self.sliver_logs_base_dir, past_date.strftime("%Y-%m-%d"))
                        if os.path.exists(past_dir):
                            log_dirs.append(past_dir)
        
        # Always add the base directory itself
        if self.sliver_logs_base_dir not in log_dirs:
            log_dirs.append(self.sliver_logs_base_dir)
        
        # Check for common subdirectories
        for subdir in ["sessions", "operators", "clients", "beacons", "implants"]:
            dir_path = os.path.join(self.sliver_logs_base_dir, subdir)
            if os.path.exists(dir_path) and os.path.isdir(dir_path):
                if dir_path not in log_dirs:
                    log_dirs.append(dir_path)
                
                # Also add any UUID-named subdirectories (session/operator IDs)
                for item in os.listdir(dir_path):
                    item_path = os.path.join(dir_path, item)
                    if os.path.isdir(item_path) and re.match(r'^[a-f0-9-]{8,36}$', item):
                        if item_path not in log_dirs:
                            log_dirs.append(item_path)
            
        # Log all directories found
        existing_dirs = [d for d in log_dirs if os.path.exists(d)]
        self.logger.info(f"Found {len(existing_dirs)} log directories to monitor:")
        for d in existing_dirs:
            self.logger.info(f"  - {d}")
            
        return existing_dirs
    
    def is_valid_log_file(self, file_path):
        """Check if a file is a valid Sliver log file"""
        if not os.path.exists(file_path) or os.path.isdir(file_path):
            return False
            
        # Sliver logs typically have .log or .json extensions
        file_name = os.path.basename(file_path)
        if not (file_name.endswith('.log') or file_name.endswith('.json')):
            return False
        
        # Skip files that are clearly not command logs
        skip_patterns = ['debug', 'error', 'system', 'startup', 'shutdown', 'heartbeat']
        if any(pattern in file_name.lower() for pattern in skip_patterns):
            return False
            
        # Check if filename contains a session ID
        if re.search(self.session_id_regex, file_name):
            return True
            
        # Check for common log names that might contain commands
        priority_logs = ['session', 'client', 'operator', 'console', 'sliver-server']
        if any(name in file_name.lower() for name in priority_logs):
            return True
            
        # If none of the above match, perform a quick content check of the first few lines
        try:
            with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                # Read just the first few lines to check format
                sample_content = ''.join([f.readline() for _ in range(5)])
                
                # Check if content suggests command activity
                command_indicators = [
                    'Executing command:', 'shell ', ' ls ', ' cd ', ' ps ', 
                    'download ', 'upload ', 'execute ', '[client]', '[console]',
                    'screenshot', 'session established', 'session '
                ]
                
                if any(indicator in sample_content for indicator in command_indicators):
                    return True
        except Exception as e:
            self.logger.debug(f"Error checking file content for {file_path}: {str(e)}")
            
        return False
    
    def extract_date_from_path(self, file_path):
        """Extract the date from a log file path"""
        try:
            # Try to find a date pattern in the path components
            path_parts = file_path.split(os.sep)
            for part in path_parts:
                # Look for YYYY-MM-DD pattern
                if re.match(r'^\d{4}-\d{2}-\d{2}$', part):
                    return part
            
            # If no date found in path, use today's date
            return datetime.now().strftime("%Y-%m-%d")
        except Exception as e:
            self.logger.error(f"Error extracting date from path {file_path}: {str(e)}")
            return datetime.now().strftime("%Y-%m-%d")
    
    def create_iso_timestamp(self, date_str, time_str):
        """
        Create an ISO format timestamp from date string and time string
        
        Args:
            date_str: String in format YYYY-MM-DD
            time_str: String in format HH:MM:SS
            
        Returns:
            String: ISO format timestamp (YYYY-MM-DDTHH:MM:SS)
        """
        try:
            # Clean up time string (remove milliseconds if present)
            clean_time = time_str.split('.')[0]
            
            # For short times like '00:01:23', ensure we have proper formatting
            time_parts = clean_time.split(':')
            if len(time_parts) == 3:
                # Full time with hours, minutes, seconds
                formatted_time = clean_time
            elif len(time_parts) == 2:
                # Missing seconds
                formatted_time = f"{clean_time}:00"
            else:
                # Invalid format, use current time
                formatted_time = datetime.now().strftime("%H:%M:%S")
            
            # Combine date and time
            timestamp = f"{date_str}T{formatted_time}"
            
            # Validate by parsing
            dt = datetime.fromisoformat(timestamp)
            
            # Return ISO format
            return dt.isoformat()
        except Exception as e:
            # If there's any error, fallback to current time
            self.logger.error(f"Error creating timestamp from {date_str} {time_str}: {str(e)}")
            return datetime.now().isoformat()
    
    def parse_log_file(self, log_file, processed_lines):
        """Parse a Sliver log file and extract only command entries"""
        # Convert to absolute path for consistency
        abs_log_file = os.path.abspath(log_file)
        
        # Get previously processed lines count
        if abs_log_file not in processed_lines:
            processed_lines[abs_log_file] = 0
        
        line_count = 0
        new_entries = []
        
        self.logger.debug(f"Starting to parse file: {abs_log_file}")
        self.logger.debug(f"Previously processed {processed_lines.get(abs_log_file, 0)} lines")
        
        try:
            # Extract date from log file path - needed for timestamps
            log_date = self.extract_date_from_path(abs_log_file)
            
            with open(abs_log_file, 'r', encoding='utf-8', errors='replace') as f:
                lines = f.readlines()
                
                self.logger.debug(f"File contains {len(lines)} lines total")
                
                # If we've already processed all lines in this file, skip it
                if processed_lines[abs_log_file] >= len(lines):
                    self.logger.debug(f"No new lines to process in {abs_log_file}")
                    return []
                
                # Determine log type - this helps with parsing strategy
                file_name = os.path.basename(abs_log_file)
                is_session_log = 'session' in file_name.lower() or re.search(self.session_id_regex, file_name)
                is_client_log = any(name in file_name.lower() for name in ['client', 'operator', 'console'])
                is_json_log = file_name.endswith('.json') or file_name.endswith('.json.log')
                
                # Try to find session ID from filename
                session_id = None
                session_match = self.session_id_regex.search(file_name)
                if session_match:
                    session_id = session_match.group(1)
                
                # Skip already processed lines
                for i in range(processed_lines[abs_log_file], len(lines)):
                    line = lines[i].strip()
                    line_count = i + 1
                    
                    if not line:  # Skip empty lines
                        continue
                        
                    self.logger.debug(f"Processing line {i+1}: {line[:100]}...")
                    
                    # Extract session metadata for context enrichment
                    self.extract_session_metadata(line)
                    
                    # Extract timestamp from line if present
                    timestamp_match = re.match(r'\[(.*?)\]', line)
                    time_str = timestamp_match.group(1) if timestamp_match else ""
                    
                    # Create ISO timestamp
                    iso_timestamp = self.create_iso_timestamp(log_date, time_str)
                    
                    # Parse JSON logs
                    if is_json_log or line.startswith('{'):
                        try:
                            log_entry = json.loads(line)
                            entry = self.parse_json_entry(log_entry, iso_timestamp)
                            if entry and not self.should_exclude_entry(entry):
                                # Check if this command is significant based on the filter mode
                                if self.is_significant_command(entry["command"]):
                                    new_entries.append(entry)
                                continue
                        except json.JSONDecodeError:
                            # Not JSON or invalid JSON, will process as text
                            pass
                    
                    # Parse session logs
                    if is_session_log:
                        entry = self.parse_session_line(line, session_id, iso_timestamp)
                        if entry and not self.should_exclude_entry(entry):
                            # Check if this command is significant based on the filter mode
                            if self.is_significant_command(entry["command"]):
                                new_entries.append(entry)
                            continue
                    
                    # Parse client/console logs
                    if is_client_log:
                        entry = self.parse_client_line(line, iso_timestamp)
                        if entry and not self.should_exclude_entry(entry):
                            # Check if this command is significant based on the filter mode
                            if self.is_significant_command(entry["command"]):
                                new_entries.append(entry)
                            continue
                    
                    # Generic parsing for any other lines that might contain commands
                    entry = self.parse_generic_line(line, iso_timestamp)
                    if entry and not self.should_exclude_entry(entry):
                        # Check if this command is significant based on the filter mode
                        if self.is_significant_command(entry["command"]):
                            new_entries.append(entry)
            
            # Update processed lines count
            processed_lines[abs_log_file] = line_count
            
            # Log the results
            if new_entries:
                self.logger.debug(f"Extracted {len(new_entries)} commands from {abs_log_file}")
            else:
                self.logger.debug(f"No commands found in {abs_log_file}")
                
            return new_entries
                
        except Exception as e:
            self.logger.error(f"Error parsing log file {abs_log_file}: {str(e)}")
            self.logger.error(traceback.format_exc())
            return []
    
    # We now use the base class implementation of should_exclude_entry
    # which leverages the centralized command_filters.py module
    
    def parse_json_entry(self, log_entry, default_timestamp=None):
        """Parse a JSON log entry and extract command if present"""
        message = log_entry.get('msg', log_entry.get('message', ''))
        timestamp = log_entry.get('timestamp', log_entry.get('time', default_timestamp))
        component = log_entry.get('component', log_entry.get('name', ''))
        
        # Look for session ID in the JSON
        session_id = log_entry.get('session_id', log_entry.get('beacon_id', None))
        if not session_id and message:
            session_match = self.session_id_regex.search(message)
            if session_match:
                session_id = session_match.group(1)
        
        # Check if this is a command execution entry
        if component == "command" and "Executing command:" in message:
            cmd_match = self.executing_cmd_regex.search(message)
            if cmd_match:
                command = cmd_match.group(1).strip()
                entry = self.create_basic_entry(command, timestamp)
                
                # Add session context if available
                if session_id:
                    entry["notes"] += f", Session: {session_id}"
                    self.add_session_context(entry, session_id)
                
                return entry
        
        # Check for file operations (only starting downloads/uploads, not completions)
        if component == "file-transfer" and "Starting file" in message:
            file_match = self.file_operation_regex.search(message)
            if file_match:
                operation = file_match.group(1)
                filepath = file_match.group(2)
                command = f"{operation}: {filepath}"
                
                entry = self.create_basic_entry(command, timestamp)
                
                # Set filename
                entry["filename"] = os.path.basename(filepath)
                
                # Add session context if available
                if session_id:
                    entry["notes"] += f", Session: {session_id}"
                    self.add_session_context(entry, session_id)
                
                return entry
        
        return None
    
    def parse_session_line(self, line, default_session_id=None, default_timestamp=None):
        """Parse a line from a session log"""
        # Extract timestamp if present
        timestamp_match = re.match(r'\[(.*?)\]', line)
        timestamp = timestamp_match.group(1) if timestamp_match else ""
        
        # Skip lines with output/status messages
        if self.command_output_regex.search(line):
            return None
        
        # Pattern for "Executing command: X" in session logs
        cmd_match = self.executing_cmd_regex.search(line)
        if cmd_match:
            command = cmd_match.group(1).strip()
            entry = self.create_basic_entry(command, default_timestamp or timestamp)
            
            # Try to find session ID in line if not provided
            session_id = default_session_id
            if not session_id:
                session_match = self.session_id_regex.search(line)
                if session_match:
                    session_id = session_match.group(1)
            
            # Add session context if available
            if session_id:
                entry["notes"] += f", Session: {session_id}"
                self.add_session_context(entry, session_id)
            
            # Extract username from the line if present
            username_match = re.search(r'User:\s+([^\s,;]+)', line)
            if username_match and not entry["username"]:
                entry["username"] = username_match.group(1)
            
            return entry
        
        # Check for file operations (only starting downloads/uploads, not completions)
        file_match = re.search(r'Starting file ((?:download|upload)): (.+?)(?:\s|$)', line)
        if file_match:
            operation = file_match.group(1)
            filepath = file_match.group(2)
            command = f"Starting file {operation}: {filepath}"
            
            entry = self.create_basic_entry(command, default_timestamp or timestamp)
            
            # Set filename
            entry["filename"] = os.path.basename(filepath)
            
            # Add session context if available
            if default_session_id:
                entry["notes"] += f", Session: {default_session_id}"
                self.add_session_context(entry, default_session_id)
            
            return entry
        
        # Check for "New session established" to get session metadata
        if "New session established from" in line:
            # Extract hostname and IP
            match = re.search(r'New session established from ([^\s(]+)\s+\(([^)]+)\)', line)
            if match:
                hostname = match.group(1)
                ip = match.group(2)
                
                # Find session ID
                session_id = default_session_id
                if not session_id:
                    session_match = self.session_id_regex.search(line)
                    if session_match:
                        session_id = session_match.group(1)
                
                if session_id:
                    # Update session metadata
                    if session_id not in self.session_metadata:
                        self.session_metadata[session_id] = {}
                    
                    self.session_metadata[session_id]["hostname"] = hostname
                    self.session_metadata[session_id]["ip"] = ip
        
        return None
    
    def parse_client_line(self, line, default_timestamp=None):
        """Parse a line from a client or console log"""
        # Extract timestamp if present
        timestamp_match = re.match(r'\[(.*?)\]', line)
        timestamp = timestamp_match.group(1) if timestamp_match else ""
        
        # Skip lines with output/status messages
        if self.command_output_regex.search(line):
            return None
        
        # Check for client/console commands
        client_match = self.client_cmd_regex.search(line)
        if client_match:
            component = client_match.group(1)  # "client" or "console"
            command = client_match.group(2).strip()
            
            entry = self.create_basic_entry(command, default_timestamp or timestamp)
            
            # Extract filename for file operations
            if any(op in command for op in ['download', 'upload']):
                file_match = re.search(r'(?:download|upload)\s+([^\s;|><]+)', command)
                if file_match:
                    entry["filename"] = os.path.basename(file_match.group(1))
            
            return entry
        
        return None
    
    def parse_generic_line(self, line, default_timestamp=None):
        """Fallback parser for any other line that might contain commands"""
        # Skip lines with output/status messages
        if self.command_output_regex.search(line):
            return None
            
        # Try to find commands in any other format
        for cmd_pattern in [
            r'shell\s+(.+?),  # shell commands
            r'execute\s+(.+?),  # execute commands
            r'run\s+(.+?),  # run commands
            r'download\s+(.+?)(?:\s|$)',  # download commands
            r'upload\s+(.+?)(?:\s|$)'  # upload commands
        ]:
            match = re.search(cmd_pattern, line)
            if match:
                # Extract timestamp if present
                timestamp_match = re.match(r'\[(.*?)\]', line)
                timestamp = timestamp_match.group(1) if timestamp_match else ""
                
                # Create command with the proper prefix
                prefix = cmd_pattern.split('\\')[0]
                command = f"{prefix} {match.group(1).strip()}"
                
                entry = self.create_basic_entry(command, default_timestamp or timestamp)
                
                # Look for session ID in the line
                session_match = self.session_id_regex.search(line)
                if session_match:
                    session_id = session_match.group(1)
                    entry["notes"] += f", Session: {session_id}"
                    self.add_session_context(entry, session_id)
                
                # Extract filename for file operations
                if any(op in prefix for op in ['download', 'upload']):
                    entry["filename"] = os.path.basename(match.group(1).split()[0])
                
                return entry
        
        return None
    
    def create_basic_entry(self, command, timestamp=""):
        """Create a basic log entry with the given command and timestamp"""
        # Create an entry with the specified timestamp (if provided)
        return {
            "timestamp": timestamp,  # Include ISO timestamp for the Clio API
            "hostname": "",
            "username": "",
            "command": command,
            "notes": f"Local time: {timestamp}" if timestamp else "",
            "filename": "",
            "status": "",
            "internal_ip": "",
            "external_ip": ""
        }
    
    def add_session_context(self, entry, session_id):
        """Add session context to an entry if available"""
        if session_id in self.session_metadata:
            metadata = self.session_metadata[session_id]
            
            if "hostname" in metadata and metadata["hostname"]:
                entry["hostname"] = metadata["hostname"]
                
            if "ip" in metadata and metadata["ip"]:
                entry["internal_ip"] = metadata["ip"]
                
            if "username" in metadata and metadata["username"]:
                entry["username"] = metadata["username"]
    
    def extract_session_metadata(self, line):
        """Extract session metadata from log entries to enrich command context"""
        try:
            # Find session ID
            session_match = self.session_id_regex.search(line)
            if not session_match:
                return
                
            session_id = session_match.group(1)
            
            # Initialize if this is a new session
            if session_id not in self.session_metadata:
                self.session_metadata[session_id] = {}
            
            # Extract hostname
            hostname_patterns = [
                r'from\s+([A-Za-z0-9_-]+)\s+\(',  # hostname in "from HOST (IP)"
                r'hostname\s+([^\s,;]+)',  # explicit hostname field
                r'registered with hostname\s+([^\s,;]+)'  # registration message
            ]
            
            for pattern in hostname_patterns:
                hostname_match = re.search(pattern, line)
                if hostname_match:
                    hostname = hostname_match.group(1)
                    # Don't overwrite existing hostname unless empty
                    if "hostname" not in self.session_metadata[session_id] or not self.session_metadata[session_id].get("hostname"):
                        self.session_metadata[session_id]["hostname"] = hostname
                    break
            
            # Extract IP address
            ip_patterns = [
                r'from\s+.*?\((\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\)',  # IP in "from HOST (IP)"
                r'(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})'  # any IP in the line
            ]
            
            for pattern in ip_patterns:
                ip_match = re.search(pattern, line)
                if ip_match:
                    ip = ip_match.group(1)
                    # Don't overwrite existing IP unless empty
                    if "ip" not in self.session_metadata[session_id] or not self.session_metadata[session_id].get("ip"):
                        self.session_metadata[session_id]["ip"] = ip
                    break
            
            # Extract username
            username_patterns = [
                r'User:\s+([^\s,;]+)',  # explicit User field
                r'user(?:name)?[\s:]+([^\s,;]+)',  # username field
                r'as user\s+([^\s,;]+)'  # "as user X" format
            ]
            
            for pattern in username_patterns:
                username_match = re.search(pattern, line)
                if username_match:
                    username = username_match.group(1)
                    # Don't overwrite existing username unless empty
                    if "username" not in self.session_metadata[session_id] or not self.session_metadata[session_id].get("username"):
                        self.session_metadata[session_id]["username"] = username
                    break
            
            # Special case for NT AUTHORITY\SYSTEM format
            if "NT AUTHORITY" in line and ("username" not in self.session_metadata[session_id] or not self.session_metadata[session_id].get("username")):
                nt_match = re.search(r'(NT AUTHORITY\\[A-Z]+)', line)
                if nt_match:
                    self.session_metadata[session_id]["username"] = nt_match.group(1)
                
        except Exception as e:
            self.logger.debug(f"Error extracting session metadata: {str(e)}")