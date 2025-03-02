#!/usr/bin/env python3
"""
Python equivalent of generate-env.js for the RedTeamLogger project.
Generates environment variables, security keys, and SSL certificates.

Usage:
    python3 generate-env.py [frontend_url]
    
Example:
    python3 generate-env.py https://myapp.example.com
    
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
from pathlib import Path
from urllib.parse import urlparse
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.backends import default_backend

# Parse command line arguments
if len(sys.argv) > 1:
    frontend_url = sys.argv[1]
else:
    frontend_url = 'https://localhost:3000'

# Validate URL format
try:
    parsed_url = urlparse(frontend_url)
    if not all([parsed_url.scheme, parsed_url.netloc]):
        raise ValueError("Invalid URL format")
except Exception as e:
    print(f"Error: Invalid URL format provided - {str(e)}")
    print("Usage: python3 generate-env.py [frontend-url]")
    print("Example: python3 generate-env.py https://myapp.example.com")
    print("If no URL is provided, https://localhost:3000 will be used")
    sys.exit(1)

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
    
    # Get hostname from frontend URL
    frontend_hostname = urlparse(frontend_url).netloc.split(':')[0]
    if frontend_hostname == 'localhost':
        # Add 127.0.0.1 for localhost connections
        extra_hostnames = ['localhost', '127.0.0.1']
    else:
        extra_hostnames = ['localhost']

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
            x509.SubjectAlternativeName([
                x509.DNSName(common_name),
                *[x509.DNSName(name) for name in extra_hostnames],
                # Service hostnames
                x509.DNSName("backend"),
                x509.DNSName("frontend"),
                x509.DNSName("relation-service"),
                x509.DNSName("db"),
                x509.DNSName("redis"),
            ]),
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
HTTPS=true
SSL_CRT_FILE=certs/server.crt
SSL_KEY_FILE=certs/server.key

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

        with open(backup_filename, 'w') as f:
            f.write(credentials_backup)
        
        print(f"\n\033[31mIMPORTANT: A backup of credentials has been saved to {backup_filename}\033[0m")
        print("\033[31mStore this file securely and delete it after saving the credentials!\033[0m")
    else:
        print("\033[33m.env file already exists, skipping generation\033[0m")

    # Generate certificates regardless of whether .env exists
    try:
        frontend_hostname = urlparse(frontend_url).netloc.split(':')[0]
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
    
    frontend_env_content = f"""HTTPS=true
SSL_CRT_FILE=../certs/server.crt
SSL_KEY_FILE=../certs/server.key
REACT_APP_API_URL={frontend_url.replace('3000', '3001')}"""

    with open(frontend_env_path, 'w') as f:
        f.write(frontend_env_content)
    print("\033[32mCreated frontend .env file for HTTPS\033[0m")

    # Create Redis test connection script
    tools_dir = Path("backend/tools")
    tools_dir.mkdir(parents=True, exist_ok=True)
    
    test_script_path = tools_dir / "testRedisConnection.py"
    test_script_content = """#!/usr/bin/env python3
import os
import sys
import redis
import dotenv
import ssl
from pathlib import Path

# Load environment variables
dotenv.load_dotenv(Path(__file__).parent.parent.parent / '.env')

def test_redis_connection():
    redis_password = os.environ.get('REDIS_PASSWORD')
    use_tls = os.environ.get('REDIS_SSL') == 'true'
    
    if not redis_password:
        print('REDIS_PASSWORD environment variable is required')
        sys.exit(1)
    
    # Configure SSL options for Redis client
    def get_ssl_context():
        if not use_tls:
            return None
        
        try:
            cert_path = Path(__file__).parent.parent.parent / 'certs/redis.crt'
            key_path = Path(__file__).parent.parent.parent / 'certs/redis.key'
            ca_path = Path(__file__).parent.parent.parent / 'certs/server.crt'
            
            if cert_path.exists() and key_path.exists() and ca_path.exists():
                ssl_context = ssl.create_default_context()
                ssl_context.load_cert_chain(cert_path, keyfile=key_path)
                ssl_context.load_verify_locations(ca_path)
                ssl_context.check_hostname = False
                ssl_context.verify_mode = ssl.CERT_NONE  
                return ssl_context
            else:
                print('SSL certificates not found, using basic SSL')
                ssl_context = ssl.create_default_context()
                ssl_context.check_hostname = False
                ssl_context.verify_mode = ssl.CERT_NONE
                return ssl_context
        except Exception as e:
            print(f'Error loading Redis SSL certificates: {str(e)}')
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE
            return ssl_context
    
    try:
        print('Connecting to Redis...')
        print(f'TLS enabled: {use_tls}')
        
        # Create Redis client
        redis_client = redis.Redis(
            host='localhost',
            port=6379,
            password=redis_password,
            ssl=use_tls,
            ssl_cert_reqs=None if use_tls else None,
            ssl_keyfile=str(Path(__file__).parent.parent.parent / 'certs/redis.key') if use_tls else None,
            ssl_certfile=str(Path(__file__).parent.parent.parent / 'certs/redis.crt') if use_tls else None,
            ssl_ca_certs=str(Path(__file__).parent.parent.parent / 'certs/server.crt') if use_tls else None,
            decode_responses=True
        )
        
        # Test setting and getting a value
        test_key = f'test_key_{os.urandom(4).hex()}'
        test_value = f'Connection successful - {str(datetime.datetime.now())}'
        
        redis_client.set(test_key, test_value)
        retrieved_value = redis_client.get(test_key)
        
        print(f'Test value retrieved: {retrieved_value}')
        
        # Clean up
        redis_client.delete(test_key)
        print('Redis connection test completed successfully')
        
    except Exception as e:
        print(f'Failed to connect to Redis: {str(e)}')
        sys.exit(1)

if __name__ == '__main__':
    test_redis_connection()
"""

    with open(test_script_path, 'w') as f:
        f.write(test_script_content)
    os.chmod(test_script_path, 0o755)  # Make it executable
    print("\033[32mCreated Redis connection test script\033[0m")

    # Create a warning message for development
    print("\n\033[33mNext steps:\033[0m")
    print("1. Save the credentials from the backup file to a secure location")
    print("2. Delete the credentials backup file")
    print("3. Run docker-compose up --build to start the application")
    print("4. Accept the self-signed certificate in your browser when prompted")
    print("5. Login with the admin credentials to set up initial access")
    print("6. To test Redis TLS connection: python3 backend/tools/testRedisConnection.py")
    print(f"\nFrontend URL configured as: {frontend_url}")
    print(f"Backend URL will be: {frontend_url.replace('3000', '3001')}\n")

if __name__ == "__main__":
    main()