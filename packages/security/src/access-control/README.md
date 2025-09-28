# Access Control Matrix (ACM)

A comprehensive Role-Based Access Control (RBAC) system with Attribute-Based Access Control (ABAC) capabilities, designed for enterprise-grade security and compliance.

## Features

### Core Capabilities
- **Dynamic Role Assignment**: Flexible role hierarchy with inheritance
- **Permission Engine**: Advanced permission evaluation with caching
- **User Management**: Complete user lifecycle with provisioning/deprovisioning
- **Temporal Access**: Time-based and schedule-based permissions
- **Risk Assessment**: Context-aware risk scoring and mitigation
- **Audit Trails**: Comprehensive logging and compliance reporting
- **Emergency Access**: Break-glass procedures with approval workflows
- **OPA Integration**: Policy-as-code with Open Policy Agent

### Advanced Features
- **Access Matrix Computation**: Pre-computed permission matrices with caching
- **Conflict Detection**: Automatic policy conflict identification and resolution
- **Access Reviews**: Automated certification campaigns and compliance checks
- **Context-Aware Decisions**: IP, location, device, and behavioral analysis
- **Performance Optimization**: Multi-level caching and bulk operations
- **Compliance Framework**: SOC 2, ISO 27001, GDPR support

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Access Control Matrix                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │    RBAC     │  │ Permission  │  │    User     │              │
│  │   Manager   │  │   Engine    │  │  Manager    │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │     OPA     │  │    Admin    │  │   Audit     │              │
│  │ Integration │  │ Interface   │  │   System    │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
├─────────────────────────────────────────────────────────────────┤
│                    Redis Cache Layer                            │
├─────────────────────────────────────────────────────────────────┤
│                   External Integrations                         │
│  [Identity Providers] [Policy Engines] [Monitoring Systems]     │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Installation

```bash
npm install @urnlabs/security
```

### Basic Setup

```typescript
import { createAccessControlSystem, createDefaultConfig } from '@urnlabs/security';

// Create system with default configuration
const config = createDefaultConfig();
const acm = createAccessControlSystem(config);

// Initialize the system
await acm.matrix.computeAccessMatrix('user-123');
```

### Evaluate Access Request

```typescript
import { AccessRequest } from '@urnlabs/security';

const request: AccessRequest = {
  id: 'req-001',
  userId: 'user-123',
  resource: '/api/v1/workflows',
  action: 'POST',
  context: {
    ip: '192.168.1.100',
    userAgent: 'Mozilla/5.0...',
    environment: 'PRODUCTION',
    session: {
      id: 'session-456',
      mfaVerified: true,
      riskScore: 25,
      loginMethod: 'SSO',
      createdAt: new Date(),
    },
  },
  timestamp: new Date(),
};

const decision = await acm.matrix.evaluateAccess(request);

if (decision.decision === 'ALLOW') {
  console.log('Access granted:', decision.reason);
} else {
  console.log('Access denied:', decision.reason);
  console.log('Recommendations:', decision.recommendations);
}
```

## Core Components

### 1. RBAC Manager

Manages roles, hierarchies, and assignments with advanced features:

```typescript
// Create a new role
const role: Role = {
  id: 'data-analyst',
  name: 'Data Analyst',
  description: 'Access to analytics and reporting functions',
  permissions: [
    {
      id: 'analytics-read',
      resource: '/api/v1/analytics/*',
      action: 'GET',
      effect: 'ALLOW',
      priority: 100,
      isActive: true,
      scope: { type: 'ORGANIZATION' },
    },
  ],
  parentRoles: ['user'],
  childRoles: [],
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: 'admin',
};

await acm.rbac.createRole(role);

// Assign role to user with temporal constraints
await acm.rbac.assignRoleToUser(
  'user-123',
  'data-analyst',
  'admin',
  {
    validFrom: new Date(),
    validTo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
  }
);
```

### 2. Permission Engine

Advanced permission evaluation with conditions and caching:

