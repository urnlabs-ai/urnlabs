import { faker } from '@faker-js/faker';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface DataMaskingConfig {
  email: 'mask' | 'anonymize' | 'fake';
  phone: 'mask' | 'anonymize' | 'fake';
  ssn: 'mask' | 'anonymize' | 'fake';
  creditCard: 'mask' | 'anonymize' | 'fake';
  name: 'mask' | 'anonymize' | 'fake';
  address: 'mask' | 'anonymize' | 'fake';
  preserveFormat: boolean;
  seed?: number;
}

export interface TestDataSchema {
  table: string;
  count: number;
  relationships?: Array<{
    field: string;
    references: string;
    table: string;
  }>;
  fields: Array<{
    name: string;
    type: 'string' | 'number' | 'boolean' | 'date' | 'email' | 'phone' | 'uuid' | 'json';
    constraints?: {
      required?: boolean;
      unique?: boolean;
      min?: number;
      max?: number;
      length?: number;
      pattern?: string;
      enum?: any[];
    };
    generator?: string; // Custom generator function name
    masked?: boolean; // Whether this field should be masked
  }>;
}

export interface TestDataSet {
  name: string;
  version: string;
  environment: 'test' | 'staging' | 'development';
  schemas: TestDataSchema[];
  metadata: {
    createdAt: string;
    description?: string;
    tags?: string[];
  };
}

export class TestDataManager {
  private maskingConfig: DataMaskingConfig;
  private generatedData: Map<string, any[]> = new Map();
  private relationships: Map<string, any[]> = new Map();

  constructor(maskingConfig: DataMaskingConfig = {
    email: 'fake',
    phone: 'fake',
    ssn: 'mask',
    creditCard: 'mask',
    name: 'fake',
    address: 'fake',
    preserveFormat: true,
    seed: 12345
  }) {
    this.maskingConfig = maskingConfig;

    // Set faker seed for consistent data generation
    if (maskingConfig.seed) {
      faker.seed(maskingConfig.seed);
    }
  }

  // Generate test data based on schema
  async generateTestData(schema: TestDataSchema): Promise<any[]> {
    const data: any[] = [];

    for (let i = 0; i < schema.count; i++) {
      const record: any = {};

      for (const field of schema.fields) {
        record[field.name] = await this.generateFieldValue(field, i);
      }

      // Handle relationships
      if (schema.relationships) {
        for (const rel of schema.relationships) {
          const referencedData = this.generatedData.get(rel.table);
          if (referencedData && referencedData.length > 0) {
            const randomRef = faker.helpers.arrayElement(referencedData);
            record[rel.field] = randomRef[rel.references];
          }
        }
      }

      data.push(record);
    }

    this.generatedData.set(schema.table, data);
    return data;
  }

  // Generate test dataset from complete schema
  async generateDataSet(dataSet: TestDataSet): Promise<Map<string, any[]>> {
    const result = new Map<string, any[]>();

    // Sort schemas by dependencies (tables with no relationships first)
    const sortedSchemas = this.sortSchemasByDependencies(dataSet.schemas);

    for (const schema of sortedSchemas) {
      const data = await this.generateTestData(schema);
      result.set(schema.table, data);
    }

    return result;
  }

  // Mask sensitive data in existing dataset
  maskData(data: any[], fields: string[]): any[] {
    return data.map(record => {
      const maskedRecord = { ...record };

      for (const field of fields) {
        if (maskedRecord[field] !== undefined) {
          maskedRecord[field] = this.maskField(maskedRecord[field], field);
        }
      }

      return maskedRecord;
    });
  }

  // Anonymize data while preserving statistical properties
  anonymizeData(data: any[], config: { [field: string]: 'shuffle' | 'generalize' | 'suppress' }): any[] {
    const anonymizedData = [...data];

    for (const [field, method] of Object.entries(config)) {
      switch (method) {
        case 'shuffle':
          this.shuffleField(anonymizedData, field);
          break;
        case 'generalize':
          this.generalizeField(anonymizedData, field);
          break;
        case 'suppress':
          this.suppressField(anonymizedData, field);
          break;
      }
    }

    return anonymizedData;
  }

