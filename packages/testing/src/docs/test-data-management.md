# Test Data Management System

## Overview

The Test Data Management System provides comprehensive tools for generating, masking, and managing test data across the entire testing lifecycle. It includes realistic data generation, PII masking, performance data creation, and database seeding capabilities.

## Features

### 🏭 Data Generation
- **Schema-based generation**: Define data structures with relationships and constraints
- **Pre-built schemas**: Ready-to-use schemas for common entities (users, organizations, transactions)
- **Referential integrity**: Automatic handling of foreign key relationships
- **Streaming generation**: Memory-efficient generation for large datasets (>10k records)
- **Reproducible data**: Seed-based generation for consistent test runs

### 🔒 Data Masking & Anonymization
- **PII masking**: Email, phone, SSN, credit card, and name masking
- **Anonymization techniques**: Shuffling, generalization, and suppression
- **Format preservation**: Maintains data format while obscuring sensitive information
- **Configurable masking**: Specify which fields to mask per use case

### ⚡ Performance Testing Data
- **Load test datasets**: Generate large volumes of realistic data
- **Concurrent access patterns**: Data optimized for multi-user scenarios
- **Size presets**: Small (1k), Medium (10k), Large (100k), XL (1M+ records)
- **Multiple formats**: JSON, SQL inserts, streaming output

### 🌱 Database Seeding
- **SQL generation**: Automatic INSERT statement generation
- **Transaction support**: Rollback-capable seeding for clean tests
- **Environment-specific**: Different datasets per environment
- **Cleanup automation**: Automatic data cleanup after tests

## CLI Usage

### Generate Test Data

```bash
# Generate 1000 user records using pre-built schema
pnpm run data:generate --schema users --count 1000 --output ./test-users.json

# Generate with custom schema file
pnpm run data:generate --schema ./custom-schema.json --count 500 --format sql

# Generate large dataset with streaming
pnpm run data:generate --schema transactions --count 100000 --stream --output ./large-dataset.json

# Reproducible generation with seed
pnpm run data:generate --schema users --count 100 --seed 12345
```

### Mask Sensitive Data

```bash
# Mask PII fields in existing data
pnpm run data:mask --input ./users.json --output ./masked-users.json --fields email,phone,ssn

# Use anonymization instead of simple masking
pnpm run data:mask --input ./data.json --anonymize --fields email,name,address
```

### Performance Test Data

```bash
# Generate performance test datasets
pnpm run data:performance --type load --size large --output ./perf-data

# Generate for stress testing
pnpm run data:performance --type stress --size xl --concurrent
```

### Database Seeding

```bash
# Seed test database
pnpm run data:seed --schema users --count 500 --database-url postgresql://localhost/test

# Clean and seed
pnpm run data:seed --schema users --count 100 --clean --transaction
```

### Schema Management

```bash
# List available pre-built schemas
pnpm run data:schemas

# Get detailed schema information
pnpm run data:schemas --detailed
```

### Data Validation

```bash
# Validate data against schema
pnpm run data:validate --input ./test-data.json --schema users
```

## Pipeline Integration

### Running Data Management Tests

```bash
# Include data management in test pipeline
pnpm run pipeline:run --data-management

# Full pipeline with all test types
pnpm run pipeline:run:full
```

### Pipeline Jobs

The data management system integrates with the test pipeline through these jobs:

1. **Data Preparation**: Generate base test datasets
2. **Data Masking Validation**: Verify masking functionality
3. **Performance Data Generation**: Create large datasets for performance tests
4. **Data Validation**: Ensure generated data meets schema requirements

## Pre-built Schemas

### Users Schema
```typescript
{
  name: 'users',
  fields: [
    { name: 'id', type: 'uuid', primaryKey: true },
    { name: 'email', type: 'email', unique: true },
    { name: 'firstName', type: 'string', faker: 'person.firstName' },
    { name: 'lastName', type: 'string', faker: 'person.lastName' },
    { name: 'phone', type: 'string', faker: 'phone.number' },
    { name: 'birthDate', type: 'date', faker: 'date.birthdate' },
    { name: 'address', type: 'object', fields: [...] },
    { name: 'createdAt', type: 'datetime', default: 'now' },
    { name: 'updatedAt', type: 'datetime', default: 'now' }
  ]
}
```

### Organizations Schema
```typescript
{
  name: 'organizations',
  fields: [
    { name: 'id', type: 'uuid', primaryKey: true },
    { name: 'name', type: 'string', faker: 'company.name' },
    { name: 'domain', type: 'string', faker: 'internet.domainName' },
    { name: 'industry', type: 'string', faker: 'company.buzzNoun' },
    { name: 'size', type: 'enum', values: ['startup', 'small', 'medium', 'large', 'enterprise'] },
    { name: 'founded', type: 'date', faker: 'date.between' },
    { name: 'website', type: 'url', faker: 'internet.url' }
  ]
}
```

### Transactions Schema
```typescript
{
  name: 'transactions',
  fields: [
    { name: 'id', type: 'uuid', primaryKey: true },
    { name: 'userId', type: 'uuid', reference: 'users.id' },
    { name: 'amount', type: 'decimal', precision: 10, scale: 2 },
    { name: 'currency', type: 'string', default: 'USD' },
    { name: 'type', type: 'enum', values: ['payment', 'refund', 'transfer'] },
    { name: 'status', type: 'enum', values: ['pending', 'completed', 'failed'] },
    { name: 'description', type: 'string', faker: 'lorem.sentence' },
    { name: 'metadata', type: 'json', optional: true }
  ]
}
```

