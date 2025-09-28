# Urnlabs Enterprise Security Framework

A production-ready enterprise security service providing JWT authentication, RBAC authorization, audit logging, and comprehensive security middleware.

## Features

### 🔐 Authentication & Authorization
- **JWT Authentication** with access and refresh tokens
- **Multi-Factor Authentication (MFA)** support with TOTP
- **Role-Based Access Control (RBAC)** with hierarchical permissions
- **Attribute-Based Access Control (ABAC)** with policy engine
- **Session management** with configurable limits and timeouts

### 🛡️ Security Middleware
- **Rate limiting** with configurable windows and limits
- **CSRF protection** with token validation
- **Security headers** (HSTS, CSP, X-Frame-Options, etc.)
- **Request validation** with content-type and size limits
- **IP-based access controls** and geo-blocking capabilities

### 📊 Audit & Compliance
- **Comprehensive audit logging** with tamper-proof storage
- **Security event tracking** with real-time monitoring
- **Compliance reporting** for SOC 2, ISO 27001, GDPR
- **Behavioral analysis** for anomaly detection
- **Access pattern monitoring** for suspicious activity detection

### 🔒 Data Protection
- **End-to-end encryption** for sensitive data
- **Field-level encryption** for database storage
- **Key management** with rotation capabilities
- **Secure password hashing** with Argon2/bcrypt
- **API key management** with scoped permissions

## Quick Start

### Prerequisites
- Node.js 18+ 
- PostgreSQL 14+
- Redis 6+ (optional, for session storage)

### Installation

1. **Clone and setup:**
```bash
git clone <repository>
cd apps/security
npm install
```

2. **Environment configuration:**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Database setup:**
```bash
# Run migrations
npm run db:migrate

# Seed default data
npm run db:seed
```

4. **Start the service:**
```bash
# Development
npm run dev

# Production
npm run build && npm start
```

## API Documentation

Once running, visit `http://localhost:7009/docs` for interactive API documentation.

### Core Endpoints

#### Authentication
- `POST /auth/login` - User login with email/password
- `POST /auth/refresh` - Refresh access token
- `POST /auth/logout` - Logout current session
- `POST /auth/logout-all` - Logout from all devices
- `GET /auth/me` - Get current user profile
- `POST /auth/validate` - Validate JWT token

#### Security
- `GET /auth/csrf-token` - Generate CSRF token
- `GET /health` - Health check endpoint
- `GET /ready` - Readiness probe for K8s

## Configuration

### Environment Variables

Key configuration options:

```bash
# Server
SECURITY_PORT=7009
NODE_ENV=production

# JWT
JWT_ACCESS_SECRET=your-secret
JWT_REFRESH_SECRET=your-secret
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/db

# Encryption
ENCRYPTION_MASTER_KEY=64-character-hex-key

# Rate Limiting
RATE_LIMIT_AUTH_MAX_REQUESTS=5
RATE_LIMIT_AUTH_WINDOW_MS=900000
```

See `.env.example` for complete configuration options.

### Security Configuration

The service uses a comprehensive security configuration object:

```typescript
const config: SecurityConfig = {
  jwt: {
    accessTokenExpiry: '15m',
    refreshTokenExpiry: '7d',
    // ...
  },
  rateLimit: {
    auth: { windowMs: 900000, maxRequests: 5 },
    api: { windowMs: 900000, maxRequests: 100 }
  },
  password: {
    minLength: 8,
    requireUppercase: true,
    requireNumbers: true,
    // ...
  }
};
```

## Database Schema

The service creates comprehensive security tables:

- **users** - User accounts and authentication data
- **roles** - Role definitions and hierarchies  
- **permissions** - Granular permission definitions
- **user_roles** / **role_permissions** - RBAC associations
- **auth_sessions** - Active user sessions
- **security_events** - Audit log with tamper protection
- **policy_rules** - ABAC policy definitions
- **access_patterns** - Behavioral analysis data

## Development

### Running Tests

```bash
# Unit tests
npm test

# Test with coverage
npm run test:coverage

# Security-specific tests
npm run test:security
```

### Code Quality

```bash
# Linting
npm run lint

# Type checking
npm run typecheck

# Security scanning
npm run security:scan
```

### Database Operations

```bash
# Generate Prisma client
npm run db:generate

# Push schema changes
npm run db:push

# Create migration
npm run db:migrate

# Open Prisma Studio
npm run db:studio
```

## Security Best Practices

### Production Deployment

1. **Environment Security:**
   - Use strong, unique secrets for all tokens
   - Enable HTTPS with proper certificates
   - Configure proper CORS origins
   - Set secure session cookies

2. **Database Security:**
   - Use connection pooling
   - Enable SSL/TLS for database connections
   - Regular security updates
   - Backup encryption

3. **Monitoring:**
   - Enable comprehensive logging
   - Set up alerting for security events
   - Monitor failed authentication attempts
   - Track unusual access patterns

### Key Rotation

The service supports key rotation for enhanced security:

```bash
# Generate new master key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Update environment and restart service
# Old encrypted data remains accessible during transition
```

## Integration

### With Other Services

The security service can be integrated with other Urnlabs services:

```typescript
// Validate tokens from other services
const response = await fetch('http://security:7009/auth/validate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: bearerToken })
});
```

### Middleware Usage

Use the security middleware in your Express/Fastify applications:

```typescript
import { SecurityMiddleware } from '@urnlabs/security';

// Rate limiting
app.use(securityMiddleware.createRateLimitMiddleware(options));

// Authentication
app.use(securityMiddleware.createAuthenticationMiddleware({
  required: true,
  allowedRoles: ['admin', 'user']
}));

// CSRF protection
app.use(securityMiddleware.createCSRFMiddleware({ enabled: true }));
```

## Monitoring & Observability

### Health Checks
- `/health` - Basic service health
- `/ready` - Kubernetes readiness probe with dependency checks

### Metrics
The service exposes Prometheus-compatible metrics for:
- Authentication success/failure rates
- API response times
- Active session counts
- Security event frequencies

### Logging
Structured logging with security event correlation:
- Authentication events
- Authorization decisions  
- Security violations
- Performance metrics

## Compliance

### SOC 2 Type II
- Comprehensive audit trails
- Access control documentation
- Security monitoring evidence
- Incident response procedures

### GDPR
- Data encryption at rest and in transit
- Right to erasure implementation
- Consent management
- Data breach notification

### ISO 27001
- Information security management
- Risk assessment procedures
- Security control implementation
- Continuous monitoring

## Troubleshooting

### Common Issues

1. **Authentication Failures:**
   ```bash
   # Check JWT secrets
   echo $JWT_ACCESS_SECRET
   
   # Verify database connection
   npm run db:studio
   ```

2. **Rate Limiting Issues:**
   ```bash
   # Check Redis connection
   redis-cli ping
   
   # Review rate limit configuration
   cat .env | grep RATE_LIMIT
   ```

3. **Database Migration Errors:**
   ```bash
   # Reset database (development only)
   npm run db:reset
   
   # Check migration status
   npx prisma migrate status
   ```

### Debug Mode

Enable debug logging for troubleshooting:

```bash
LOG_LEVEL=debug npm run dev
```

## Support

For issues and questions:
- GitHub Issues: [urnlabs/urnlabs](https://github.com/urnlabs/urnlabs)
- Email: security@urnlabs.ai
- Documentation: [docs.urnlabs.ai](https://docs.urnlabs.ai)

## License

Copyright © 2024 Urnlabs AI. All rights reserved.