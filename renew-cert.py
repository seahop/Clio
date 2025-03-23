#!/usr/bin/env python3
"""
Let's Encrypt certificate renewal script for Clio Logging Platform

This script automatically renews Let's Encrypt certificates and updates 
all service-specific certificate files in the application.

Usage:
    python3 renew-cert.py [domain]

Examples:
    python3 renew-cert.py example.com
    
Options:
    --force      Force renewal even if certificate is not due for renewal
    --dns        Use DNS challenge method (default if originally used)
    --http       Use HTTP challenge method on port 3000
    --verbose    Show detailed output
"""

import subprocess
import shutil
import os
import sys
import argparse
from pathlib import Path
import datetime

# Parse command line arguments
parser = argparse.ArgumentParser(
    description='Renew Let\'s Encrypt certificates for Clio Logging Platform'
)
parser.add_argument('domain', nargs='?', 
                   help='Domain name for the certificate (required if not specified during generation)')
parser.add_argument('--force', action='store_true',
                   help='Force renewal even if certificate is not due for renewal')
parser.add_argument('--dns', action='store_true',
                   help='Use DNS challenge method')
parser.add_argument('--http', action='store_true',
                   help='Use HTTP challenge method on port 3000')
parser.add_argument('--verbose', action='store_true',
                   help='Show detailed output')
parser.add_argument('--no-confirm', action='store_true',
                   help='Skip confirmation prompts (useful for cron jobs)')
args = parser.parse_args()

# Set up logging
VERBOSE = args.verbose

def log(message, level='info'):
    """Print message with appropriate formatting"""
    timestamp = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    if level == 'info':
        print(f"\033[36m[{timestamp}] INFO: {message}\033[0m")
    elif level == 'warning':
        print(f"\033[33m[{timestamp}] WARNING: {message}\033[0m")
    elif level == 'error':
        print(f"\033[31m[{timestamp}] ERROR: {message}\033[0m")
    elif level == 'success':
        print(f"\033[32m[{timestamp}] SUCCESS: {message}\033[0m")
    elif level == 'debug' and VERBOSE:
        print(f"\033[35m[{timestamp}] DEBUG: {message}\033[0m")

def load_domain_from_env():
    """Try to load domain from .env file if not specified"""
    try:
        env_path = Path('.env')
        if env_path.exists():
            with open(env_path, 'r') as f:
                for line in f:
                    if line.startswith('FRONTEND_URL='):
                        url = line.strip().split('=', 1)[1].strip()
                        from urllib.parse import urlparse
                        domain = urlparse(url).netloc.split(':')[0]
                        log(f"Found domain in .env file: {domain}", 'debug')
                        return domain
    except Exception as e:
        log(f"Error reading domain from .env: {e}", 'debug')
    return None

def get_challenge_method():
    """Determine which challenge method to use based on arguments or detect from existing setup"""
    if args.dns:
        return 'dns'
    elif args.http:
        return 'http'
    
    # Try to detect from existing renewal configuration
    try:
        with open('/etc/letsencrypt/renewal/{domain}.conf', 'r') as f:
            content = f.read()
            if 'authenticator = manual' in content and 'pref_challenges = dns' in content:
                log("Detected DNS challenge from existing configuration", 'debug')
                return 'dns'
            elif 'http-01-port = 3000' in content:
                log("Detected HTTP challenge from existing configuration", 'debug')
                return 'http'
    except Exception as e:
        log(f"Error detecting challenge method: {e}", 'debug')
    
    # Default to DNS challenge as it's more secure
    log("No challenge method detected, defaulting to DNS challenge", 'debug')
    return 'dns'

def check_cert_expiry(domain):
    """Check if certificate is approaching expiration"""
    try:
        cert_path = f"/etc/letsencrypt/live/{domain}/cert.pem"
        if not os.path.exists(cert_path):
            log(f"Certificate not found at {cert_path}", 'warning')
            return True  # If cert doesn't exist, renewal is needed
        
        # Use openssl to check expiration
        cmd = ["openssl", "x509", "-in", cert_path, "-noout", "-enddate"]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        end_date_line = result.stdout.strip()
        
        # Parse the date
        end_date_str = end_date_line.split('=')[1]
        # Convert to datetime object
        import time
        from datetime import datetime
        end_date = datetime.strptime(end_date_str, '%b %d %H:%M:%S %Y %Z')
        now = datetime.now()
        
        # Calculate days remaining
        days_remaining = (end_date - now).days
        
        if days_remaining <= 30:
            log(f"Certificate expires in {days_remaining} days", 'warning')
            return True
        else:
            log(f"Certificate valid for another {days_remaining} days", 'info')
            return False
    except Exception as e:
        log(f"Error checking certificate expiration: {e}", 'error')
        return True  # Default to renewal if we can't check