## Custom Schema Definition

```typescript
// Define custom schema
const customSchema: TestDataSchema = {
  name: 'products',
  fields: [
    { name: 'id', type: 'uuid', primaryKey: true },
    { name: 'name', type: 'string', faker: 'commerce.productName' },
    { name: 'price', type: 'decimal', min: 10, max: 1000, precision: 10, scale: 2 },
    { name: 'category', type: 'string', faker: 'commerce.department' },
    { name: 'inStock', type: 'boolean', probability: 0.8 },
    { name: 'tags', type: 'array', itemType: 'string', minItems: 1, maxItems: 5 }
  ],
  relationships: [
    { field: 'vendorId', references: 'organizations', foreignKey: 'id' }
  ]
};
```

## Data Masking Configuration

### Email Masking
```typescript
// Original: john.doe@example.com
// Masked:   j***.***@example.com
```

### Phone Masking
```typescript
// Original: +1-555-123-4567
// Masked:   +1-555-***-****
```

### SSN Masking
```typescript
// Original: 123-45-6789
// Masked:   ***-**-6789
```

### Credit Card Masking
```typescript
// Original: 4532-1234-5678-9012
// Masked:   ****-****-****-9012
```

### Name Masking
```typescript
// Original: John Doe
// Masked:   J*** D**
```

## Performance Considerations

### Memory Efficiency
- Use streaming generation for datasets > 10,000 records
- Batch processing for database operations
- Lazy loading of faker instances

### Generation Speed
- Pre-compiled schemas for faster execution
- Worker thread utilization for parallel generation
- Optimized random number generation with seeds

### Storage Optimization
- Compressed JSON output for large datasets
- SQL batch insert generation
- Configurable output formatting

## Integration Examples

### Vitest Integration
```typescript
import { TestDataManager, preBuiltSchemas } from '@urnlabs/testing';

describe('User Service', () => {
  let testData: any[];
  let dataManager: TestDataManager;

  beforeAll(async () => {
    dataManager = new TestDataManager({ seed: 12345 });
    testData = await dataManager.generateTestData(preBuiltSchemas.users, 10);
  });

  it('should handle user creation', () => {
    const user = testData[0];
    expect(user.email).toMatch(/^[^@]+@[^@]+\.[^@]+$/);
    expect(user.firstName).toBeTruthy();
  });
});
```

### Playwright Integration
```typescript
import { TestDataManager } from '@urnlabs/testing';

test.beforeEach(async ({ page }) => {
  const dataManager = new TestDataManager();
  const users = await dataManager.generateTestData(preBuiltSchemas.users, 5);

  // Seed test database with generated users
  await page.evaluate((users) => {
    window.testData = users;
  }, users);
});
```

### API Testing Integration
```typescript
import { TestDataManager } from '@urnlabs/testing';
import request from 'supertest';

describe('Users API', () => {
  it('should create users with generated data', async () => {
    const dataManager = new TestDataManager();
    const userData = await dataManager.generateTestData(preBuiltSchemas.users, 1);

    const response = await request(app)
      .post('/api/users')
      .send(userData[0])
      .expect(201);

    expect(response.body.id).toBeTruthy();
  });
});
```

## Security Considerations

### PII Protection
- Automatic detection of sensitive fields
- Configurable masking rules per environment
- Audit logging of data access
- Secure deletion of temporary files

### Compliance
- GDPR-compliant anonymization techniques
- CCPA data privacy support
- SOC 2 audit trail capabilities
- Data retention policy enforcement

## Best Practices

### Data Generation
1. Use seeds for reproducible tests
2. Generate minimal data needed for each test
3. Clean up generated data after tests
4. Use streaming for large datasets
5. Validate generated data against schema

### Data Masking
1. Mask data in non-production environments
2. Test masking rules thoroughly
3. Document masking strategies
4. Regular security audits of masked data
5. Use anonymization for analytics data

### Performance Testing
1. Generate data representative of production volume
2. Include realistic data distribution patterns
3. Test with both fresh and aged data
4. Simulate concurrent access patterns
5. Monitor resource usage during generation

## Troubleshooting

### Common Issues

**Memory issues with large datasets**
```bash
# Use streaming for large datasets
pnpm run data:generate --schema users --count 100000 --stream
```

**Slow generation performance**
```bash
# Use smaller batches and parallel processing
pnpm run data:generate --schema users --count 10000 --batch-size 1000
```

**Schema validation errors**
```bash
# Validate schema before generation
pnpm run data:validate --input ./data.json --schema users --verbose
```

**Database connection issues**
```bash
# Test connection separately
pnpm run data:seed --database-url postgresql://localhost/test --verbose
```

## API Reference

### TestDataManager Class

```typescript
class TestDataManager {
  constructor(options?: TestDataManagerOptions);

  // Core methods
  generateTestData(schema: TestDataSchema, count: number): Promise<any[]>;
  generateLargeDataset(schema: TestDataSchema, count: number): Promise<any[]>;
  maskData(data: any[], fields: string[]): any[];
  anonymizeData(data: any[], fields: string[]): any[];

  // Utility methods
  generateSQLInserts(data: any[], tableName: string): string;
  saveToFile(data: any[], filePath: string, format?: 'json' | 'sql'): void;
  validateSchema(schema: TestDataSchema): boolean;
}
```

For complete API documentation, see the TypeScript definitions in `src/services/test-data-manager.ts`.