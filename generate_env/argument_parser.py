"""Command line argument handling for the environment generator."""

import argparse
from urllib.parse import urlparse

# Help text to display in the CLI
HELP_TEXT = """
Clio Environment Generator

This script generates the necessary environment configuration, security keys, 
and SSL certificates for the Clio application.

Basic usage:
    sudo python3 generate-env.py [frontend_url]

Advanced usage with Let's Encrypt:
    sudo python3 generate-env.py [frontend_url] --letsencrypt --dns-challenge --domain=myapp.example.com --email=admin@example.com

Advanced usage with Google SSO:
    sudo python3 generate-env.py [frontend_url] --google-client-id=CLIENT_ID --google-client-secret=CLIENT_SECRET

Combined usage:
    sudo python3 generate-env.py [frontend_url] --letsencrypt --dns-challenge --domain=myapp.example.com --email=admin@example.com --google-client-id=CLIENT_ID --google-client-secret=CLIENT_SECRET

Examples:
    sudo python3 generate-env.py https://localhost
    sudo python3 generate-env.py https://192.168.1.100
    sudo python3 generate-env.py https://myapp.example.com --letsencrypt --dns-challenge --domain=myapp.example.com --email=admin@example.com
    sudo python3 generate-env.py https://myapp.example.com --google-client-id=123456789.apps.googleusercontent.com --google-client-secret=abcdef123456
    sudo python3 generate-env.py https://yourdomain.com --letsencrypt --domain=yourdomain.com --email=your@email.com --google-client-id=123456.your.client.id --google-client-secret=YOUR-SECRET --google-callback-url=https://yourdomain.com/api/auth/google/callback

Notes:
    - If no frontend URL is provided, https://localhost will be used by default
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
    
def is_ip_address(hostname):
    """Check if the hostname is an IP address."""
    import re
    return bool(re.match(r'^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$', hostname))