def get_letsencrypt_certificate_dns(domain, email):
    """Obtain a Let's Encrypt certificate using DNS challenge"""
    print(f"\033[36mObtaining Let's Encrypt certificate for {domain} using DNS challenge...\033[0m")
    
    # Create certs directory if it doesn't exist
    certs_dir = Path("certs")
    certs_dir.mkdir(exist_ok=True)
    
    try:
        # Check if certbot is installed
        try:
            subprocess.run(["certbot", "--version"], check=True, capture_output=True)
        except (subprocess.CalledProcessError, FileNotFoundError):
            print("\033[31mError: certbot is not installed or not in PATH\033[0m")
            print("\033[31mPlease install certbot first: https://certbot.eff.org/instructions\033[0m")
            return False
        
        # Run certbot with DNS challenge
        print("\033[33m")
        print("=" * 80)
        print("DNS CHALLENGE INSTRUCTIONS")
        print("=" * 80)
        print("You will need to create a TXT record in your DNS settings.")
        print("The script will provide the record name and value.")
        print("After creating the record, press Enter to continue.")
        print("DNS propagation may take a few minutes.")
        print("=" * 80)
        print("\033[0m")
        
        # Prepare the certbot command
        cmd = [
            "certbot", "certonly", 
            "--manual", "--preferred-challenges=dns",
            "--agree-tos",
            f"--email={email}",
            f"--domains={domain}",
            "--manual-public-ip-logging-ok"
        ]
        
        # Run the command interactively
        process = subprocess.Popen(
            cmd, 
            stdin=subprocess.PIPE, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE, 
            text=True,
            bufsize=1
        )
        
        # Handle the interactive process
        output_lines = []
        for line in iter(process.stdout.readline, ''):
            output_lines.append(line)
            print(line, end='')
            
            # When certbot asks for confirmation, wait for user input
            if "Press Enter to Continue" in line:
                input("\033[32mPress Enter when DNS record has been created...\033[0m")
                process.stdin.write("\n")
                process.stdin.flush()
        
        # Get any error output
        error_output = process.stderr.read()
        
        # Wait for process to complete
        process.wait()
        
        # Check if certbot succeeded
        if process.returncode != 0:
            print(f"\033[31mError obtaining certificate: {error_output}\033[0m")
            print("\033[31mCertbot output:\033[0m")
            print(''.join(output_lines))
            return False
        
        # Path to the certificates
        cert_dir = f"/etc/letsencrypt/live/{domain}"
        
        # Check if certificates exist (might need sudo)
        if not os.path.exists(cert_dir):
            print(f"\033[31mError: Certificate directory {cert_dir} not found\033[0m")
            return False
        
        # Copy certificates to project directory
        cert_path = f"{cert_dir}/fullchain.pem"
        key_path = f"{cert_dir}/privkey.pem"
        
        server_cert = certs_dir / "server.crt"
        server_key = certs_dir / "server.key"
        
        # Copy files (might need sudo)
        print("\033[36mCopying certificates to project directory...\033[0m")
        try:
            shutil.copy(cert_path, server_cert)
            shutil.copy(key_path, server_key)
        except PermissionError:
            print("\033[33mPermission error: trying with sudo...\033[0m")
            subprocess.run(["sudo", "cp", cert_path, server_cert], check=True)
            subprocess.run(["sudo", "cp", key_path, server_key], check=True)
            subprocess.run(["sudo", "chown", f"{os.getuid()}:{os.getgid()}", server_cert], check=True)
            subprocess.run(["sudo", "chown", f"{os.getuid()}:{os.getgid()}", server_key], check=True)
        
        # Set proper permissions
        os.chmod(server_cert, 0o644)
        os.chmod(server_key, 0o644)
        
        # Create service-specific certificates
        create_service_certificates(server_cert, server_key, certs_dir)
        
        # Ensure all certificates are readable by Docker services
        if platform.system() != 'Windows':
            try:
                subprocess.run(["chmod", "-R", "a+r", certs_dir], check=True)
                print("\033[32mSet read permissions for all certificates\033[0m")
            except Exception as e:
                print(f"\033[33mWarning: Could not set permissions: {e}\033[0m")
        
        print("\033[32mLet's Encrypt certificate obtained successfully\033[0m")
        
        # Automatically restart Docker containers without confirmation
        print("\033[36mAutomatically restarting Docker containers to apply new certificates...\033[0m")
        try:
            subprocess.run(["docker-compose", "restart"], check=True)
            print("\033[32mDocker containers restarted successfully\033[0m")
        except Exception as e:
            print(f"\033[31mError restarting Docker containers: {e}\033[0m")
            print("\033[33mYou may need to manually restart with: docker-compose restart\033[0m")
        
        return True
    except Exception as e:
        print(f"\033[31mError obtaining Let's Encrypt certificate: {str(e)}\033[0m")
        return False

