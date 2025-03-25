"""Manage configuration file generation for the Clio environment."""

import os
import datetime
from pathlib import Path
from .utils.file_operations import write_file, append_to_gitignore, ensure_directory

def create_environment_config(args, credentials):
    """Generate all configuration files needed for the environment."""
    # Create separate .env files for each service
    if credentials.get('is_new', False):
        # Create common credentials to reference in service-specific .env files
        common_creds = {
            'redis_encryption_key': credentials['redis_encryption_key'],
            'jwt_secret': credentials['jwt_secret'],
            'admin_password': credentials['admin_password'],
            'user_password': credentials['user_password'],
            'redis_password': credentials['redis_password'],
            'postgres_password': credentials['postgres_password'],
            'field_encryption_key': credentials.get('field_encryption_key', generate_fallback_field_encryption_key()),
        }
        
        # Create .env files for each service
        create_backend_env(args, common_creds)
        create_redis_env(common_creds)
        create_db_env(common_creds)
        create_relation_service_env(args, common_creds)
        
        # Create .env file with core variables for docker-compose
        create_core_env(args, common_creds)
    
    # Create frontend .env file
    create_frontend_env(args)
    
    # Add entries to .gitignore
    update_gitignore()

def generate_fallback_field_encryption_key():
    """Generate a fallback field encryption key if not provided in credentials."""
    import secrets
    return secrets.token_hex(32)

def create_core_env(args, creds):
    """Generate the core .env file with minimal environment variables for docker-compose."""
    env_content = f"""# Core environment variables for docker-compose
# Generated on: {datetime.datetime.utcnow().isoformat()}

# Database credentials - needed for docker-compose health checks
POSTGRES_USER=postgres
POSTGRES_PASSWORD={creds['postgres_password']}
POSTGRES_DB=redteamlogger

# Redis password - needed for docker-compose health checks
REDIS_PASSWORD={creds['redis_password']}

# This minimal .env file only contains variables needed for docker-compose health checks
# Service-specific environment variables are in their respective .env files
"""

    # Write to .env file
    write_file('.env', env_content)
    print("\033[32mGenerated new core .env file with minimal variables\033[0m")

def create_backend_env(args, creds):
    """Generate the backend-specific .env file."""
    ensure_directory(Path("backend"))
    
    env_content = f"""# Backend environment variables
# Generated on: {datetime.datetime.utcnow().isoformat()}

# Security Keys
REDIS_ENCRYPTION_KEY={creds['redis_encryption_key']}
JWT_SECRET={creds['jwt_secret']}
ADMIN_PASSWORD={creds['admin_password']}
USER_PASSWORD={creds['user_password']}
REDIS_PASSWORD={creds['redis_password']}
REDIS_SSL=true

# Field-level encryption for sensitive data (passwords)
FIELD_ENCRYPTION_KEY={creds['field_encryption_key']}

# PostgreSQL Configuration
POSTGRES_USER=postgres
POSTGRES_PASSWORD={creds['postgres_password']}
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
# IMPORTANT: Keep this file secure and never commit it to version control"""

    # Write to backend/.env file
    write_file('backend/.env', env_content)
    print("\033[32mGenerated backend/.env file with backend-specific variables\033[0m")

def create_redis_env(creds):
    """Generate the Redis-specific .env file."""
    ensure_directory(Path("redis"))
    
    env_content = f"""# Redis environment variables
# Generated on: {datetime.datetime.utcnow().isoformat()}

REDIS_PASSWORD={creds['redis_password']}
REDIS_ENCRYPTION_KEY={creds['redis_encryption_key']}

# IMPORTANT: Keep this file secure and never commit it to version control
"""

    # Write to redis/.env file
    write_file('redis/.env', env_content)
    print("\033[32mGenerated redis/.env file with Redis-specific variables\033[0m")

def create_db_env(creds):
    """Generate the database-specific .env file."""
    ensure_directory(Path("db"))
    
    env_content = f"""# PostgreSQL environment variables
# Generated on: {datetime.datetime.utcnow().isoformat()}

POSTGRES_USER=postgres
POSTGRES_PASSWORD={creds['postgres_password']}
POSTGRES_DB=redteamlogger
POSTGRES_SSL=true

# IMPORTANT: Keep this file secure and never commit it to version control
"""

    # Write to db/.env file
    write_file('db/.env', env_content)
    print("\033[32mGenerated db/.env file with database-specific variables\033[0m")

def create_relation_service_env(args, creds):
    """Generate the relation-service-specific .env file."""
    ensure_directory(Path("relation-service"))
    
    env_content = f"""# Relation Service environment variables
# Generated on: {datetime.datetime.utcnow().isoformat()}

NODE_ENV=development
PORT=3002
FRONTEND_URL={args.frontend_url}
HOSTNAME={args.hostname}
HTTPS=true

# PostgreSQL Configuration
POSTGRES_USER=postgres
POSTGRES_PASSWORD={creds['postgres_password']}
POSTGRES_DB=redteamlogger
POSTGRES_HOST=db
POSTGRES_PORT=5432
POSTGRES_SSL=true

# IMPORTANT: Keep this file secure and never commit it to version control
"""

    # Write to relation-service/.env file
    write_file('relation-service/.env', env_content)
    print("\033[32mGenerated relation-service/.env file with service-specific variables\033[0m")

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
    print("\033[32mCreated frontend/.env file for HTTPS\033[0m")

def update_gitignore():
    """Add sensitive files to .gitignore."""
    gitignore_entries = [
        '.env',
        'credentials-backup-*.txt',
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