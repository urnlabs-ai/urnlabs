# Urnlabs Secrets Management System

A comprehensive secrets management solution using HashiCorp Vault for the Urnlabs AI platform. This system provides enterprise-grade security, automatic secret rotation, and secrets scanning capabilities.

## 🔐 Features

- **HashiCorp Vault Integration**: Centralized secrets storage with enterprise-grade security
- **Automatic Secret Rotation**: Configurable rotation policies for different secret types
- **Secrets Scanning**: Detect hardcoded secrets in your codebase
- **Cache Management**: Intelligent caching with TTL for improved performance
- **API Integration**: RESTful API for secrets management operations
- **Backup & Recovery**: Automated backup and restore capabilities
- **Audit Logging**: Complete audit trail of all secrets operations
- **High Availability**: Clustered Vault setup with automatic failover

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Applications  │    │  Secrets Manager │    │ HashiCorp Vault │
│                 │───▶│                  │───▶│                 │
│ - API Service   │    │ - Caching        │    │ - KV Engine     │
│ - Agents        │    │ - Rotation       │    │ - Auth Methods  │
│ - Gateway       │    │ - Scanning       │    │ - Policies      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 🚀 Quick Start

### 1. Start Vault with Docker Compose

```bash
# Start the entire stack including Vault
docker-compose -f docker-compose-local.yml up -d vault

# Wait for Vault to be ready
docker-compose -f docker-compose-local.yml logs -f vault
```

### 2. Initialize Vault (First Time Only)

```bash
# Initialize and configure Vault
cd packages/security
npm run vault:init

# Migrate existing secrets to Vault
npm run vault:migrate
```

### 3. Configure Applications

```bash
# Copy the Vault-enabled environment template
cp .env.vault.example .env

# Update VAULT_ROLE_ID and VAULT_SECRET_ID with values from init script
# These will be displayed after running vault:init
```

### 4. Start Applications

```bash
# Start all services with Vault integration
docker-compose -f docker-compose-local.yml up -d
```

## 📖 Usage Guide

### Environment Configuration

The system supports two configuration modes:

1. **Traditional**: Hardcoded secrets in environment variables
2. **Vault-Enabled**: Secrets retrieved from Vault at runtime

Use `.env.vault.example` as a template for Vault-enabled configuration.

### Application Integration

#### Basic Usage

```typescript
import { SecretsManager } from '@urnlabs/security';

// Initialize secrets manager
const secretsManager = new SecretsManager({
  vault: {
    address: process.env.VAULT_ADDR!,
    roleId: process.env.VAULT_ROLE_ID!,
    secretId: process.env.VAULT_SECRET_ID!,
  }
});

// Get database configuration
const dbConfig = await secretsManager.getDatabaseConfig();

// Get API keys
const claudeApiKey = await secretsManager.getAPIKey('claude');
const githubToken = await secretsManager.getAPIKey('github', 'token');
```

#### Express Middleware

```typescript
import { createVaultMiddleware } from '@urnlabs/security';

app.use(createVaultMiddleware({
  secretsManager,
  injectSecrets: true,
  healthCheckPath: '/vault/health'
}));

// Secrets are now available in request context
app.get('/api/data', async (req, res) => {
  const dbConfig = await req.secrets.getDatabaseConfig();
  // Use dbConfig...
});
```

### Secrets Management API

The security service exposes a REST API for secrets management:

#### Health Check
```bash
GET /secrets/health
```

#### Get Configuration
```bash
# Database configuration (credentials hidden)
GET /secrets/database

# JWT configuration (secret hidden)
GET /secrets/jwt
```

#### Get API Keys (Authenticated)
```bash
# Get masked API key
GET /secrets/api-key/{provider}?key={keyName}
Authorization: Bearer <token>
```

#### Secret Rotation
```bash
# Get rotation status
GET /secrets/rotation/status

# Trigger manual rotation
POST /secrets/rotation/trigger
Authorization: Bearer <token>
Content-Type: application/json
{
  "path": "jwt/main"
}
```

#### Secrets Scanning
```bash
# Scan for hardcoded secrets
POST /secrets/scan
Authorization: Bearer <token>
Content-Type: application/json
{
  "path": "/app/src",
  "excludePatterns": ["**/*.test.ts"],
  "maxFileSize": 10485760
}
```

#### Cache Management
```bash
# Invalidate cache
DELETE /secrets/cache?key=jwt-config
Authorization: Bearer <token>
```

## 🔄 Secret Rotation

### Automatic Rotation

The system includes configurable rotation policies:

```typescript
// Default rotation rules
{
  path: 'jwt/main',
  type: 'jwt',
  schedule: '0 0 1 * *', // Monthly
  enabled: true,
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
}
```

### Manual Rotation

```bash
# Using API
curl -X POST http://localhost:7009/secrets/rotation/trigger \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"path": "jwt/main"}'

# Using Vault CLI
vault kv put secret/jwt/main \
  secret="$(openssl rand -base64 64)" \
  algorithm="HS256" \
  expiration="1h"
```

## 🔍 Secrets Scanning

### Command Line Interface

```bash
# Scan current directory
npm run secrets:scan -- scan .

# Scan with custom options
npm run secrets:scan -- scan /path/to/code \
  --exclude "**/*.test.ts" "node_modules" \
  --output scan-results.json

# List available patterns
npm run secrets:scan -- patterns
```

### Programmatic Usage

```typescript
import { SecretsScanner } from '@urnlabs/security';

const scanner = new SecretsScanner({
  rootPath: '/path/to/scan',
  excludePatterns: ['**/node_modules/**'],
  maxFileSize: 10 * 1024 * 1024
});

const results = await scanner.scan();
const report = scanner.generateReport(results);

console.log(`Found ${report.summary.high} high-severity secrets`);
```

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Scan for secrets
  run: |
    npm run secrets:scan -- scan . --output secrets-report.json
    if [ $? -eq 1 ]; then
      echo "High-severity secrets detected!"
      exit 1
    fi
