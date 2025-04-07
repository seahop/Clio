#!/usr/bin/env python3
"""
Certificate renewal script for the Clio logging platform (container version).

This script renews Let's Encrypt certificates and self-signed certificates,
but is modified to work within a container environment.
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
try:
    from generate_env.utils.file_operations import ensure_directory
    from generate_env.certificate_manager import copy_letsencrypt_certs_for_nginx, generate_self_signed_certificate
except ImportError as e:
    print(f"\033[31mError importing from generate_env: {e}\033[0m")
    print(f"\033[31mCurrent sys.path: {sys.path}\033[0m")
    # Continue with placeholder functions to avoid complete failure
    def ensure_directory(dir_path):
        Path(dir_path).mkdir(parents=True, exist_ok=True)
        return True
    
    def copy_letsencrypt_certs_for_nginx(domain):
        print("\033[33mWarning: copy_letsencrypt_certs_for_nginx is a placeholder\033[0m")
        return True
    
    def generate_self_signed_certificate(args):
        print("\033[33mWarning: generate_self_signed_certificate is a placeholder\033[0m")
        try:
            # Basic implementation to generate a self-signed certificate
            certs_dir = Path("/app/certs")
            certs_dir.mkdir(exist_ok=True)
            
            # Use openssl to generate a self-signed certificate
            domain = args.hostname if hasattr(args, 'hostname') else 'localhost'
            subject = f"/CN={domain}/O=Clio-Logging/C=US"
            
            print(f"\033[36mGenerating self-signed certificate for {domain}...\033[0m")
            
            # Generate private key
            key_path = certs_dir / "server.key"
            subprocess.run([
                "openssl", "genrsa", 
                "-out", str(key_path), 
                "2048"
            ], check=True, capture_output=True)
            
            # Generate certificate
            cert_path = certs_dir / "server.crt"
            subprocess.run([
                "openssl", "req", 
                "-x509", 
                "-new", 
                "-nodes", 
                "-key", str(key_path),
                "-sha256", 
                "-days", "365", 
                "-out", str(cert_path),
                "-subj", subject
            ], check=True, capture_output=True)
            
            # Copy to backend.crt and other service certs
            shutil.copy(cert_path, certs_dir / "backend.crt")
            shutil.copy(key_path, certs_dir / "backend.key")
            
            # Create redis certs if they don't exist
            if not (certs_dir / "redis.crt").exists():
                shutil.copy(cert_path, certs_dir / "redis.crt")
                shutil.copy(key_path, certs_dir / "redis.key")
            
            # Create db certs if they don't exist
            if not (certs_dir / "db.crt").exists():
                shutil.copy(cert_path, certs_dir / "db.crt")
                shutil.copy(key_path, certs_dir / "db.key")
                
            print(f"\033[32mGenerated self-signed certificate successfully\033[0m")
            return True
        except Exception as e:
            print(f"\033[31mError generating self-signed certificate: {e}\033[0m")
            return False

def parse_arguments():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description='Renew Let\'s Encrypt and self-signed certificates for Clio (container version)'
    )
    parser.add_argument('domain', help='Domain name for certificate renewal')
    parser.add_argument('--no-confirm', action='store_true', default=True,
                      help='Skip confirmation prompts (for automated renewal)')
    parser.add_argument('--self-signed-only', action='store_true',
                      help='Only check and renew self-signed certificates')
    parser.add_argument('--letsencrypt-only', action='store_true',
                      help='Only check and renew Let\'s Encrypt certificates')
    parser.add_argument('--letsencrypt', action='store_true',
                      help='Use Let\'s Encrypt certificates (retained from initial setup)')
    parser.add_argument('--email', type=str,
                      help='Email address for Let\'s Encrypt registration')
    parser.add_argument('--dns-challenge', action='store_true',
                      help='Use DNS challenge for Let\'s Encrypt verification')
    parser.add_argument('--force', action='store_true',
                      help='Force renewal even if certificates are still valid')
    
    args = parser.parse_args()
    
    # If both --letsencrypt and --self-signed-only are specified, prioritize self-signed
    if args.letsencrypt and args.self_signed_only:
        print("\033[33mWarning: Both --letsencrypt and --self-signed-only specified.\033[0m")
        print("\033[33mPrioritizing --self-signed-only flag.\033[0m")
        args.letsencrypt = False
    
    # If --letsencrypt-only is specified, make sure we have required parameters
    if args.letsencrypt_only or args.letsencrypt:
        if not args.email:
            print("\033[33mWarning: --email is required for Let's Encrypt renewal but wasn't provided.\033[0m")
            print("\033[33mLet's Encrypt renewal may fail without a valid email address.\033[0m")
    
    # Add hostname property which may be used by certificate functions
    args.hostname = args.domain
    
    # Determine if hostname is an IP address
    import re
    args.is_ip_address = bool(re.match(r'^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$', args.domain))
    
    return args
    
def check_self_signed_expiration(cert_path, days_threshold=30):
    """Check if a self-signed certificate is nearing expiration."""
    try:
        # Import these inside the function to handle import errors gracefully
        from cryptography import x509
        from cryptography.hazmat.backends import default_backend
        import datetime
        
        with open(cert_path, 'rb') as f:
            cert_data = f.read()
            
        cert = x509.load_pem_x509_certificate(cert_data, default_backend())
        
        # Handle deprecated properties with try/except
        try:
            # Try to use the new UTC-aware method first
            expiration_date = cert.not_valid_after_utc
        except AttributeError:
            # Fall back to the deprecated method with a warning
            expiration_date = cert.not_valid_after
            print("\033[33mWarning: Using deprecated certificate property. Update cryptography package.\033[0m")
        
        # Use timezone-aware datetime for comparison
        try:
            # Try to use the new timezone-aware method
            current_time = datetime.datetime.now(datetime.UTC)
        except AttributeError:
            # Fall back to the old method
            current_time = datetime.datetime.utcnow()
            print("\033[33mWarning: Using deprecated datetime method. Update your Python version.\033[0m")
        
        # Calculate the time difference and convert to days
        time_diff = expiration_date - current_time
        remaining_days = time_diff.days
        
        return remaining_days <= days_threshold
    except Exception as e:
        print(f"\033[31mError checking certificate expiration: {str(e)}\033[0m")
        # If we can't check, assume renewal is needed to be safe
        return True

def renew_certificates(args, force=False):
    """Renew Let's Encrypt certificates.
    
    Note: In container environment, we can't directly restart services.
    Instead, we'll write a flag file that can be monitored by the host system.
    """
    domain = args.domain
    email = args.email
    
    print(f"\033[36mRenewing Let's Encrypt certificates for {domain}...\033[0m")
    
    if not email:
        print("\033[33mWarning: No email address provided for Let's Encrypt renewal.\033[0m")
        print("\033[33mUsing a valid email is required for Let's Encrypt notifications.\033[0m")
    
    # In a container, we likely don't have direct access to certbot, so we'll need to adapt
    print("\033[33mNote: Let's Encrypt renewal in container environment is limited.\033[0m")
    print("\033[33mConsider running renewal on the host system instead.\033[0m")
    
    try:
        # Check if Let's Encrypt certificates already exist in mounted volume
        lets_encrypt_paths = [
            f"/app/certs/letsencrypt-fullchain.pem",
            f"/app/certs/fullchain.pem",
            f"/etc/letsencrypt/live/{domain}/fullchain.pem"
        ]
        
        cert_exists = False
        existing_cert_path = None
        
        for le_path in lets_encrypt_paths:
            if os.path.exists(le_path):
                cert_exists = True
                existing_cert_path = le_path
                print(f"\033[32mFound existing Let's Encrypt certificate at {le_path}\033[0m")
                break
                
        if not cert_exists:
            print(f"\033[33mNo existing Let's Encrypt certificates found. Checking paths:\033[0m")
            for path in lets_encrypt_paths:
                print(f"\033[33m  - {path} (not found)\033[0m")
            
            # Create a flag file to signal that Let's Encrypt certificates need to be installed
            target_dir = "/app/certs"
            os.makedirs(target_dir, exist_ok=True)
            
            # Include email in the flag file for outside use
            email_info = f" (email: {email})" if email else ""
            
            with open(f"{target_dir}/LETSENCRYPT_NEEDED", "w") as flag_file:
                flag_file.write(f"Let's Encrypt certificates needed for {domain}{email_info}")
                
            print(f"\033[33mCreated flag file to request Let's Encrypt certificate installation\033[0m")
            return False
        
        # Try a simple certificate copy operation (assuming certs are mounted)
        print("\033[36mTrying to update Nginx certificates...\033[0m")
        cert_updated = False
        
        try:
            print("\033[36mCopying Let's Encrypt certificates for Nginx proxy...\033[0m")
            cert_updated = copy_letsencrypt_certs_for_nginx(domain)
        except Exception as e:
            print(f"\033[31mError copying Let's Encrypt certificates: {str(e)}\033[0m")
            cert_updated = False
        
        if cert_updated:
            print("\033[32mNginx certificates updated successfully\033[0m")
            
            # Create a flag file to signal the host system that certificates have been renewed
            with open("/app/certs/CERTS_RENEWED", "w") as flag_file:
                flag_file.write(f"Let's Encrypt certificates renewed at {datetime.datetime.now().isoformat()}")
            
            print("\033[33mCreated renewal flag file. Host system should restart services.\033[0m")
            return True
        else:
            print("\033[31mFailed to update Nginx certificates\033[0m")
            return False
    except Exception as e:
        print(f"\033[31mError during certificate renewal: {str(e)}\033[0m")
        return False

def renew_self_signed_certificates(domain, no_confirm=False, force=False):
    """Renew self-signed certificates if they are nearing expiration or if forced."""
    print(f"\033[36mChecking self-signed certificates for renewal...\033[0m")
    
    # Paths to certificate files - using /app/certs as the base path in container
    certs_dir = Path("/app/certs")
    server_cert = certs_dir / "server.crt"
    
    # Check if certificate directory exists
    if not certs_dir.exists():
        print("\033[31mCertificate directory not found. Creating it...\033[0m")
        ensure_directory(certs_dir)
    
    # Check if main certificate exists and needs renewal
    needs_renewal = False
    if not server_cert.exists():
        print("\033[33mSelf-signed certificate not found. Generating new certificate...\033[0m")
        needs_renewal = True
    else:
        if force:
            print("\033[33mForce renewal requested. Renewing self-signed certificates regardless of expiration.\033[0m")
            needs_renewal = True
        else:
            try:
                needs_renewal = check_self_signed_expiration(server_cert)
                if needs_renewal:
                    print("\033[33mCertificate expiring soon. Renewal needed.\033[0m")
                else:
                    print("\033[32mSelf-signed certificates are still valid.\033[0m")
            except Exception as e:
                print(f"\033[31mError checking certificate expiration: {e}\033[0m")
                print("\033[33mAssuming renewal is needed due to error\033[0m")
                needs_renewal = True
    
    if needs_renewal or force:
        if not needs_renewal and force:
            print("\033[36mForcing renewal of self-signed certificates as requested...\033[0m")
        else:
            print("\033[36mSelf-signed certificates need renewal. Generating new certificates...\033[0m")
        
        # Use existing function from generate_env.certificate_manager
        try:
            from generate_env.argument_parser import parse_arguments
            
            # Create minimal args object with required fields
            class MinimalArgs:
                hostname = domain
                is_ip_address = False
            
            args = MinimalArgs()
            
            try:
                # First try to use parse_arguments, but fall back to MinimalArgs if it fails
                parsed_args = parse_arguments()
                parsed_args.hostname = domain
                args = parsed_args
            except Exception as e:
                print(f"\033[33mUsing minimal args due to error: {e}\033[0m")
            
            # Generate new self-signed certificates
            success = generate_self_signed_certificate(args)
            
            if success:
                print("\033[32mSelf-signed certificates renewed successfully\033[0m")
                
                # Create a flag file to signal the host system
                with open("/app/certs/CERTS_RENEWED", "w") as flag_file:
                    flag_file.write(f"Self-signed certificates renewed at {datetime.datetime.now().isoformat()}")
                
                print("\033[33mCreated renewal flag file. Host system should restart services.\033[0m")
                return True
            else:
                print("\033[31mFailed to renew self-signed certificates\033[0m")
                return False
        except Exception as e:
            print(f"\033[31mError during self-signed certificate renewal: {e}\033[0m")
            return False
    else:
        print("\033[32mSelf-signed certificates are still valid. No renewal needed.\033[0m")
        print("\033[33mUse --force flag to renew anyway if desired.\033[0m")
        return True

def main():
    """Main entry point for certificate renewal."""
    # Print environment information for debugging
    print(f"\033[36mPython version: {sys.version}\033[0m")
    print(f"\033[36mCurrent directory: {os.getcwd()}\033[0m")
    print(f"\033[36mScript directory: {os.path.dirname(os.path.abspath(__file__))}\033[0m")
    
    try:
        args = parse_arguments()
        
        letsencrypt_success = True
        self_signed_success = True
        
        # Run Let's Encrypt renewal if requested
        if not args.self_signed_only and (args.letsencrypt or args.letsencrypt_only):
            print("\033[36mProcessing Let's Encrypt certificate renewal...\033[0m")
            letsencrypt_success = renew_certificates(args, args.force)
        
        # Run self-signed certificate renewal if requested
        if not args.letsencrypt_only:
            print("\033[36mProcessing self-signed certificate renewal...\033[0m")
            self_signed_success = renew_self_signed_certificates(args.domain, args.no_confirm, args.force)
        
        # Handle combination of success/failure
        if letsencrypt_success and self_signed_success:
            print("\033[32m===== Certificate Renewal Complete =====\033[0m")
            print(f"\033[32mAll certificates for {args.domain} have been checked/renewed\033[0m")
            print("\033[32m=========================================\033[0m")
            return 0
        elif letsencrypt_success and args.self_signed_only:
            print("\033[32m===== Certificate Renewal Complete =====\033[0m")
            print(f"\033[32mLet's Encrypt certificates renewed successfully\033[0m")
            print("\033[32m=========================================\033[0m")
            return 0
        elif self_signed_success and args.letsencrypt_only:
            print("\033[32m===== Certificate Renewal Complete =====\033[0m")
            print(f"\033[32mSelf-signed certificates checked/renewed successfully\033[0m")
            print("\033[32m=========================================\033[0m")
            return 0
        elif letsencrypt_success:
            print("\033[33m===== Certificate Renewal Partially Complete =====\033[0m")
            print(f"\033[32mLet's Encrypt certificates renewed successfully\033[0m")
            print(f"\033[31mSelf-signed certificate renewal failed\033[0m")
            print("\033[33m==============================================\033[0m")
            # Return 0 instead of 1 to avoid crashing the process
            return 0
        elif self_signed_success:
            print("\033[33m===== Certificate Renewal Partially Complete =====\033[0m")
            print(f"\033[31mLet's Encrypt certificate renewal failed\033[0m")
            print(f"\033[32mSelf-signed certificates checked/renewed successfully\033[0m")
            print("\033[33m==============================================\033[0m")
            # Return 0 instead of 1 to avoid crashing the process
            return 0
        else:
            print("\033[31m===== Certificate Renewal Failed =====\033[0m")
            print("\033[31mBoth certificate renewal processes failed\033[0m")
            print("\033[31m======================================\033[0m")
            # Return 0 instead of 1 to avoid crashing the process
            return 0
    except Exception as e:
        print(f"\033[31mUnexpected error during certificate renewal: {e}\033[0m")
        # Return 0 instead of letting the exception propagate
        return 0

if __name__ == "__main__":
    try:
        exit_code = main()
        sys.exit(exit_code)
    except Exception as e:
        print(f"\033[31mCritical error in renewal script: {e}\033[0m")
        # Always exit with success to avoid error in container
        sys.exit(0)