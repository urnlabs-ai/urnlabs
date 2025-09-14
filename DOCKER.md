# Docker Development Environment

## Overview

This project supports multiple ways to run the development environment using Docker Compose, including a new unified configuration that allows you to run all applications with a single command.

## Available Applications

1. **UsmanRamzan.ai** - Personal AI Portfolio
2. **UrnLabs.ai** - AI Agent Platform 
3. **EPrecisio.com** - DevOps Excellence

## Docker Compose Configurations

### 1. Unified Local Development (`docker-compose-local.yml`) - RECOMMENDED

The unified Docker Compose configuration includes all services in a single file for easy local development:

- **Backend Services**: Gateway, API, Agents, Bridge, Dashboard, URN-Maestro, Monitoring, MCP Integration, Testing, and Security
- **Dependencies**: PostgreSQL, Redis, Prometheus, and Grafana
- **Web Applications**: UrnLabs, UsmanRamzan, and UsmanRamzan-AI websites
- **Reverse Proxy**: Nginx for routing to web applications

```bash
# Start all services with a single command
docker-compose -f docker-compose-local.yml up -d

# View logs for all services
docker-compose -f docker-compose-local.yml logs -f

# Stop all services
docker-compose -f docker-compose-local.yml down

# Rebuild services after making changes
docker-compose -f docker-compose-local.yml up -d --build
```

**Access URLs:**
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
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001 (admin/admin)
- **Main Website Selection**: http://localhost:80
- **UrnLabs Website**: http://localhost:80/urnlabs/ or http://localhost:8002
- **UsmanRamzan Website**: http://localhost:80/usmanramzan/ or http://localhost:8001
- **UsmanRamzan-AI Website**: http://localhost:80/usmanramzan-ai/ or http://localhost:8003

For detailed setup instructions, see [DOCKER-COMPOSE-LOCAL.md](./DOCKER-COMPOSE-LOCAL.md).

### 2. Simple Development Server (`docker-compose.dev.yml`)

Uses the existing `serve-sites.cjs` script to serve all three sites from a single container.

```bash
# Start the development server
docker-compose -f docker-compose.dev.yml up -d

# View logs
docker-compose -f docker-compose.dev.yml logs -f

# Stop the server
docker-compose -f docker-compose.dev.yml down
```

**Access URLs:**
- UsmanRamzan.ai: http://localhost:9001
- UrnLabs.ai: http://localhost:9002  
- EPrecisio.com: http://localhost:9003

### 3. Individual Astro Servers (`docker-compose.dev.yml` with `astro` profile)

Runs each site in its own container with full Astro development servers.

```bash
# Start individual Astro dev servers
docker-compose -f docker-compose.dev.yml --profile astro up -d

# View logs for specific service
docker-compose -f docker-compose.dev.yml logs -f usmanramzan-ai

# Stop all services
docker-compose -f docker-compose.dev.yml --profile astro down
```

**Access URLs:**
- UsmanRamzan.ai: http://localhost:7000
- UrnLabs.ai: http://localhost:7001
- EPrecisio.com: http://localhost:7003

### 4. Production-like Environment (`docker-compose.websites.yml`)

Full production-style deployment with Nginx proxy and health checks.

```bash
# Build and start production environment
docker-compose -f docker-compose.websites.yml up --build -d

# View logs
docker-compose -f docker-compose.websites.yml logs -f

# Stop and clean up
docker-compose -f docker-compose.websites.yml down
```

**Access URLs:**
- UsmanRamzan.ai: http://localhost:8001
- UrnLabs.ai: http://localhost:8002
- EPrecisio.com: http://localhost:8003
- Nginx Proxy: http://localhost:8000

## Quick Start

### Recommended: Unified Local Development

1. **Environment Setup:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

2. **Start all services:**
   ```bash
   docker-compose -f docker-compose-local.yml up -d
   ```

3. **Access your applications:**
   - **Gateway**: http://localhost:7000 (main entry point for all backend services)
   - **Websites**: http://localhost:80 (with Nginx routing to all sites)
   - **Monitoring**: http://localhost:3001 (Grafana)

4. **View real-time logs:**
   ```bash
   docker-compose -f docker-compose-local.yml logs -f
   ```

5. **Stop when done:**
   ```bash
   docker-compose -f docker-compose-local.yml down
   ```

### Alternative: Simple Development Server

1. **Start the development environment:**
   ```bash
   docker-compose -f docker-compose.dev.yml up -d
   ```

