# Urnlabs Analytics Service

Production-ready analytics and ROI measurement service that provides real-time performance metrics collection, ROI calculation, interactive dashboards, automated reporting, and business intelligence insights.

## Features

### 🎯 Core Capabilities
- **Real-time Metrics Collection**: Collect and store performance, business, and agent metrics
- **ROI Calculation**: Comprehensive return on investment analysis with cost breakdown
- **Interactive Dashboards**: Customizable widgets and visualizations
- **Automated Reporting**: Scheduled reports via email, Slack, PDF, and webhooks
- **Business Intelligence**: AI-powered insights, trend analysis, and alerting
- **Production-Ready**: Enterprise-grade security, performance, and scalability

### 📊 Metrics Types
- **Performance Metrics**: Response times, throughput, error rates, resource utilization
- **Agent Metrics**: AI agent execution times, success rates, costs, token usage
- **Business Metrics**: Revenue impact, cost savings, efficiency gains, customer satisfaction

### 💰 ROI Analysis
- **Cost Tracking**: Agent costs, infrastructure costs, operational expenses
- **Savings Calculation**: Human labor savings, error reduction, efficiency improvements
- **Revenue Impact**: New customer acquisition, retention improvements, time-to-market
- **Financial Metrics**: ROI percentage, payback period, net present value

### 📈 Dashboards & Visualizations
- **Widget Types**: Line charts, bar charts, pie charts, gauges, counters, tables, heatmaps
- **Real-time Updates**: Live data streaming with configurable refresh intervals
- **Custom Layouts**: Drag-and-drop dashboard builder with responsive design
- **Export Options**: PNG images, PDF reports, data exports

### 📋 Automated Reporting
- **Multiple Formats**: PDF, email, Slack, webhook delivery
- **Flexible Scheduling**: Hourly, daily, weekly, monthly, quarterly reports
- **Custom Content**: Rich report sections with charts, tables, and narrative content
- **Distribution Lists**: Multiple recipients per report with role-based access

### 🤖 Business Intelligence
- **Trend Analysis**: Statistical trend detection with forecasting
- **Anomaly Detection**: Automated identification of unusual patterns
- **Alert Rules**: Configurable thresholds with multi-channel notifications
- **Optimization Recommendations**: AI-powered suggestions for performance improvements

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 13+
- Redis 6+
- Docker (optional)

### Installation

```bash
# Clone the repository
git clone https://github.com/urnlabs/urnlabs.git
cd urnlabs/apps/analytics

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Edit .env with your configuration
vim .env

# Start the service
npm run dev
```

### Using Docker

```bash
# Build and run with Docker
docker build -t urnlabs-analytics .
docker run -p 7003:7003 --env-file .env urnlabs-analytics
```

### Using Docker Compose (Recommended)

```bash
# From project root
docker-compose -f docker-compose-local.yml up analytics
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `7003` |
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `SMTP_HOST` | Email server host | Required for reports |
| `SLACK_WEBHOOK_URL` | Slack notifications | Optional |
| `AVERAGE_HOURLY_RATE_CENTS` | Average hourly labor rate | `5000` ($50/hr) |
| `AI_API_COST_MULTIPLIER` | AI API cost markup | `1.2` (20%) |

See `.env.example` for complete configuration options.

### Database Setup

```sql
-- Create database
CREATE DATABASE urnlabs_analytics;

-- Run migrations
npm run db:migrate

-- Seed sample data (optional)
npm run db:seed
```

## API Documentation

### Base URL
```
http://localhost:7003/api/v1
```

### Authentication
Currently, the service supports API key authentication via headers:
```
Authorization: Bearer <your-api-key>
```

### Core Endpoints

#### Metrics Collection
```bash
# Record performance metric
POST /metrics
{
  "service": "api",
  "metric_type": "timer",
  "value": 150,
  "unit": "ms",
  "tags": { "endpoint": "/users" }
}

