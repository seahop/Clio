#!/usr/bin/env python3

import os
import sys
import time
import signal
import logging
import argparse
import traceback
from datetime import datetime

from core.forwarder import LogForwarder
from parsers.cobalt_strike import CobalStrikeParser
from parsers.sliver import SliverParser

# Set up logging
def setup_logging(log_dir, debug=False):
    """Set up logging configuration"""
    os.makedirs(log_dir, exist_ok=True)
    log_file = os.path.join(log_dir, "forwarder.log")
    
    # Configure logging
    log_level = logging.DEBUG if debug else logging.INFO
    
    # Use a more detailed format for debug mode, matching original script
    if debug:
        log_format = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    else:
        log_format = '%(asctime)s - %(levelname)s - %(message)s'
    
    logging.basicConfig(
        level=log_level,
        format=log_format,
        handlers=[
            logging.FileHandler(log_file),
            logging.StreamHandler()
        ]
    )
    
    # Set external libraries to a higher log level to reduce noise
    if debug:
        logging.getLogger('watchdog').setLevel(logging.INFO)
        logging.getLogger('urllib3').setLevel(logging.INFO)
        logging.getLogger('requests').setLevel(logging.INFO)
    
    return log_file

def parse_arguments():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(description="C2 Log Forwarder for Clio")
    parser.add_argument("--api-key", required=True, help="Clio API key")
    parser.add_argument("--clio-url", required=True, help="Clio URL (e.g., https://domain.local:3000)")
    parser.add_argument("--c2-type", required=True, choices=["cobalt_strike", "sliver"], 
                        help="C2 framework type")
    parser.add_argument("--historical-days", type=int, default=1, 
                        help="Number of historical days to process (default: 1)")
    parser.add_argument("--max-tracked-days", type=int, default=2,
                        help="Maximum number of days to keep tracking logs for (default: 2)")
    parser.add_argument("--interval", type=int, default=5, 
                        help="Polling interval in seconds (default: 5)")
    parser.add_argument("--data-dir", default="clio_forwarder", 
                        help="Directory for storing logs and state (default: clio_forwarder)")
    parser.add_argument("--insecure-ssl", action="store_true", 
                        help="Disable SSL certificate verification")
    parser.add_argument("--debug", action="store_true", 
                        help="Enable debug logging")
    
    return parser.parse_args()

def main():
    # Parse command line arguments
    args = parse_arguments()
    
    # Set up the data directory and logging
    data_dir = os.path.abspath(args.data_dir)
    log_file = setup_logging(data_dir, args.debug)
    
    logger = logging.getLogger("LogForwarder")
    logger.info("Starting C2 Log Forwarder for Clio")
    
    # Create the appropriate parser based on C2 type
    if args.c2_type == "cobalt_strike":
        parser = CobalStrikeParser(
            os.getcwd(),
            args.historical_days,
            args.max_tracked_days
        )
    elif args.c2_type == "sliver":
        parser = SliverParser(
            os.getcwd(),
            args.historical_days,
            args.max_tracked_days
        )
    else:
        logger.error(f"Unsupported C2 type: {args.c2_type}")
        sys.exit(1)
    
    try:
        # Create and start the log forwarder
        forwarder = LogForwarder(
            parser=parser,
            api_key=args.api_key,
            clio_url=args.clio_url,
            data_dir=data_dir,
            poll_interval=args.interval,
            verify_ssl=not args.insecure_ssl
        )
        
        # Register signal handlers
        def signal_handler(sig, frame):
            logger.info(f"Received signal {sig}, shutting down...")
            forwarder.stop()
        
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        
        # Start the forwarder
        forwarder.start()
        
    except KeyboardInterrupt:
        logger.info("Keyboard interrupt received, exiting...")
    except Exception as e:
        logger.critical(f"Unhandled exception: {str(e)}")
        logger.critical(traceback.format_exc())
        sys.exit(1)

if __name__ == "__main__":
    main()