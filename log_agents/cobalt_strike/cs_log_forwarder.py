#!/usr/bin/env python3

import os
import re
import sys
import time
import json
import pickle
import signal
import logging
import argparse
import traceback
import requests
from datetime import datetime, timedelta
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

# Create a dedicated folder for all generated files
def setup_data_directory(data_dir="clio_forwarder"):
    """Create and return the data directory path"""
    # Create the data directory if it doesn't exist
    if not os.path.exists(data_dir):
        try:
            os.makedirs(data_dir)
            print(f"Created data directory: {data_dir}")
        except Exception as e:
            print(f"Error creating data directory: {e}")
            # Fall back to current directory if we can't create the folder
            data_dir = "."
    return data_dir

# Data directory setup
DATA_DIR = setup_data_directory()

# Setup logging to file in the data directory
log_file = os.path.join(DATA_DIR, "cs_log_forwarder.log")
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_file),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("BeaconForwarder")

class BeaconLogForwarder:
    def __init__(self, api_key, clio_url, historical_days=0, poll_interval=10, state_file=None, verify_ssl=True, max_tracked_days=2):
        self.api_key = api_key
        self.clio_url = clio_url.rstrip("/")
        self.poll_interval = poll_interval
        self.historical_days = historical_days
        self.verify_ssl = verify_ssl
        self.max_tracked_days = max_tracked_days  # Max number of days to keep observers for
        
        # Set up paths relative to the Cobalt Strike root
        self.cs_logs_base_dir = os.path.join(os.getcwd(), "logs")
        
        # Use the provided state file or default to the data directory
        if state_file:
            self.state_file = state_file
        else:
            self.state_file = os.path.join(DATA_DIR, "forwarder_state.pkl")
            
        self.processed_lines = {}  # Track processed lines by file
        self.file_metadata = {}    # Track file sizes and modification times
        self.running = True        # Control flag for main loop
        
        # Track observers by directory
        self.observers = {}        # Map from directory to observer
        self.last_observer_cleanup = datetime.now()
        
        # Clio API endpoint for log ingestion
        self.ingest_url = f"{self.clio_url}/ingest/logs"
        
        # Main regex pattern for parsing Beacon commands
        # Format: [time] Beacon ID (user@host): command
        self.beacon_cmd_regex = re.compile(r"\[(.*?)\]\s+Beacon\s+(\d+)\s+\((.+?)(?:@|\s+)(.+?)\):\s+(.*)")
        
        # Clean up any stale lock files at startup
        self.cleanup_stale_locks()
        
        # Load previous state if available
        self.load_state()
        
        # Prune old entries from state
        self.prune_old_state_entries()
        
        logger.info(f"Initialized Beacon Log Forwarder:")
        logger.info(f"- Working directory: {os.getcwd()}")
        logger.info(f"- Logs base directory: {self.cs_logs_base_dir}")
        logger.info(f"- Historical days to process: {historical_days}")
        logger.info(f"- Max tracked days: {max_tracked_days}")
        logger.info(f"- Polling interval: {poll_interval} seconds")
        logger.info(f"- State file: {self.state_file}")
        logger.info(f"- Log file: {log_file}")
        logger.info(f"- SSL verification: {'Disabled' if not verify_ssl else 'Enabled'}")
        
    def cleanup_stale_locks(self):
        """Clean up any stale lock files from previous runs"""
        try:
            lock_count = 0
            for filename in os.listdir(DATA_DIR):
                if filename.endswith('.lock') or filename.endswith('.process.lock'):
                    lock_path = os.path.join(DATA_DIR, filename)
                    try:
                        os.remove(lock_path)
                        lock_count += 1
                    except Exception as e:
                        logger.error(f"Failed to remove stale lock file {lock_path}: {str(e)}")
            
            if lock_count > 0:
                logger.info(f"Cleaned up {lock_count} stale lock files")
        except Exception as e:
            logger.error(f"Error cleaning up stale locks: {str(e)}")
        
    def save_state(self):
        """Save the current processing state to disk"""
        try:
            # Create a backup of the current state file if it exists
            if os.path.exists(self.state_file):
                backup_file = f"{self.state_file}.bak"
                try:
                    # Copy the current state to a backup file
                    with open(self.state_file, 'rb') as src, open(backup_file, 'wb') as dst:
                        dst.write(src.read())
                except Exception as e:
                    logger.error(f"Failed to create state backup: {str(e)}")
            
            with open(self.state_file, 'wb') as f:
                # Use absolute file paths in the state dictionary to avoid ambiguity
                processed_lines_with_abs_path = {}
                for file_path, lines in self.processed_lines.items():
                    # Convert to absolute path if not already
                    abs_path = os.path.abspath(file_path)
                    processed_lines_with_abs_path[abs_path] = lines
                
                # Save both processed lines and file metadata    
                pickle.dump({
                    'processed_lines': processed_lines_with_abs_path,
                    'file_metadata': self.file_metadata,
                    'last_run': datetime.now().isoformat()
                }, f)
            logger.debug(f"State saved to {self.state_file}")
        except Exception as e:
            logger.error(f"Failed to save state: {str(e)}")
    
    def load_state(self):
        """Load the previous processing state from disk"""
        try:
            if os.path.exists(self.state_file):
                with open(self.state_file, 'rb') as f:
                    state = pickle.load(f)
                    
                    # Convert keys to absolute paths if they aren't already
                    processed_lines = state.get('processed_lines', {})
                    self.processed_lines = {}
                    
                    for file_path, lines in processed_lines.items():
                        abs_path = os.path.abspath(file_path)
                        self.processed_lines[abs_path] = lines
                    
                    # Load file metadata if present
                    self.file_metadata = state.get('file_metadata', {})
                        
                    last_run = state.get('last_run')
                    logger.info(f"Loaded previous state from {self.state_file}")
                    if last_run:
                        logger.info(f"Last run: {last_run}")
                    logger.info(f"Tracking {len(self.processed_lines)} previously processed files")
                    
                    # Log the details of each file being tracked for debugging
                    for file_path, lines in self.processed_lines.items():
                        logger.debug(f"Tracking file: {file_path} with {lines} processed lines")
        except Exception as e:
            logger.error(f"Failed to load state: {str(e)}")
            logger.info("Starting with fresh state")
            self.processed_lines = {}
            self.file_metadata = {}
    
    def prune_old_state_entries(self):
        """Remove entries for files older than max_tracked_days from the state"""
        try:
            today = datetime.now().date()
            cutoff_date = today - timedelta(days=self.max_tracked_days)
            cutoff_str = cutoff_date.strftime("%Y-%m-%d")
            
            # Find files to prune based on path pattern (looking for date directories)
            files_to_prune = []
            for file_path in list(self.processed_lines.keys()):
                dir_path = os.path.dirname(file_path)
                dir_name = os.path.basename(dir_path)
                
                # Check if the directory name looks like a date older than cutoff
                if re.match(r'^\d{4}-\d{2}-\d{2}$', dir_name) and dir_name < cutoff_str:
                    files_to_prune.append(file_path)
            
            # Also check file metadata
            for file_path in list(self.file_metadata.keys()):
                dir_path = os.path.dirname(file_path)
                dir_name = os.path.basename(dir_path)
                
                if re.match(r'^\d{4}-\d{2}-\d{2}$', dir_name) and dir_name < cutoff_str:
                    if file_path not in files_to_prune:  # Avoid duplicates
                        files_to_prune.append(file_path)
            
            # Remove the old entries
            pruned_count = 0
            for file_path in files_to_prune:
                if file_path in self.processed_lines:
                    del self.processed_lines[file_path]
                    pruned_count += 1
                
                if file_path in self.file_metadata:
                    del self.file_metadata[file_path]
            
            if pruned_count > 0:
                logger.info(f"Pruned {pruned_count} entries for files older than {cutoff_str}")
                # Save the updated state to disk
                self.save_state()
                
        except Exception as e:
            logger.error(f"Error pruning old state entries: {str(e)}")
            logger.error(traceback.format_exc())
            
    def get_log_directories(self):
        """Get all log directories to monitor, including historical ones if specified"""
        log_dirs = []
        
        # Verify the base logs directory exists
        if not os.path.exists(self.cs_logs_base_dir):
            logger.error(f"Logs base directory does not exist: {self.cs_logs_base_dir}")
            logger.error(f"Make sure you're running this script from the Cobalt Strike root directory.")
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
        logger.info(f"Found {len(existing_dirs)} log directories to monitor:")
        for d in existing_dirs:
            logger.info(f"  - {d}")
            
        return existing_dirs
        
    def test_connection(self):
        """Test the connection to the Clio API"""
        try:
            resp = requests.get(
                f"{self.clio_url}/api/ingest/status",
                headers={"X-API-Key": self.api_key},
                verify=self.verify_ssl,
                timeout=10  # Add timeout to prevent hanging indefinitely
            )
            
            if resp.status_code == 200:
                logger.info(f"✅ Connected to Clio API: {resp.json()}")
                return True
            else:
                logger.error(f"❌ Failed to connect to Clio API: {resp.status_code}")
                logger.error(resp.text)
                return False
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ Error connecting to Clio API: {str(e)}")
            return False
        except Exception as e:
            logger.error(f"❌ Unexpected error testing connection: {str(e)}")
            return False
    
    def parse_beacon_log(self, log_file):
        """Parse a Beacon log file and extract command entries only"""
        # Convert to absolute path for consistency
        abs_log_file = os.path.abspath(log_file)
        
        # Get previously processed lines count
        if abs_log_file not in self.processed_lines:
            self.processed_lines[abs_log_file] = 0
        
        line_count = 0
        new_entries = []
        
        logger.debug(f"Starting to parse file: {abs_log_file}")
        logger.debug(f"Previously processed {self.processed_lines.get(abs_log_file, 0)} lines")
        
        try:
            with open(abs_log_file, 'r', encoding='utf-8', errors='replace') as f:
                lines = f.readlines()
                
                logger.debug(f"File contains {len(lines)} lines total")
                
                # If we've already processed all lines in this file, skip it
                if self.processed_lines[abs_log_file] >= len(lines):
                    logger.debug(f"No new lines to process in {abs_log_file}")
                    return []
                
                # Skip already processed lines
                for i in range(self.processed_lines[abs_log_file], len(lines)):
                    line = lines[i]
                    line_count = i + 1
                    
                    logger.debug(f"Processing line {i+1}: {line[:50]}...")
                    
                    # Match only user commands to beacons
                    cmd_match = self.beacon_cmd_regex.match(line)
                    if cmd_match:
                        logger.debug(f"  ✓ Line matched command pattern")
                        timestamp, beacon_id, username, hostname, command = cmd_match.groups()
                        
                        logger.debug(f"  Extracted: timestamp={timestamp}, beacon_id={beacon_id}, username={username}, hostname={hostname}")
                        logger.debug(f"  Command: {command}")
                        
                        # Parse domain if present
                        domain = ""
                        if '\\' in username:
                            domain, username = username.split('\\')
                            logger.debug(f"  Parsed domain from username: domain={domain}, username={username}")
                        elif '/' in username:
                            domain, username = username.split('/')
                            logger.debug(f"  Parsed domain from username: domain={domain}, username={username}")
                        
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
                        
                        logger.debug(f"  Created entry: {entry}")
                        new_entries.append(entry)
                    else:
                        logger.debug(f"  ✗ Line did not match command pattern")
            
            logger.debug(f"Finished parsing file. Found {len(new_entries)} new command entries.")
            
            # Update processed lines count with full absolute path
            self.processed_lines[abs_log_file] = line_count
            
            # Save state periodically after processing large files
            if new_entries and (len(new_entries) > 25 or line_count > 100):
                self.save_state()
                
            return new_entries
                
        except Exception as e:
            logger.error(f"Error parsing log file {abs_log_file}: {str(e)}")
            logger.error(traceback.format_exc())
            return []

    def send_logs_to_clio(self, logs):
        """Send logs to the Clio API"""
        if not logs:
            return
        
        try:
            # Debug: Print what we're about to send
            logger.debug(f"Preparing to send {len(logs)} logs to Clio")
            logger.debug(f"First log entry: {json.dumps(logs[0], indent=2)}")
            
            # Split into batches if there are many logs
            batch_size = 25  # Clio has a batch limit of 50, using 25 to be safe
            for i in range(0, len(logs), batch_size):
                batch = logs[i:i+batch_size]
                
                max_retries = 3
                retry_delay = 5  # seconds
                
                for attempt in range(max_retries):
                    try:
                        # IMPORTANT CHANGE: Try sending one log at a time instead of a batch
                        # This helps debug which specific log might be causing issues
                        for log_entry in batch:
                            logger.debug(f"Sending JSON payload: {json.dumps(log_entry)}")
                            resp = requests.post(
                                self.ingest_url,
                                headers={
                                    "X-API-Key": self.api_key,
                                    "Content-Type": "application/json"
                                },
                                json=log_entry,  # Send one log at a time
                                verify=self.verify_ssl,
                                timeout=30
                            )
                            
                            # Log the full response for debugging
                            logger.debug(f"Response status: {resp.status_code}")
                            logger.debug(f"Response body: {resp.text}")
                            
                            if resp.status_code in (200, 201, 207):
                                result = resp.json()
                                logger.info(f"✅ Sent log entry to Clio: {result.get('message', 'Success')}")
                            else:
                                logger.error(f"❌ Failed to send log entry (attempt {attempt+1}/{max_retries}): {resp.status_code}")
                                logger.error(f"Failed entry: {json.dumps(log_entry)}")
                                logger.error(resp.text)
                        
                        # Break the retry loop if we got here
                        break
                    except requests.exceptions.RequestException as e:
                        logger.error(f"❌ Network error (attempt {attempt+1}/{max_retries}): {str(e)}")
                        if attempt < max_retries - 1:
                            logger.info(f"Retrying in {retry_delay} seconds...")
                            time.sleep(retry_delay)
                        else:
                            logger.error("Max retries reached, giving up on this batch")
                            return False
                
            return True
                
        except Exception as e:
            logger.error(f"❌ Error sending logs: {str(e)}")
            logger.error(traceback.format_exc())
            return False

    def process_log_file(self, log_file):
        """Process a single beacon log file"""
        # Convert to absolute path
        abs_log_file = os.path.abspath(log_file)
        
        if not os.path.exists(abs_log_file):
            return
            
        # Only process files that look like beacon logs
        file_name = os.path.basename(abs_log_file)
        if not file_name.startswith("beacon_") and "beacon" not in file_name.lower():
            return
        
        # Check if the file is in a directory that's too old
        dir_path = os.path.dirname(abs_log_file)
        dir_name = os.path.basename(dir_path)
        
        # If it's in a date directory older than max_tracked_days, skip it
        today = datetime.now().date()
        cutoff_date = today - timedelta(days=self.max_tracked_days)
        cutoff_str = cutoff_date.strftime("%Y-%m-%d")
        
        if re.match(r'^\d{4}-\d{2}-\d{2}$', dir_name) and dir_name < cutoff_str:
            logger.debug(f"Skipping file in outdated directory: {abs_log_file}")
            return
        
        # Use a lock to ensure only one thread processes this file at a time
        lock_path = os.path.join(DATA_DIR, f"{file_name}.process.lock")
        
        try:
            # Check if another process is already working on this file
            if os.path.exists(lock_path):
                logger.debug(f"File {abs_log_file} is already being processed, skipping")
                return
                
            # Create the lock file
            with open(lock_path, 'w') as f:
                f.write(str(time.time()))
            
            try:
                entries = self.parse_beacon_log(abs_log_file)
                if entries:
                    result = self.send_logs_to_clio(entries)
                    if result:
                        logger.info(f"Processed {len(entries)} entries from {abs_log_file}")
                        
                        # Update file metadata after successful processing
                        self.file_metadata[abs_log_file] = {
                            'size': os.path.getsize(abs_log_file),
                            'mtime': os.path.getmtime(abs_log_file)
                        }
                        
                        # Save state immediately after processing
                        self.save_state()
            finally:
                # Always remove the lock file when done
                if os.path.exists(lock_path):
                    os.remove(lock_path)
                    
        except Exception as e:
            logger.error(f"Error processing {abs_log_file}: {str(e)}")
            logger.error(traceback.format_exc())

    def scan_directories(self):
        """Scan all relevant log directories for beacon logs"""
        try:
            log_dirs = self.get_log_directories()
            files_processed = 0
            
            for log_dir in log_dirs:
                if not os.path.exists(log_dir):
                    continue
                    
                for file in os.listdir(log_dir):
                    if file.startswith("beacon_") or "beacon" in file.lower():
                        if file.endswith('.log'):
                            log_file = os.path.join(log_dir, file)
                            abs_log_file = os.path.abspath(log_file)
                            
                            # Check if the file has been modified since we last processed it
                            try:
                                current_size = os.path.getsize(abs_log_file)
                                last_modified = os.path.getmtime(abs_log_file)
                                
                                if abs_log_file in self.file_metadata:
                                    old_size = self.file_metadata[abs_log_file].get('size', 0)
                                    old_mtime = self.file_metadata[abs_log_file].get('mtime', 0)
                                    
                                    # Only process if file has changed
                                    if current_size > old_size or last_modified > old_mtime:
                                        logger.debug(f"File has changed: {abs_log_file}")
                                        logger.debug(f"  Old size: {old_size}, New size: {current_size}")
                                        logger.debug(f"  Old mtime: {old_mtime}, New mtime: {last_modified}")
                                        self.process_log_file(log_file)
                                        files_processed += 1
                                else:
                                    # First time seeing this file
                                    logger.debug(f"Processing new file: {abs_log_file}")
                                    self.process_log_file(log_file)
                                    files_processed += 1
                            except Exception as e:
                                logger.error(f"Error checking file status: {abs_log_file}, {str(e)}")
            
            # Only save state if we actually processed files
            if files_processed > 0:
                logger.debug(f"Processed {files_processed} files during directory scan")
                self.save_state()
            else:
                logger.debug("No changes detected during directory scan")
                
        except Exception as e:
            logger.error(f"Error scanning directories: {str(e)}")
            logger.error(traceback.format_exc())
    
    def setup_observer(self, directory):
        """Set up a file observer for a directory"""
        # Check if we already have an observer for this directory
        if directory in self.observers:
            logger.debug(f"Observer already exists for: {directory}")
            return
            
        if not os.path.exists(directory):
            logger.warning(f"Directory doesn't exist, skipping: {directory}")
            return
                
        logger.info(f"Setting up file watcher for: {directory}")
        event_handler = LogEventHandler(self)
        observer = Observer()
        observer.schedule(event_handler, path=directory, recursive=False)
        observer.start()
        # Store the observer with the directory as the key
        self.observers[directory] = observer
    
    def cleanup_observers(self):
        """Stop and remove observers for directories older than max_tracked_days"""
        today = datetime.now().date()
        cutoff_date = today - timedelta(days=self.max_tracked_days)
        cutoff_str = cutoff_date.strftime("%Y-%m-%d")
        
        directories_to_remove = []
        
        for directory, observer in self.observers.items():
            dir_name = os.path.basename(directory)
            if re.match(r'^\d{4}-\d{2}-\d{2}$', dir_name) and dir_name < cutoff_str:
                # This is an old date directory that should no longer be watched
                directories_to_remove.append(directory)
        
        for directory in directories_to_remove:
            logger.info(f"Removing observer for old directory: {directory}")
            observer = self.observers.pop(directory)
            observer.stop()
            observer.join()
        
        if directories_to_remove:
            logger.info(f"Removed {len(directories_to_remove)} observers for old directories")
    
    def signal_handler(self, sig, frame):
        """Handle termination signals gracefully"""
        logger.info(f"Received signal {sig}, shutting down...")
        self.running = False  # This will exit the main loop
    
    def check_log_rotation(self):
        """Check if we need to rotate our own logs"""
        try:
            log_path = log_file  # Using the global log_file variable
            
            # Check if log file exists and is larger than 5MB
            if os.path.exists(log_path) and os.path.getsize(log_path) > 5 * 1024 * 1024:
                # Create timestamped backup
                timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
                backup_path = f"{log_path}.{timestamp}"
                
                # Close and reopen the log file handlers
                for handler in logger.handlers[:]:
                    if isinstance(handler, logging.FileHandler) and handler.baseFilename == log_path:
                        handler.close()
                        logger.removeHandler(handler)
                
                # Rename the current log file
                os.rename(log_path, backup_path)
                
                # Create a new log file and add handler
                new_handler = logging.FileHandler(log_path)
                new_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
                logger.addHandler(new_handler)
                
                # Delete old log files if there are more than 5
                log_backups = [f for f in os.listdir(os.path.dirname(log_path)) 
                             if f.startswith(os.path.basename(log_path) + ".")]
                log_backups.sort()
                
                if len(log_backups) > 5:
                    for old_log in log_backups[:-5]:
                        try:
                            os.remove(os.path.join(os.path.dirname(log_path), old_log))
                            logger.info(f"Deleted old log file: {old_log}")
                        except Exception as e:
                            logger.error(f"Failed to delete old log file {old_log}: {str(e)}")
                
                logger.info(f"Rotated log file to {backup_path}")
        except Exception as e:
            logger.error(f"Error rotating log file: {str(e)}")
            # Continue anyway - log rotation failure shouldn't stop the program
    
    def start_monitoring(self):
        """Start monitoring beacon log files"""
        logger.info(f"🔍 Monitoring Cobalt Strike Beacon logs")
        logger.info(f"🔗 Forwarding to Clio at: {self.clio_url}")
        
        # Set up signal handlers for graceful shutdown
        signal.signal(signal.SIGINT, self.signal_handler)
        signal.signal(signal.SIGTERM, self.signal_handler)
        
        # First, test the connection
        if not self.test_connection():
            logger.error("Exiting due to connection issues.")
            return
        
        # Initial scan
        logger.info("Performing initial log scan...")
        self.scan_directories()
        
        # Set up a file system observer for each relevant directory
        log_dirs = self.get_log_directories()
        for log_dir in log_dirs:
            self.setup_observer(log_dir)
            
        # Also watch the base directory for new date directories
        base_handler = LogEventHandler(self)
        base_observer = Observer()
        base_observer.schedule(base_handler, path=self.cs_logs_base_dir, recursive=False)
        base_observer.start()
        self.observers['base'] = base_observer
        
        try:
            # Main loop - periodically scan for changes and for new directories
            last_observer_cleanup = datetime.now()
            
            while self.running:
                time.sleep(self.poll_interval)
                
                try:
                    # Check if it's time to clean up old observers (once per day)
                    now = datetime.now()
                    if (now - last_observer_cleanup).total_seconds() > 86400:  # 24 hours
                        logger.info("Performing maintenance tasks...")
                        # Clean up old observers
                        self.cleanup_observers()
                        # Prune old entries from state
                        self.prune_old_state_entries()
                        last_observer_cleanup = now
                    
                    # Update the list of log directories to monitor (in case a new day started)
                    log_dirs = self.get_log_directories()
                    
                    # Check for directories that need observers
                    for log_dir in log_dirs:
                        if os.path.exists(log_dir) and log_dir not in self.observers:
                            logger.info(f"Adding new observer for: {log_dir}")
                            self.setup_observer(log_dir)
                    
                    # Only scan if there might be modifications that the watchdog didn't catch
                    self.scan_directories()
                    
                    # Rotate our own logs if they get too large
                    self.check_log_rotation()
                    
                except Exception as e:
                    logger.error(f"Error in main monitoring loop: {str(e)}")
                    logger.error(traceback.format_exc())
                    # Continue with the next iteration
        except Exception as e:
            logger.error(f"Critical error in main loop: {str(e)}")
            logger.error(traceback.format_exc())
        finally:
            # Save the current state
            self.save_state()
            
            # Stop all observers
            logger.info("Stopping log monitoring...")
            for observer in observers:
                observer.stop()
                
            # Wait for all observer threads to finish
            for observer in observers:
                observer.join()
                
            logger.info("Log monitoring stopped.")


