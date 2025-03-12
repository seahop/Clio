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
    def __init__(self, root_dir, historical_days=1, max_tracked_days=2, filter_mode="all"):
        self.root_dir = os.path.abspath(root_dir)
        self.historical_days = historical_days
        self.max_tracked_days = max_tracked_days
        self.filter_mode = filter_mode
        self.logger = logging.getLogger(self.__class__.__name__)
        
        # Initialize insignificant commands list (to be overridden by subclasses)
        self.insignificant_commands = []
        
        # Log filter mode
        self.logger.info(f"Using filter mode: {self.filter_mode}")
        if self.filter_mode == "significant":
            self.setup_insignificant_commands()
            self.logger.info(f"Filtering out {len(self.insignificant_commands)} insignificant commands")

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
    
    def setup_insignificant_commands(self):
        """
        Initialize the list of insignificant commands to filter out when in 'significant' mode
        Loads commands from the command_filters module based on C2 framework type.
        """
        try:
            # Import here to avoid circular imports
            from command_filters import get_insignificant_commands
            
            # Get the class name without "Parser" suffix to determine C2 type
            framework_type = self.__class__.__name__.lower().replace('parser', '')
            
            # Special case handling for class names that don't match framework types
            if framework_type == "cobalstrike":
                framework_type = "cobalt_strike"
                
            # Load commands for this framework
            self.insignificant_commands = get_insignificant_commands(framework_type)
            self.logger.debug(f"Loaded {len(self.insignificant_commands)} insignificant commands for {framework_type}")
        except ImportError:
            # Fallback to basic list if command_filters module is not available
            self.logger.warning("command_filters module not found, using basic command filter list")
            self.insignificant_commands = [
                "ls", "dir", "pwd", "cd", "cls", "clear", "help", "?", "exit", "quit"
            ]
    
    def should_exclude_entry(self, entry):
        """
        Check if an entry should be excluded from logging regardless of significance
        
        Args:
            entry: The log entry dictionary
            
        Returns:
            bool: True if the entry should be excluded, False otherwise
        """
        if not entry or "command" not in entry:
            return True
            
        try:
            # Import here to avoid circular imports
            from command_filters import should_exclude_command
            
            # Get the class name without "Parser" suffix to determine C2 type
            framework_type = self.__class__.__name__.lower().replace('parser', '')
            
            # Special case handling for class names that don't match framework types
            if framework_type == "cobalstrike":
                framework_type = "cobalt_strike"
                
            return should_exclude_command(entry["command"], framework_type)
        except ImportError:
            # Fallback to basic exclusion if command_filters module is not available
            self.logger.warning("command_filters module not found, using basic exclusion logic")
            return False
    
    def is_significant_command(self, command):
        """
        Check if a command is significant enough to forward
        
        Args:
            command: The command string to check
            
        Returns:
            bool: True if the command should be forwarded, False if it should be filtered out
        """
        if self.filter_mode == "all":
            return True
            
        if not command:
            return False
            
        # Check if the command starts with any insignificant command
        command_lower = command.lower().strip()
        
        for insignificant in self.insignificant_commands:
            # Match exact command or command with arguments
            if command_lower == insignificant or command_lower.startswith(f"{insignificant} "):
                self.logger.debug(f"Filtering out insignificant command: {command}")
                return False
        
        return True
    
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