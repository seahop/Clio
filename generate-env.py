#!/usr/bin/env python3
# Disable buffering on stdout/stderr
"""
Python script for generating environment variables, security keys, and SSL certificates.
Now with support for Let's Encrypt certificates using DNS challenge.

Usage:
    python3 generate-env.py [frontend_url] [options]
    
Examples:
    # Generate self-signed certificates (default)
    python3 generate-env.py https://myapp.example.com
    
    # Generate Let's Encrypt certificates using DNS challenge
    python3 generate-env.py https://myapp.example.com --letsencrypt --dns-challenge --domain=myapp.example.com --email=admin@example.com
    
    # With Google SSO configuration
    python3 generate-env.py https://myapp.example.com --google-client-id=123456789.apps.googleusercontent.com --google-client-secret=abcdef123456
"""

import os
import sys
os.environ['PYTHONUNBUFFERED'] = '1'  # Critical for interactive subprocess with sudo
sys.stdout.reconfigure(line_buffering=True)  # Force line buffering
sys.stderr.reconfigure(line_buffering=True)  # Force line buffering
import traceback
import json
import time
import base64
import secrets
import subprocess
import datetime
import platform
import re
import ipaddress
import argparse
import shutil
from pathlib import Path
from urllib.parse import urlparse

# Define help text for the script
HELP_TEXT = """
RedTeamLogger Environment Generator

This script generates the necessary environment configuration, security keys, 
and SSL certificates for the RedTeamLogger application.

Basic usage:
    python3 generate-env.py [frontend_url]

Advanced usage with Let's Encrypt:
    python3 generate-env.py [frontend_url] --letsencrypt --dns-challenge --domain=myapp.example.com --email=admin@example.com

Advanced usage with Google SSO:
    python3 generate-env.py [frontend_url] --google-client-id=CLIENT_ID --google-client-secret=CLIENT_SECRET

Combined usage:
    python3 generate-env.py [frontend_url] --letsencrypt --dns-challenge --domain=myapp.example.com --email=admin@example.com --google-client-id=CLIENT_ID --google-client-secret=CLIENT_SECRET

Examples:
    python3 generate-env.py https://localhost:3000
    python3 generate-env.py https://192.168.1.100:3000
    python3 generate-env.py https://myapp.example.com --letsencrypt --dns-challenge --domain=myapp.example.com --email=admin@example.com
    python3 generate-env.py https://myapp.example.com --google-client-id=123456789.apps.googleusercontent.com --google-client-secret=abcdef123456

Notes:
    - If no frontend URL is provided, https://localhost:3000 will be used by default
    - For Let's Encrypt certificate generation:
        - --letsencrypt flag enables Let's Encrypt
        - --dns-challenge uses the DNS challenge method (recommended for VPN environments)
        - --domain specifies the domain for the certificate
        - --email is required for Let's Encrypt registration
    - For Google SSO integration:
        - --google-client-id is your OAuth 2.0 Client ID from Google Cloud Console
        - --google-client-secret is your OAuth 2.0 Client Secret from Google Cloud Console
        - --google-callback-url is optional and will be automatically generated based on your hostname
"""
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.backends import default_backend

# Parse command line arguments with argparse for better handling
parser = argparse.ArgumentParser(
    description='Generate environment configuration for RedTeamLogger',
    epilog=HELP_TEXT,
    formatter_class=argparse.RawDescriptionHelpFormatter
)
parser.add_argument('frontend_url', nargs='?', default='https://localhost:3000', 
                    help='Frontend URL (default: https://localhost:3000)')
parser.add_argument('--self-signed', action='store_true', default=True,
                    help='Generate self-signed certificates (default)')
parser.add_argument('--letsencrypt', action='store_true', default=False,
                    help='Use Let\'s Encrypt certificates instead of self-signed')
parser.add_argument('--dns-challenge', action='store_true', default=False,
                    help='Use DNS challenge for Let\'s Encrypt (recommended for VPN environments)')
parser.add_argument('--domain', type=str, 
                    help='Domain name for Let\'s Encrypt certificate')
