# /deploy-staging - Environment-Specific Deployment

## Description
Handles complete deployment to staging environment with health checks, rollback capabilities, and automated testing.

## Usage
```
/deploy-staging [--branch=<branch>] [--migration] [--rollback] [--health-check]
```

## Deployment Process
1. **Pre-deployment Validation**
   - Branch protection rules check
   - Required status checks passed
   - No merge conflicts
   - Environment variables validation
   - Dependencies security scan

2. **Database Operations**
   - Backup current database
   - Run pending migrations
   - Validate schema changes
   - Update seed data if needed

3. **Application Deployment**
   - Build application with staging config
   - Deploy to staging infrastructure
   - Update environment variables
   - Restart services in correct order

4. **Post-deployment Verification**
   - Health check endpoints
   - Database connectivity
   - External service integrations
   - Critical user journeys
   - Performance benchmarks

5. **Notification & Monitoring**
   - Slack deployment notifications
   - Update deployment dashboard
   - Enable monitoring alerts
   - Log deployment metrics

## Rollback Procedures
- Automatic rollback on health check failures
- Manual rollback command available
- Database rollback with backup restoration
- Traffic routing back to previous version

## Environment Configuration
```yaml
staging:
  database_url: "${STAGING_DATABASE_URL}"
  redis_url: "${STAGING_REDIS_URL}"
  api_base_url: "https://api-staging.urnlabs.ai"
  frontend_url: "https://staging.urnlabs.ai"
  log_level: "debug"
  monitoring_enabled: true
```