# Urnlabs External Integrations Service

The Integrations Service provides seamless connectivity with external platforms including GitHub, Slack, and a marketplace of pre-built connectors for popular tools like Jira, Confluence, Jenkins, and GitLab.

## Features

### 🐙 GitHub App Integration
- **Repository Management**: Access repositories, create/merge PRs, manage issues
- **Webhook Processing**: Real-time event handling for push, PR, and issue events
- **Security**: Signature verification and proper authentication

### 🤖 Slack Bot Integration
- **Interactive Components**: Buttons, modals, and workflow approvals
- **Slash Commands**: Custom `/urnlabs` commands for platform management
- **Notifications**: Real-time status updates and alerts

### 🔗 Webhook Processing System
- **Security**: Signature verification and rate limiting
- **Reliability**: Retry logic with exponential backoff
- **Scalability**: Redis-based queue processing with dead letter queues

### 🏪 Integration Marketplace
- **Pre-built Connectors**: Jira, Confluence, Jenkins, GitLab, Docker Hub, AWS CloudWatch
- **Plugin Architecture**: Easy installation and configuration
- **Connection Testing**: Validate credentials and connectivity

## Quick Start

### Environment Setup

1. Copy the environment template:
```bash
cp .env.example .env
```

2. Configure required environment variables:
```env
# GitHub App (Optional)
GITHUB_APP_ID=your_github_app_id
GITHUB_APP_PRIVATE_KEY=your_github_private_key
GITHUB_WEBHOOK_SECRET=your_webhook_secret

# Slack Bot (Optional)
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token
SLACK_SIGNING_SECRET=your_slack_signing_secret

# Database & Redis (Required)
DATABASE_URL=postgresql://user:pass@localhost:5432/urnlabs
REDIS_URL=redis://localhost:6379
```

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test

# Run specific test suites
npm run test:github
npm run test:slack
npm run test:webhooks
```

### Docker Deployment

```bash
# Build image
docker build -t urnlabs-integrations .

# Run container
docker run -p 7010:7010 --env-file .env urnlabs-integrations
```

## API Documentation

Once running, access the interactive API documentation at:
- Development: http://localhost:7010/docs
- Health Check: http://localhost:7010/health

### Key Endpoints

#### GitHub Integration
- `GET /api/v1/github/installations/{id}/repositories` - List repositories
- `POST /api/v1/github/installations/{id}/repositories/{owner}/{repo}/pulls` - Create PR
- `POST /webhooks/github` - GitHub webhook endpoint

#### Slack Integration
- `POST /api/v1/slack/messages` - Send message
- `POST /api/v1/slack/notifications` - Send notification
- `POST /slack/events` - Slack events endpoint

#### Webhook Management
- `POST /api/v1/webhooks/{source}/{eventType}` - Generic webhook endpoint
- `GET /api/v1/webhooks/stats` - Processing statistics
- `GET /api/v1/webhooks/dead-letter` - Failed events

#### Marketplace
- `GET /api/v1/marketplace/connectors` - Available connectors
- `POST /api/v1/marketplace/connectors/{id}/install` - Install connector
- `GET /api/v1/marketplace/instances` - Installed instances

## Setup Guides

### GitHub App Setup

1. Create a GitHub App in your organization settings
2. Set webhook URL: `https://your-domain.com/api/v1/webhooks/github`
3. Subscribe to events: `push`, `pull_request`, `issues`, `installation`
4. Generate and download private key
5. Run setup script:
```bash
npm run github:setup
```

### Slack Bot Setup

1. Create a Slack App at https://api.slack.com/apps
2. Configure OAuth scopes: `app_mentions:read`, `chat:write`, `commands`, etc.
3. Set request URL: `https://your-domain.com/api/v1/slack/events`
4. Add slash command `/urnlabs`
5. Install app to workspace
6. Run setup script:
```bash
npm run slack:setup
```

### Marketplace Connectors

#### Jira Integration
```javascript
// Install Jira connector
const response = await fetch('/api/v1/marketplace/connectors/jira/install', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'My Jira Instance',
    config: {
      baseUrl: 'https://yourcompany.atlassian.net',
      projectKeys: ['PROJ', 'DEV']
    },
    credentials: {
      username: 'user@company.com',
      apiToken: 'your-api-token'
    }
  })
});
```

#### Jenkins Integration
```javascript
// Install Jenkins connector
const response = await fetch('/api/v1/marketplace/connectors/jenkins/install', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Production Jenkins',
    config: {
      baseUrl: 'https://jenkins.company.com',
      jobs: ['deploy-prod', 'run-tests']
    },
    credentials: {
      username: 'jenkins-user',
      apiToken: 'your-jenkins-token'
    }
  })
});
```

## Security Features

- **Webhook Signature Verification**: All webhooks verify sender authenticity
- **Rate Limiting**: Prevents abuse with configurable limits per source
- **Credential Encryption**: Sensitive data encrypted at rest
- **Access Controls**: JWT-based authentication for API endpoints
- **Audit Logging**: Complete activity tracking for compliance

## Monitoring & Observability

- **Health Checks**: Individual service health endpoints
- **Metrics**: Processing statistics and performance data
- **Logging**: Structured logging with correlation IDs
- **Error Tracking**: Dead letter queues for failed processing

## Troubleshooting

### Common Issues

1. **GitHub Webhook Fails**
   - Verify webhook secret matches configuration
   - Check GitHub App permissions
   - Ensure webhook URL is accessible

2. **Slack Events Not Processing**
   - Verify signing secret configuration
   - Check request URL in Slack app settings
   - Ensure bot has required scopes

3. **Connector Installation Fails**
   - Test credentials manually
   - Check network connectivity
   - Verify API endpoints are accessible

### Debug Mode

Enable debug logging:
```env
LOG_LEVEL=debug
NODE_ENV=development
```

### Health Checks

Monitor service health:
```bash
# Overall service health
curl http://localhost:7010/health

# Individual component health
curl http://localhost:7010/api/v1/github/health/github
curl http://localhost:7010/api/v1/slack/health/slack
curl http://localhost:7010/api/v1/health/webhooks
curl http://localhost:7010/api/v1/marketplace/health/marketplace
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

This project is part of the Urnlabs AI Agent Platform and follows the same licensing terms.