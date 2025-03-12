import os
import time
import logging
from datetime import datetime

def create_lock_file(lock_path):
    """Create a lock file with the current timestamp"""
    try:
        with open(lock_path, 'w') as f:
            f.write(str(time.time()))
        return True
    except Exception as e:
        logger = logging.getLogger("Utils")
        logger.error(f"Failed to create lock file {lock_path}: {str(e)}")
        return False

def remove_lock_file(lock_path):
    """Remove a lock file if it exists"""
    if os.path.exists(lock_path):
        try:
            os.remove(lock_path)
            return True
        except Exception as e:
            logger = logging.getLogger("Utils")
            logger.error(f"Failed to remove lock file {lock_path}: {str(e)}")
    return False

def cleanup_stale_locks(data_dir):
    """Clean up any stale lock files from previous runs"""
    logger = logging.getLogger("Utils")
    try:
        lock_count = 0
        current_time = time.time()
        lock_timeout = 3600  # 1 hour timeout for lock files
        
        for filename in os.listdir(data_dir):
            if filename.endswith('.lock') or filename.endswith('.process.lock'):
                lock_path = os.path.join(data_dir, filename)
                
                # Check if lock file is stale based on timestamp or always remove
                is_stale = True
                try:
                    # If the lock file contains a timestamp, check if it's older than timeout
                    if os.path.exists(lock_path):
                        lock_time = os.path.getmtime(lock_path)
                        if current_time - lock_time < lock_timeout:
                            # Try to read the file to see if it contains a valid timestamp
                            with open(lock_path, 'r') as f:
                                content = f.read().strip()
                                if content.isdigit() or content.replace('.', '', 1).isdigit():
                                    lock_timestamp = float(content)
                                    if current_time - lock_timestamp < lock_timeout:
                                        is_stale = False
                except Exception:
                    # If any error occurs reading the file, consider it stale
                    pass
                
                # Remove if stale
                if is_stale:
                    try:
                        os.remove(lock_path)
                        lock_count += 1
                    except Exception as e:
                        logger.error(f"Failed to remove stale lock file {lock_path}: {str(e)}")
        
        if lock_count > 0:
            logger.info(f"Cleaned up {lock_count} stale lock files")
        return lock_count
    except Exception as e:
        logger.error(f"Error cleaning up stale locks: {str(e)}")
        return 0

def rotate_logs(log_path, logger):
    """Rotate log files when they get too large"""
    try:
        # Check if log file exists and is larger than 5MB
        if os.path.exists(log_path) and os.path.getsize(log_path) > 5 * 1024 * 1024:
            # Create timestamped backup
            timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
            backup_path = f"{log_path}.{timestamp}"
            
            # Get all logging handlers for this file
            log_handlers = []
            for handler in logging.root.handlers:
                if isinstance(handler, logging.FileHandler) and handler.baseFilename == log_path:
                    log_handlers.append(handler)
            
            # Close and reopen the log file handlers
            for handler in log_handlers:
                handler.close()
                logging.root.removeHandler(handler)
            
            # Rename the current log file
            os.rename(log_path, backup_path)
            
            # Create a new log file and add handler
            for handler in log_handlers:
                new_handler = logging.FileHandler(log_path)
                new_handler.setFormatter(handler.formatter)
                new_handler.setLevel(handler.level)
                logging.root.addHandler(new_handler)
            
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
            return True
    except Exception as e:
        logger.error(f"Error rotating log file: {str(e)}")
    
    return False