```typescript
// Evaluate permissions with context
const permissions = await acm.permissions.getUserPermissions('user-123');
const result = await acm.permissions.evaluatePermissions(
  permissions,
  'DELETE',
  {
    userId: 'user-123',
    ip: '192.168.1.100',
    userAgent: 'Mozilla/5.0...',
    timestamp: new Date(),
    environment: 'PRODUCTION',
    attributes: {
      location: { country: 'US', region: 'CA' },
      device: { isTrusted: true, type: 'DESKTOP' },
    },
  }
);

console.log('Permission result:', result);
```

### 3. User Manager

Complete user lifecycle management:

```typescript
// Provision new user
const provisioningRequest: UserProvisioningRequest = {
  email: 'john.doe@company.com',
  firstName: 'John',
  lastName: 'Doe',
  department: 'Engineering',
  jobTitle: 'Software Engineer',
  startDate: new Date(),
  endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
  requiredRoles: ['developer', 'user'],
  requiredGroups: ['engineering-team'],
  requestedBy: 'manager-456',
  businessJustification: 'New team member joining development team',
};

const newUser = await acm.users.provisionUser(provisioningRequest);

// Generate access report
const report = await acm.users.generateUserAccessReport('user-123');
console.log('User access report:', report);
```

## Advanced Features

### Temporal Access Controls

```typescript
// Create time-based access schedule
const temporalAccess: TemporalAccess = {
  id: 'business-hours',
  name: 'Business Hours Access',
  description: 'Access only during business hours',
  schedule: [
    {
      dayOfWeek: [1, 2, 3, 4, 5], // Monday to Friday
      startTime: '09:00',
      endTime: '17:00',
      validFrom: new Date(),
      validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  ],
  timezone: 'America/New_York',
  isActive: true,
};

// Apply to permission
const permission: Permission = {
  id: 'sensitive-data-access',
  resource: '/api/v1/sensitive/*',
  action: 'GET',
  effect: 'ALLOW',
  priority: 200,
  isActive: true,
  conditions: [
    {
      type: 'temporal',
      operator: 'between',
      field: 'time',
      value: ['09:00', '17:00'],
    },
    {
      type: 'temporal',
      operator: 'in',
      field: 'day_of_week',
      value: [1, 2, 3, 4, 5],
    },
  ],
};
```

### Emergency Access

```typescript
// Request emergency access
const emergencyAccess: EmergencyAccess = {
  id: 'emergency-001',
  userId: 'user-123',
  requestedBy: 'user-123',
  reason: 'Critical production issue - customer data corruption',
  permissions: [
    {
      id: 'emergency-admin',
      resource: '/api/v1/admin/*',
      action: '*',
      effect: 'ALLOW',
      priority: 999,
      isActive: true,
    },
  ],
  validFrom: new Date(),
  validTo: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours
  isActive: true,
  approvalRequired: true,
  autoExpire: true,
  audit: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};
```

### Access Reviews and Certification

```typescript
// Start access certification campaign
const campaign: AccessCertificationCampaign = {
  id: 'quarterly-review-2024-q1',
  name: 'Q1 2024 Access Review',
  description: 'Quarterly access certification for all users',
  targetUsers: ['user-123', 'user-456', 'user-789'],
  reviewers: ['manager-001', 'security-team'],
  startDate: new Date(),
  endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  status: 'ACTIVE',
  progress: {
    totalUsers: 3,
    reviewedUsers: 0,
    pendingUsers: 3,
    violationsFound: 0,
  },
  settings: {
    autoApproveNoChanges: false,
    escalationEnabled: true,
    reminderFrequency: 7,
    complianceFrameworks: ['SOC2', 'ISO27001'],
  },
  createdAt: new Date(),
  updatedAt: new Date(),
};

await acm.users.startAccessCertificationCampaign(campaign);
```

## OPA Integration

### Sync ACM to OPA

```typescript
import { OPAIntegration } from '@urnlabs/security';

// Create OPA integration
const opaIntegration = new OPAIntegration(
  opaService,
  policyManager,
  acm.matrix
);

// Sync roles and permissions to OPA
const roles = await acm.rbac.getRoles({ isActive: true });
const permissions = []; // Get all permissions
await opaIntegration.syncToOPA(roles, permissions);

// Evaluate with OPA integration
const decision = await opaIntegration.evaluateAccessWithOPA(request);
```

### OPA Policy Example