class LogEventHandler(FileSystemEventHandler):
    def __init__(self, forwarder):
        self.forwarder = forwarder
        
    def on_modified(self, event):
        if event.is_directory:
            return
        try:
            if (event.src_path.endswith('.log') and 
                ("beacon" in event.src_path.lower() or os.path.basename(event.src_path).startswith("beacon_"))):
                
                # Add a brief delay to let the file finish being written
                time.sleep(0.5)
                
                # Use a file lock to prevent multiple threads from processing the same file
                lock_file = os.path.join(DATA_DIR, f"{os.path.basename(event.src_path)}.lock")
                
                # Try to create a lock file
                try:
                    if os.path.exists(lock_file):
                        logger.debug(f"Another process is already handling {event.src_path}, skipping")
                        return
                        
                    # Create lock file
                    with open(lock_file, 'w') as f:
                        f.write(str(os.getpid()))
                    
                    logger.debug(f"File modification detected: {event.src_path}")
                    self.forwarder.process_log_file(event.src_path)
                finally:
                    # Always remove lock file when done
                    if os.path.exists(lock_file):
                        os.remove(lock_file)
                        
        except Exception as e:
            logger.error(f"Error handling file modification event: {str(e)}")

    def on_created(self, event):
        try:
            if event.is_directory:
                # New date directory might have been created
                if os.path.basename(event.src_path).startswith("20") and len(os.path.basename(event.src_path)) == 10:
                    logger.info(f"New date directory detected: {event.src_path}")
                    # Add a new observer for this directory
                    observers = []  # This is just a temporary list, we only care about the newly created observer
                    self.forwarder.setup_observer(event.src_path, observers)
                return
                
            if (event.src_path.endswith('.log') and 
                ("beacon" in event.src_path.lower() or os.path.basename(event.src_path).startswith("beacon_"))):
                logger.debug(f"New file created: {event.src_path}")
                self.forwarder.process_log_file(event.src_path)
        except Exception as e:
            logger.error(f"Error handling file creation event: {str(e)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Cobalt Strike Beacon Log Forwarder for Clio")
    parser.add_argument("--api-key", required=True, help="Clio API key")
    parser.add_argument("--clio-url", required=True, help="Clio URL (e.g., https://clio.example.com)")
    parser.add_argument("--historical-days", type=int, default=1, help="Number of historical days to process")
    parser.add_argument("--interval", type=int, default=5, help="Polling interval in seconds")
    parser.add_argument("--data-dir", default="clio_forwarder", help="Directory for storing logs and state")
    parser.add_argument("--insecure-ssl", action="store_true", help="Disable SSL certificate verification")
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")
    
    args = parser.parse_args()
    
    # Set up the data directory
    DATA_DIR = setup_data_directory(args.data_dir)
    
    # Update the log file location
    log_file = os.path.join(DATA_DIR, "cs_log_forwarder.log")
    for handler in logger.handlers[:]:
        if isinstance(handler, logging.FileHandler):
            handler.close()
            logger.removeHandler(handler)
    logger.addHandler(logging.FileHandler(log_file))
    
    # Set debug level if requested
    if args.debug:
        logger.setLevel(logging.DEBUG)
    
    try:
        forwarder = BeaconLogForwarder(
            api_key=args.api_key,
            clio_url=args.clio_url,
            historical_days=args.historical_days,
            poll_interval=args.interval,
            state_file=os.path.join(DATA_DIR, "forwarder_state.pkl"),
            verify_ssl=not args.insecure_ssl
        )
        
        forwarder.start_monitoring()
    except KeyboardInterrupt:
        logger.info("Keyboard interrupt received, exiting...")
    except Exception as e:
        logger.critical(f"Unhandled exception: {str(e)}")
        logger.critical(traceback.format_exc())
        # Exit with error code
        sys.exit(1)