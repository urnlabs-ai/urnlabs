# Urnlabs Workflow Engine

Production-ready AI workflow orchestration engine with deterministic execution, governance-first approach, and measurable ROI tracking.

## Features

### Core Workflow Orchestration
- **DAG-based Execution**: Directed Acyclic Graph engine with topological sorting for optimal parallel execution
- **Deterministic Workflows**: Predictable, repeatable, and auditable workflow execution
- **Multi-agent Coordination**: Seamless integration with AI agents for intelligent task execution
- **Real-time Monitoring**: Live workflow execution tracking with WebSocket updates

### Advanced Error Handling
- **Exponential Backoff Retry**: Configurable retry policies with intelligent backoff strategies
- **Circuit Breaker Pattern**: Prevents cascade failures with automatic circuit breaking
- **Dead Letter Queue**: Permanent failure handling with comprehensive error categorization
- **Idempotent Operations**: Safe retry mechanisms without side effects

### Workflow Versioning & A/B Testing
- **Semantic Versioning**: Automatic version management with change impact analysis
- **A/B Testing Framework**: Traffic splitting and statistical significance testing
- **Blue-Green Deployments**: Zero-downtime workflow deployments
- **Rollback Procedures**: Safe rollback to previous workflow versions

### State Management
- **State Machine**: Robust state transitions with validation and audit trails
- **Optimistic Locking**: Prevents race conditions in concurrent executions
- **Context Isolation**: Secure variable and secret management per execution
- **Persistence Layer**: Reliable state persistence with recovery capabilities

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   HTTP API      │    │  WebSocket API  │    │   Agent Registry│
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ Workflow CRUD   │    │ Real-time       │    │ Agent Discovery │
│ Execution Mgmt  │    │ Status Updates  │    │ Load Balancing  │
│ Version Control │    │ Event Streaming │    │ Health Checks   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
         ┌─────────────────────────────────────────────────┐
         │              Workflow Engine Core               │
         ├─────────────────────────────────────────────────┤
         │ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │
         │ │ DAG Engine  │ │State Machine│ │Retry Engine │ │
         │ └─────────────┘ └─────────────┘ └─────────────┘ │
         │ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │
         │ │Version Mgmt │ │Agent Executor│ │Event System │ │
         │ └─────────────┘ └─────────────┘ └─────────────┘ │
         └─────────────────────────────────────────────────┘
                                 │
         ┌─────────────────────────────────────────────────┐
         │              Queue & Storage Layer              │
         ├─────────────────────────────────────────────────┤
         │ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │
         │ │  BullMQ     │ │    Redis    │ │ PostgreSQL  │ │
         │ │ (Queues)    │ │ (Cache)     │ │(Persistence)│ │
         │ └─────────────┘ └─────────────┘ └─────────────┘ │
         └─────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 20+
- Redis 6+
- PostgreSQL 13+ (optional, for persistence)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd apps/workflow-engine

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Edit configuration
nano .env
```

### Development Setup

```bash
# Start Redis (required)
redis-server

# Start in development mode
npm run dev

# Server will start on http://localhost:7005
```

### Docker Setup

```bash
# Build Docker image
docker build -t urnlabs/workflow-engine .

# Run with Docker Compose
docker-compose up -d
```

## API Documentation

The workflow engine provides a comprehensive REST API and WebSocket interface.

### Base URL
- Development: `http://localhost:7005/api/v1`
- Production: `https://your-domain.com/api/v1`

### Interactive Documentation
- Swagger UI: `http://localhost:7005/docs`

### Core Endpoints

#### Workflow Management

```http
# Create workflow
POST /workflows
Content-Type: application/json

{
  "name": "Code Review Workflow",
  "description": "Automated code review process",
  "steps": [
    {
      "id": "fetch-changes",
      "name": "Fetch Code Changes",
      "type": "agent-task",
      "dependencies": [],
      "configuration": {
        "agentId": "git-agent",
        "function": "fetchPullRequest",
        "parameters": {
          "repository": "{{repository_url}}",
          "pullRequestId": "{{pull_request_id}}"
        }
      }
    }
  ],
  "parameters": [
    {
      "name": "repository_url",
      "type": "string",
      "required": true
    }
  ]
}
```

```http
# List workflows
GET /workflows?page=1&limit=10&tags=ci-cd

# Get workflow details
GET /workflows/{workflowId}

# Update workflow
PUT /workflows/{workflowId}

# Delete workflow
DELETE /workflows/{workflowId}
```

#### Workflow Execution

```http
# Start execution
POST /executions
Content-Type: application/json

{
  "workflowId": "code-review-workflow",
  "version": "1.0.0",
  "input": {
    "repository_url": "https://github.com/example/repo",
    "pull_request_id": "123"
  },
  "context": {
    "userId": "user123",
    "environment": "production"
  }
}
```

```http
# Get execution status
GET /executions/{executionId}

# Control execution
PUT /executions/{executionId}
Content-Type: application/json

{
  "action": "pause",  # pause | resume | cancel
  "reason": "Manual intervention required"
}
```

#### Real-time Updates

```javascript
// WebSocket connection for real-time updates
const ws = new WebSocket('ws://localhost:7005/ws');

ws.on('message', (data) => {
  const event = JSON.parse(data);
  console.log('Workflow event:', event);
});
```

## Workflow Templates

The engine includes pre-built templates for common patterns:

