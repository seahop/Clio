#!/usr/bin/env python3
"""
S3 Decryption Tool

This script decrypts files that were encrypted using the Clio S3 encryption feature.
It requires both the encrypted file and the corresponding key file to perform decryption.

Usage:
  python decrypt_s3_file.py filename.encrypted.zip filename.key.zip [output_file.zip]

If output_file is not specified, the script will create a file with the original filename
in the current directory.
"""

import sys
import os
import json
import argparse
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend


def parse_arguments():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description='Decrypt files encrypted by Clio S3 feature')
    
    parser.add_argument('encrypted_file', help='Path to the encrypted file (filename.encrypted.zip)')
    parser.add_argument('key_file', help='Path to the key file (filename.key.zip)')
    parser.add_argument('output_file', nargs='?', help='Path to save the decrypted file (optional)')
    parser.add_argument('--verbose', '-v', action='store_true', help='Enable verbose output')
    
    return parser.parse_args()


def read_key_file(key_file_path):
    """Read and parse the key file."""
    try:
        with open(key_file_path, 'r') as f:
            key_data = json.load(f)
            
        # Verify the key file contains required fields
        required_fields = ['algorithm', 'key', 'iv', 'originalFileName']
        missing_fields = [field for field in required_fields if field not in key_data]
        
        if missing_fields:
            raise ValueError(f"Key file is missing required fields: {', '.join(missing_fields)}")
            
        return key_data
    except json.JSONDecodeError:
        raise ValueError("Invalid key file format. Expected JSON format.")
    except Exception as e:
        raise ValueError(f"Error reading key file: {str(e)}")


def decrypt_file(encrypted_file_path, key_data, output_file_path=None, verbose=False):
    """Decrypt the file using the key data."""
    try:
        # If output file is not specified, use the original filename in the current directory
        if not output_file_path:
            output_file_path = os.path.join(os.getcwd(), key_data['originalFileName'])
        
        # Convert hex key and IV to bytes
        key = bytes.fromhex(key_data['key'])
        iv = bytes.fromhex(key_data['iv'])
        
        if verbose:
            print(f"Algorithm: {key_data['algorithm']}")
            print(f"Key length: {len(key)} bytes")
            print(f"IV length: {len(iv)} bytes")
            print(f"Original filename: {key_data['originalFileName']}")
            print(f"Encrypted filename: {key_data.get('encryptedFileName', '(not specified)')}")
            print(f"Output file: {output_file_path}")
        
        # Read the encrypted file
        with open(encrypted_file_path, 'rb') as f:
            encrypted_data = f.read()
            
        if verbose:
            print(f"Encrypted data size: {len(encrypted_data)} bytes")
        
        # Create the decryption cipher based on the algorithm in the key file
        if key_data['algorithm'] == 'aes-256-cbc':
            cipher = Cipher(
                algorithms.AES(key),
                modes.CBC(iv),
                backend=default_backend()
            )
        else:
            raise ValueError(f"Unsupported encryption algorithm: {key_data['algorithm']}")
        
        # Decrypt the data
        decryptor = cipher.decryptor()
        decrypted_data = decryptor.update(encrypted_data) + decryptor.finalize()
        
        # Remove PKCS7 padding if present
        # The last byte of the decrypted data indicates how much padding to remove
        try:
            padding_length = decrypted_data[-1]
            # Check if the padding looks valid (padding bytes should all be the same value)
            if padding_length <= 16:  # AES block size
                if all(b == padding_length for b in decrypted_data[-padding_length:]):
                    decrypted_data = decrypted_data[:-padding_length]
                    if verbose:
                        print(f"Removed {padding_length} bytes of padding")
        except Exception as e:
            if verbose:
                print(f"Warning: Error handling padding: {str(e)}")
            # Continue with the data as-is if padding removal fails
        
        # Write the decrypted data to the output file
        with open(output_file_path, 'wb') as f:
            f.write(decrypted_data)
            
        if verbose:
            print(f"Decrypted data size: {len(decrypted_data)} bytes")
            
        return output_file_path
    except Exception as e:
        raise RuntimeError(f"Decryption failed: {str(e)}")


def verify_file_exists(file_path):
    """Check if the specified file exists."""
    if not os.path.isfile(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")


def main():
    """Main function to execute the script."""
    try:
        args = parse_arguments()
        
        # Verify input files exist
        verify_file_exists(args.encrypted_file)
        verify_file_exists(args.key_file)
        
        if args.verbose:
            print(f"Reading key file: {args.key_file}")
        
        key_data = read_key_file(args.key_file)
        
        if args.verbose:
            print(f"Decrypting file: {args.encrypted_file}")
            
        output_file = decrypt_file(
            args.encrypted_file, 
            key_data, 
            args.output_file, 
            args.verbose
        )
        
        print(f"\nDecryption successful!")
        print(f"Decrypted file saved as: {output_file}")
        return 0
        
    except FileNotFoundError as e:
        print(f"Error: {str(e)}")
        return 1
    except ValueError as e:
        print(f"Error: {str(e)}")
        return 1
    except RuntimeError as e:
        print(f"Error: {str(e)}")
        return 1
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        return 1


if __name__ == "__main__":
    sys.exit(main())