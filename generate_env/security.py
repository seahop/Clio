"""Generate security credentials for the Clio environment."""

import secrets
import base64
import os
import time
import datetime
from .utils.file_operations import write_file

def generate_secure_key(bytes_length):
    """Generate a secure random key as a hex string."""
    return secrets.token_hex(bytes_length)

def generate_secure_password(bytes_length):
    """Generate a secure random password in base64 format."""
    return base64.b64encode(secrets.token_bytes(bytes_length)).decode('utf-8')

def generate_security_credentials(args):
    """Generate all security credentials needed for the environment."""
    credentials = {}
    
    # Check if service-specific .env files exist to determine if we need to generate new credentials
    if not (os.path.exists('backend/.env') and 
            os.path.exists('redis/.env') and 
            os.path.exists('db/.env') and 
            os.path.exists('relation-service/.env')):
        credentials['is_new'] = True
        
        # Generate secure keys and passwords
        credentials['redis_encryption_key'] = generate_secure_key(32)
        credentials['jwt_secret'] = generate_secure_key(64)
        credentials['admin_password'] = generate_secure_password(12)
        credentials['user_password'] = generate_secure_password(12)
        credentials['redis_password'] = generate_secure_password(16)
        credentials['postgres_password'] = generate_secure_password(32)
        
        # Create a backup of the credentials
        backup_filename = create_credentials_backup(credentials, args)
        credentials['backup_file'] = backup_filename
    else:
        credentials['is_new'] = False
        print("\033[33mService .env files already exist, skipping credential generation\033[0m")
        
        # Add Google SSO to existing .env if needed
        if args.google_client_id and args.google_client_secret:
            update_env_with_google_sso(args)
    
    return credentials

def create_credentials_backup(credentials, args):
    """Create a backup file with the generated credentials."""
    # Generate a unique backup filename
    backup_filename = f"credentials-backup-{int(time.time() * 1000)}.txt"
    
    # Create the backup content
    backup_content = f"""# Backup of Initial Credentials - Created on {datetime.datetime.utcnow().isoformat()}
# IMPORTANT: Store this file securely and then delete it after saving the credentials!

Admin Password: {credentials['admin_password']}
User Password: {credentials['user_password']}
Database Password: {credentials['postgres_password']}
Redis Password: {credentials['redis_password']}
Redis Encryption Key: {credentials['redis_encryption_key']}
Redis SSL: true
JWT Secret: {credentials['jwt_secret']}"""

    # Add Google SSO credentials to the backup if provided
    if args.google_client_id and args.google_client_secret:
        backup_content += f"""

# Google SSO Configuration
Google Client ID: {args.google_client_id}
Google Client Secret: {args.google_client_secret}
Google Callback URL: {args.google_callback_url}"""

    # Write the backup file
    write_file(backup_filename, backup_content)
    
    return backup_filename

def update_env_with_google_sso(args):
    """Update existing .env files with Google SSO configuration."""
    print("\033[33mUpdating existing backend/.env file with Google SSO configuration...\033[0m")
    
    # Only the backend needs Google SSO configuration
    backend_env_path = 'backend/.env'
    
    if os.path.exists(backend_env_path):
        # Read existing .env
        with open(backend_env_path, 'r') as f:
            env_content = f.read()
        
        # Check if Google SSO is already configured
        if 'GOOGLE_CLIENT_ID' in env_content:
            print("\033[33mGoogle SSO configuration already exists in backend/.env. Updating values...\033[0m")
            
            # Read existing .env line by line
            lines = []
            with open(backend_env_path, 'r') as f:
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
            with open(backend_env_path, 'w') as f:
                f.writelines(lines)
        else:
            # Append Google SSO config to existing .env
            with open(backend_env_path, 'a') as f:
                f.write(f"""
# Google SSO Configuration
GOOGLE_CLIENT_ID={args.google_client_id}
GOOGLE_CLIENT_SECRET={args.google_client_secret}
GOOGLE_CALLBACK_URL={args.google_callback_url}
""")
        
        print("\033[32mUpdated backend/.env with Google SSO configuration\033[0m")
    else:
        print("\033[31mNo existing backend/.env file found for Google SSO configuration\033[0m")