  // Save dataset to file
  async saveDataSet(dataSet: TestDataSet, data: Map<string, any[]>, outputDir: string): Promise<void> {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Save metadata
    const metadataPath = path.join(outputDir, `${dataSet.name}-metadata.json`);
    await fs.promises.writeFile(metadataPath, JSON.stringify(dataSet, null, 2));

    // Save data files
    for (const [table, records] of data.entries()) {
      const dataPath = path.join(outputDir, `${dataSet.name}-${table}.json`);
      await fs.promises.writeFile(dataPath, JSON.stringify(records, null, 2));

      // Also save as SQL inserts
      const sqlPath = path.join(outputDir, `${dataSet.name}-${table}.sql`);
      const sqlInserts = this.generateSQLInserts(table, records);
      await fs.promises.writeFile(sqlPath, sqlInserts);
    }
  }

  // Load dataset from file
  async loadDataSet(dataSetName: string, inputDir: string): Promise<{ dataSet: TestDataSet; data: Map<string, any[]> }> {
    const metadataPath = path.join(inputDir, `${dataSetName}-metadata.json`);

    if (!fs.existsSync(metadataPath)) {
      throw new Error(`Dataset metadata not found: ${metadataPath}`);
    }

    const dataSet = JSON.parse(await fs.promises.readFile(metadataPath, 'utf-8'));
    const data = new Map<string, any[]>();

    for (const schema of dataSet.schemas) {
      const dataPath = path.join(inputDir, `${dataSetName}-${schema.table}.json`);
      if (fs.existsSync(dataPath)) {
        const records = JSON.parse(await fs.promises.readFile(dataPath, 'utf-8'));
        data.set(schema.table, records);
      }
    }

    return { dataSet, data };
  }

  // Generate performance test data with configurable volume
  async generatePerformanceData(
    schema: TestDataSchema,
    volumeConfig: {
      baseCount: number;
      multiplier: number;
      maxMemoryMB: number;
    }
  ): Promise<AsyncGenerator<any[], void, unknown>> {
    const targetCount = schema.count * volumeConfig.multiplier;
    const batchSize = Math.min(1000, Math.floor((volumeConfig.maxMemoryMB * 1024 * 1024) / 1000)); // Rough estimate

    async function* generateBatches(this: TestDataManager) {
      for (let offset = 0; offset < targetCount; offset += batchSize) {
        const currentBatchSize = Math.min(batchSize, targetCount - offset);
        const batchSchema = { ...schema, count: currentBatchSize };

        const batch = await this.generateTestData(batchSchema);
        yield batch;
      }
    }

    return generateBatches.call(this);
  }

  // Private helper methods
  private async generateFieldValue(field: any, index: number): Promise<any> {
    const { type, constraints, generator } = field;

    // Use custom generator if specified
    if (generator && typeof (this as any)[generator] === 'function') {
      return (this as any)[generator](constraints);
    }

    switch (type) {
      case 'string':
        return this.generateString(constraints);
      case 'number':
        return this.generateNumber(constraints);
      case 'boolean':
        return faker.datatype.boolean();
      case 'date':
        return this.generateDate(constraints);
      case 'email':
        return field.masked ? this.generateMaskedEmail() : faker.internet.email();
      case 'phone':
        return field.masked ? this.generateMaskedPhone() : faker.phone.number();
      case 'uuid':
        return faker.string.uuid();
      case 'json':
        return this.generateJSON(constraints);
      default:
        return null;
    }
  }

  private generateString(constraints?: any): string {
    if (constraints?.enum) {
      return faker.helpers.arrayElement(constraints.enum);
    }

    const length = constraints?.length || faker.number.int({ min: 5, max: 50 });

    if (constraints?.pattern) {
      // Simple pattern matching (in real implementation, use more sophisticated regex)
      return faker.string.alphanumeric(length);
    }

    return faker.lorem.words(Math.ceil(length / 6)).substring(0, length);
  }

  private generateNumber(constraints?: any): number {
    const min = constraints?.min || 0;
    const max = constraints?.max || 1000000;
    return faker.number.int({ min, max });
  }