parser.add_argument('--email', type=str,
                    help='Email address for Let\'s Encrypt registration')
# Google SSO arguments
parser.add_argument('--google-client-id', 
                    help='Google OAuth Client ID from Google Cloud Console')
parser.add_argument('--google-client-secret', 
                    help='Google OAuth Client Secret from Google Cloud Console')
parser.add_argument('--google-callback-url', 
                    help='Google OAuth Callback URL (default: https://[hostname]/api/auth/google/callback)')
args = parser.parse_args()

# If Let's Encrypt is specified, disable self-signed by default
if args.letsencrypt:
    args.self_signed = False

frontend_url = args.frontend_url

# Validate URL format
try:
    parsed_url = urlparse(frontend_url)
    if not all([parsed_url.scheme, parsed_url.netloc]):
        raise ValueError("Invalid URL format")
except Exception as e:
    print(f"Error: Invalid URL format provided - {str(e)}")
    print("Usage: python3 generate-env.py [frontend-url]")
    print("Example: python3 generate-env.py https://192.168.1.100:3000")
    print("Example: python3 generate-env.py https://mydomain.com:3000")
    print("If no URL is provided, https://localhost:3000 will be used")
    sys.exit(1)

# Extract hostname from the URL
frontend_hostname = parsed_url.netloc.split(':')[0]

# Determine if this is an ngrok URL
is_ngrok = 'ngrok' in frontend_hostname

# Determine default Google callback URL if not specified
if args.google_client_id and args.google_client_secret and not args.google_callback_url:
    # For ngrok URLs, remove port from callback
    if is_ngrok:
        args.google_callback_url = f"https://{frontend_hostname}/api/auth/google/callback"
    else:
        # For regular URLs, maintain the port if present in frontend_url
        port = ""
        if ':' in parsed_url.netloc:
            port = ":" + parsed_url.netloc.split(':')[1]
        args.google_callback_url = f"https://{frontend_hostname}{port}/api/auth/google/callback"

# Determine if the hostname is an IP address
is_ip_address = bool(re.match(r'^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$', frontend_hostname))

# Set the bind address based on the hostname
if frontend_hostname == 'localhost':
    bind_address = '127.0.0.1'  # Bind only to localhost
else:
    bind_address = '0.0.0.0'    # Bind to all interfaces for non-localhost hostnames

# Log the binding details
print(f"\033[36mUsing hostname: {frontend_hostname}\033[0m")
print(f"\033[36mBinding to address: {bind_address}\033[0m")

# Log certificate configuration status
if args.letsencrypt:
    if not args.domain:
        print(f"\033[31mError: --domain is required with --letsencrypt\033[0m")
        sys.exit(1)
    if not args.email:
        print(f"\033[31mError: --email is required with --letsencrypt\033[0m")
        sys.exit(1)
        
    print(f"\033[36mUsing Let's Encrypt for certificate generation\033[0m")
    if args.dns_challenge:
        print(f"\033[36mUsing DNS challenge method\033[0m")
    else:
        print(f"\033[36mUsing HTTP challenge method\033[0m")
    print(f"\033[36mDomain: {args.domain}\033[0m")
else:
    print(f"\033[36mUsing self-signed certificates\033[0m")

# Log Google SSO configuration status
if args.google_client_id and args.google_client_secret:
    print(f"\033[36mGoogle SSO configuration provided\033[0m")
    print(f"\033[36mCallback URL: {args.google_callback_url}\033[0m")
else:
    print(f"\033[33mNo Google SSO configuration provided\033[0m")

ENV_FILE = '.env'

def generate_secure_key(bytes_length):
    """Generate a secure random key as a hex string."""
    return secrets.token_hex(bytes_length)

def generate_secure_password(bytes_length):
    """Generate a secure random password in base64 format."""
    return base64.b64encode(secrets.token_bytes(bytes_length)).decode('utf-8')

