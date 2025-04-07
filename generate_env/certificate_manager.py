"""Certificate generation and management for the Clio environment."""

import os
import sys
import shutil
import subprocess
import platform
import ipaddress
import datetime
from pathlib import Path
from .utils.file_operations import ensure_directory

def generate_certificates(args):
    """Generate SSL certificates based on the user's choices."""
    print("\033[36mGenerating certificates...\033[0m")
    
    try:
        if args.letsencrypt:
            print("\033[36mUsing hybrid approach with Let's Encrypt for frontend and self-signed for internal services\033[0m")
            cert_success = get_letsencrypt_certificate_hybrid(args)
            
            if not cert_success:
                print("\033[33mLet's Encrypt certificate generation failed, falling back to self-signed certificates\033[0m")
                generate_self_signed_certificate(args)
        elif args.self_signed:
            generate_self_signed_certificate(args)
    except Exception as e:
        print(f"\033[31mError generating certificates: {str(e)}\033[0m")
        print("\033[33mFalling back to self-signed certificates\033[0m")
        generate_self_signed_certificate(args)
    
    # Make setup-ssl script executable on Linux/Mac
    if platform.system() != 'Windows':
        try:
            ssl_script_path = Path("backend/db/init/00-setup-ssl.sh")
            if ssl_script_path.exists():
                print("\033[36mMaking SSL setup script executable\033[0m")
                os.chmod(ssl_script_path, 0o755)  # rwxr-xr-x
                print("\033[32mSSL setup script is now executable\033[0m")
        except Exception as e:
            print(f"\033[33mWarning: Could not make SSL setup script executable: {str(e)}\033[0m")

def generate_self_signed_certificate(args):
    """Generate a self-signed SSL certificate."""
    print(f"\033[36mGenerating self-signed SSL certificate for {args.hostname}...\033[0m")
    
    # Create certs directory if it doesn't exist
    certs_dir = Path("certs")
    ensure_directory(certs_dir)
    
    try:
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.backends import default_backend
        
        # Define alternative hostnames
        alt_names = [
            x509.DNSName(args.hostname),  # Primary hostname from URL
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
        if args.is_ip_address:
            try:
                unique_alt_names.append(x509.IPAddress(ipaddress.IPv4Address(args.hostname)))
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
            x509.NameAttribute(NameOID.COMMON_NAME, args.hostname),
            x509.NameAttribute(NameOID.COUNTRY_NAME, "US"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Clio Logging Platform")
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
        
        # Save the main server certificate and key
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
        
        # Create certificates only for the necessary services
        for service in ['backend', 'db', 'redis']:
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
        print("\033[32mGenerated server.crt, server.key, and service-specific certificates with permissions 644\033[0m")
        return True
        
    except ImportError:
        print("\033[31mError: cryptography module not found. Installing required packages...\033[0m")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "cryptography"])
            print("\033[32mPackages installed successfully, retrying certificate generation...\033[0m")
            # Retry after installing the package
            return generate_self_signed_certificate(args)
        except Exception as e:
            print(f"\033[31mFailed to install required packages: {str(e)}\033[0m")
            return False
    except Exception as e:
        print(f"\033[31mError generating certificate: {str(e)}\033[0m")
        return False

def update_env_with_letsencrypt_paths(cert_path, key_path):
    """Update the .env file with Let's Encrypt certificate paths"""
    env_path = '.env'
    if os.path.exists(env_path):
        # Read existing .env file
        with open(env_path, 'r') as f:
            lines = f.readlines()
        
        # Update or add the LETSENCRYPT_CERT_PATH and LETSENCRYPT_KEY_PATH variables
        cert_updated = False
        key_updated = False
        
        for i, line in enumerate(lines):
            if line.startswith('LETSENCRYPT_CERT_PATH='):
                lines[i] = f'LETSENCRYPT_CERT_PATH={cert_path}\n'
                cert_updated = True
            elif line.startswith('LETSENCRYPT_KEY_PATH='):
                lines[i] = f'LETSENCRYPT_KEY_PATH={key_path}\n'
                key_updated = True
        
        if not cert_updated:
            lines.append(f'LETSENCRYPT_CERT_PATH={cert_path}\n')
        if not key_updated:
            lines.append(f'LETSENCRYPT_KEY_PATH={key_path}\n')
        
        # Write updated .env file
        with open(env_path, 'w') as f:
            f.writelines(lines)
        
        print("\033[32mUpdated .env file with Let's Encrypt certificate paths\033[0m")
        
def get_letsencrypt_certificate_hybrid(args):
    """Obtain a Let's Encrypt certificate for frontend while using self-signed for internal services"""
    domain = args.domain
    email = args.email
    
    print(f"\033[36mImplementing hybrid certificate approach for {domain}\033[0m")
    print(f"\033[36m - Let's Encrypt for frontend/external access\033[0m")
    print(f"\033[36m - Self-signed for internal service communication\033[0m")
    
    # First, generate self-signed certificates for all services
    generate_self_signed_certificate(args)
    
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
        
        # Set up cron job for certificate renewal - Pass entire args object
        setup_cron_job(domain, args)
        
        return True
    except Exception as e:
        print(f"\033[31mError in Let's Encrypt certificate setup: {str(e)}\033[0m")
        print("\033[33mUsing self-signed certificates for all services\033[0m")
        return True  # Continue with self-signed certs
        
