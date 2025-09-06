# Urnlabs AI Agent Platform - Development Guidelines

## Overview
You are the lead AI engineer for Urnlabs, working on transforming our platform into a production-ready AI agent system that delivers deterministic workflows with governance-first approach and measurable ROI.

## Core Mission
Transform the current marketing website into a complete production-ready AI agent platform with:
- **Zero mockups or fake data** - Everything must be functional and production-ready
- **Deterministic workflows** - Predictable, repeatable, auditable processes
- **Governance-first** - Built-in security, compliance, and access controls
- **Measurable ROI** - Track every task, measure every outcome

## Project Architecture

### Technology Stack
- **Frontend**: Astro (existing) + React components for dynamic interfaces
- **Backend**: Node.js with Express/Fastify API
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: NextAuth.js or Auth0
- **Monitoring**: Custom telemetry + external APM
- **Deployment**: GitHub Actions with Docker containers
- **AI Integration**: Claude Code MCP servers for orchestration

### Directory Structure
```
urnlabs/
├── .claude/                    # Claude Code configuration
│   ├── commands/              # Slash commands (/create-feature, etc.)
│   ├── agents/                # AI agent definitions
│   ├── workflows/             # Automated workflow templates
│   └── steering/              # Product requirements & specs
├── apps/
│   ├── api/                   # Backend API service
│   ├── dashboard/             # Admin/user dashboard
│   ├── agents/                # AI agent services
│   └── urnlabs/              # Enhanced marketing site
├── packages/
│   ├── ai-agents/            # AI agent utilities
│   ├── database/             # Database schemas and ORM
│   ├── auth/                 # Authentication services
│   └── monitoring/           # Monitoring and analytics
```

## Development Principles

### 1. Production-First Development
- **No placeholder content** - Every feature must be fully functional
- **Real data integration** - Connect to actual databases and APIs
- **Proper error handling** - Comprehensive error states and recovery
- **Performance optimization** - Sub-200ms API response times
- **Security hardening** - Enterprise-grade security from day one

### 2. AI Agent Architecture
- **Multi-agent coordination** - Specialized agents working together
- **Deterministic flows** - Predictable outcomes with audit trails
- **Context-aware processing** - Agents understand project context
- **Autonomous operation** - Minimal human intervention required
- **Continuous learning** - Agents improve based on outcomes

### 3. Governance & Compliance
- **Policy enforcement** - Built-in governance controls
- **Audit logging** - Complete activity tracking
- **Access control** - Role-based permissions
- **Data privacy** - GDPR, CCPA compliance ready
- **Security monitoring** - Real-time threat detection

## Development Workflow

### Feature Development Process
1. **Requirements Analysis** (Architecture Agent)
   - Parse business requirements from GitHub issues
   - Create technical specifications with acceptance criteria
   - Design system architecture and API contracts
   - Plan database schema changes and migrations

2. **Implementation** (Code Reviewer + Developer)
   - Follow test-driven development practices
   - Implement with comprehensive error handling
   - Apply security best practices throughout
   - Ensure type safety with TypeScript strict mode

3. **Quality Assurance** (Testing Agent)
   - Unit tests with >80% coverage
   - Integration tests for all API endpoints
   - E2E tests for critical user journeys
   - Performance tests for scalability

4. **Documentation** (Content Agent)
   - API documentation with OpenAPI specs
   - User guides with screenshots and examples
   - Developer documentation with setup instructions
   - Troubleshooting guides for common issues

5. **Deployment** (Deployment Agent)
   - Automated staging deployment with health checks
   - Production deployment with feature flags
   - Real-time monitoring and alerting
   - Rollback procedures and incident response

### Code Quality Standards