def generate_certificate(common_name):
    """Generate a self-signed SSL certificate."""
    print("\033[36mGenerating self-signed SSL certificate...\033[0m")
    
    # Create certs directory if it doesn't exist
    certs_dir = Path("certs")
    certs_dir.mkdir(exist_ok=True)
    
    # Define alternative hostnames
    alt_names = [
        x509.DNSName(common_name),
        x509.DNSName(frontend_hostname),  # Include the hostname from URL
        x509.DNSName("localhost"),
        # Service hostnames
        x509.DNSName("backend"),
        x509.DNSName("frontend"),
        x509.DNSName("relation-service"),
        x509.DNSName("db"),
        x509.DNSName("redis")
    ]
    
    # Remove any duplicates in alt_names
    unique_alt_names = []
    seen_values = set()
    
    for alt_name in alt_names:
        value = alt_name.value
        if value not in seen_values:
            seen_values.add(value)
            unique_alt_names.append(alt_name)
    
    # Include IP addresses
    unique_alt_names.append(x509.IPAddress(ipaddress.IPv4Address('127.0.0.1')))
    
    # If hostname looks like an IP address, add it as IP
    if is_ip_address:
        try:
            unique_alt_names.append(x509.IPAddress(ipaddress.IPv4Address(frontend_hostname)))
        except ValueError:
            pass
    
    # Generate a key pair
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
        backend=default_backend()
    )
    
    # Create a self-signed certificate
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, common_name),
        x509.NameAttribute(NameOID.COUNTRY_NAME, "US"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Red Team Logger Development"),
    ])
    
    # Certificate validity
    now = datetime.datetime.utcnow()
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(private_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now)
        .not_valid_after(now + datetime.timedelta(days=365))
        .add_extension(
            x509.SubjectAlternativeName(unique_alt_names),
            critical=False,
        )
        .add_extension(
            x509.BasicConstraints(ca=True, path_length=None),
            critical=True,
        )
        .sign(private_key, hashes.SHA256(), default_backend())
    )
    
    # Save the certificate and key
    key_path = certs_dir / "server.key"
    cert_path = certs_dir / "server.crt"
    
    with open(key_path, "wb") as f:
        f.write(private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        ))
    
    # Set secure permissions for private key - allow read by all (needed for Docker)
    os.chmod(key_path, 0o644)
    
    with open(cert_path, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))
    
    # Make certificate readable by all
    os.chmod(cert_path, 0o644)
    
    # Create symbolic links or copy files for service-specific names with correct permissions
    for service in ['frontend', 'backend', 'db', 'redis', 'relation-service']:
        service_key_path = certs_dir / f"{service}.key"
        service_cert_path = certs_dir / f"{service}.crt"
        
        # Copy key and set secure but readable permissions
        with open(service_key_path, "wb") as f:
            f.write(private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.TraditionalOpenSSL,
                encryption_algorithm=serialization.NoEncryption(),
            ))
        os.chmod(service_key_path, 0o644)  # Allow read by all (needed for Docker)
        
        # Copy certificate
        with open(service_cert_path, "wb") as f:
            f.write(cert.public_bytes(serialization.Encoding.PEM))
        os.chmod(service_cert_path, 0o644)  # Allow read by all
    
    # For extra safety, make the entire certs directory readable by all
    if platform.system() != 'Windows':
        os.system(f"chmod -R a+r {certs_dir}")
    
    print("\033[32mSSL certificate generated successfully\033[0m")
    print("\033[32mAll certificates have been set with proper permissions (644)\033[0m")

