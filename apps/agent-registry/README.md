# Urnlabs AI Agent Registry and Discovery System

A comprehensive AI Agent Registry and Discovery System that provides centralized management, health monitoring, marketplace functionality, and Docker orchestration for AI agents.

## Features

### 🤖 Agent Registry
- **Agent Registration & Discovery**: Register and discover AI agents with capability-based filtering
- **Load Balancing**: Multiple algorithms (round-robin, least-connections, performance-based, capability-based)
- **Versioning**: Semantic versioning support with upgrade/rollback capabilities
- **Organization Scoping**: Multi-tenant architecture with organization isolation

### 🔍 Agent Discovery
- **Capability-Based Search**: Find agents by specific capabilities and specializations
- **Advanced Filtering**: Filter by status, health, version, and custom metadata
- **Intelligent Routing**: Route tasks to optimal agents based on current load and performance

### 💓 Health Monitoring
- **Real-Time Monitoring**: WebSocket-based real-time agent health updates
- **Heartbeat Protocol**: Configurable heartbeat intervals with timeout detection
- **Performance Metrics**: Track response time, throughput, error rates, and resource usage
- **Health Aggregation**: Organization-level health overview and alerting

### 🏪 Agent Marketplace
- **Agent Templates**: Pre-built agent configurations for common use cases
- **One-Click Deployment**: Install and deploy agents from marketplace
- **Rating & Reviews**: Community-driven agent quality assessment
- **Collections**: Group related agents for workflow automation

### 🐳 Docker Orchestration
- **Container Lifecycle**: Full container lifecycle management (start, stop, restart, scale)
- **Auto-Scaling**: Automatic scaling based on workload and performance metrics
- **Resource Management**: CPU, memory, and storage allocation with limits
- **Health Checks**: Built-in health monitoring with automatic recovery

### 📊 Analytics & Monitoring
- **Performance Dashboards**: Real-time performance metrics and analytics
- **Usage Statistics**: Track agent usage, deployment success rates, and trends
- **Compliance Logging**: Comprehensive audit trails for all operations

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Client    │    │   Mobile App    │    │   CLI Tools     │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────┴─────────────┐
                    │      API Gateway          │
                    │    (Load Balancer)        │
                    └─────────────┬─────────────┘
                                  │
                     ┌────────────┴────────────┐
                     │   Agent Registry API    │
                     │      (Port 7003)        │
                     └────────────┬────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
┌─────────┴──────────┐  ┌─────────┴──────────┐  ┌─────────┴──────────┐
│   Registry Service │  │  Health Monitor    │  │ Marketplace Service │
│   - Registration   │  │  - Heartbeats      │  │  - Templates       │
│   - Discovery      │  │  - Health Checks   │  │  - Deployments     │
│   - Load Balancing │  │  - WebSocket       │  │  - Collections     │
└─────────┬──────────┘  └─────────┬──────────┘  └─────────┬──────────┘
          │                       │                       │
          └───────────────────────┼───────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │  Docker Orchestrator      │
                    │  - Container Management   │
                    │  - Auto-scaling          │
                    │  - Resource Allocation   │
                    └─────────────┬─────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
    ┌─────┴─────┐         ┌───────┴───────┐       ┌───────┴───────┐
    │ PostgreSQL│         │     Redis     │       │    Docker     │
    │ Database  │         │    Cache      │       │   Engine      │
    └───────────┘         └───────────────┘       └───────────────┘
```

## Quick Start

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- PostgreSQL 15+
- Redis 7+

### Development Setup

1. **Clone and install dependencies**:
```bash
cd apps/agent-registry
npm install
```

2. **Set up environment**:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Start with Docker Compose**:
```bash
# From project root
docker-compose -f docker-compose-local.yml up agent-registry
```

4. **Run tests**:
```bash
npm test
npm run test:coverage
```

### Manual Setup

1. **Start dependencies**:
```bash
# PostgreSQL
docker run -d --name postgres \
  -e POSTGRES_DB=urnlabs_dev \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 postgres:15-alpine

# Redis
docker run -d --name redis \
  -p 6379:6379 redis:7-alpine
```

2. **Run database migrations**:
```bash
npm run db:generate
npm run db:push
```

3. **Start the service**:
```bash
npm run dev
```

## API Documentation

The service provides a comprehensive REST API with OpenAPI documentation available at:
- **Development**: http://localhost:7003/docs
- **Health Check**: http://localhost:7003/health

### Core Endpoints

#### Agent Management
```bash
# Register a new agent
POST /api/v1/agents
{
  "name": "code-reviewer-v1",
  "type": "code-reviewer",
  "version": "1.0.0",
  "capabilities": [
    { "name": "code_analysis", "version": "1.0.0" },
    { "name": "security_scan", "version": "1.0.0" }
  ],
  "specializations": ["javascript", "typescript"],
  "tools": ["eslint", "typescript-checker"]
}

# Discover agents
GET /api/v1/agents?capabilities=code_analysis&status=active&limit=10

