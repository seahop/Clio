"""
Clio environment generator package.

This package contains functionality to generate environment variables,
security keys, and SSL certificates for the Clio logging platform.
"""

from .argument_parser import parse_arguments
from .config_manager import create_environment_config
from .certificate_manager import generate_certificates, setup_nginx_config
from .security import generate_security_credentials
from .utils import file_operations

def main():
    """Main entry point for the environment generator."""
    # Parse command line arguments
    args = parse_arguments()
    
    # Generate security credentials (keys, passwords)
    credentials = generate_security_credentials(args)
    
    # Generate environment configuration files
    create_environment_config(args, credentials)
    
    # Generate certificates
    generate_certificates(args)
    
    # Configure Nginx based on certificate choices
    setup_nginx_config(args)
    
    # Display summary of actions taken
    print_success_message(args, credentials)
    
    return 0  # Success

def print_success_message(args, credentials):
    """Print a success message with important information for the user."""
    print("\n\033[32m===== Environment Setup Complete =====\033[0m")
    
    # Show initial credentials if they were generated
    if credentials.get('is_new', False):
        print("\033[33m\nInitial Credentials (save these somewhere secure):\033[0m")
        print("\033[36mAdmin Credentials:\033[0m")
        print(f"ADMIN_PASSWORD={credentials.get('admin_password', 'unknown')}")
        
        print("\n\033[36mUser Credentials:\033[0m")
        print(f"USER_PASSWORD={credentials.get('user_password', 'unknown')}")
        
        print("\n\033[36mDatabase Credentials:\033[0m")
        print(f"POSTGRES_PASSWORD={credentials.get('postgres_password', 'unknown')}")
        
        print("\n\033[36mRedis Credentials:\033[0m")
        print(f"REDIS_PASSWORD={credentials.get('redis_password', 'unknown')}")
        
        # Mention the backup file
        if credentials.get('backup_file'):
            print(f"\n\033[31mIMPORTANT: A backup of credentials has been saved to {credentials.get('backup_file')}\033[0m")
            print("\033[31mStore this file securely and delete it after saving the credentials!\033[0m")
    
    # Certificate information
    if args.letsencrypt:
        print("\n\033[36mCertificate Information:\033[0m")
        print("- Let's Encrypt certificates have been configured for your domain")
        print("- Self-signed certificates are used for internal service communication")
        print("- Certificates will expire in 90 days and need to be renewed")
        print(f"- A cron job has been set up to automatically renew your certificates")
        print(f"- You can manually renew with: python3 renew-cert.py {args.domain}")
    else:
        print("\n\033[36mCertificate Information:\033[0m")
        print("- Self-signed certificates have been generated")
        print("- You will need to accept these certificates in your browser")
    
    # Google SSO information if configured
    if args.google_client_id and args.google_client_secret:
        print("\n\033[36mGoogle SSO Information:\033[0m")
        print("- Google SSO has been configured with the provided credentials")
        print(f"- Callback URL: {args.google_callback_url}")
    
    print("\n\033[33mEnvironment Setup:\033[0m")
    print("- Service-specific .env files have been created in each service directory")
    print("- Each service only has access to the environment variables it needs")
    
    print("\n\033[33mNext steps:\033[0m")
    print("1. Run docker-compose up --build to start the application")
    print("2. Access the application at " + args.frontend_url)
    print("3. Login with the provided credentials")
    print("\033[32m======================================\033[0m\n")