```rego
package access_control_matrix

import future.keywords.if
import future.keywords.in

# Allow data analysts to read analytics during business hours
allow {
  input.user.roles[_] == "data-analyst"
  input.action == "GET"
  regex.match("^/api/v1/analytics/.*$", input.resource.id)
  time_in_business_hours
}

time_in_business_hours {
  hour := time.format(time.now_ns(), "15", "UTC")
  to_number(hour) >= 9
  to_number(hour) <= 17
}
```

## Admin Interface

### REST API Endpoints

The ACM includes a comprehensive admin interface with REST API endpoints:

```typescript
// Register admin routes with Fastify
await adminInterface.registerRoutes(fastify);

// Available endpoints:
// POST   /admin/users/provision
// POST   /admin/users/:userId/deprovision
// GET    /admin/users/:userId
// PUT    /admin/users/:userId/attributes
// GET    /admin/users/:userId/access-report

// POST   /admin/roles
// GET    /admin/roles
// GET    /admin/roles/:roleId
// PUT    /admin/roles/:roleId
// DELETE /admin/roles/:roleId
// POST   /admin/roles/:roleId/assign/:userId
// DELETE /admin/roles/:roleId/assign/:userId

// POST   /admin/access/evaluate
// POST   /admin/access/evaluate-bulk
// GET    /admin/access/matrix/:userId
// GET    /admin/access/cache/stats

// POST   /admin/reviews/campaigns
// GET    /admin/reviews/pending
// POST   /admin/reviews/:reviewId/complete

// POST   /admin/emergency/request
// POST   /admin/emergency/:accessId/approve
// POST   /admin/emergency/:accessId/revoke
// GET    /admin/emergency/active

// POST   /admin/opa/sync
// GET    /admin/opa/validate
// POST   /admin/opa/evaluate
```

## Configuration

### Development Configuration

```typescript
const devConfig = createDefaultConfig();
// Uses local Redis, shorter cache TTLs, debug logging
```

### Production Configuration

```typescript
const prodConfig = createProductionConfig();
// Optimized for performance, longer cache TTLs, enhanced security
```

### Custom Configuration

```typescript
const customConfig: AccessControlSystemConfig = {
  redis: {
    host: 'redis-cluster.company.com',
    port: 6380,
    password: process.env.REDIS_PASSWORD,
    db: 1,
  },
  cache: {
    matrixTTL: 7200, // 2 hours
    decisionTTL: 900, // 15 minutes
    maxSize: 100000,
  },
  security: {
    enableAuditLogging: true,
    enableRiskAssessment: true,
    maxRiskScore: 100,
    emergencyAccessEnabled: true,
  },
  performance: {
    maxConcurrentRequests: 500,
    requestTimeout: 2000,
    enableMetrics: true,
  },
  rbac: {
    maxRoleDepth: 20,
    enableTemporalAccess: true,
    enableRoleInheritance: true,
    enableConflictDetection: true,
    roleReviewFrequency: 45, // days
  },
};
```

## Monitoring and Observability

### Cache Statistics

```typescript
const stats = acm.matrix.getCacheStats();
console.log('Matrix cache hit rate:', stats.matrix.hitRate);
console.log('Decision cache size:', stats.decision.size);
```

### Performance Metrics

```typescript
// Built-in metrics collection
const metrics = {
  evaluationTime: Date.now() - startTime,
  cacheHitRate: stats.matrix.hitRate,
  activeUsers: await getUserCount(),
  riskDistribution: await getRiskDistribution(),
};
```

## Security Considerations

### Data Protection
- All sensitive data encrypted at rest and in transit
- PII handling compliant with GDPR/CCPA
- Audit logs immutable and tamper-evident

### Performance
- Multi-level caching strategy
- Optimized for sub-200ms response times
- Horizontal scaling support

### Compliance
- SOC 2 Type II controls
- ISO 27001 alignment
- NIST Framework support

## Testing

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run performance tests
npm run test:performance

# Generate coverage report
npm run test:coverage
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Implement changes with tests
4. Submit pull request

## License

MIT License - see LICENSE file for details.

## Support

For support and questions:
- GitHub Issues: [Repository Issues](https://github.com/urnlabs/security/issues)
- Documentation: [Full Documentation](https://docs.urnlabs.com/security)
- Security Issues: security@urnlabs.com