  private generateDate(constraints?: any): string {
    const pastDate = constraints?.min ? new Date(constraints.min) : faker.date.past();
    const futureDate = constraints?.max ? new Date(constraints.max) : faker.date.future();

    return faker.date.between({ from: pastDate, to: futureDate }).toISOString();
  }

  private generateJSON(constraints?: any): any {
    const keys = constraints?.keys || ['key1', 'key2', 'key3'];
    const result: any = {};

    for (const key of keys) {
      result[key] = faker.lorem.word();
    }

    return result;
  }

  private generateMaskedEmail(): string {
    const email = faker.internet.email();
    return this.maskEmail(email);
  }

  private generateMaskedPhone(): string {
    const phone = faker.phone.number();
    return this.maskPhone(phone);
  }

  private maskField(value: any, fieldType: string): any {
    if (typeof value !== 'string') {
      return value;
    }

    switch (fieldType.toLowerCase()) {
      case 'email':
        return this.maskEmail(value);
      case 'phone':
        return this.maskPhone(value);
      case 'ssn':
        return this.maskSSN(value);
      case 'creditcard':
        return this.maskCreditCard(value);
      case 'name':
        return this.maskName(value);
      default:
        return this.maskGeneric(value);
    }
  }

  private maskEmail(email: string): string {
    const config = this.maskingConfig.email;

    switch (config) {
      case 'mask':
        const [user, domain] = email.split('@');
        const maskedUser = user.length > 2 ? user[0] + '*'.repeat(user.length - 2) + user[user.length - 1] : '***';
        return `${maskedUser}@${domain}`;
      case 'anonymize':
        return crypto.createHash('sha256').update(email).digest('hex').substring(0, 16) + '@example.com';
      case 'fake':
        return faker.internet.email();
      default:
        return email;
    }
  }

  private maskPhone(phone: string): string {
    const config = this.maskingConfig.phone;

    switch (config) {
      case 'mask':
        return phone.replace(/\d(?=\d{4})/g, '*');
      case 'anonymize':
        const hash = crypto.createHash('sha256').update(phone).digest('hex');
        return `+1-555-${hash.substring(0, 4)}`;
      case 'fake':
        return faker.phone.number();
      default:
        return phone;
    }
  }

  private maskSSN(ssn: string): string {
    const config = this.maskingConfig.ssn;

    switch (config) {
      case 'mask':
        return ssn.replace(/\d(?=\d{4})/g, '*');
      case 'anonymize':
        return '***-**-' + ssn.slice(-4);
      case 'fake':
        return `${faker.number.int({ min: 100, max: 999 })}-${faker.number.int({ min: 10, max: 99 })}-${faker.number.int({ min: 1000, max: 9999 })}`;
      default:
        return ssn;
    }
  }

  private maskCreditCard(cc: string): string {
    const config = this.maskingConfig.creditCard;

    switch (config) {
      case 'mask':
        return cc.replace(/\d(?=\d{4})/g, '*');
      case 'anonymize':
        return '**** **** **** ' + cc.slice(-4);
      case 'fake':
        return faker.finance.creditCardNumber();
      default:
        return cc;
    }
  }

  private maskName(name: string): string {
    const config = this.maskingConfig.name;

    switch (config) {
      case 'mask':
        return name.split(' ').map(part =>
          part.length > 1 ? part[0] + '*'.repeat(part.length - 1) : part
        ).join(' ');
      case 'anonymize':
        return `User${crypto.createHash('sha256').update(name).digest('hex').substring(0, 8)}`;
      case 'fake':
        return faker.person.fullName();
      default:
        return name;
    }
  }

  private maskGeneric(value: string): string {
    if (value.length <= 2) {
      return '*'.repeat(value.length);
    }

    return value[0] + '*'.repeat(value.length - 2) + value[value.length - 1];
  }

  private shuffleField(data: any[], field: string): void {
    const values = data.map(record => record[field]).filter(v => v !== undefined);
    const shuffledValues = faker.helpers.shuffle([...values]);

    let index = 0;
    for (const record of data) {
      if (record[field] !== undefined) {
        record[field] = shuffledValues[index++];
      }
    }
  }