2. **Access your applications:**
   - UrnLabs.ai: http://localhost:9002 (main AI platform)
   - UsmanRamzan.ai: http://localhost:9001 (personal portfolio)
   - EPrecisio.com: http://localhost:9003 (DevOps consulting)

3. **View real-time logs:**
   ```bash
   docker-compose -f docker-compose.dev.yml logs -f urnlabs-dev-server
   ```

4. **Stop when done:**
   ```bash
   docker-compose -f docker-compose.dev.yml down
   ```

## Development Workflow

### File Watching

The Docker containers mount your local code directory, so all changes are reflected immediately without rebuilding containers.

### Package Management

The containers use the existing `pnpm` workspace configuration:
- Dependencies are installed from the root workspace
- Hot reloading works for all file changes
- No need to rebuild for code changes

### Debugging

```bash
# View container status
docker-compose -f docker-compose-local.yml ps

# View detailed logs
docker-compose -f docker-compose-local.yml logs -f

# Access container shell
docker-compose -f docker-compose-local.yml exec gateway sh

# Check resource usage
docker stats
```

## Troubleshooting

### Port Conflicts

If ports are already in use:

1. **Check running processes:**
   ```bash
   lsof -i :7000 :7001 :7002 :80 :5432 :6379
   ```

2. **Stop conflicting processes or update ports in `docker-compose-local.yml`**

### Container Issues

```bash
# Restart containers
docker-compose -f docker-compose-local.yml restart

# Clean rebuild
docker-compose -f docker-compose-local.yml down
docker system prune -f
docker-compose -f docker-compose-local.yml up --build -d
```

### Performance

```bash
# Monitor resource usage
docker stats

# View container logs for performance issues  
docker-compose -f docker-compose-local.yml logs --tail=50 gateway
```

## Integration with Local Development

You can run both Docker and local development simultaneously:

- **Local servers**: ports 7000-7009, 8001-8003
- **Docker containers**: ports 7000-7009, 8001-8003, 80, 3001, 5432, 6379, 9090

This allows you to compare environments or test different configurations.

## Service Health Checks

All services in the unified Docker Compose configuration include health checks. You can verify the status of all services:

```bash
docker-compose -f docker-compose-local.yml ps
```

Services with a "(healthy)" status are running correctly.

## Volume Management

The unified Docker Compose configuration creates the following volumes for data persistence:

- `postgres_data`: PostgreSQL database files
- `redis_data`: Redis data files
- `maestro_data`: URN-Maestro data files
- `shared_data`: Shared data between services
- `monitoring_data`: Monitoring service data
- `prometheus_data`: Prometheus metrics data
- `grafana_data`: Grafana configuration and dashboards

## Network Configuration

All services are connected via a shared Docker network named `urnlabs-network`. Services can communicate with each other using their service names as hostnames.

## Production Deployment

For production deployment, use the full `docker-compose.websites.yml` configuration which includes:

- Nginx reverse proxy
- Health checks
- Container restart policies
- Volume management
- Network isolation

## Environment Variables

Available environment variables for the unified configuration:

```bash
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

Add custom environment variables to the Docker Compose files as needed for your development workflow.

## Advanced Usage

### Service-Specific Commands

```bash
# Rebuild only the API service
docker-compose -f docker-compose-local.yml up -d --build api

# View logs for only the agents service
docker-compose -f docker-compose-local.yml logs -f agents

# Access the PostgreSQL database
docker-compose -f docker-compose-local.yml exec postgres psql -U postgres -d urnlabs_dev

# Access Redis CLI
docker-compose -f docker-compose-local.yml exec redis redis-cli
```

### Database Operations

```bash
# Reset the database (warning: all data will be lost)
docker-compose -f docker-compose-local.yml down -v
docker-compose -f docker-compose-local.yml up -d

# Create a database backup
docker-compose -f docker-compose-local.yml exec postgres pg_dump -U postgres urnlabs_dev > backup.sql

# Restore from backup
docker-compose -f docker-compose-local.yml exec -T postgres psql -U postgres urnlabs_dev < backup.sql
```

## Security Considerations

For local development, the configuration uses default credentials and minimal security. For production deployments:

1. Change all default passwords
2. Use strong, unique secrets
3. Enable TLS/SSL encryption
4. Restrict network access
5. Implement proper authentication and authorization

## Documentation

- [DOCKER-COMPOSE-LOCAL.md](./DOCKER-COMPOSE-LOCAL.md): Detailed instructions for the unified Docker Compose configuration
- [README.md](./README.md): Project overview and quick start guide
- [CLAUDE.md](./CLAUDE.md): Development guidelines and agent protocols