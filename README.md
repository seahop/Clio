<h1 align="center">Clio Logging Platform</h1>
<p align="center">
<img src="./images/Clio_Logging_Platform_Logo.png" alt="Clio Logo" width="400"/>
</p>

A secure, collaborative logging system designed for red team operations and security assessments. This application provides real-time logging capabilities with features like row locking, user authentication, audit trails, and comprehensive tagging and operations management.

## Key Features

- **Real-time Collaborative Logging**: Multiple users can view and edit logs simultaneously
- **Row-Level Locking**: Prevent conflicts with row-level locking mechanism
- **Role-Based Access Control**: Admin and user roles with different permissions
- **Secure Authentication**: CSRF protection, secure session management, and password policies
- **Operations Management**: Organize work by engagement with automatic operation tagging
- **Comprehensive Tagging System**: Categorize logs with MITRE ATT&CK techniques, tools, and custom tags
- **Auto-tagging**: Logs automatically tagged with user's active operation for consistent tracking
- **Relationship Analysis**: Visualize connections between hosts, IPs, domains, and user commands
- **File Status Tracking**: Monitor file status across systems (ON_DISK, IN_MEMORY, ENCRYPTED, etc.)
- **API Integration**: Programmatic access for automated log submission and integration with external tools
- **Evidence Management**: Upload and track evidence files associated with logs

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 18 or higher (for setup scripts)
- npm (Node Package Manager)

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/seahop/Clio.git
   cd Clio
   ./setup.sh
   ```

2. Generate environment variables and security keys:
   ```bash
   # Create and activate a virtual environment
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   
   # Install required packages
   pip install -r requirements.txt

   # Generate certs and env
   sudo python generate-env.py https://yourIPorHost
   ```
   or for production style
   ```bash
   sudo python3 generate-env.py https://yourdomain.com --letsencrypt --domain=yourdomain.com --email=your@email.com --google-client-id=123456.your.client.id --google-client-secret=YOUR-SECRET --google-callback-url=https://yourdomain.com/api/auth/google/callback
   ```

3. Build and start the containers:
   ```bash
   docker compose build
   docker compose up
   ```

4. Access the application at:
   - https://localhost (or your custom domain/IP)

The default admin and user passwords will be displayed in the console output and saved in a credentials backup file.

## Documentation

For detailed information about Clio, please refer to our documentation:

- [Architecture Overview](./docs/architecture.md) - System architecture and technology stack
- [Security Features](./docs/security.md) - In-depth security information
- [User Guide](./docs/user-guide.md) - How to use the application including tags and operations
- [API Documentation](./docs/api-guide.md) - Working with the Clio API
- [Using Log Forwarders](./log_exporter/README.md) - Forwarding of logs for C2s
- [Google OAuth Integration](./docs/sso-integration.md) - How to set up and use Google SSO

## License

This software is provided as-is for use by red team professionals.