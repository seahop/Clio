"""Manage configuration file generation for the Clio environment."""

import os
import datetime
from pathlib import Path
from .utils.file_operations import write_file, append_to_gitignore, ensure_directory

def create_environment_config(args, credentials):
    """Generate all configuration files needed for the environment."""
    # Create .env file if it doesn't exist
    if not os.path.exists('.env') and credentials.get('is_new', False):
        create_env_file(args, credentials)
    
    # Create frontend .env file
    create_frontend_env(args)
    
    # Add entries to .gitignore
    update_gitignore()

def create_env_file(args, credentials):
    """Generate the main .env file with environment variables."""
    # Create .env content
    env_content = f"""# Security Keys
REDIS_ENCRYPTION_KEY={credentials['redis_encryption_key']}
JWT_SECRET={credentials['jwt_secret']}
ADMIN_PASSWORD={credentials['admin_password']}
USER_PASSWORD={credentials['user_password']}
REDIS_PASSWORD={credentials['redis_password']}
REDIS_SSL=true

# PostgreSQL Configuration
POSTGRES_USER=postgres
POSTGRES_PASSWORD={credentials['postgres_password']}
POSTGRES_DB=redteamlogger
POSTGRES_HOST=db
POSTGRES_PORT=5432
POSTGRES_SSL=true

# Server Configuration
PORT=3001
NODE_ENV=development
FRONTEND_URL={args.frontend_url}
BIND_ADDRESS={args.bind_address}
HOSTNAME={args.hostname}
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
    write_file('.env', env_content)
    print("\033[32mGenerated new .env file with secure keys\033[0m")

def create_frontend_env(args):
    """Create frontend .env file for HTTPS."""
    # Create frontend directory if it doesn't exist
    frontend_dir = Path("frontend")
    ensure_directory(frontend_dir)
    
    frontend_env_path = frontend_dir / ".env"
    
    # Create frontend .env content
    frontend_env_content = f"""HTTPS=true
SSL_CRT_FILE=../certs/server.crt
SSL_KEY_FILE=../certs/server.key
REACT_APP_API_URL=https://{args.hostname}:3001"""

    # Write to frontend .env file
    write_file(frontend_env_path, frontend_env_content)
    print("\033[32mCreated frontend .env file for HTTPS\033[0m")

def update_gitignore():
    """Add sensitive files to .gitignore."""
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
    
    # Add entries to .gitignore
    result = append_to_gitignore(gitignore_entries)
    
    if result:
        print("\033[32mUpdated .gitignore with necessary entries\033[0m")