```

## 💾 Backup & Recovery

### Automated Backups

```bash
# Create backup
packages/security/vault/scripts/backup-restore.sh backup

# List backups
packages/security/vault/scripts/backup-restore.sh list

# Verify backup
packages/security/vault/scripts/backup-restore.sh verify backup-file.json.gz
```

### Restore Operations

```bash
# Restore from backup
packages/security/vault/scripts/backup-restore.sh restore backup-file.json.gz

# Cleanup old backups (keep 30 days)
packages/security/vault/scripts/backup-restore.sh cleanup 30
```

### Backup Schedule

For production, set up automated backups:

```bash
# Crontab entry for daily backups at 2 AM
0 2 * * * /path/to/backup-restore.sh backup
```

## 📋 Configuration Reference

### Vault Configuration

```hcl
# vault/config.hcl
ui = true
disable_mlock = true

storage "raft" {
  path = "/vault/data"
  node_id = "node1"
}

listener "tcp" {
  address = "0.0.0.0:8200"
  cluster_address = "0.0.0.0:8201"
  tls_disable = "true"
}
```

### Secrets Manager Configuration

```typescript
const config = {
  vault: {
    address: 'http://vault:8200',
    roleId: 'your-role-id',
    secretId: 'your-secret-id',
    timeout: 10000
  },
  cacheEnabled: true,
  cacheTTL: 300000, // 5 minutes
  retryAttempts: 3,
  retryDelay: 1000
};
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VAULT_ADDR` | Vault server address | `http://localhost:8200` |
| `VAULT_ROLE_ID` | AppRole role ID | - |
| `VAULT_SECRET_ID` | AppRole secret ID | - |
| `VAULT_NAMESPACE` | Vault namespace | - |
| `VAULT_TIMEOUT` | Request timeout (ms) | `10000` |
| `SECRETS_ROTATION_ENABLED` | Enable rotation | `true` |
| `SECRETS_SCANNING_ENABLED` | Enable scanning | `true` |
| `SECRETS_CACHE_ENABLED` | Enable caching | `true` |
| `SECRETS_CACHE_TTL` | Cache TTL (ms) | `300000` |

## 🔧 Operations

### Health Monitoring

```bash
# Check Vault status
vault status

# Check service health
curl http://localhost:7009/secrets/health

# View rotation status
curl http://localhost:7009/secrets/rotation/status
```

### Troubleshooting

#### Vault Connection Issues

```bash
# Check Vault is running
docker-compose -f docker-compose-local.yml ps vault

# Check Vault logs
docker-compose -f docker-compose-local.yml logs vault

# Test connection
curl http://localhost:8200/v1/sys/health
```

#### Authentication Issues

```bash
# Verify AppRole credentials
vault auth -method=approle role_id=$VAULT_ROLE_ID secret_id=$VAULT_SECRET_ID

# Check token permissions
vault token lookup
```

#### Secret Access Issues

```bash
# Test secret read
vault kv get secret/database/postgres

# Check policies
vault policy read app-policy
```

### Performance Tuning

1. **Cache Configuration**: Adjust `cacheTTL` based on secret update frequency
2. **Connection Pooling**: Configure appropriate timeouts and retry policies
3. **Vault Tuning**: Optimize Vault storage backend and listener configuration

## 🛡️ Security Considerations

### Production Deployment

1. **TLS Encryption**: Enable TLS for all Vault communications
2. **Auto-Unseal**: Use cloud KMS for automatic unsealing
3. **Audit Logging**: Enable comprehensive audit logging
4. **Network Security**: Restrict Vault network access
5. **Backup Encryption**: Encrypt backup files at rest

### Access Control

1. **Principle of Least Privilege**: Grant minimal required permissions
2. **Regular Rotation**: Rotate AppRole credentials regularly
3. **Policy Review**: Regularly review and update Vault policies
4. **Monitoring**: Monitor all secret access patterns

### Compliance

The system supports compliance with:
- SOX (Sarbanes-Oxley)
- PCI DSS
- GDPR
- ISO 27001
- HIPAA

## 📚 API Reference

### SecretsManager Class

#### Methods

- `getDatabaseConfig()`: Get database connection details
- `getRedisConfig()`: Get Redis connection details
- `getJWTConfig()`: Get JWT configuration
- `getAPIKey(provider, key?)`: Get API key for provider
- `getEncryptionKey()`: Get encryption key
- `getSecrets(paths)`: Get multiple secrets
- `invalidateCache(key?)`: Invalidate cache entries
- `healthCheck()`: Check Vault connectivity

### VaultClient Class

#### Methods

- `readSecret(path)`: Read secret from Vault
- `writeSecret(path, data)`: Write secret to Vault
- `deleteSecret(path)`: Delete secret from Vault
- `listSecrets(path)`: List secrets at path
- `rotateSecret(path, newData)`: Rotate secret

### SecretsRotationManager Class

#### Methods

- `addRotationRule(rule)`: Add rotation rule
- `removeRotationRule(path)`: Remove rotation rule
- `triggerRotation(path)`: Manually trigger rotation
- `getRotationStatus()`: Get rotation status
- `start()`: Start rotation manager
- `stop()`: Stop rotation manager

### SecretsScanner Class

#### Methods

- `scan()`: Scan for secrets
- `generateReport(results)`: Generate scan report
- `saveReport(results, path)`: Save report to file

## 🤝 Contributing

1. Follow the existing code style and patterns
2. Add tests for new functionality
3. Update documentation
4. Ensure security best practices

## 📄 License

MIT License - see LICENSE file for details