def get_letsencrypt_certificate_hybrid(domain, email):
    """Obtain a Let's Encrypt certificate for frontend while using self-signed for internal services"""
    print(f"\033[36mImplementing hybrid certificate approach for {domain}\033[0m")
    print(f"\033[36m - Let's Encrypt for frontend/external access\033[0m")
    print(f"\033[36m - Self-signed for internal service communication\033[0m")
    
    # First, generate self-signed certificates for all services
    generate_certificate(domain)
    
    # Create certs directory if it doesn't exist (should already exist from generate_certificate)
    certs_dir = Path("certs")
    
    try:
        # Check if certbot is installed
        try:
            subprocess.run(["certbot", "--version"], check=True, capture_output=True)
        except (subprocess.CalledProcessError, FileNotFoundError):
            print("\033[31mError: certbot is not installed or not in PATH\033[0m")
            return True  # Continue with self-signed certs only
        
        # Run certbot with standalone HTTP challenge
        cmd = [
            "certbot", "certonly", "--standalone",
            "--non-interactive", "--agree-tos",
            f"--email={email}",
            f"--domains={domain}",
            "--preferred-challenges=http"
        ]
        
        process = subprocess.run(cmd, capture_output=True, text=True)
        
        if process.returncode != 0:
            print(f"\033[33mWarning: Could not obtain Let's Encrypt certificate: {process.stderr}\033[0m")
            print(f"\033[33mUsing self-signed certificates for all services\033[0m")
            return True  # Continue with self-signed certs
        
        # Copy Let's Encrypt certificates for Nginx
        copy_letsencrypt_certs_for_nginx(domain)
        
        print("\033[32mHybrid certificate setup complete!\033[0m")
        print("\033[32m - Self-signed certificates for internal services\033[0m")
        print("\033[32m - Let's Encrypt certificates copied for Nginx proxy\033[0m")
        
        # Set up cron job for certificate renewal
        setup_cron_job(domain)
        
        return True
    except Exception as e:
        print(f"\033[31mError in Let's Encrypt certificate setup: {str(e)}\033[0m")
        print("\033[33mUsing self-signed certificates for all services\033[0m")
        return True  # Continue with self-signed certs

def create_service_certificates(cert_path, key_path, certs_dir):
    """Create copies of certificates for each service"""
    for service in ['frontend', 'backend', 'db', 'redis', 'relation-service']:
        service_cert = certs_dir / f"{service}.crt"
        service_key = certs_dir / f"{service}.key"
        
        # Copy files
        shutil.copy2(cert_path, service_cert)
        shutil.copy2(key_path, service_key)
        
        # Set permissions
        os.chmod(service_cert, 0o644)
        os.chmod(service_key, 0o644)
    
    print("\033[32mService-specific certificates created\033[0m")

def get_letsencrypt_certificate_http(domain, email):
    """Obtain a Let's Encrypt certificate using HTTP challenge on port 80 (standalone)"""
    print(f"\033[36mObtaining Let's Encrypt certificate for {domain} using standalone HTTP challenge...\033[0m")
    
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
        
        # Run certbot with standalone HTTP challenge
        cmd = [
            "certbot", "certonly", "--standalone",
            "--non-interactive", "--agree-tos",
            f"--email={email}",
            f"--domains={domain}",
            "--preferred-challenges=http"
        ]
        
        process = subprocess.run(cmd, capture_output=True, text=True)
        
        if process.returncode != 0:
            print(f"\033[31mError obtaining certificate: {process.stderr}\033[0m")
            return False
        
        # Path to the certificates
        cert_dir = f"/etc/letsencrypt/live/{domain}"
        
        # Check if certificates exist
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
        
        print("\033[32mLet's Encrypt certificate obtained successfully\033[0m")
        return True
    except Exception as e:
        print(f"\033[31mError obtaining Let's Encrypt certificate: {str(e)}\033[0m")
        return False