# Send heartbeat
POST /api/v1/agents/{agentId}/heartbeat
{
  "status": "active",
  "healthStatus": "healthy",
  "metrics": {
    "responseTime": 150,
    "throughput": 12,
    "errorRate": 1.5,
    "activeConnections": 3
  }
}
```

#### Marketplace
```bash
# Search marketplace
GET /api/v1/marketplace?query=code&type=agent&verified=true

# Install agent
POST /api/v1/marketplace/install
{
  "marketplaceItemId": "agent-template-1",
  "name": "my-code-reviewer",
  "configuration": {
    "timeout": 30000,
    "maxConcurrency": 2
  }
}

# Get deployments
GET /api/v1/marketplace/deployments
```

#### Deployments
```bash
# Get deployment details
GET /api/v1/deployments/{deploymentId}

# Stop deployment
POST /api/v1/deployments/{deploymentId}/stop

# Scale deployment
POST /api/v1/deployments/{deploymentId}/scale
{
  "replicas": 3
}

# Get logs
GET /api/v1/deployments/{deploymentId}/logs?lines=100
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Service port | `7003` |
| `DATABASE_URL` | PostgreSQL connection string | - |
| `REDIS_HOST` | Redis hostname | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `JWT_SECRET` | JWT signing secret | - |
| `DOCKER_HOST` | Docker daemon socket | `unix:///var/run/docker.sock` |
| `MAX_AGENTS_PER_ORG` | Max agents per organization | `100` |
| `AUTO_SCALING_ENABLED` | Enable auto-scaling | `true` |
| `DEFAULT_LOAD_BALANCING_ALGORITHM` | Load balancing algorithm | `round_robin` |

### Load Balancing Algorithms

- **`round_robin`**: Distribute requests evenly across agents
- **`least_connections`**: Route to agent with fewest active connections
- **`performance_based`**: Route based on response time and throughput
- **`capability_based`**: Prioritize agents with more relevant capabilities
- **`weighted_round_robin`**: Round-robin with agent-specific weights

### Health Check Configuration

```typescript
{
  "healthCheck": {
    "enabled": true,
    "interval": 30000,     // 30 seconds
    "timeout": 5000,       // 5 seconds
    "retries": 3,
    "unhealthyThreshold": 0.5,  // 50% success rate
    "degradedThreshold": 0.7    // 70% success rate
  }
}
```

## WebSocket Real-Time Updates

Connect to `ws://localhost:8081` for real-time updates:

```javascript
const ws = new WebSocket('ws://localhost:8081');

ws.on('message', (data) => {
  const update = JSON.parse(data);
  
  switch (update.type) {
    case 'agent_health_update':
      console.log('Agent health changed:', update.data);
      break;
    case 'deployment_status_update':
      console.log('Deployment status:', update.data);
      break;
    case 'agent_registration_update':
      console.log('Agent registered/updated:', update.data);
      break;
  }
});
```

## Testing

### Run Tests

```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# All tests with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Test Structure

```
src/__tests__/
├── unit/
│   ├── agent-registry.test.ts
│   ├── health-monitor.test.ts
│   ├── marketplace.test.ts
│   └── docker-orchestrator.test.ts
├── integration/
│   ├── api-endpoints.test.ts
│   └── websocket.test.ts
└── e2e/
    └── full-workflow.test.ts
```

## Monitoring & Observability

### Health Endpoints

- `GET /health` - Service health check
- `GET /api/v1/health/overview` - Organization health overview

### Metrics Collection

The service exposes Prometheus metrics on port 9090:

- `agent_registry_total` - Total registered agents
- `agent_registry_active` - Currently active agents
- `agent_registry_deployments_total` - Total deployments
- `agent_registry_api_requests_total` - API request count
- `agent_registry_api_duration_seconds` - API response times

### Logging

Structured JSON logging with configurable levels:

```bash
# Set log level
export LOG_LEVEL=debug|info|warn|error
```

## Security

### Authentication

All API endpoints require JWT authentication:

```bash
# Include JWT token in requests
curl -H "Authorization: Bearer <jwt-token>" \
     http://localhost:7003/api/v1/agents
```

### Docker Security

- Non-root user execution
- Read-only root filesystem
- Resource limits enforced
- Security scanning enabled

### Network Security

- CORS configuration
- Rate limiting
- Input validation
- SQL injection prevention

## Deployment

### Docker Production

```bash
# Build production image
docker build -t urnlabs/agent-registry:latest .

# Run production container
docker run -d \
  --name agent-registry \
  -p 7003:7003 \
  -p 8081:8081 \
  -e NODE_ENV=production \
  -e DATABASE_URL=postgresql://... \
  -e REDIS_HOST=redis.example.com \
  -v /var/run/docker.sock:/var/run/docker.sock \
  urnlabs/agent-registry:latest
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agent-registry
spec:
  replicas: 3
  selector:
    matchLabels:
      app: agent-registry
  template:
    metadata:
      labels:
        app: agent-registry
    spec:
      containers:
      - name: agent-registry
        image: urnlabs/agent-registry:latest
        ports:
        - containerPort: 7003
        - containerPort: 8081
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: agent-registry-secrets
              key: database-url
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details