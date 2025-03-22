#!/usr/bin/env python3
"""
Python equivalent of generate-env.js for the RedTeamLogger project.
Generates environment variables, security keys, and SSL certificates.

Usage:
    python3 generate-env.py [frontend_url] [--google-client-id=CLIENT_ID] [--google-client-secret=CLIENT_SECRET] [--google-callback-url=CALLBACK_URL]
    
Example:
    python3 generate-env.py https://myapp.example.com --google-client-id=123456789.apps.googleusercontent.com --google-client-secret=abcdef123456
    python3 generate-env.py https://192.168.1.100:3000
    
If no URL is provided, https://localhost:3000 will be used.
"""

import os
import sys
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
from pathlib import Path
from urllib.parse import urlparse

# Define help text for the script
HELP_TEXT = """
RedTeamLogger Environment Generator

This script generates the necessary environment configuration, security keys, 
and SSL certificates for the RedTeamLogger application.

Basic usage:
    python3 generate-env.py [frontend_url]

Advanced usage with Google SSO:
    python3 generate-env.py [frontend_url] --google-client-id=CLIENT_ID --google-client-secret=CLIENT_SECRET

Examples:
    python3 generate-env.py https://localhost:3000
    python3 generate-env.py https://192.168.1.100:3000
    python3 generate-env.py https://myapp.example.com --google-client-id=123456789.apps.googleusercontent.com --google-client-secret=abcdef123456
    python3 generate-env.py https://myapp.example.com --google-client-id=123456789.apps.googleusercontent.com --google-client-secret=abcdef123456 --google-callback-url=https://mysubdomain.ngrok-free.app/api/auth/google/callback

Notes:
    - If no frontend URL is provided, https://localhost:3000 will be used by default
    - Google SSO parameters are optional
    - If a Google callback URL is not specified, it will be automatically generated based on your hostname
    - For ngrok tunnels, do not include port in the callback URL
    - Existing .env files will not be overwritten but will be updated with Google SSO settings if provided
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
parser.add_argument('--google-client-id', 
                    help='Google OAuth Client ID from Google Cloud Console')
parser.add_argument('--google-client-secret', 
                    help='Google OAuth Client Secret from Google Cloud Console')
parser.add_argument('--google-callback-url', 
                    help='Google OAuth Callback URL (default: https://[hostname]/api/auth/google/callback)')
args = parser.parse_args()

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
frontend_hostname = urlparse(frontend_url).netloc.split(':')[0]

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
        if ':' in urlparse(frontend_url).netloc:
            port = ":" + urlparse(frontend_url).netloc.split(':')[1]
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
    print("\033[36mGenerating SSL certificate...\033[0m")
    
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

    # Generate certificates regardless of whether .env exists
    try:
        # Don't redefine frontend_hostname here - use the one from the global scope
        generate_certificate(frontend_hostname)
    except Exception as e:
        print(f"Error generating certificates: {str(e)}")
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
            if ':' in urlparse(frontend_url).netloc:
                port = ":" + urlparse(frontend_url).netloc.split(':')[1]
            
            js_origin = f"https://{frontend_hostname}{port}"
            print(f"  * Authorized JavaScript origins: {js_origin}")
            print(f"  * Authorized redirect URIs: {args.google_callback_url}")
    
    if bind_address == '0.0.0.0':
        print("\n\033[32m------- EXTERNAL ACCESS ENABLED -------\033[0m")
        print("Your application will be accessible from other machines at:")
        print(f"- Frontend: https://{frontend_hostname}:3000")
        print("\033[33mNote: Users will need to accept the self-signed certificate warning.\033[0m")
        print("-------------------------------------------")
    
    # Add generic Google OAuth setup guide
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