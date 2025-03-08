# Development Guide

This guide provides information for developers working with the Clio codebase, including how to set up a development environment, understand the code structure, and contribute to the project.

## Development Environment Setup

### Prerequisites

- Docker and Docker Compose
- Node.js 18 or higher
- npm (Node Package Manager)
- Python 3.6+ (for setup scripts)
- Git

### Local Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/seahop/Clio.git
   cd Clio
   ```

2. Generate environment variables and security keys:
   ```bash
   # Create and activate a virtual environment
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   
   # Install required packages
   pip install -r requirements.txt
   
   # Run the script for local development
   python generate-env.py
   ```

3. Start the containers in development mode:
   ```bash
   docker-compose build --no-cache
   ```

4. Access the application at:
   - Frontend: https://localhost:3000

### Code Structure

The Clio codebase is organized into several key directories:

```
Clio/
├── backend/             # Backend API service
│   ├── controllers/     # Request handlers
│   ├── lib/             # Core libraries
│   ├── middleware/      # Express middleware
│   ├── models/          # Data models
│   ├── routes/          # API routes
│   └── utils/           # Utility functions
├── frontend/            # React frontend
│   ├── public/          # Static assets
│   └── src/             # React components and logic
│       ├── components/  # UI components
│       ├── hooks/       # React hooks
│       └── utils/       # Utility functions
├── relation-service/    # Relationship analysis service 
│   ├── src/             # Service code
│   └── models/          # Data models
└── docs/                # Documentation
```

## Key Technologies

### Frontend

- **React**: UI library for building components
- **Tailwind CSS**: Utility-first CSS framework
- **Lucide React**: Icon library
- **React Hooks**: For state management and side effects

### Backend

- **Express.js**: Web framework for handling API requests
- **PostgreSQL**: Relational database for data storage
- **Redis**: For session management and caching
- **JSON Web Tokens**: Authentication mechanism
- **Multer**: For file upload handling

## Development Workflow

### Running in Development Mode

Development mode includes:
- Hot reloading for the frontend
- Automatic restart for the backend services
- More verbose logging

```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

### Testing

Run the test suite with:

```bash
# Frontend tests
cd frontend
npm test

# Backend tests
cd backend
npm test
```

### Building for Production

```bash
docker-compose build
docker-compose up
```

## Working With The Database

### Database Migrations

The application uses a simple migration system for database changes:

1. Create a new migration file in `backend/db/migrations/`
2. Follow the naming convention: `YYYYMMDD_description.sql`
3. Run migrations with the migration script:
   ```bash
   cd backend
   node scripts/run-migrations.js
   ```

### Database Schema

Key tables in the database:

- `logs`: Main logging data
- `users`: User accounts and authentication
- `evidence_files`: Evidence attachments
- `api_keys`: API authentication keys
- `relations`: Relationship data between entities

## API Development

When extending the API, follow these guidelines:

1. Create route handlers in the appropriate controller file
2. Add routes in the corresponding route file
3. Add input validation and sanitization
4. Add authentication and permission checks
5. Update API documentation

## Frontend Development

When working on the frontend:

1. Follow the component structure in `frontend/src/components/`
2. Use custom hooks for shared logic
3. Handle API calls through the service interfaces
4. Maintain consistent styling with Tailwind CSS

## Debugging

### Backend Debugging

To enable detailed debugging:

```bash
# In docker-compose environment
docker-compose exec backend sh
NODE_DEBUG=express,http,redis node server.js

# Local debugging
cd backend
NODE_DEBUG=express,http,redis node server.js
```

### Frontend Debugging

React Developer Tools are recommended for frontend debugging:

1. Install the React Developer Tools browser extension
2. Use the Components tab to inspect component state
3. Use console logging with development builds

## Common Issues

### TLS Certificate Issues

If you encounter TLS certificate issues:

```bash
# Generate new certificates
python scripts/generate-certs.py https://yourIPorHost:3000

# Restart the containers
docker-compose down
docker-compose up
```

### Redis Connection Problems

For Redis connection issues:

```bash
# Check Redis container status
docker-compose ps redis

# Check Redis logs
docker-compose logs redis

# Connect to Redis CLI
docker-compose exec redis redis-cli -a yourpassword
```

### Database Reset

To completely reset the database:

```bash
docker-compose down
docker volume rm clio_postgres_data 
docker-compose up
```

### Clearing All Data

```bash
docker volume rm clio_postgres_data clio_redis_data clio_evidence_files
```

## Contribution Guidelines

1. Create a feature branch for your changes
2. Follow the code style and conventions
3. Add tests for new functionality
4. Update documentation as needed
5. Submit a pull request with a clear description