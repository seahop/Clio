import time
import threading
import queue
import logging
from collections import deque
from datetime import datetime, timedelta

class RateLimitQueue:
    """
    A queue system for handling API rate limits with automatic retry functionality.
    
    This class provides a queue for storing logs that can't be sent immediately due
    to rate limiting, and handles retrying them with appropriate backoff.
    """
    
    def __init__(self, rate_limit=120, rate_window=60, max_queue_size=1000):
        """
        Initialize the rate limit queue.
        
        Args:
            rate_limit (int): Number of requests allowed per window
            rate_window (int): Time window in seconds
            max_queue_size (int): Maximum size of the queue before oldest items are dropped
        """
        self.logger = logging.getLogger("RateLimitQueue")
        self.queue = deque()
        self.lock = threading.RLock()  # Reentrant lock for thread safety
        self.rate_limit = rate_limit
        self.rate_window = rate_window
        self.max_queue_size = max_queue_size
        
        # Rate limit tracking
        self.rate_limited = False
        self.rate_limit_reset = None
        self.request_timestamps = deque()
        
        # Statistics
        self.total_queued = 0
        self.total_dropped = 0
        self.total_sent = 0
        self.retry_attempts = 0
    
    def add(self, log_entry):
        """
        Add a log entry to the queue.
        
        Args:
            log_entry: The log entry to queue
            
        Returns:
            bool: True if the entry was added, False if the queue is full and it was dropped
        """
        with self.lock:
            # If queue is at max capacity, drop the oldest item
            if len(self.queue) >= self.max_queue_size:
                self.queue.popleft()  # Remove oldest item
                self.total_dropped += 1
                self.logger.warning(f"Queue full, dropped oldest log entry. Total dropped: {self.total_dropped}")
            
            # Add the new entry
            self.queue.append(log_entry)
            self.total_queued += 1
            
            queue_size = len(self.queue)
            
            if queue_size > 0 and queue_size % 10 == 0:
                self.logger.info(f"Queue size: {queue_size}")
            
            return True
    
    def add_batch(self, log_entries):
        """
        Add multiple log entries to the queue.
        
        Args:
            log_entries (list): List of log entries to queue
            
        Returns:
            int: Number of entries successfully added to the queue
        """
        with self.lock:
            added_count = 0
            for entry in log_entries:
                if self.add(entry):
                    added_count += 1
            return added_count
    
    def is_rate_limited(self):
        """
        Check if we're currently rate limited.
        
        Returns:
            bool: True if currently rate limited, False otherwise
        """
        with self.lock:
            # If we have a reset time and it's in the future, we're rate limited
            if self.rate_limited and self.rate_limit_reset:
                now = datetime.now()
                if now < self.rate_limit_reset:
                    remaining = (self.rate_limit_reset - now).total_seconds()
                    return True, remaining
                else:
                    # Reset has passed
                    self.rate_limited = False
                    self.rate_limit_reset = None
                    return False, 0
            
            # Check if we've sent too many requests in the current window
            now = time.time()
            
            # Remove timestamps older than the rate window
            while self.request_timestamps and self.request_timestamps[0] < now - self.rate_window:
                self.request_timestamps.popleft()
            
            # If we've reached the limit, we're rate limited
            if len(self.request_timestamps) >= self.rate_limit:
                # Set rate limited with reset time at the oldest timestamp + window
                oldest = self.request_timestamps[0]
                reset_time = oldest + self.rate_window
                seconds_remaining = max(0, reset_time - now)
                
                # Only log if we weren't already rate limited
                if not self.rate_limited:
                    self.logger.info(f"Rate limit reached. Reset in {seconds_remaining:.1f} seconds")
                    
                self.rate_limited = True
                self.rate_limit_reset = datetime.now() + timedelta(seconds=seconds_remaining)
                return True, seconds_remaining
            
            return False, 0
    
    def track_request(self):
        """
        Track a request for rate limiting purposes.
        
        Called when a request is successfully sent to the API.
        """
        with self.lock:
            self.request_timestamps.append(time.time())
            self.total_sent += 1
    
    def set_rate_limited(self, reset_seconds=None):
        """
        Mark the queue as rate limited.
        
        Args:
            reset_seconds (int, optional): Seconds until rate limit resets. If None, 
                                         uses the default rate window.
        """
        with self.lock:
            self.rate_limited = True
            
            if reset_seconds is None:
                # Default to waiting the full window if no reset time provided
                reset_seconds = self.rate_window
            
            self.rate_limit_reset = datetime.now() + timedelta(seconds=reset_seconds)
            self.logger.info(f"Rate limit set. Reset in {reset_seconds:.1f} seconds")
    
    def get_queued_entries(self, max_count=None):
        """
        Get a batch of queued entries, up to max_count.
        
        Args:
            max_count (int, optional): Maximum number of entries to retrieve.
                                      If None, returns all queued entries.
                                    
        Returns:
            list: List of queued entries, up to max_count
        """
        with self.lock:
            if not self.queue:
                return []
            
            limited, seconds = self.is_rate_limited()
            if limited:
                # Don't return any items if we're rate limited
                return []
            
            # Determine number of entries to retrieve
            if max_count is None:
                # If no max specified, use half the rate limit to be conservative
                max_count = max(1, self.rate_limit // 2)
            else:
                max_count = min(max_count, len(self.queue))
            
            entries = []
            for _ in range(max_count):
                if not self.queue:
                    break
                entries.append(self.queue.popleft())
            
            return entries
    
    def get_size(self):
        """
        Get the current queue size.
        
        Returns:
            int: Current number of entries in the queue
        """
        with self.lock:
            return len(self.queue)
    
    def get_stats(self):
        """
        Get statistics about the queue.
        
        Returns:
            dict: Dictionary with queue statistics
        """
        with self.lock:
            return {
                'current_size': len(self.queue),
                'total_queued': self.total_queued,
                'total_sent': self.total_sent,
                'total_dropped': self.total_dropped,
                'retry_attempts': self.retry_attempts,
                'rate_limited': self.rate_limited,
                'rate_limit_reset': self.rate_limit_reset.isoformat() if self.rate_limit_reset else None
            }