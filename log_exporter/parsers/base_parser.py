import os
import logging
import re
from abc import ABC, abstractmethod
from datetime import datetime, timedelta

class BaseLogParser(ABC):
    """
    Base class for all C2 framework log parsers
    
    This abstract class defines the interface that all C2 framework parsers must implement.
    Each C2 framework has its own log format and directory structure, so the implementation
    of these methods will vary by framework.
    
    The default implementations of some methods assume date-based directories (YYYY-MM-DD format),
    but each parser can override these methods if their C2 framework uses a different structure.
    """
    def __init__(self, root_dir, historical_days=1, max_tracked_days=2):
        self.root_dir = os.path.abspath(root_dir)
        self.historical_days = historical_days
        self.max_tracked_days = max_tracked_days
        self.logger = logging.getLogger(self.__class__.__name__)

    @abstractmethod
    def get_base_directory(self):
        """
        Get the base directory that contains all logs
        
        Returns:
            str: Path to the base logs directory
        """
        pass
    
    @abstractmethod
    def get_log_directories(self):
        """
        Get all log directories to monitor
        
        Returns:
            list: List of directory paths to monitor
        """
        pass
    
    @abstractmethod
    def is_valid_log_file(self, file_path):
        """
        Check if a file is a valid log file for this parser
        
        Args:
            file_path: Path to the file
            
        Returns:
            bool: True if the file is a valid log file, False otherwise
        """
        pass
    
    @abstractmethod
    def parse_log_file(self, log_file, processed_lines):
        """
        Parse a log file and extract relevant entries
        
        Args:
            log_file: Path to the log file
            processed_lines: Dictionary of file paths to line counts already processed
            
        Returns:
            list: List of extracted log entries
        """
        pass
    
    def get_cutoff_date_str(self):
        """
        Get the cutoff date string for pruning old entries
        
        Returns:
            str: Cutoff date in ISO format (YYYY-MM-DD)
        """
        today = datetime.now().date()
        cutoff_date = today - timedelta(days=self.max_tracked_days)
        return cutoff_date.strftime("%Y-%m-%d")
    
    def is_file_outdated(self, file_path, cutoff_str):
        """
        Check if a file is older than the cutoff date
        
        Args:
            file_path: Path to the file
            cutoff_str: Cutoff date string in ISO format (YYYY-MM-DD)
            
        Returns:
            bool: True if the file is outdated, False otherwise
        """
        # Default implementation checks if the file is in a date directory
        # that's older than the cutoff date
        dir_path = os.path.dirname(file_path)
        dir_name = os.path.basename(dir_path)
        
        # Check if the directory name looks like a date older than cutoff
        return (re.match(r'^\d{4}-\d{2}-\d{2}$', dir_name) and dir_name < cutoff_str)
    
    def is_directory_outdated(self, directory, cutoff_str):
        """
        Check if a directory is older than the cutoff date
        
        Args:
            directory: Path to the directory
            cutoff_str: Cutoff date string in ISO format (YYYY-MM-DD)
            
        Returns:
            bool: True if the directory is outdated, False otherwise
        """
        # Default implementation checks if the directory name is a date
        # that's older than the cutoff date
        dir_name = os.path.basename(directory)
        return (re.match(r'^\d{4}-\d{2}-\d{2}$', dir_name) and dir_name < cutoff_str)
    
    def is_date_directory(self, directory):
        """
        Check if a directory is a date directory
        
        Args:
            directory: Path to the directory
            
        Returns:
            bool: True if the directory is a date directory, False otherwise
        """
        dir_name = os.path.basename(directory)
        return re.match(r'^\d{4}-\d{2}-\d{2}$', dir_name) is not None