# Record agent metric
POST /metrics/agent
{
  "service": "agents",
  "agent_id": "agent-123",
  "success": true,
  "execution_time_ms": 2500,
  "cost_cents": 5,
  "tokens_used": 150
}

# Query metrics
POST /metrics/query
{
  "metric_name": "api.response_time",
  "start_time": "2024-01-01T00:00:00Z",
  "end_time": "2024-01-02T00:00:00Z",
  "aggregation": { "function": "avg", "interval": "1h" }
}
```

#### ROI Calculation
```bash
# Calculate ROI
POST /roi/calculate
{
  "period_start": "2024-01-01T00:00:00Z",
  "period_end": "2024-01-31T23:59:59Z"
}

# Get ROI summary
GET /roi/summary?periods=30d

# Get cost breakdown
GET /roi/costs?group_by=agent

# Get savings analysis
GET /roi/savings
```

#### Dashboard Management
```bash
# Create widget
POST /dashboard/widgets
{
  "title": "API Response Time",
  "type": "line_chart",
  "config": {
    "query": "api.response_time",
    "time_range": "24h"
  }
}

# Get widget data
GET /dashboard/widgets/{id}/data

# Create dashboard
POST /dashboard
{
  "name": "Main Dashboard",
  "widgets": [...]
}
```

#### Reporting
```bash
# Create report
POST /reports
{
  "name": "Weekly Performance",
  "schedule": "weekly",
  "format": "email",
  "recipients": ["admin@company.com"]
}

# Generate report immediately
POST /reports/{id}/generate
```

#### Business Intelligence
```bash
# Generate insights
POST /intelligence/insights/generate

# Analyze trends
POST /intelligence/trends
{
  "metric": "api.response_time",
  "start_time": "2024-01-01T00:00:00Z",
  "end_time": "2024-01-07T23:59:59Z"
}

# Create alert rule
POST /intelligence/alerts
{
  "name": "High Response Time",
  "metric_query": "api.response_time",
  "threshold_value": 1000,
  "severity": "high"
}
```

### Interactive API Documentation
Visit `http://localhost:7003/docs` for complete Swagger/OpenAPI documentation.

## Usage Examples

### Recording Metrics

```typescript
import axios from 'axios';

const analyticsAPI = axios.create({
  baseURL: 'http://localhost:7003/api/v1',
  headers: { 'Authorization': 'Bearer your-api-key' }
});

// Record API performance
await analyticsAPI.post('/metrics', {
  service: 'api',
  metric_type: 'timer',
  value: 145,
  unit: 'ms',
  tags: { endpoint: '/api/users', method: 'GET' }
});

// Record agent execution
await analyticsAPI.post('/metrics/agent', {
  service: 'agents',
  agent_id: 'content-generator',
  workflow_id: 'blog-creation',
  success: true,
  execution_time_ms: 3500,
  cost_cents: 12,
  tokens_used: 450,
  tags: { model: 'gpt-4', task_type: 'content_generation' }
});

// Record business impact
await analyticsAPI.post('/metrics/business', {
  metric_name: 'automation_hours_saved',
  value: 8.5,
  dimension: { 
    department: 'marketing',
    skill_level: 'senior',
    task_category: 'content_creation'
  },
  cost_savings_cents: 68000 // $680 saved
});
```

### Creating Dashboards

```typescript
// Create a performance monitoring widget
const widget = await analyticsAPI.post('/dashboard/widgets', {
  title: 'API Response Time Trend',
  type: 'line_chart',
  config: {
    query: 'api.response_time',
    time_range: '24h',
    aggregation: 'avg',
    grouping: ['endpoint'],
    filters: { service: 'api' },
    visualization_options: {
      show_trend_line: true,
      alert_threshold: 500
    }
  },
  data_source: 'metrics',
  refresh_interval_seconds: 300,
  position: { x: 0, y: 0, width: 8, height: 4 }
});

// Create a dashboard
const dashboard = await analyticsAPI.post('/dashboard', {
  name: 'Operations Dashboard',
  description: 'Real-time operational metrics',
  widgets: [widget.data],
  created_by: 'admin',
  is_public: false,
  tags: ['operations', 'real-time']
});
```