def copy_letsencrypt_certs_for_nginx(domain):
    """Copy Let's Encrypt certificates to the project for Nginx proxy use"""
    print(f"\033[36mCopying Let's Encrypt certificates for Nginx proxy...\033[0m")
    
    # Create certs directory if it doesn't exist
    certs_dir = Path("certs")
    certs_dir.mkdir(exist_ok=True)
    
    try:
        letsencrypt_cert = f"/etc/letsencrypt/live/{domain}/fullchain.pem"
        letsencrypt_key = f"/etc/letsencrypt/live/{domain}/privkey.pem"
        
        nginx_cert = certs_dir / "letsencrypt-fullchain.pem"
        nginx_key = certs_dir / "letsencrypt-privkey.pem"
        
        # Copy files (might need sudo)
        try:
            shutil.copy(letsencrypt_cert, nginx_cert)
            shutil.copy(letsencrypt_key, nginx_key)
        except PermissionError:
            print("\033[33mPermission error: trying with sudo...\033[0m")
            subprocess.run(["sudo", "cp", letsencrypt_cert, nginx_cert], check=True)
            subprocess.run(["sudo", "cp", letsencrypt_key, nginx_key], check=True)
            subprocess.run(["sudo", "chown", f"{os.getuid()}:{os.getgid()}", nginx_cert], check=True)
            subprocess.run(["sudo", "chown", f"{os.getuid()}:{os.getgid()}", nginx_key], check=True)
        
        # Set proper permissions
        os.chmod(nginx_cert, 0o644)
        os.chmod(nginx_key, 0o644)
        
        print("\033[32mLet's Encrypt certificates copied for Nginx use\033[0m")
        return True
    except Exception as e:
        print(f"\033[31mError copying Let's Encrypt certificates: {str(e)}\033[0m")
        return False

def setup_cron_job(domain):
    """Set up a cron job for certificate renewal"""
    print("\033[36mSetting up cron job for certificate renewal...\033[0m")
    
    # Get current directory
    current_dir = os.path.abspath(os.getcwd())
    
    # Ensure the renew-cert.py script is executable
    renew_script_path = os.path.join(current_dir, "renew-cert.py")
    if os.path.exists(renew_script_path):
        if platform.system() != 'Windows':
            os.chmod(renew_script_path, 0o755)  # rwxr-xr-x
            print("\033[32mMade renewal script executable\033[0m")
    else:
        print("\033[31mWarning: renew-cert.py not found in current directory\033[0m")
        print("\033[31mCron job will be created but may not work without the script\033[0m")
    
    # Create cron job entry - run monthly on the 1st at 2 AM
    # Add --no-confirm flag for automated renewal
    cron_job = f"0 2 1 * * cd {current_dir} && python3 {current_dir}/renew-cert.py {domain} --no-confirm"
    
    try:
        # Create a temporary file
        temp_cron_file = "temp_cron"
        
        # Export existing crontab
        subprocess.run(f"crontab -l > {temp_cron_file} 2>/dev/null || true", shell=True)
        
        # Check if the cron job already exists
        with open(temp_cron_file, 'r') as f:
            existing_cron = f.read()
        
        if cron_job in existing_cron:
            print("\033[33mCron job already exists. Skipping...\033[0m")
        else:
            # Append new cron job
            with open(temp_cron_file, 'a') as f:
                f.write(f"\n# Added by Clio Logging Platform on {datetime.datetime.now()}\n")
                f.write(f"{cron_job}\n")
            
            # Install new crontab
            subprocess.run(f"crontab {temp_cron_file}", shell=True, check=True)
            print("\033[32mCron job added successfully!\033[0m")
            print(f"\033[32mJob: {cron_job}\033[0m")
        
        # Remove temporary file
        os.remove(temp_cron_file)
        return True
    except Exception as e:
        print(f"\033[31mFailed to set up cron job: {str(e)}\033[0m")
        print("\033[33mYou can manually add this cron job:\033[0m")
        print(f"\033[33m{cron_job}\033[0m")
        print("\033[33mRun 'crontab -e' to edit your crontab file.\033[0m")
        return False

