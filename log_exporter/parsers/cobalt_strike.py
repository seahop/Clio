import os
import re
import logging
import traceback
from datetime import datetime, timedelta

from parsers.base_parser import BaseLogParser

class CobalStrikeParser(BaseLogParser):
    """Parser for Cobalt Strike beacon logs"""
    
    def __init__(self, root_dir, historical_days=1, max_tracked_days=2, filter_mode="all"):
        super().__init__(root_dir, historical_days, max_tracked_days, filter_mode)
        
        # Set up paths relative to the Cobalt Strike root
        self.cs_logs_base_dir = os.path.join(self.root_dir, "logs")
        
        # Main regex pattern for parsing Beacon commands
        # Format: [time] Beacon ID (user@host): command
        self.beacon_cmd_regex = re.compile(r"\[(.*?)\]\s+Beacon\s+(\d+)\s+\((.+?)@(.+?)\):\s+(.*)")
        
        self.logger.info(f"Initialized Cobalt Strike Parser")
        self.logger.info(f"- Logs base directory: {self.cs_logs_base_dir}")
        self.logger.info(f"- Historical days to process: {self.historical_days}")
        self.logger.info(f"- Max tracked days: {self.max_tracked_days}")
    
    def get_base_directory(self):
        """Get the base directory that contains all logs"""
        return self.cs_logs_base_dir
    
    def get_log_directories(self):
        """Get all log directories to monitor, including historical ones if specified"""
        log_dirs = []
        
        # Verify the base logs directory exists
        if not os.path.exists(self.cs_logs_base_dir):
            self.logger.error(f"Logs base directory does not exist: {self.cs_logs_base_dir}")
            self.logger.error(f"Make sure you're running this script from the Cobalt Strike root directory.")
            return []
        
        # Get today's date
        today = datetime.now().date()
        
        # Always include today's directory
        today_str = today.strftime("%Y-%m-%d")
        today_dir = os.path.join(self.cs_logs_base_dir, today_str)
        log_dirs.append(today_dir)
        
        # Add yesterday's directory (always most relevant for recent activity)
        yesterday = today - timedelta(days=1)
        yesterday_str = yesterday.strftime("%Y-%m-%d")
        yesterday_dir = os.path.join(self.cs_logs_base_dir, yesterday_str)
        if os.path.exists(yesterday_dir):
            log_dirs.append(yesterday_dir)
        
        # Only add more historical directories if specifically requested AND they're within max_tracked_days
        if self.historical_days > 1:
            # Calculate how many additional days to include beyond yesterday
            additional_days = min(self.historical_days - 1, self.max_tracked_days - 1)
            if additional_days > 0:
                for i in range(2, additional_days + 2):  # Start from 2 days ago
                    past_date = today - timedelta(days=i)
                    past_dir = os.path.join(self.cs_logs_base_dir, past_date.strftime("%Y-%m-%d"))
                    if os.path.exists(past_dir):
                        log_dirs.append(past_dir)
        
        # Log all directories found
        existing_dirs = [d for d in log_dirs if os.path.exists(d)]
        self.logger.info(f"Found {len(existing_dirs)} log directories to monitor:")
        for d in existing_dirs:
            self.logger.info(f"  - {d}")
            
        return existing_dirs
    
    def is_valid_log_file(self, file_path):
        """Check if a file is a valid Cobalt Strike beacon log file"""
        if not os.path.exists(file_path) or os.path.isdir(file_path):
            return False
            
        # Only process files that look like beacon logs
        file_name = os.path.basename(file_path)
        if not file_name.endswith('.log'):
            return False
            
        if not (file_name.startswith("beacon_") or "beacon" in file_name.lower()):
            return False
        
        return True
    
    def parse_log_file(self, log_file, processed_lines):
        """Parse a Beacon log file and extract command entries only"""
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
                
                # Skip already processed lines
                for i in range(processed_lines[abs_log_file], len(lines)):
                    line = lines[i]
                    line_count = i + 1
                    
                    self.logger.debug(f"Processing line {i+1}: {line[:50]}...")
                    
                    # Match only user commands to beacons
                    cmd_match = self.beacon_cmd_regex.match(line)
                    if cmd_match:
                        self.logger.debug(f"  ✓ Line matched command pattern")
                        time_str, beacon_id, username, hostname, command = cmd_match.groups()
                        
                        self.logger.debug(f"  Extracted: time={time_str}, beacon_id={beacon_id}, username={username}, hostname={hostname}")
                        self.logger.debug(f"  Command: {command}")
                        
                        # Create ISO timestamp from the log date and time string
                        iso_timestamp = self.create_iso_timestamp(log_date, time_str)
                        
                        # Create the log entry with the timestamp
                        # No longer splitting domain\user - keeping as username
                        entry = {
                            "timestamp": iso_timestamp,
                            "hostname": hostname,
                            "username": username,  # Keep domain\user together in username field
                            "command": command,
                            "notes": f"Beacon ID: {beacon_id}, Local time: {time_str}",
                            "filename": "",
                            "status": "",
                            "internal_ip": "",
                            "external_ip": ""
                        }
                        
                        # Check if entry should be excluded or filtered
                        if self.should_exclude_entry(entry):
                            self.logger.debug(f"  ✗ Entry excluded: {command}")
                            continue
                            
                        if not self.is_significant_command(command):
                            self.logger.debug(f"  ✗ Command filtered as insignificant: {command}")
                            continue
                            
                        self.logger.debug(f"  Created entry: {entry}")
                        new_entries.append(entry)
                    else:
                        self.logger.debug(f"  ✗ Line did not match command pattern")
            
            self.logger.debug(f"Finished parsing file. Found {len(new_entries)} new command entries.")
            
            # Update processed lines count with full absolute path
            processed_lines[abs_log_file] = line_count
                
            return new_entries
                
        except Exception as e:
            self.logger.error(f"Error parsing log file {abs_log_file}: {str(e)}")
            self.logger.error(traceback.format_exc())
            return []
    
    def extract_date_from_path(self, file_path):
        """Extract the date from a log file path (e.g., logs/2025-03-31/beacon_123.log)"""
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