### Code Review Workflow
```bash
curl -X POST http://localhost:7005/api/v1/workflows/from-template \
  -H "Content-Type: application/json" \
  -d '{
    "templateId": "code-review-workflow",
    "parameters": {
      "repository_url": "https://github.com/your-org/your-repo",
      "reviewers": ["reviewer1@company.com", "reviewer2@company.com"]
    }
  }'
```

### Data Processing Pipeline
```bash
curl -X POST http://localhost:7005/api/v1/workflows/from-template \
  -H "Content-Type: application/json" \
  -d '{
    "templateId": "data-processing-pipeline",
    "parameters": {
      "source_url": "s3://your-bucket/data/",
      "destination_table": "processed_data",
      "batch_size": 1000
    }
  }'
```

### Incident Response
```bash
curl -X POST http://localhost:7005/api/v1/workflows/from-template \
  -H "Content-Type: application/json" \
  -d '{
    "templateId": "incident-response-workflow",
    "parameters": {
      "alert_source": "monitoring-system",
      "severity": "high",
      "affected_service": "api-gateway",
      "on_call_team": "platform-team"
    }
  }'
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `7005` |
| `REDIS_HOST` | Redis hostname | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `MAX_PARALLEL_STEPS` | Max concurrent steps | `10` |
| `MAX_PARALLEL_WORKFLOWS` | Max concurrent workflows | `5` |
| `AGENT_REGISTRY_URL` | Agent registry endpoint | `http://localhost:7003` |
| `LOG_LEVEL` | Logging level | `info` |

### Workflow Configuration

```typescript
interface WorkflowStep {
  id: string;
  name: string;
  type: 'agent-task' | 'http-request' | 'script' | 'condition' | 'wait' | 'notification';
  dependencies: string[];
  configuration: {
    parameters: Record<string, any>;
  };
  retryPolicy?: {
    maxAttempts: number;
    baseDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
  };
  timeout?: number;
}
```

## Monitoring & Observability

### Health Checks

```bash
# Basic health check
curl http://localhost:7005/health

# Detailed status
curl http://localhost:7005/api/v1/status
```

### Metrics

The engine exposes Prometheus-compatible metrics:

- `workflow_executions_total` - Total workflow executions
- `workflow_execution_duration_seconds` - Workflow execution duration
- `workflow_step_failures_total` - Failed workflow steps
- `workflow_queue_size` - Current queue size

### Logging

Structured JSON logging with configurable levels:

```json
{
  "level": "info",
  "time": "2024-01-01T12:00:00.000Z",
  "pid": 12345,
  "hostname": "workflow-engine",
  "msg": "Workflow execution started",
  "workflowId": "code-review-workflow",
  "executionId": "exec-123",
  "userId": "user123"
}
```

## Security

### Authentication & Authorization
- JWT-based authentication
- Role-based access control (RBAC)
- API key authentication for agents

### Security Features
- Input validation and sanitization
- Rate limiting
- CORS protection
- Security headers (Helmet.js)
- Secret management with encrypted storage

### Best Practices
- Use environment variables for secrets
- Enable HTTPS in production
- Implement proper logging and monitoring
- Regular security audits

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests
npm run test:integration

# Run with coverage
npm run test:coverage
```

### Test Categories

- **Unit Tests**: Core engine components
- **Integration Tests**: End-to-end workflow execution
- **Performance Tests**: Load and stress testing
- **Security Tests**: Vulnerability assessment

## Deployment

### Docker Deployment

```bash
# Build production image
docker build -t urnlabs/workflow-engine:latest .

# Run container
docker run -d \
  --name workflow-engine \
  -p 7005:7005 \
  -e REDIS_HOST=redis \
  -e AGENT_REGISTRY_URL=http://agent-registry:7003 \
  urnlabs/workflow-engine:latest
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: workflow-engine
spec:
  replicas: 3
  selector:
    matchLabels:
      app: workflow-engine
  template:
    metadata:
      labels:
        app: workflow-engine
    spec:
      containers:
      - name: workflow-engine
        image: urnlabs/workflow-engine:latest
        ports:
        - containerPort: 7005
        env:
        - name: REDIS_HOST
          value: "redis-service"
        - name: AGENT_REGISTRY_URL
          value: "http://agent-registry-service:7003"
```

### Production Checklist

- [ ] Environment variables configured
- [ ] Redis cluster setup for high availability
- [ ] Database backup and recovery procedures
- [ ] Monitoring and alerting configured
- [ ] Load balancer configuration
- [ ] SSL/TLS certificates installed
- [ ] Log aggregation setup
- [ ] Security scanning completed

## Contributing

### Development Workflow

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Run the test suite
5. Submit a pull request

### Code Standards

- TypeScript strict mode
- ESLint configuration
- Prettier formatting
- 80%+ test coverage
- Comprehensive documentation

## License

MIT License - see LICENSE file for details.

## Support

- Documentation: [Internal Docs](../../../docs/workflow-engine/)
- Issues: [GitHub Issues](https://github.com/urnlabs/platform/issues)
- Chat: [Internal Slack #workflow-engine](https://urnlabs.slack.com/channels/workflow-engine)

## Changelog

### v1.0.0 (2024-01-01)
- Initial release
- DAG-based execution engine
- Multi-agent coordination
- Versioning and A/B testing
- Production-ready deployment