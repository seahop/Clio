#!/usr/bin/env python3
"""
Certificate renewal script for the Clio logging platform.

This script renews Let's Encrypt certificates and reconfigures the application
to use the renewed certificates.
"""

import os
import sys
import argparse
import subprocess
import datetime
import shutil
from pathlib import Path

# Ensure the generate_env package is in the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import needed functions from our package
from generate_env.utils.file_operations import ensure_directory
from generate_env.certificate_manager import copy_letsencrypt_certs_for_nginx

def parse_arguments():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description='Renew Let\'s Encrypt certificates for Clio'
    )
    parser.add_argument('domain', help='Domain name for certificate renewal')
    parser.add_argument('--no-confirm', action='store_true', 
                      help='Skip confirmation prompts (for automated renewal)')
    return parser.parse_args()

def renew_certificates(domain, no_confirm=False):
    """Renew Let's Encrypt certificates."""
    print(f"\033[36mRenewing Let's Encrypt certificates for {domain}...\033[0m")
    
    if not no_confirm:
        confirmation = input("\033[33mThis will attempt to renew Let's Encrypt certificates. Continue? (y/n): \033[0m")
        if confirmation.lower() != 'y':
            print("\033[31mRenewal cancelled.\033[0m")
            return False
    
    # Check if certbot is installed
    try:
        subprocess.run(["certbot", "--version"], check=True, capture_output=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("\033[31mError: certbot is not installed or not in PATH\033[0m")
        return False
    
    # Run certbot renew command
    try:
        renew_process = subprocess.run(
            ["sudo", "certbot", "renew", "--quiet"],
            capture_output=True,
            text=True
        )
        
        if renew_process.returncode != 0:
            print(f"\033[31mCertbot renewal failed: {renew_process.stderr}\033[0m")
            return False
        
        print("\033[32mCertificates renewed successfully\033[0m")
        
        # Update certificates for Nginx
        print("\033[36mUpdating Nginx certificates...\033[0m")
        cert_updated = copy_letsencrypt_certs_for_nginx(domain)
        
        if cert_updated:
            print("\033[32mNginx certificates updated successfully\033[0m")
        else:
            print("\033[31mFailed to update Nginx certificates\033[0m")
            return False
        
        print("\033[36mRestarting Docker services...\033[0m")
        if not no_confirm:
            restart = input("\033[33mRestart Docker services to apply new certificates? (y/n): \033[0m")
            if restart.lower() != 'y':
                print("\033[33mSkipping Docker restart. Remember to restart manually with: docker-compose restart\033[0m")
                return True
        
        # Restart Docker services
        try:
            subprocess.run(["docker-compose", "restart", "nginx-proxy"], check=True)
            print("\033[32mNginx service restarted successfully\033[0m")
        except subprocess.CalledProcessError as e:
            print(f"\033[31mFailed to restart Docker services: {e}\033[0m")
            print("\033[33mYou may need to restart manually with: docker-compose restart\033[0m")
            return False
        
        return True
    except Exception as e:
        print(f"\033[31mError during certificate renewal: {str(e)}\033[0m")
        return False

def main():
    """Main entry point for certificate renewal."""
    args = parse_arguments()
    success = renew_certificates(args.domain, args.no_confirm)
    
    if success:
        print("\033[32m===== Certificate Renewal Complete =====\033[0m")
        print(f"\033[32mCertificates for {args.domain} have been renewed\033[0m")
        print("\033[32mNginx proxy has been updated with the new certificates\033[0m")
        print("\033[32m=========================================\033[0m")
        return 0
    else:
        print("\033[31m===== Certificate Renewal Failed =====\033[0m")
        print("\033[31mPlease check the error messages above\033[0m")
        print("\033[31m======================================\033[0m")
        return 1

if __name__ == "__main__":
    sys.exit(main())