# Clio Logging Platform
<p align="center">
<img src="./images/Clio_Logging_Platform_Logo.png" alt="Clio Logo" width="300"/>
<p>

A secure, collaborative logging system designed for red team operations and security assessments. This application provides real-time logging capabilities with features like row locking, user authentication, and audit trails. Currently, this is only working with a Chromium based browsers.

## Features

- **Real-time Collaborative Logging**: Multiple users can view and edit logs simultaneously
- **Row-Level Locking**: Prevent conflicts with row-level locking mechanism
- **Role-Based Access Control**: Admin and user roles with different permissions
- **Secure Authentication**: CSRF protection, secure session management, and password policies
- **Audit Trail**: Track all changes and user actions
- **File Status Tracking**: Monitor file status across systems (ON_DISK, IN_MEMORY, ENCRYPTED, etc.)
- **Relationship Analysis**: Visualize connections between hosts, IPs, domains, and user commands
- **Responsive UI**: Modern, responsive interface built with React and Tailwind CSS
- **Data Persistence**: PostgreSQL database for reliable data storage
- **Session Management**: Redis-based session handling with encryption
- **TLS Encryption**: End-to-end encryption for all services and communications

## Architecture Overview

Clio uses a microservices architecture with three primary components:

1. **Frontend**: React-based UI with real-time data visualization
2. **Backend**: Core API service for authentication and logging operations
3. **Relation Service**: Analysis service that builds relationships between log entries

![Service Connections](./images/service_connections.png)

## Technology Stack

### Frontend
- **React 19.0.0**: Latest version of React for UI components
- **Tailwind CSS 3.3.0**: Utility-first CSS framework
- **Lucide React 0.475.0**: Icon library
- **Modern JavaScript (ES6+)**: For frontend logic

### Backend
- **Node.js 23**: Server runtime environment
- **Express.js 4.18.2**: Web framework
- **PostgreSQL 17**: Relational database
- **Redis 7.4.2**: Session management and caching
- **JWT 9.0.2**: For secure authentication
- **Docker & Docker Compose**: For containerization and orchestration

### Relation Service
- **Node.js 23**: Server runtime environment
- **Express.js 4.18.2**: Web framework
- **Shared PostgreSQL database**: For data consistency across services
- **Specialized analysis algorithms**: For relationship mapping

### Security Features
- **Password-based authentication**: With strong password policies
- **CSRF token protection**: Prevents cross-site request forgery
- **Redis data encryption at rest**: Using AES-256-GCM
- **Secure session management**: With server instance verification
- **HTTP-only cookies**: Prevents client-side cookie access
- **Rate limiting**: Prevents brute force attacks
- **Secure headers**: Using Helmet.js for HTTP security headers
- **TLS for all service communications**: End-to-end encryption
- **Admin-specific security tokens**: For privileged operations
- **Automatic lockout**: After failed authentication attempts
- **Session tracking and forced logout capabilities**: For security management

## Prerequisites

- Docker and Docker Compose
- Node.js 18 or higher (for setup scripts)
- npm (Node Package Manager)

## Setup Instructions

### First Time Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/seahop/Clio.git
   cd Clio
   ```

2. Generate environment variables and security keys using either Node.js or Python:

   **Option 1: Using Node.js**
   ```bash
   npm install
   node generate-env.js
   ```
   or specify a custom domain:
   ```bash
   npm install
   node generate-env.js https://yourdomain.com
   ```

   **Option 2: Using Python (if Node.js is not installed)**
   ```bash
   # Create and activate a virtual environment
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   
   # Install required packages
   pip install -r requirements.txt
   
   # Run the script
   python generate-env.py
   ```
   or specify a custom domain:
   ```bash
   python generate-env.py https://yourdomain.com
   ```

   This will create:
   - A `.env` file with necessary secrets
   - Initial admin and user passwords
   - Self-signed TLS certificates
   - A backup of credentials in the project directory

3. Build and start the containers:
   ```bash
   docker-compose build
   docker-compose up
   ```

4. When the services start, you'll see the admin and user passwords in the console output. Make note of these credentials as you'll need them for the first login. A backup of these credentials is also saved in the project root directory as `credentials-backup-[timestamp].txt`.

### Subsequent Starts

After initial setup, you can start the application with:
```bash
docker-compose up
```

The application will be available at:
- Frontend: https://localhost:3000

## Usage Guide

### Authentication

- Use the generated admin and user passwords for initial login
- You'll be prompted to change your password on first login
- Admin accounts have full access to all features
- User accounts can view and edit logs, but cannot access administrative functions

### Main Interface

The application consists of three primary views:

1. **Logs**: The main logging interface for recording and tracking red team activities
2. **Relations**: Visual analysis of connections between hosts, IPs, domains, and user activities
3. **File Status**: Track files across systems with statuses like ON_DISK, IN_MEMORY, ENCRYPTED, etc.

### Working with Logs

- Click "Add Row" to create a new log entry
- Click on any cell to edit its content
- Lock a row to prevent others from editing it while you work
- Use tab to navigate between cells
- Admins can delete rows as needed

### Relationship Analysis

The Relations view allows you to:
- Visualize connections between different system elements
- Filter relationships by type (IP, hostname, domain, user)
- Expand nodes to see detailed connection information
- Track user command patterns

### File Status Tracking

The File Status view provides:
- Current status of files across all systems
- Status history and changes over time
- Filtering by status, hostname, and analyst
- Comprehensive view of file lifecycle

## Application Structure

### Session Management

Sessions are managed using Redis with the following features:
- Encrypted session data using AES-256-GCM
- 9-hour session duration
- Automatic cleanup of expired sessions
- Server-side session validation
- Server instance verification to prevent session hijacking

## Security Considerations

### Password Requirements
- Minimum 12 characters
- Must include uppercase and lowercase letters
- Must include numbers
- Must include special characters
- Cannot be just letters followed by numbers
- Cannot contain repeated characters (3 or more times)

### Data Protection
- All sessions are encrypted in Redis
- Passwords are hashed using PBKDF2 with 310,000 iterations
- PostgreSQL data is persisted in Docker volumes
- TLS encryption for all service communications
- Automatic backup scripts included for both Redis and PostgreSQL data

## Utility Tools

### Backup Tools
The project includes several utility scripts for data management:

- `tools/backupPostgresData.js`: PostgreSQL database backup
- `tools/backupRedisData.js`: Redis data backup
- `tools/decryptRedisData.js`: Decrypt Redis backup data
- `tools/exportPostgresData.js`: Export logs to JSON format
- `tools/testRedisConnection.js`: Test Redis TLS connectivity

These tools provide:
- Encrypted backups
- Data export capabilities
- Backup verification
- Separate storage of encryption keys

## Development Notes

### Building for Production
```bash
docker-compose build
docker-compose up
```

### Clearing old data
```bash
docker-compose down
docker volume rm clio_postgres_data clio_redis_data
```

## License

This software is provided as-is for use by red team professionals.

The license requires:
- You must include the original license and copyright notice
- The authors cannot be held liable

You can:
- ✔️ Use this software for commercial purposes
- ✔️ Modify this software
- ✔️ Distribute this software
- ✔️ Use this software privately
- ✔️ Use this software for patent purposes
- ✔️ Fork and modify for internal company use