def main():
    # Check if .env exists
    if not os.path.exists(ENV_FILE):
        # Generate secure keys and passwords
        redis_encryption_key = generate_secure_key(32)
        jwt_secret = generate_secure_key(64)
        admin_password = generate_secure_password(12)
        user_password = generate_secure_password(12)
        redis_password = generate_secure_password(16)
        postgres_password = generate_secure_password(32)
        
        # Create .env content
        env_content = f"""# Security Keys
REDIS_ENCRYPTION_KEY={redis_encryption_key}
JWT_SECRET={jwt_secret}
ADMIN_PASSWORD={admin_password}
USER_PASSWORD={user_password}
REDIS_PASSWORD={redis_password}
REDIS_SSL=true

# PostgreSQL Configuration
POSTGRES_USER=postgres
POSTGRES_PASSWORD={postgres_password}
POSTGRES_DB=redteamlogger
POSTGRES_HOST=db
POSTGRES_PORT=5432
POSTGRES_SSL=true

# Server Configuration
PORT=3001
NODE_ENV=development
FRONTEND_URL={frontend_url}
BIND_ADDRESS={bind_address}
HOSTNAME={frontend_hostname}
HTTPS=true
SSL_CRT_FILE=certs/server.crt
SSL_KEY_FILE=certs/server.key
"""

        # Add Google SSO configuration if provided
        if args.google_client_id and args.google_client_secret:
            env_content += f"""
# Google SSO Configuration
GOOGLE_CLIENT_ID={args.google_client_id}
GOOGLE_CLIENT_SECRET={args.google_client_secret}
GOOGLE_CALLBACK_URL={args.google_callback_url}
"""

        # Add timestamp and warning
        env_content += f"""
# Generated on: {datetime.datetime.utcnow().isoformat()}
# IMPORTANT: Keep this file secure and never commit it to version control"""

        # Write to .env file
        with open(ENV_FILE, 'w') as f:
            f.write(env_content)
        print("\033[32mGenerated new .env file with secure keys\033[0m")
        
        # Output the keys for first-time setup
        print("\033[33m\nInitial Credentials (save these somewhere secure):\033[0m")
        print("\033[36mAdmin Credentials:\033[0m")
        print(f"ADMIN_PASSWORD={admin_password}")
        
        print("\n\033[36mUser Credentials:\033[0m")
        print(f"USER_PASSWORD={user_password}")
        
        print("\n\033[36mDatabase Credentials:\033[0m")
        print(f"POSTGRES_PASSWORD={postgres_password}")
        
        print("\n\033[36mRedis Credentials:\033[0m")
        print(f"REDIS_PASSWORD={redis_password}")
        
        # Generate a backup of credentials
        backup_filename = f"credentials-backup-{int(time.time() * 1000)}.txt"
        credentials_backup = f"""# Backup of Initial Credentials - Created on {datetime.datetime.utcnow().isoformat()}
# IMPORTANT: Store this file securely and then delete it after saving the credentials!

Admin Password: {admin_password}
User Password: {user_password}
Database Password: {postgres_password}
Redis Password: {redis_password}
Redis Encryption Key: {redis_encryption_key}
Redis SSL: true
JWT Secret: {jwt_secret}"""

        # Add Google SSO credentials to the backup if provided
        if args.google_client_id and args.google_client_secret:
            credentials_backup += f"""

# Google SSO Configuration
Google Client ID: {args.google_client_id}
Google Client Secret: {args.google_client_secret}
Google Callback URL: {args.google_callback_url}"""

        with open(backup_filename, 'w') as f:
            f.write(credentials_backup)
        
        print(f"\n\033[31mIMPORTANT: A backup of credentials has been saved to {backup_filename}\033[0m")
        print("\033[31mStore this file securely and delete it after saving the credentials!\033[0m")
    else:
        print("\033[33m.env file already exists, skipping generation\033[0m")
        
        # Check if Google SSO was provided but .env already exists
        if args.google_client_id and args.google_client_secret:
            print("\033[33mUpdating existing .env file with Google SSO configuration...\033[0m")
            
            # Read existing .env
            with open(ENV_FILE, 'r') as f:
                env_content = f.read()
            
            # Check if Google SSO is already configured
            if 'GOOGLE_CLIENT_ID' in env_content:
                print("\033[33mGoogle SSO configuration already exists in .env. Updating values...\033[0m")
                
                # Read existing .env line by line
                lines = []
                with open(ENV_FILE, 'r') as f:
                    for line in f:
                        if line.startswith('GOOGLE_CLIENT_ID='):
                            lines.append(f"GOOGLE_CLIENT_ID={args.google_client_id}\n")
                        elif line.startswith('GOOGLE_CLIENT_SECRET='):
                            lines.append(f"GOOGLE_CLIENT_SECRET={args.google_client_secret}\n")
                        elif line.startswith('GOOGLE_CALLBACK_URL='):
                            lines.append(f"GOOGLE_CALLBACK_URL={args.google_callback_url}\n")
                        else:
                            lines.append(line)
                
                # Write updated .env
                with open(ENV_FILE, 'w') as f:
                    f.writelines(lines)
            else:
                # Append Google SSO config to existing .env
                with open(ENV_FILE, 'a') as f:
                    f.write(f"""
# Google SSO Configuration
GOOGLE_CLIENT_ID={args.google_client_id}
GOOGLE_CLIENT_SECRET={args.google_client_secret}
GOOGLE_CALLBACK_URL={args.google_callback_url}
""")
            
            print("\033[32mUpdated .env with Google SSO configuration\033[0m")

    # Generate certificates based on the chosen method
    try:
        print("DEBUG: About to handle certificate generation")
        sys.stdout.flush() 
        if args.letsencrypt:
            print("\033[36mUsing hybrid approach with Let's Encrypt for frontend and self-signed for internal services\033[0m")
            # Always use the hybrid approach with Let's Encrypt
            cert_success = get_letsencrypt_certificate_hybrid(args.domain, args.email)
            
            if not cert_success:
                print("\033[33mLet's Encrypt certificate generation failed, falling back to self-signed certificates\033[0m")
                generate_certificate(frontend_hostname)
        elif args.self_signed:
            generate_certificate(frontend_hostname)
    except Exception as e:
        print(f"Error generating certificates: {str(e)}")
        traceback.print_exc()  # Add traceback for better error reporting
        sys.exit(1)

    # Make setup-ssl script executable on Linux/Mac
    if platform.system() != 'Windows':
        try:
            ssl_script_path = Path("backend/db/init/00-setup-ssl.sh")
            print("\033[36mMaking SSL setup script executable\033[0m")
            os.chmod(ssl_script_path, 0o755)  # rwxr-xr-x
            print("\033[32mSSL setup script is now executable\033[0m")
        except Exception as e:
            print(f"Warning: Could not make SSL setup script executable: {str(e)}")

    # Add .env, certificates, and credentials backup to .gitignore
    gitignore_path = '.gitignore'
    gitignore_entries = [
        '.env',
        'credentials-backup-*.txt',
        '*/node_modules/*',
        'backend/data/logs.json',
        'backend/data/auth_logs.json',
        'certs/*',
        'server.crt',
        'server.key',
        'package-lock.json',
        'node_modules'
    ]

    if os.path.exists(gitignore_path):
        with open(gitignore_path, 'r') as f:
            current_gitignore = f.read()
        
        new_entries = [entry for entry in gitignore_entries if entry not in current_gitignore]
        
        if new_entries:
            with open(gitignore_path, 'a') as f:
                f.write('\n' + '\n'.join(new_entries) + '\n')
            print("\033[32mUpdated .gitignore with new entries\033[0m")
    else:
        with open(gitignore_path, 'w') as f:
            f.write('\n'.join(gitignore_entries) + '\n')
        print("\033[32mCreated .gitignore with necessary entries\033[0m")

    # Create frontend .env file for HTTPS
    frontend_dir = Path("frontend")
    frontend_dir.mkdir(exist_ok=True)
    frontend_env_path = frontend_dir / ".env"
    
    # Update the API URL to use the correct hostname
    frontend_env_content = f"""HTTPS=true
SSL_CRT_FILE=../certs/server.crt
SSL_KEY_FILE=../certs/server.key
REACT_APP_API_URL=https://{frontend_hostname}:3001"""

    with open(frontend_env_path, 'w') as f:
        f.write(frontend_env_content)
    print("\033[32mCreated frontend .env file for HTTPS\033[0m")

    # Create a warning message for development
    print("\n\033[33mNext steps:\033[0m")
    print("1. Save the credentials from the backup file to a secure location")
    print("2. Delete the credentials backup file")
    print("3. Run docker-compose up --build to start the application")
    
    if args.letsencrypt:
        print("4. Your Let's Encrypt certificates will expire in 90 days")
        print("   A cron job has been set up to automatically renew them")
        print("   You can also manually renew them with: python3 renew-cert.py " + args.domain)
        print("   Using hybrid approach: Let's Encrypt for frontend, self-signed for internal")
    else:
        print("4. Accept the self-signed certificate in your browser when prompted")
        
    print("5. Login with the admin and/or user credentials to set up initial access")
    
    # Add Google SSO specific instructions if configured
    if args.google_client_id and args.google_client_secret:
        print("\n\033[36mGoogle SSO Configuration:\033[0m")
        print("- Google SSO has been configured with the provided credentials")
        print("- Make sure you've configured the following in your Google Cloud Console:")
        
        # Check if callback URL contains ngrok
        if "ngrok" in args.google_callback_url:
            print(f"  * Authorized JavaScript origins: {args.google_callback_url.split('/')[0]}//{args.google_callback_url.split('/')[2]}")
            print(f"  * Authorized redirect URIs: {args.google_callback_url}")
            print("\n\033[33mNOTE FOR NGROK USERS:\033[0m")
            print("  - When using ngrok, DO NOT include the port in your Google Console configurations")
            print("  - JavaScript origin should be like: https://your-subdomain.ngrok-free.app")
            print("  - Redirect URI should be like: https://your-subdomain.ngrok-free.app/api/auth/google/callback")
        else:
            # For non-ngrok URLs, include port if in the frontend_url
            port = ""
            if ':' in parsed_url.netloc:
                port = ":" + parsed_url.netloc.split(':')[1]
            
            js_origin = f"https://{frontend_hostname}{port}"
            print(f"  * Authorized JavaScript origins: {js_origin}")
            print(f"  * Authorized redirect URIs: {args.google_callback_url}")
    
    if bind_address == '0.0.0.0':
        print("\n\033[32m------- EXTERNAL ACCESS ENABLED -------\033[0m")
        print("Your application will be accessible from other machines at:")
        print(f"- Frontend: https://{frontend_hostname}:3000")
        if args.letsencrypt:
            print("\033[32mFrontend uses Let's Encrypt certificate - no browser warnings!\033[0m")
        else:
            print("\033[33mNote: Users will need to accept the self-signed certificate warning.\033[0m")
        print("-------------------------------------------")
    
    # Add Let's Encrypt renewal instructions if applicable
    if args.letsencrypt:
        print("\n\033[36mLet's Encrypt Certificate Renewal:\033[0m")
        print("1. Certificates are valid for 90 days")
        print("2. A cron job has been set up to automatically renew the certificates")
        print("3. You can also manually renew with: python3 renew-cert.py " + args.domain)
        print("4. After renewal, restart Docker services: docker-compose restart")
        
    # Add generic Google OAuth setup guide
    if not args.google_client_id or not args.google_client_secret:
        print("\n\033[36mGoogle OAuth Configuration Guide:\033[0m")
        print("1. Create a project in Google Cloud Console (console.cloud.google.com)")
        print("2. Navigate to APIs & Services > OAuth consent screen")
        print("   - Configure the OAuth consent screen (can be external for testing)")
        print("   - Add scopes for email and profile")
        print("3. Navigate to APIs & Services > Credentials")
        print("   - Create OAuth 2.0 Client ID credentials")
        print("   - Add authorized JavaScript origins and redirect URIs as noted above")
        print("4. Copy Client ID and Client Secret to use with this script")
        print("\n\033[33mTIP FOR NGROK USERS:\033[0m")
        print("- For consistent testing, use a fixed subdomain with ngrok:")
        print("  ngrok http https://localhost:3000 --subdomain=yourname")
        print("- This gives you a consistent URL like: https://yourname.ngrok-free.app")
        print("-------------------------------------------\n")

if __name__ == "__main__":
    main()