### ROI Analysis

```typescript
// Calculate monthly ROI
const roi = await analyticsAPI.post('/roi/calculate', {
  period_start: '2024-01-01T00:00:00Z',
  period_end: '2024-01-31T23:59:59Z',
  include_projections: true
});

console.log(`ROI: ${roi.data.roi_percent.toFixed(2)}%`);
console.log(`Payback Period: ${roi.data.payback_period_days} days`);
console.log(`Cost Savings: $${roi.data.cost_savings_cents / 100}`);

// Get cost breakdown by agent
const costs = await analyticsAPI.get('/roi/costs', {
  params: {
    period_start: '2024-01-01T00:00:00Z',
    period_end: '2024-01-31T23:59:59Z',
    group_by: 'agent'
  }
});

costs.data.top_costs.forEach(cost => {
  console.log(`${cost.name}: $${cost.cost_cents / 100} (${cost.percentage.toFixed(1)}%)`);
});
```

### Automated Reporting

```typescript
// Create weekly performance report
const report = await analyticsAPI.post('/reports', {
  name: 'Weekly Performance Report',
  description: 'Comprehensive weekly analysis of system performance and ROI',
  schedule: 'weekly',
  recipients: ['ceo@company.com', 'cto@company.com'],
  format: 'email',
  sections: [
    {
      title: 'Executive Summary',
      description: 'High-level performance metrics and ROI summary',
      widget_ids: ['roi-summary-widget', 'performance-overview-widget'],
      custom_content: 'This week showed significant improvements in automation efficiency...'
    },
    {
      title: 'Detailed Metrics',
      description: 'Comprehensive performance analysis',
      widget_ids: ['detailed-metrics-widget', 'cost-breakdown-widget']
    }
  ]
});

// Generate report immediately
const generated = await analyticsAPI.post(`/reports/${report.data.id}/generate`);
console.log(`Report generated: ${generated.data.file_path}`);
```

### Business Intelligence

```typescript
// Generate business insights
const insights = await analyticsAPI.post('/intelligence/insights/generate');

insights.data.forEach(insight => {
  console.log(`${insight.title} (${insight.impact})`);
  console.log(insight.description);
  insight.recommendations.forEach(rec => console.log(`- ${rec}`));
});

// Analyze performance trends
const trends = await analyticsAPI.post('/intelligence/trends', {
  metric: 'api.response_time',
  start_time: '2024-01-01T00:00:00Z',
  end_time: '2024-01-07T23:59:59Z',
  forecast_days: 7
});

console.log(`Trend: ${trends.data.trend_direction} (${trends.data.change_percent.toFixed(2)}%)`);
console.log(`Forecast: ${trends.data.forecast.join(', ')}`);

// Create alert rule
const alert = await analyticsAPI.post('/intelligence/alerts', {
  name: 'High API Response Time',
  description: 'Alert when API response time exceeds acceptable threshold',
  metric_query: 'api.response_time',
  condition: {
    operator: 'gt',
    aggregation: 'avg',
    time_window_minutes: 5
  },
  threshold_value: 1000, // 1 second
  severity: 'high',
  channels: [
    {
      type: 'email',
      config: { email: 'devops@company.com' }
    },
    {
      type: 'slack',
      config: { channel: '#alerts' }
    }
  ],
  enabled: true,
  cooldown_minutes: 30
});
```

## Performance & Scalability

### Optimizations
- **Redis Caching**: Aggressive caching of query results and widget data
- **Database Indexing**: Optimized indexes for time-series queries
- **Batch Processing**: Metrics buffering and batch inserts
- **Connection Pooling**: Efficient database connection management

### Scaling Considerations
- **Horizontal Scaling**: Stateless design supports multiple instances
- **Database Sharding**: Time-based partitioning for large datasets
- **Cache Clustering**: Redis cluster support for high availability
- **Load Balancing**: Round-robin or least-connections balancing

