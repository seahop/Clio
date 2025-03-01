#!/usr/bin/env python3
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
