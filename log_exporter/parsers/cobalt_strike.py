import os
import re
import logging
import traceback
from datetime import datetime, timedelta

from parsers.base_parser import BaseLogParser

class CobalStrikeParser(BaseLogParser):
    """Parser for Cobalt Strike beacon logs"""
    
    def __init__(self, root_dir, historical_days=1, max_tracked_days=2):
        super().__init__(root_dir, historical_days, max_tracked_days)
        
        # Set up paths relative to the Cobalt Strike root
        self.cs_logs_base_dir = os.path.join(self.root_dir, "logs")
        
        # Main regex pattern for parsing Beacon commands
        # Format: [time] Beacon ID (user@host): command
        self.beacon_cmd_regex = re.compile(r"\[(.*?)\]\s+Beacon\s+(\d+)\s+\((.+?)(?:@|\s+)(.+?)\):\s+(.*)")
        
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
                        timestamp, beacon_id, username, hostname, command = cmd_match.groups()
                        
                        self.logger.debug(f"  Extracted: timestamp={timestamp}, beacon_id={beacon_id}, username={username}, hostname={hostname}")
                        self.logger.debug(f"  Command: {command}")
                        
                        # Parse domain if present
                        domain = ""
                        if '\\' in username:
                            domain, username = username.split('\\')
                            self.logger.debug(f"  Parsed domain from username: domain={domain}, username={username}")
                        elif '/' in username:
                            domain, username = username.split('/')
                            self.logger.debug(f"  Parsed domain from username: domain={domain}, username={username}")
                        
                        # Create the log entry with only the essential information
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
                        
                        # Only add domain if we found it
                        if domain:
                            entry["domain"] = domain
                        
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