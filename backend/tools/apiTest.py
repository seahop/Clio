#!/usr/bin/env python3
# example_api_client.py - Example client for log ingestion via API

import argparse
import json
import requests
import sys
import time
from datetime import datetime

class RedTeamLoggerClient:
    """Client for submitting logs to the Red Team Logger via API"""
    
    def __init__(self, base_url, api_key):
        """
        Initialize the client
        
        Args:
            base_url (str): Base URL of the API (e.g., 'https://yourdomain.com/ingest')
            api_key (str): Your API key
        """
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.headers = {
            'Content-Type': 'application/json',
            'X-API-Key': api_key
        }
    
    def check_status(self):
        """
        Check API connectivity and API key validity
        
        Returns:
            dict: API status response
        """
        try:
            response = requests.get(
                f"{self.base_url}/status",
                headers=self.headers
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Error checking API status: {e}")
            if hasattr(e, 'response') and e.response:
                print(f"Response: {e.response.text}")
            return None
    
    def send_log(self, log_data):
        """
        Send a single log entry
        
        Args:
            log_data (dict): Log data to send
            
        Returns:
            dict: API response
        """
        try:
            response = requests.post(
                f"{self.base_url}/logs",
                headers=self.headers,
                json=log_data
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Error sending log: {e}")
            if hasattr(e, 'response') and e.response:
                print(f"Response: {e.response.text}")
            return None
    
    def send_logs_batch(self, logs):
        """
        Send multiple log entries in a batch
        
        Args:
            logs (list): List of log data dictionaries
            
        Returns:
            dict: API response
        """
        if not logs:
            print("No logs to send")
            return None
            
        # API has a limit of 50 logs per request
        if len(logs) > 50:
            print(f"Warning: Batch size ({len(logs)}) exceeds maximum (50). Splitting into multiple requests.")
            results = []
            for i in range(0, len(logs), 50):
                batch = logs[i:i+50]
                print(f"Sending batch {i//50 + 1} of {(len(logs) + 49) // 50} ({len(batch)} logs)...")
                result = self.send_logs_batch(batch)
                if result:
                    results.append(result)
                time.sleep(1)  # Avoid rate limiting
            return results
        
        try:
            response = requests.post(
                f"{self.base_url}/logs",
                headers=self.headers,
                json=logs
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Error sending logs batch: {e}")
            if hasattr(e, 'response') and e.response:
                print(f"Response: {e.response.text}")
            return None


def create_example_log():
    """Create an example log entry"""
    return {
        "internal_ip": "192.168.1.100",
        "external_ip": "203.0.113.1",
        "hostname": "victim-host",
        "domain": "example.org",
        "username": "jsmith",
        "command": "cat /etc/passwd",
        "notes": "Privilege escalation attempt",
        "filename": "passwd",
        "status": "ON_DISK",
        "timestamp": datetime.now().isoformat()
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Red Team Logger API Client')
    parser.add_argument('--url', required=True, help='Base URL of the API (e.g., https://yourdomain.com/ingest)')
    parser.add_argument('--key', required=True, help='Your API key')
    parser.add_argument('--action', choices=['status', 'send', 'batch'], default='status', 
                      help='Action to perform: check status, send single log, or batch logs')
    parser.add_argument('--file', help='JSON file containing log data for batch sending')
    parser.add_argument('--count', type=int, default=1, help='Number of example logs to send (for batch mode)')
    
    args = parser.parse_args()
    
    client = RedTeamLoggerClient(args.url, args.key)
    
    if args.action == 'status':
        print("Checking API status...")
        status = client.check_status()
        if status:
            print(json.dumps(status, indent=2))
            print("\nAPI is accessible and your API key is valid!")
    
    elif args.action == 'send':
        print("Sending a single log...")
        log = create_example_log()
        result = client.send_log(log)
        if result:
            print(json.dumps(result, indent=2))
    
    elif args.action == 'batch':
        if args.file:
            try:
                with open(args.file, 'r') as f:
                    logs = json.load(f)
                if not isinstance(logs, list):
                    logs = [logs]  # Convert single object to list
            except Exception as e:
                print(f"Error reading logs from file: {e}")
                sys.exit(1)
        else:
            # Create example logs
            print(f"Creating {args.count} example logs...")
            logs = [create_example_log() for _ in range(args.count)]
        
        print(f"Sending {len(logs)} logs...")
        result = client.send_logs_batch(logs)
        if result:
            print(json.dumps(result, indent=2))

"""
Example usages:

# Check API status
python example_api_client.py --url https://yourdomain.com/ingest --key rtl_yourkey_abc123 --action status

# Send a single log
python example_api_client.py --url https://yourdomain.com/ingest --key rtl_yourkey_abc123 --action send

# Send multiple example logs
python example_api_client.py --url https://yourdomain.com/ingest --key rtl_yourkey_abc123 --action batch --count 10

# Send logs from a JSON file
python example_api_client.py --url https://yourdomain.com/ingest --key rtl_yourkey_abc123 --action batch --file logs.json
"""