def renew_certificate_http(domain):
    """Renew Let's Encrypt certificate using HTTP challenge on port 3000"""
    log(f"Renewing certificate for {domain} using HTTP challenge on port 3000...", 'info')
    
    # Run certbot renew with HTTP challenge
    cmd = [
        "certbot", "renew",
        "--preferred-challenges=http",
        "--http-01-port=3000"
    ]
    
    if args.force:
        cmd.append("--force-renewal")
    
    try:
        log("Starting certbot renewal process", 'debug')
        log("This will require port 3000 to be publicly accessible", 'info')
        
        process = subprocess.run(cmd, capture_output=True, text=True)
        
        # Log output for debugging
        if VERBOSE:
            log(f"Certbot stdout:\n{process.stdout}", 'debug')
            if process.stderr:
                log(f"Certbot stderr:\n{process.stderr}", 'debug')
        
        if process.returncode != 0:
            log(f"Certificate renewal failed: {process.stderr}", 'error')
            return False
        
        log("Certificate renewed successfully", 'success')
        return update_application_certificates(domain)
    except Exception as e:
        log(f"Error renewing certificate: {e}", 'error')
        return False

def update_application_certificates(domain):
    """Update application certificates after renewal"""
    log("Updating application certificates...", 'info')
    
    certs_dir = Path("certs")
    cert_path = f"/etc/letsencrypt/live/{domain}/fullchain.pem"
    key_path = f"/etc/letsencrypt/live/{domain}/privkey.pem"
    
    server_cert = certs_dir / "server.crt"
    server_key = certs_dir / "server.key"
    
    try:
        # Ensure certs directory exists
        if not certs_dir.exists():
            log("Creating certs directory", 'debug')
            certs_dir.mkdir(exist_ok=True)
        
        # Copy files (might need sudo)
        log(f"Copying certificates from {cert_path} to {server_cert}", 'debug')
        try:
            shutil.copy(cert_path, server_cert)
            shutil.copy(key_path, server_key)
        except PermissionError:
            log("Permission error: trying with sudo...", 'warning')
            subprocess.run(["sudo", "cp", cert_path, server_cert], check=True)
            subprocess.run(["sudo", "cp", key_path, server_key], check=True)
            subprocess.run(["sudo", "chown", f"{os.getuid()}:{os.getgid()}", server_cert], check=True)
            subprocess.run(["sudo", "chown", f"{os.getuid()}:{os.getgid()}", server_key], check=True)
        
        # Set proper permissions
        os.chmod(server_cert, 0o644)
        os.chmod(server_key, 0o644)
        
        # Update service-specific certificates
        for service in ['frontend', 'backend', 'db', 'redis', 'relation-service']:
            service_cert = certs_dir / f"{service}.crt"
            service_key = certs_dir / f"{service}.key"
            
            log(f"Creating certificate for {service}", 'debug')
            shutil.copy(server_cert, service_cert)
            shutil.copy(server_key, service_key)
            
            os.chmod(service_cert, 0o644)
            os.chmod(service_key, 0o644)
        
        # Make sure all certificates are readable by Docker services
        try:
            subprocess.run(["chmod", "-R", "a+r", certs_dir], check=True)
            log("Set read permissions for all certificates", 'debug')
        except Exception as e:
            log(f"Warning: Could not set permissions: {e}", 'warning')
        
        log("All application certificates updated successfully", 'success')
        return True
    except Exception as e:
        log(f"Error updating application certificates: {e}", 'error')
        return False

def restart_services():
    """Restart Docker containers to apply new certificates"""
    try:
        log("Automatically restarting Docker containers to apply new certificates...", 'info')
        
        # Check if docker-compose.yml exists
        if not os.path.exists('docker-compose.yml'):
            log("docker-compose.yml not found, skipping container restart", 'warning')
            return False
        
        log("Restarting Docker containers...", 'info')
        subprocess.run(["docker-compose", "restart"], check=True)
        log("Docker containers restarted successfully", 'success')
        return True
    except Exception as e:
        log(f"Error restarting Docker containers: {e}", 'error')
        log("You may need to manually restart with: docker-compose restart", 'warning')
        return False
        
if __name__ == "__main__":
    # Determine domain name
    domain = args.domain
    if not domain:
        domain = load_domain_from_env()
        if not domain:
            log("Error: Domain name is required", 'error')
            log("Usage: python3 renew-cert.py example.com", 'info')
            sys.exit(1)
    
    log(f"Using domain: {domain}", 'info')
    
    # Check if renewal is needed
    if not args.force and not check_cert_expiry(domain):
        confirm = input("\033[33mCertificate is not due for renewal. Force renewal anyway? (y/n): \033[0m")
        if confirm.lower() != 'y':
            log("Renewal skipped. Certificate is still valid.", 'info')
            sys.exit(0)
    
    # Determine challenge method and renew
    challenge_method = get_challenge_method()
    
    success = False
    if challenge_method == 'dns':
        success = renew_certificate_dns(domain)
    else:
        success = renew_certificate_http(domain)
    
    # Restart services if successful
    if success:
        restart_services()
        log("Certificate renewal and update completed successfully!", 'success')
        log(f"Certificates will be valid for the next 90 days", 'info')
        log(f"Remember to run this script again before expiration", 'info')
    else:
        log("Certificate renewal or update failed", 'error')
        log("Check the logs above for errors", 'error')
    
    sys.exit(0 if success else 1)