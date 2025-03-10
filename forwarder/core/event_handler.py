import os
import time
import logging
from watchdog.events import FileSystemEventHandler

from core.utils import create_lock_file, remove_lock_file

class LogEventHandler(FileSystemEventHandler):
    """Handles file system events for log files"""
    
    def __init__(self, forwarder):
        self.forwarder = forwarder
        self.logger = logging.getLogger("LogEventHandler")
        self.data_dir = forwarder.data_dir
    
    def on_modified(self, event):
        """Handle file modification events"""
        if event.is_directory:
            return
        try:
            if self.forwarder.parser.is_valid_log_file(event.src_path):
                # Add a brief delay to let the file finish being written
                time.sleep(0.5)
                
                # Use a file lock to prevent multiple threads from processing the same file
                file_name = os.path.basename(event.src_path)
                lock_file = os.path.join(self.data_dir, f"{file_name}.lock")
                
                # Skip if file is already being processed
                if os.path.exists(lock_file):
                    self.logger.debug(f"Another process is already handling {event.src_path}, skipping")
                    return
                
                # Create lock file
                create_lock_file(lock_file)
                
                try:
                    self.logger.debug(f"File modification detected: {event.src_path}")
                    self.forwarder.process_log_file(event.src_path)
                finally:
                    # Always remove lock file when done
                    remove_lock_file(lock_file)
                        
        except Exception as e:
            self.logger.error(f"Error handling file modification event: {str(e)}")

    def on_created(self, event):
        """Handle file creation events"""
        try:
            if event.is_directory:
                # Check if this is a new date directory created by the C2 framework
                if self.forwarder.parser.is_date_directory(event.src_path):
                    self.logger.info(f"New date directory detected: {event.src_path}")
                    # Add a new observer for this directory
                    self.forwarder.setup_observer(event.src_path)
                return
                
            if self.forwarder.parser.is_valid_log_file(event.src_path):
                self.logger.debug(f"New file created: {event.src_path}")
                self.forwarder.process_log_file(event.src_path)
                
        except Exception as e:
            self.logger.error(f"Error handling file creation event: {str(e)}")