import os
import time
import json
import pickle
import logging
import requests
import traceback
from datetime import datetime, timedelta
from watchdog.observers import Observer

from core.event_handler import LogEventHandler
from core.utils import rotate_logs, cleanup_stale_locks, create_lock_file, remove_lock_file
from core.rate_limit_queue import RateLimitQueue

class LogForwarder:
    """Main log forwarding engine that handles watching and sending logs to Clio"""
    
    def __init__(self, parser, api_key, clio_url, data_dir, poll_interval=5, verify_ssl=True, 
                 rate_limit=120, rate_window=60, max_queue_size=10000):
        self.parser = parser
        self.api_key = api_key
        self.clio_url = clio_url.rstrip("/")
        self.poll_interval = poll_interval
        self.verify_ssl = verify_ssl
        self.data_dir = data_dir
        
        # Initialize logger
        self.logger = logging.getLogger("LogForwarder")
        
        # Initialize basic variables
        self.state_file = os.path.join(data_dir, "forwarder_state.pkl")
        self.processed_lines = {}  # Track processed lines by file
        self.file_metadata = {}    # Track file sizes and modification times
        self.observers = {}        # Map from directory to observer
        self.last_observer_cleanup = datetime.now()
        self.running = True
        
        # Initialize the rate limit queue
        self.rate_queue = RateLimitQueue(
            rate_limit=rate_limit,
            rate_window=rate_window,
            max_queue_size=max_queue_size
        )
        
        # Clio API endpoint for log ingestion
        self.ingest_url = f"{self.clio_url}/ingest/logs"
        
        # Clean up any stale lock files at startup
        cleanup_stale_locks(self.data_dir)
        
        # Load previous state
        self.load_state()
        
        # Clean up old state entries
        self.prune_old_state_entries()
        
        self.logger.info(f"Initialized Log Forwarder:")
        self.logger.info(f"- Working directory: {os.getcwd()}")
        self.logger.info(f"- C2 Framework: {self.parser.__class__.__name__}")
        self.logger.info(f"- Data directory: {self.data_dir}")
        self.logger.info(f"- State file: {self.state_file}")
        self.logger.info(f"- Polling interval: {self.poll_interval} seconds")
        self.logger.info(f"- SSL verification: {'Disabled' if not verify_ssl else 'Enabled'}")
        self.logger.info(f"- Rate limit: {rate_limit} requests per {rate_window} seconds")
        self.logger.info(f"- Max queue size: {max_queue_size} entries")
    
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
                    self.logger.info(f"Loaded previous state from {self.state_file}")
                    if last_run:
                        self.logger.info(f"Last run: {last_run}")
                    self.logger.info(f"Tracking {len(self.processed_lines)} previously processed files")
        except Exception as e:
            self.logger.error(f"Failed to load state: {str(e)}")
            self.logger.info("Starting with fresh state")
            self.processed_lines = {}
            self.file_metadata = {}
    
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
                    self.logger.error(f"Failed to create state backup: {str(e)}")
            
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
            self.logger.debug(f"State saved to {self.state_file}")
        except Exception as e:
            self.logger.error(f"Failed to save state: {str(e)}")
    
    def prune_old_state_entries(self):
        """Remove entries for files older than max_tracked_days from the state"""
        try:
            # Get cutoff date from the parser
            cutoff_str = self.parser.get_cutoff_date_str()
            
            # Find files to prune based on path pattern (looking for date directories)
            files_to_prune = []
            
            # Find paths to prune in processed_lines and file_metadata
            for mapping in [self.processed_lines, self.file_metadata]:
                for file_path in list(mapping.keys()):
                    if self.parser.is_file_outdated(file_path, cutoff_str):
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
                self.logger.info(f"Pruned {pruned_count} entries for files older than {cutoff_str}")
                # Save the updated state to disk
                self.save_state()
                
        except Exception as e:
            self.logger.error(f"Error pruning old state entries: {str(e)}")
            self.logger.error(traceback.format_exc())
    
    def test_connection(self):
        """Test the connection to the Clio API"""
        try:
            resp = requests.get(
                f"{self.clio_url}/api/ingest/status",
                headers={"X-API-Key": self.api_key},
                verify=self.verify_ssl,
                timeout=10
            )
            
            if resp.status_code == 200:
                self.logger.info(f"✅ Connected to Clio API: {resp.json()}")
                return True
            elif resp.status_code == 429:
                # Rate limited
                self.logger.warning(f"⚠️ Connected to Clio API but received rate limit response")
                
                # Try to get reset information from response headers
                reset_seconds = None
                retry_after = resp.headers.get('Retry-After')
                if retry_after:
                    if retry_after.isdigit():
                        reset_seconds = int(retry_after)
                    else:
                        try:
                            # Try to parse as HTTP date
                            reset_time = datetime.strptime(retry_after, "%a, %d %b %Y %H:%M:%S %Z")
                            reset_seconds = (reset_time - datetime.now()).total_seconds()
                        except ValueError:
                            pass
                
                # Set rate limit in queue
                self.rate_queue.set_rate_limited(reset_seconds)
                
                return True  # Connection is valid, just rate limited
            else:
                self.logger.error(f"❌ Failed to connect to Clio API: {resp.status_code}")
                self.logger.error(resp.text)
                return False
        except requests.exceptions.RequestException as e:
            self.logger.error(f"❌ Error connecting to Clio API: {str(e)}")
            return False
        except Exception as e:
            self.logger.error(f"❌ Unexpected error testing connection: {str(e)}")
            return False
    
    def process_queued_logs(self):
        """Process logs from the queue if any are available and not rate limited"""
        try:
            queue_size = self.rate_queue.get_size()
            if queue_size == 0:
                return
            
            # Check if we're rate limited
            rate_limited, wait_seconds = self.rate_queue.is_rate_limited()
            if rate_limited:
                self.logger.debug(f"Rate limited, waiting {wait_seconds:.1f} seconds before processing queue")
                return
                
            # Try to send up to 10 logs at a time
            logs_to_send = self.rate_queue.get_queued_entries(max_count=10)
            if not logs_to_send:
                return
                
            self.logger.info(f"Processing {len(logs_to_send)} logs from queue (queue size: {queue_size})")
            self.send_logs_to_clio(logs_to_send)
        except Exception as e:
            self.logger.error(f"Error processing queued logs: {str(e)}")
            self.logger.error(traceback.format_exc())
    
    def send_logs_to_clio(self, logs):
        """Send logs to the Clio API"""
        if not logs:
            return True
        
        try:
            # Debug: Print what we're about to send
            self.logger.debug(f"Preparing to send {len(logs)} logs to Clio")
            if logs:
                # Log the first entry with special attention to the timestamp
                first_log = logs[0]
                self.logger.debug(f"First log entry with timestamp {first_log.get('timestamp', 'No timestamp')}: {json.dumps(first_log, indent=2)}")
            
            # Check for rate limiting before sending
            rate_limited, wait_seconds = self.rate_queue.is_rate_limited()
            if rate_limited:
                self.logger.info(f"Rate limited, queueing {len(logs)} logs (retry in {wait_seconds:.1f}s)")
                self.rate_queue.add_batch(logs)
                return False
                
            # Split into batches if there are many logs
            batch_size = 25  # Clio has a batch limit of 50, using 25 to be safe
            
            for i in range(0, len(logs), batch_size):
                batch = logs[i:i+batch_size]
                
                max_retries = 3
                retry_delay = 5  # seconds
                
                for attempt in range(max_retries):
                    try:
                        # IMPORTANT: Try sending one log at a time instead of a batch
                        # This helps debug which specific log might be causing issues
                        for log_entry in batch:
                            # Ensure each log entry has a timestamp
                            if 'timestamp' not in log_entry or not log_entry['timestamp']:
                                log_entry['timestamp'] = datetime.now().isoformat()
                                self.logger.warning(f"Missing timestamp, using current time: {log_entry['timestamp']}")
                            
                            self.logger.debug(f"Sending JSON payload with timestamp {log_entry.get('timestamp')}: {json.dumps(log_entry)}")
                            resp = requests.post(
                                self.ingest_url,
                                headers={
                                    "X-API-Key": self.api_key,
                                    "Content-Type": "application/json"
                                },
                                json=log_entry,
                                verify=self.verify_ssl,
                                timeout=30
                            )
                            
                            # Log the full response for debugging
                            self.logger.debug(f"Response status: {resp.status_code}")
                            self.logger.debug(f"Response body: {resp.text}")
                            
                            if resp.status_code in (200, 201, 207):
                                result = resp.json()
                                self.logger.info(f"✅ Sent log entry to Clio: {result.get('message', 'Success')}")
                                
                                # Track the request for rate limiting
                                self.rate_queue.track_request()
                            elif resp.status_code == 429:
                                # Rate limited - add to queue and stop processing
                                self.logger.warning(f"⚠️ Rate limited by Clio API")
                                
                                # Try to get reset information from response headers
                                reset_seconds = None
                                retry_after = resp.headers.get('Retry-After')
                                if retry_after:
                                    if retry_after.isdigit():
                                        reset_seconds = int(retry_after)
                                    else:
                                        try:
                                            # Try to parse as HTTP date
                                            reset_time = datetime.strptime(retry_after, "%a, %d %b %Y %H:%M:%S %Z")
                                            reset_seconds = (reset_time - datetime.now()).total_seconds()
                                        except ValueError:
                                            pass
                                
                                # Set rate limit in queue
                                self.rate_queue.set_rate_limited(reset_seconds)
                                
                                # Add remaining logs to queue
                                remaining_logs = batch[batch.index(log_entry):]
                                self.rate_queue.add_batch(remaining_logs)
                                return False
                            else:
                                self.logger.error(f"❌ Failed to send log entry (attempt {attempt+1}/{max_retries}): {resp.status_code}")
                                self.logger.error(f"Failed entry: {json.dumps(log_entry)}")
                                self.logger.error(resp.text)
                        
                        # Break the retry loop if we got here
                        break
                    except requests.exceptions.RequestException as e:
                        self.logger.error(f"❌ Network error (attempt {attempt+1}/{max_retries}): {str(e)}")
                        if attempt < max_retries - 1:
                            self.logger.info(f"Retrying in {retry_delay} seconds...")
                            time.sleep(retry_delay)
                        else:
                            self.logger.error("Max retries reached, giving up on this batch")
                            # Queue the remaining logs for later
                            self.rate_queue.add_batch(batch)
                            return False
                
            return True
                
        except Exception as e:
            self.logger.error(f"❌ Error sending logs: {str(e)}")
            self.logger.error(traceback.format_exc())
            
            # Queue the logs for retry
            self.rate_queue.add_batch(logs)
            return False

    def process_log_file(self, log_file):
        """Process a single log file"""
        # Convert to absolute path
        abs_log_file = os.path.abspath(log_file)
        
        if not os.path.exists(abs_log_file):
            return
        
        # Skip if the file is not a valid log file for this parser
        if not self.parser.is_valid_log_file(abs_log_file):
            return
        
        # Skip if the file is too old
        cutoff_str = self.parser.get_cutoff_date_str()
        if self.parser.is_file_outdated(abs_log_file, cutoff_str):
            self.logger.debug(f"Skipping file in outdated directory: {abs_log_file}")
            return
        
        # Use a lock to ensure only one thread processes this file at a time
        file_name = os.path.basename(abs_log_file)
        lock_path = os.path.join(self.data_dir, f"{file_name}.process.lock")
        
        # Skip if file is already being processed
        if os.path.exists(lock_path):
            self.logger.debug(f"File {abs_log_file} is already being processed, skipping")
            return
            
        # Create the lock file
        create_lock_file(lock_path)
        
        try:
            entries = self.parser.parse_log_file(abs_log_file, self.processed_lines)
            if entries:
                # Check if we're rate limited first
                rate_limited, wait_seconds = self.rate_queue.is_rate_limited()
                if rate_limited:
                    self.logger.info(f"Rate limited, queueing {len(entries)} entries (retry in {wait_seconds:.1f}s)")
                    self.rate_queue.add_batch(entries)
                    # Even though we're queuing, we still update the file metadata to avoid re-parsing
                    self.file_metadata[abs_log_file] = {
                        'size': os.path.getsize(abs_log_file),
                        'mtime': os.path.getmtime(abs_log_file)
                    }
                    self.save_state()
                else:
                    # Try to send directly
                    result = self.send_logs_to_clio(entries)
                    if result:
                        self.logger.info(f"Processed {len(entries)} entries from {abs_log_file}")
                    else:
                        self.logger.info(f"Queued {len(entries)} entries from {abs_log_file} for later sending")
                    
                    # Update file metadata after processing
                    self.file_metadata[abs_log_file] = {
                        'size': os.path.getsize(abs_log_file),
                        'mtime': os.path.getmtime(abs_log_file)
                    }
                    
                    # Save state immediately after processing
                    self.save_state()
        except Exception as e:
            self.logger.error(f"Error processing {abs_log_file}: {str(e)}")
            self.logger.error(traceback.format_exc())
        finally:
            # Always remove the lock file when done
            remove_lock_file(lock_path)
    
    def scan_directories(self):
        """Scan all relevant log directories for log files"""
        try:
            log_dirs = self.parser.get_log_directories()
            files_processed = 0
            
            for log_dir in log_dirs:
                if not os.path.exists(log_dir):
                    continue
                    
                for file_name in os.listdir(log_dir):
                    log_file = os.path.join(log_dir, file_name)
                    abs_log_file = os.path.abspath(log_file)
                    
                    # Skip if not a valid log file
                    if not self.parser.is_valid_log_file(abs_log_file):
                        continue
                    
                    # Check if the file has been modified since we last processed it
                    try:
                        current_size = os.path.getsize(abs_log_file)
                        last_modified = os.path.getmtime(abs_log_file)
                        
                        if abs_log_file in self.file_metadata:
                            old_size = self.file_metadata[abs_log_file].get('size', 0)
                            old_mtime = self.file_metadata[abs_log_file].get('mtime', 0)
                            
                            # Only process if file has changed
                            if current_size > old_size or last_modified > old_mtime:
                                self.logger.debug(f"File has changed: {abs_log_file}")
                                self.process_log_file(log_file)
                                files_processed += 1
                        else:
                            # First time seeing this file
                            self.logger.debug(f"Processing new file: {abs_log_file}")
                            self.process_log_file(log_file)
                            files_processed += 1
                    except Exception as e:
                        self.logger.error(f"Error checking file status: {abs_log_file}, {str(e)}")
            
            # Only save state if we actually processed files
            if files_processed > 0:
                self.logger.debug(f"Processed {files_processed} files during directory scan")
                self.save_state()
            else:
                self.logger.debug("No changes detected during directory scan")
                
        except Exception as e:
            self.logger.error(f"Error scanning directories: {str(e)}")
            self.logger.error(traceback.format_exc())
    
    def setup_observer(self, directory):
        """Set up a file observer for a directory"""
        # Check if we already have an observer for this directory
        if directory in self.observers:
            self.logger.debug(f"Observer already exists for: {directory}")
            return
            
        if not os.path.exists(directory):
            self.logger.warning(f"Directory doesn't exist, skipping: {directory}")
            return
                
        self.logger.info(f"Setting up file watcher for: {directory}")
        event_handler = LogEventHandler(self)
        observer = Observer()
        observer.schedule(event_handler, path=directory, recursive=False)
        observer.start()
        # Store the observer with the directory as the key
        self.observers[directory] = observer
    
    def cleanup_observers(self):
        """Stop and remove observers for old directories"""
        cutoff_str = self.parser.get_cutoff_date_str()
        
        directories_to_remove = []
        
        for directory, observer in self.observers.items():
            if directory == 'base':  # Don't remove the base observer
                continue
                
            # Check if directory is outdated for this parser
            if self.parser.is_directory_outdated(directory, cutoff_str):
                directories_to_remove.append(directory)
        
        for directory in directories_to_remove:
            self.logger.info(f"Removing observer for old directory: {directory}")
            observer = self.observers.pop(directory)
            observer.stop()
            observer.join()
        
        if directories_to_remove:
            self.logger.info(f"Removed {len(directories_to_remove)} observers for old directories")

    def log_queue_stats(self):
        """Log statistics about the queue"""
        stats = self.rate_queue.get_stats()
        self.logger.info(f"Queue stats: size={stats['current_size']}, "
                         f"total queued={stats['total_queued']}, "
                         f"total sent={stats['total_sent']}, "
                         f"dropped={stats['total_dropped']}, "
                         f"rate limited={stats['rate_limited']}")
    
    def start(self):
        """Start monitoring log files"""
        self.logger.info(f"🔍 Starting Log Forwarding")
        self.logger.info(f"🔗 Forwarding to Clio at: {self.clio_url}")
        
        # First, test the connection
        if not self.test_connection():
            self.logger.error("Exiting due to connection issues.")
            return
        
        # Initial scan
        self.logger.info("Performing initial log scan...")
        self.scan_directories()
        
        # Set up a file system observer for each relevant directory
        log_dirs = self.parser.get_log_directories()
        for log_dir in log_dirs:
            self.setup_observer(log_dir)
        
        # Also watch the base directory for new date directories
        base_dir = self.parser.get_base_directory()
        base_handler = LogEventHandler(self)
        base_observer = Observer()
        base_observer.schedule(base_handler, path=base_dir, recursive=False)
        base_observer.start()
        self.observers['base'] = base_observer
        
        try:
            # Main loop - periodically scan for changes and check for new directories
            last_observer_cleanup = datetime.now()
            last_log_rotation_check = datetime.now()
            last_stats_log = datetime.now()
            
            while self.running:
                time.sleep(self.poll_interval)
                
                try:
                    # Process any queued logs first
                    self.process_queued_logs()
                    
                    # Check if it's time to log queue stats (every 5 minutes)
                    now = datetime.now()
                    if (now - last_stats_log).total_seconds() > 300:  # 5 minutes
                        self.log_queue_stats()
                        last_stats_log = now
                    
                    # Check if it's time to clean up old observers (once per day)
                    if (now - last_observer_cleanup).total_seconds() > 86400:  # 24 hours
                        self.logger.info("Performing maintenance tasks...")
                        # Clean up old observers
                        self.cleanup_observers()
                        # Prune old entries from state
                        self.prune_old_state_entries()
                        last_observer_cleanup = now
                    
                    # Update the list of log directories to monitor (in case a new day started)
                    log_dirs = self.parser.get_log_directories()
                    
                    # Check for directories that need observers
                    for log_dir in log_dirs:
                        if os.path.exists(log_dir) and log_dir not in self.observers:
                            self.logger.info(f"Adding new observer for: {log_dir}")
                            self.setup_observer(log_dir)
                    
                    # Only scan if there might be modifications that the watchdog didn't catch
                    self.scan_directories()
                    
                    # Rotate our own logs if they get too large (every 30 minutes)
                    if (now - last_log_rotation_check).total_seconds() > 1800:  # 30 minutes
                        log_files = logging.root.handlers
                        for handler in log_files:
                            if isinstance(handler, logging.FileHandler):
                                rotate_logs(handler.baseFilename, self.logger)
                        last_log_rotation_check = now
                    
                except Exception as e:
                    self.logger.error(f"Error in main monitoring loop: {str(e)}")
                    self.logger.error(traceback.format_exc())
                    # Continue with the next iteration
        except Exception as e:
            self.logger.error(f"Critical error in main loop: {str(e)}")
            self.logger.error(traceback.format_exc())
        finally:
            self.stop()
    
    def stop(self):
        """Stop all monitoring and clean up"""
        if not self.running:
            return
            
        self.running = False
        
        # Save the current state
        self.save_state()
        
        # Stop all observers
        self.logger.info("Stopping log monitoring...")
        for directory, observer in list(self.observers.items()):
            try:
                observer.stop()
                observer.join()
                self.logger.debug(f"Stopped observer for: {directory}")
            except Exception as e:
                self.logger.error(f"Error stopping observer for {directory}: {str(e)}")
        
        self.observers.clear()
        self.logger.info("Log monitoring stopped.")