  private generalizeField(data: any[], field: string): void {
    for (const record of data) {
      if (record[field] !== undefined) {
        // Example generalization - convert specific values to ranges
        if (typeof record[field] === 'number') {
          const value = record[field];
          if (value < 25) record[field] = '0-25';
          else if (value < 50) record[field] = '25-50';
          else if (value < 75) record[field] = '50-75';
          else record[field] = '75+';
        }
      }
    }
  }

  private suppressField(data: any[], field: string): void {
    for (const record of data) {
      if (record[field] !== undefined) {
        record[field] = '[SUPPRESSED]';
      }
    }
  }

  private sortSchemasByDependencies(schemas: TestDataSchema[]): TestDataSchema[] {
    const sorted: TestDataSchema[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (schema: TestDataSchema) => {
      if (visiting.has(schema.table)) {
        throw new Error(`Circular dependency detected: ${schema.table}`);
      }

      if (visited.has(schema.table)) {
        return;
      }

      visiting.add(schema.table);

      if (schema.relationships) {
        for (const rel of schema.relationships) {
          const depSchema = schemas.find(s => s.table === rel.table);
          if (depSchema) {
            visit(depSchema);
          }
        }
      }

      visiting.delete(schema.table);
      visited.add(schema.table);
      sorted.push(schema);
    };

    for (const schema of schemas) {
      if (!visited.has(schema.table)) {
        visit(schema);
      }
    }

    return sorted;
  }

  private generateSQLInserts(table: string, records: any[]): string {
    if (records.length === 0) {
      return `-- No data for table ${table}\n`;
    }

    const columns = Object.keys(records[0]);
    let sql = `-- Data for table ${table}\n`;
    sql += `INSERT INTO ${table} (${columns.join(', ')}) VALUES\n`;

    const values = records.map(record => {
      const vals = columns.map(col => {
        const value = record[col];
        if (value === null || value === undefined) {
          return 'NULL';
        }
        if (typeof value === 'string') {
          return `'${value.replace(/'/g, "''")}'`;
        }
        if (typeof value === 'object') {
          return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
        }
        return value;
      });
      return `(${vals.join(', ')})`;
    });

    sql += values.join(',\n') + ';\n';

    return sql;
  }

  // Utility methods for common data patterns
  generateUserData(count: number = 100): TestDataSchema {
    return {
      table: 'users',
      count,
      fields: [
        { name: 'id', type: 'uuid', constraints: { required: true, unique: true } },
        { name: 'email', type: 'email', constraints: { required: true, unique: true }, masked: true },
        { name: 'name', type: 'string', constraints: { required: true }, masked: true },
        { name: 'phone', type: 'phone', masked: true },
        { name: 'created_at', type: 'date', constraints: { required: true } },
        { name: 'is_active', type: 'boolean' },
        { name: 'role', type: 'string', constraints: { enum: ['admin', 'user', 'viewer'] } },
        { name: 'metadata', type: 'json' }
      ]
    };
  }

  generateOrganizationData(count: number = 50): TestDataSchema {
    return {
      table: 'organizations',
      count,
      fields: [
        { name: 'id', type: 'uuid', constraints: { required: true, unique: true } },
        { name: 'name', type: 'string', constraints: { required: true } },
        { name: 'slug', type: 'string', constraints: { required: true, unique: true } },
        { name: 'description', type: 'string' },
        { name: 'created_at', type: 'date', constraints: { required: true } },
        { name: 'settings', type: 'json' }
      ]
    };
  }

  generateTransactionData(count: number = 1000): TestDataSchema {
    return {
      table: 'transactions',
      count,
      relationships: [
        { field: 'user_id', references: 'id', table: 'users' },
        { field: 'organization_id', references: 'id', table: 'organizations' }
      ],
      fields: [
        { name: 'id', type: 'uuid', constraints: { required: true, unique: true } },
        { name: 'user_id', type: 'uuid', constraints: { required: true } },
        { name: 'organization_id', type: 'uuid', constraints: { required: true } },
        { name: 'amount', type: 'number', constraints: { min: 1, max: 10000 } },
        { name: 'currency', type: 'string', constraints: { enum: ['USD', 'EUR', 'GBP'] } },
        { name: 'description', type: 'string' },
        { name: 'created_at', type: 'date', constraints: { required: true } },
        { name: 'metadata', type: 'json' }
      ]
    };
  }
}