"""Command line argument handling for the environment generator."""

import argparse
from urllib.parse import urlparse

# Help text to display in the CLI
HELP_TEXT = """
RedTeamLogger Environment Generator

This script generates the necessary environment configuration, security keys, 
and SSL certificates for the RedTeamLogger application.

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
        description='Generate environment configuration for RedTeamLogger',
        epilog=HELP_TEXT,
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument('frontend_url', nargs='?', default='https://localhost', 
                        help='Frontend URL (default: https://localhost)')
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
        
        # Validate Let's Encrypt required parameters
        if not args.domain:
            parser.error("--domain is required with --letsencrypt")
        if not args.email:
            parser.error("--email is required with --letsencrypt")

    # Validate URL format
    try:
        parsed_url = urlparse(args.frontend_url)
        if not all([parsed_url.scheme, parsed_url.netloc]):
            raise ValueError("Invalid URL format")
    except Exception as e:
        parser.error(f"Invalid URL format provided: {str(e)}")

    # Extract hostname from the URL
    args.hostname = parsed_url.netloc.split(':')[0]
    
    # Determine if this is an ngrok URL
    args.is_ngrok = 'ngrok' in args.hostname

    # Determine if the hostname is an IP address
    args.is_ip_address = bool(is_ip_address(args.hostname))

    # Set the bind address based on the hostname
    if args.hostname == 'localhost':
        args.bind_address = '127.0.0.1'  # Bind only to localhost
    else:
        args.bind_address = '0.0.0.0'    # Bind to all interfaces for non-localhost hostnames

    # Determine default Google callback URL if not specified
    if args.google_client_id and args.google_client_secret and not args.google_callback_url:
        # For ngrok URLs, remove port from callback
        if args.is_ngrok:
            args.google_callback_url = f"https://{args.hostname}/api/auth/google/callback"
        else:
            # For regular URLs, maintain the port if present in frontend_url
            port = ""
            if ':' in parsed_url.netloc:
                port = ":" + parsed_url.netloc.split(':')[1]
            args.google_callback_url = f"https://{args.hostname}{port}/api/auth/google/callback"

    return args

def is_ip_address(hostname):
    """Check if the hostname is an IP address."""
    import re
    return bool(re.match(r'^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$', hostname))