### Performance Targets
- **API Response Time**: < 200ms for 95% of requests
- **Throughput**: 1000+ metrics/second ingestion
- **Query Performance**: < 1s for complex analytics queries
- **Uptime**: 99.9% availability target

## Monitoring & Observability

### Health Checks
```bash
# Service health
GET /health

# Component health
GET /metrics/health
GET /dashboard/health
GET /roi/health
GET /reports/health
GET /intelligence/health
```

### Metrics Collection
The service automatically collects its own performance metrics:
- Request latency and throughput
- Error rates and types
- Resource utilization
- Cache hit rates
- Background job performance

### Logging
Structured JSON logging with configurable levels:
```bash
# Set log level
export LOG_LEVEL=debug
```

### Prometheus Integration
Enable Prometheus metrics export:
```bash
export ENABLE_PROMETHEUS=true
```

## Security

### Authentication
- API key authentication
- JWT token support (optional)
- Role-based access control (RBAC)

### Data Protection
- Input validation and sanitization
- SQL injection prevention (Prisma ORM)
- XSS protection
- Rate limiting

### Compliance
- GDPR compliance ready
- Data retention policies
- Audit logging
- Secure data transmission (HTTPS)

## Development

### Setup Development Environment

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Type checking
npm run type-check

# Linting
npm run lint
npm run lint:fix
```

### Testing

```bash
# Unit tests
npm run test

# Integration tests
npm run test:integration

# End-to-end tests
npm run test:e2e

# Performance tests
npm run test:performance
```

### Database Migrations

```bash
# Generate migration
npx prisma migrate dev --name migration_name

# Apply migrations
npx prisma migrate deploy

# Reset database
npx prisma migrate reset
```

## Deployment

### Production Build

```bash
# Build for production
npm run build

# Start production server
npm start
```

### Docker Deployment

```bash
# Build image
docker build -t urnlabs-analytics:latest .

# Run container
docker run -d \
  --name analytics \
  -p 7003:7003 \
  --env-file .env \
  urnlabs-analytics:latest
```

### Environment-Specific Configuration

```bash
# Development
NODE_ENV=development npm run dev

# Production
NODE_ENV=production npm start

# Staging
NODE_ENV=staging npm start
```

## Troubleshooting

### Common Issues

#### Database Connection Errors
```bash
# Check database connectivity
npx prisma db pull

# Verify connection string
echo $DATABASE_URL
```

#### Redis Connection Issues
```bash
# Test Redis connection
redis-cli ping

# Check Redis configuration
redis-cli config get "*"
```

#### Memory Issues
```bash
# Monitor memory usage
docker stats analytics

# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096" npm start
```

#### Performance Issues
```bash
# Enable debug logging
LOG_LEVEL=debug npm start

# Monitor performance metrics
curl http://localhost:7003/health
```

### Debug Mode

```bash
# Enable debug mode
DEBUG=analytics:* npm run dev

# Database query logging
DATABASE_LOGGING=true npm run dev
```

## Contributing

### Development Workflow
1. Fork the repository
2. Create feature branch: `git checkout -b feature/analytics-enhancement`
3. Make changes with tests
4. Commit with conventional commits: `feat(analytics): add real-time streaming`
5. Push and create pull request

### Code Standards
- TypeScript strict mode
- ESLint configuration
- Prettier formatting
- 80%+ test coverage
- JSDoc documentation

### Pull Request Guidelines
- Include tests for new features
- Update documentation
- Follow conventional commit format
- Ensure CI/CD passes

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- **Documentation**: [docs.urnlabs.ai](https://docs.urnlabs.ai)
- **Issues**: [GitHub Issues](https://github.com/urnlabs/urnlabs/issues)
- **Discord**: [Urnlabs Community](https://discord.gg/urnlabs)
- **Email**: support@urnlabs.ai

---

Built with ❤️ by the Urnlabs team