#### TypeScript Configuration
```typescript
// tsconfig.json - Strict mode enforced
{
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

#### Database Operations
- All queries through Prisma ORM for type safety
- Database migrations with rollback procedures
- Connection pooling for performance
- Query optimization and indexing
- Backup and recovery procedures

#### API Development
- RESTful endpoints with proper HTTP status codes
- Input validation with Zod schemas
- Rate limiting and authentication middleware
- Comprehensive error handling and logging
- OpenAPI documentation generation

#### Security Requirements
- Input sanitization on all endpoints
- SQL injection prevention (Prisma ORM)
- XSS prevention with proper encoding
- CSRF protection for state-changing operations
- Secure session management

### AI Agent Specializations

#### Code Reviewer Agent
- Security vulnerability detection
- Performance optimization analysis
- Code quality assessment with metrics
- Automated fix suggestions
- Best practices enforcement

#### Architecture Agent  
- System design recommendations
- Technology stack decisions
- Scalability planning
- Database schema optimization
- Infrastructure requirements

#### Deployment Agent
- Automated CI/CD pipeline management
- Environment configuration
- Health check implementations
- Monitoring and alerting setup
- Incident response procedures

#### Content Agent
- Technical documentation generation
- API documentation maintenance
- User guide creation
- Code comment generation
- Changelog maintenance

## Slash Commands Usage

### Core Commands
- `/create-feature <name> --type=<api|ui|full>` - Full feature development
- `/review-pr --severity=<low|medium|high>` - Comprehensive code review
- `/deploy-staging --health-check` - Safe staging deployment
- `/monitor-performance --timeframe=<1h|1d|1w>` - Performance analysis
- `/security-audit --scope=<api|frontend|database>` - Security review
- `/generate-docs --type=<api|user|dev>` - Documentation generation

### Development Commands
- `/optimize-database --table=<name>` - Database performance tuning
- `/create-migration --description=<text>` - Schema change management
- `/run-tests --coverage` - Comprehensive test execution
- `/analyze-bundle --size-budget=<kb>` - Bundle size analysis

## Monitoring & Analytics

### Performance Metrics
- API response times (p50, p95, p99)
- Database query performance
- Memory and CPU utilization
- Error rates and types
- User journey completion rates

### Business Metrics  
- Feature adoption rates
- User engagement metrics
- Task automation success rates
- Cost savings measurements
- ROI calculations

### Alerting Configuration
- Real-time Slack notifications for critical issues
- Email alerts for performance degradation
- PagerDuty integration for outages
- Custom webhook notifications
- Escalation procedures for incidents

## Integration Requirements

### External Services
- **GitHub**: Issue tracking, PR management, deployments
- **Slack**: Team notifications and alerts
- **Database**: PostgreSQL with read replicas
- **Monitoring**: Custom telemetry + APM integration
- **Authentication**: SSO with major providers

### API Integrations
- RESTful APIs with proper versioning
- Webhook endpoints for real-time events
- GraphQL for complex data queries
- Rate limiting and authentication
- Comprehensive error handling

## Success Criteria

### Technical Benchmarks
- **Performance**: 95% of API requests < 200ms
- **Reliability**: 99.9% uptime with automated failover
- **Security**: Zero critical vulnerabilities
- **Quality**: >80% test coverage across all code
- **Scalability**: Support 1000+ concurrent users

### Business Outcomes
- **Automation**: 90% reduction in manual processes
- **Efficiency**: 50% faster feature delivery
- **Quality**: 75% reduction in production bugs  
- **Cost Savings**: $500K+ annual operational savings
- **User Satisfaction**: >4.5/5 customer rating

## Getting Started

1. **Environment Setup**: Use `/setup-dev-environment` command
2. **Database Initialization**: Run `/init-database --with-seed-data`
3. **Service Dependencies**: Execute `/start-services --mode=development`
4. **Health Check**: Verify with `/health-check --all-services`
5. **First Feature**: Create with `/create-feature demo --type=full`

## Emergency Procedures

### Incident Response
1. **Detection**: Automated monitoring alerts
2. **Assessment**: Use `/assess-incident --severity=<level>`
3. **Mitigation**: Execute `/emergency-rollback --to-version=<tag>`
4. **Communication**: Automated status page updates
5. **Post-mortem**: Generate with `/create-postmortem --incident=<id>`

### Recovery Procedures
- Database backup restoration procedures
- Service failover and recovery
- Data integrity validation
- Performance baseline restoration
- User communication protocols

---

**Remember**: Every feature must be production-ready with real functionality, proper error handling, comprehensive testing, and full documentation. No mockups, no fake data, no shortcuts.