def copy_letsencrypt_certs_for_nginx(domain):
    """Copy Let's Encrypt certificates to the project for Nginx proxy use"""
    print(f"\033[36mCopying Let's Encrypt certificates for Nginx proxy...\033[0m")
    
    # Create certs directory if it doesn't exist
    certs_dir = Path("certs")
    ensure_directory(certs_dir)
    
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
        
        # Update the .env file to set the LETSENCRYPT_CERT_PATH and LETSENCRYPT_KEY_PATH variables
        update_env_with_letsencrypt_paths("./certs/letsencrypt-fullchain.pem", "./certs/letsencrypt-privkey.pem")
        
        print("\033[32mLet's Encrypt certificates copied for Nginx use\033[0m")
        return True
    except Exception as e:
        print(f"\033[31mError copying Let's Encrypt certificates: {str(e)}\033[0m")
        return False

def setup_cron_job(domain, args):
    """Set up a cron job for certificate renewal that preserves all necessary parameters"""
    print("\033[36mSetting up cron job for certificate renewal...\033[0m")
    
    if platform.system() == 'Windows':
        print("\033[33mCron jobs are not supported on Windows. Please set up a scheduled task manually.\033[0m")
        return False
    
    # Get current directory
    current_dir = os.path.abspath(os.getcwd())
    
    # Ensure the renew-cert.py script is executable
    renew_script_path = os.path.join(current_dir, "renew-cert.py")
    if os.path.exists(renew_script_path):
        os.chmod(renew_script_path, 0o755)  # rwxr-xr-x
        print("\033[32mMade renewal script executable\033[0m")
    else:
        print("\033[31mWarning: renew-cert.py not found in current directory\033[0m")
        print("\033[31mCron job will be created but may not work without the script\033[0m")
    
    # Build cron job command with all necessary parameters
    cron_cmd = f"cd {current_dir} && python3 {current_dir}/renew-cert.py {domain} --no-confirm"
    
    # If this is a Let's Encrypt setup, include --letsencrypt and email
    if args.letsencrypt and args.email:
        cron_cmd += f" --letsencrypt --email={args.email}"
    else:
        cron_cmd += " --self-signed-only"
    
    # Add DNS challenge flag if it was used in initial setup
    if args.dns_challenge:
        cron_cmd += " --dns-challenge"
    
    # Create cron job entry - run on the 1st of every month at 2 AM
    cron_job = f"0 2 1 * * {cron_cmd}"
    
    try:
        # Create a temporary file
        temp_cron_file = "temp_cron"
        
        # Export existing crontab
        subprocess.run(f"crontab -l > {temp_cron_file} 2>/dev/null || true", shell=True)
        
        # Check if the cron job already exists
        with open(temp_cron_file, 'r') as f:
            existing_cron = f.read()
        
        if cron_cmd in existing_cron:
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
        
        # Create a backup file with renewal command for manual use
        backup_file = Path(current_dir) / "certificate-renewal-command.txt"
        with open(backup_file, "w") as f:
            f.write(f"# Certificate Renewal Command\n")
            f.write(f"# Created on: {datetime.datetime.now().isoformat()}\n\n")
            f.write(f"# Run this command to manually renew certificates:\n")
            f.write(f"{cron_cmd}\n\n")
            f.write(f"# After renewal, restart Docker services with:\n")
            f.write(f"docker-compose restart\n")
        
        print(f"\033[32mSaved renewal command to {backup_file}\033[0m")
        
        return True
    except Exception as e:
        print(f"\033[31mFailed to set up cron job: {str(e)}\033[0m")
        print("\033[33mYou can manually add this cron job:\033[0m")
        print(f"\033[33m{cron_job}\033[0m")
        print("\033[33mRun 'crontab -e' to edit your crontab file.\033[0m")
        return False

def setup_nginx_config(args):
    """Set up the Nginx configuration based on certificate type"""
    nginx_configs_dir = Path("nginx-proxy/configs")
    
    if not nginx_configs_dir.exists():
        print("\033[33mNginx configs directory not found, skipping Nginx configuration\033[0m")
        return False
    
    print("\033[36mVerifying Nginx configuration...\033[0m")
    
    # Check if Let's Encrypt certificates exist in certs directory
    letsencrypt_fullchain = Path("certs/letsencrypt-fullchain.pem")
    letsencrypt_privkey = Path("certs/letsencrypt-privkey.pem")
    
    # Also make the Nginx start script executable
    nginx_start_script = Path("nginx-proxy/start.sh")
    if nginx_start_script.exists() and platform.system() != 'Windows':
        try:
            os.chmod(nginx_start_script, 0o755)
            print("\033[32mMade Nginx start script executable\033[0m")
        except Exception as e:
            print(f"\033[33mWarning: Could not make Nginx start script executable: {str(e)}\033[0m")
    
    has_letsencrypt = letsencrypt_fullchain.exists() and letsencrypt_privkey.exists()
    
    if has_letsencrypt:
        print("\033[32mLet's Encrypt certificates found for Nginx\033[0m")
        print("\033[32mNginx will use Let's Encrypt certificates for external connections\033[0m")
    else:
        print("\033[33mNo Let's Encrypt certificates found, Nginx will use self-signed certificates\033[0m")
        print("\033[33mThis will cause browser warnings for external connections\033[0m")
    
    return True