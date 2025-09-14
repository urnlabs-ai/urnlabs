# Unified Docker Compose Configuration for Local Development

This document provides instructions for using the unified `docker-compose-local.yml` file to run all applications locally with a single command.

## Overview

The unified Docker Compose configuration includes:

- **Backend Services**: Gateway, API, Agents, Bridge, Dashboard, URN-Maestro, Monitoring, MCP Integration, Testing, and Security
- **Dependencies**: PostgreSQL, Redis, Prometheus, and Grafana
- **Web Applications**: UrnLabs, UsmanRamzan, and UsmanRamzan-AI websites
- **Reverse Proxy**: Nginx for routing to web applications

## Prerequisites

Before running the unified Docker Compose configuration, ensure you have the following installed:

- Docker (version 20.10 or higher)
- Docker Compose (version 1.29 or higher)
- At least 8GB RAM available for Docker
- Port availability: 80, 443, 3001, 5432, 6379, 7000-7009, 8001-8003, 9090

## Environment Variables

Create a `.env` file in the root directory with the required environment variables. You can copy from `.env.example`:

```bash
cp .env.example .env
```

Required variables for basic functionality:

```env
# Database
POSTGRES_DB=urnlabs_dev
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

# Redis
REDIS_URL=redis://redis:6379

# JWT
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters-long

# AI Providers (optional but recommended)
CLAUDE_API_KEY=your-claude-api-key
GEMINI_API_KEY=your-gemini-api-key
QWEN_API_KEY=your-qwen-api-key

# Version Control (optional)
GITHUB_TOKEN=your-github-token
```

## Quick Start

To start all services:

```bash
docker-compose -f docker-compose-local.yml up -d
```

This will:
- Build all necessary Docker images
- Start all services in the background
- Create necessary volumes and networks
- Initialize the database with the schema

## Accessing Services

Once all services are running, you can access them at the following URLs:

### Backend Services

- **Gateway**: http://localhost:7000 (main entry point)
- **API**: http://localhost:7001
- **Agents**: http://localhost:7002
- **Bridge**: http://localhost:7003
- **Dashboard**: http://localhost:7004
- **URN-Maestro**: http://localhost:7005
- **Monitoring**: http://localhost:7006
- **MCP Integration**: http://localhost:7007
- **Testing**: http://localhost:7008
- **Security**: http://localhost:7009

### Dependencies

- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001 (admin/admin)

### Web Applications

- **Main Website Selection**: http://localhost:80
- **UrnLabs Website**: http://localhost:80/urnlabs/ or http://localhost:8002
- **UsmanRamzan Website**: http://localhost:80/usmanramzan/ or http://localhost:8001
- **UsmanRamzan-AI Website**: http://localhost:80/usmanramzan-ai/ or http://localhost:8003

## Service Health Checks

All services include health checks. You can verify the status of all services:

```bash
docker-compose -f docker-compose-local.yml ps
```

Services with a "(healthy)" status are running correctly.

## Common Commands

### View Logs

To view logs for all services:

```bash
docker-compose -f docker-compose-local.yml logs -f
```

To view logs for a specific service:

```bash
docker-compose -f docker-compose-local.yml logs -f [service-name]
```

### Stop Services

To stop all services:

```bash
docker-compose -f docker-compose-local.yml down
```

To stop and remove volumes (data will be lost):

```bash
docker-compose -f docker-compose-local.yml down -v
```

### Restart Services

To restart all services:

```bash
docker-compose -f docker-compose-local.yml restart
```

To restart a specific service:

```bash
docker-compose -f docker-compose-local.yml restart [service-name]
```

### Rebuild Services

To rebuild services after making changes:

```bash
docker-compose -f docker-compose-local.yml up -d --build
```

## Development Workflow

### Working with Backend Services

1. Make changes to the source code
2. Rebuild the specific service:
   ```bash
   docker-compose -f docker-compose-local.yml up -d --build [service-name]
   ```
3. View logs to verify changes:
   ```bash
   docker-compose -f docker-compose-local.yml logs -f [service-name]
   ```

### Working with Web Applications

1. Make changes to the website source code in the respective `worktrees/` directory
2. Rebuild the specific website service:
   ```bash
   docker-compose -f docker-compose-local.yml up -d --build [website-name]
   ```
3. Access the website at its URL to see changes

### Database Operations

To access the PostgreSQL database:

```bash
docker-compose -f docker-compose-local.yml exec postgres psql -U postgres -d urnlabs_dev
```

To reset the database (warning: all data will be lost):

```bash
docker-compose -f docker-compose-local.yml down -v
docker-compose -f docker-compose-local.yml up -d
```

## Troubleshooting

### Port Conflicts

If you encounter port conflicts, check which ports are in use:

```bash
# On macOS/Linux
lsof -i :[port-number]

# On Windows
netstat -ano | findstr :[port-number]
```

Either stop the service using the port or modify the port mapping in `docker-compose-local.yml`.

### Service Failures

If a service fails to start:

1. Check the logs for error messages:
   ```bash
   docker-compose -f docker-compose-local.yml logs [service-name]
   ```
2. Verify all dependencies are running:
   ```bash
   docker-compose -f docker-compose-local.yml ps
   ```
3. Check for missing environment variables in your `.env` file

### Performance Issues

If you experience performance issues:

1. Check Docker resource usage:
   ```bash
   docker stats
   ```
2. Increase Docker's memory allocation (Docker Desktop settings)
3. Consider stopping non-essential services

## Architecture Overview

The unified Docker Compose configuration creates the following architecture:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Apps      │    │   Backend       │    │   Dependencies  │
│                 │    │                 │    │                 │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │UrnLabs      │ │    │ │Gateway      │ │    │ │PostgreSQL   │ │
│ │             │ │    │ │             │ │    │ │             │ │
│ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │
│                 │    │                 │    │                 │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │UsmanRamzan  │ │◄───┤ │Nginx       │ │◄───┤ │Redis        │ │
│ │             │ │    │ │             │ │    │ │             │ │
│ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │
│                 │    │                 │    │                 │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │UsmanRamzan │ │    │ │API/Agents/  │ │    │ │Prometheus   │ │
│ │AI           │ │    │ │etc.         │ │    │ │             │ │
│ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Network Configuration

All services are connected via a shared Docker network named `urnlabs-network`. Services can communicate with each other using their service names as hostnames.

### Volume Mounts

The following volumes are created for data persistence:

- `postgres_data`: PostgreSQL database files
- `redis_data`: Redis data files
- `maestro_data`: URN-Maestro data files
- `shared_data`: Shared data between services
- `monitoring_data`: Monitoring service data
- `prometheus_data`: Prometheus metrics data
- `grafana_data`: Grafana configuration and dashboards

## Security Considerations

For local development, the configuration uses default credentials and minimal security. For production deployments:

1. Change all default passwords
2. Use strong, unique secrets
3. Enable TLS/SSL encryption
4. Restrict network access
5. Implement proper authentication and authorization

## Contributing

When making changes to the Docker Compose configuration:

1. Test all services after changes
2. Update this documentation if necessary
3. Ensure all health checks are working
4. Verify environment variables are properly documented

## Support

If you encounter issues with the unified Docker Compose configuration:

1. Check this documentation for troubleshooting steps
2. Verify your environment meets the prerequisites
3. Check the GitHub issues for similar problems
4. Create a new issue with detailed information about your problem