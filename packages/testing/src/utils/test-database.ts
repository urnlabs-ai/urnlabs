import { Client, Pool } from 'pg';
import { faker } from '@faker-js/faker';

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

export class TestDatabaseManager {
  private config: DatabaseConfig;
  private pool: Pool;
  private client?: Client;
  private transactionDepth = 0;

  constructor(config: DatabaseConfig) {
    this.config = config;
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000
    });
  }

  async initialize(): Promise<void> {
    try {
      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();

      // Ensure test database is clean
      await this.cleanup();
    } catch (error) {
      throw new Error(`Failed to initialize test database: ${error}`);
    }
  }

  async beginTransaction(): Promise<void> {
    if (!this.client) {
      this.client = await this.pool.connect();
    }

    if (this.transactionDepth === 0) {
      await this.client.query('BEGIN');
    } else {
      await this.client.query(`SAVEPOINT sp_${this.transactionDepth}`);
    }

    this.transactionDepth++;
  }

  async rollbackTransaction(): Promise<void> {
    if (!this.client || this.transactionDepth === 0) {
      return;
    }

    this.transactionDepth--;

    if (this.transactionDepth === 0) {
      await this.client.query('ROLLBACK');
      this.client.release();
      this.client = undefined;
    } else {
      await this.client.query(`ROLLBACK TO SAVEPOINT sp_${this.transactionDepth}`);
    }
  }

  async commitTransaction(): Promise<void> {
    if (!this.client || this.transactionDepth === 0) {
      return;
    }

    this.transactionDepth--;

    if (this.transactionDepth === 0) {
      await this.client.query('COMMIT');
      this.client.release();
      this.client = undefined;
    } else {
      await this.client.query(`RELEASE SAVEPOINT sp_${this.transactionDepth}`);
    }
  }

  async query(text: string, params?: any[]): Promise<any> {
    const client = this.client || this.pool;
    return await client.query(text, params);
  }

  // Test data creation methods
  async createUser(userData: any = {}): Promise<any> {
    const defaultUser = {
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
      password_hash: '$2b$10$test.hash.for.testing',
      role: 'user',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    };

    const user = { ...defaultUser, ...userData };

    const result = await this.query(`
      INSERT INTO users (id, email, name, password_hash, role, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      user.id, user.email, user.name, user.password_hash,
      user.role, user.is_active, user.created_at, user.updated_at
    ]);

    return result.rows[0];
  }

  async createOrganization(orgData: any = {}): Promise<any> {
    const defaultOrg = {
      id: faker.string.uuid(),
      name: faker.company.name(),
      slug: faker.helpers.slugify(faker.company.name()).toLowerCase(),
      description: faker.company.catchPhrase(),
      settings: JSON.stringify({ maxAgents: 10, maxWorkflows: 50 }),
      created_at: new Date(),
      updated_at: new Date()
    };

    const org = { ...defaultOrg, ...orgData };

    const result = await this.query(`
      INSERT INTO organizations (id, name, slug, description, settings, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      org.id, org.name, org.slug, org.description,
      org.settings, org.created_at, org.updated_at
    ]);

    return result.rows[0];
  }

  async createAgent(agentData: any = {}): Promise<any> {
    const defaultAgent = {
      id: faker.string.uuid(),
      name: faker.word.words(2),
      type: 'automation',
      status: 'active',
      version: '1.0.0',
      description: faker.lorem.sentence(),
      capabilities: JSON.stringify(['file-processing', 'data-validation']),
      configuration: JSON.stringify({ maxConcurrentTasks: 5 }),
      health_check: JSON.stringify({ status: 'healthy', lastCheck: new Date() }),
      metrics: JSON.stringify({ tasksExecuted: 0, successRate: 1.0 }),
      created_at: new Date(),
      updated_at: new Date()
    };

    const agent = { ...defaultAgent, ...agentData };

    const result = await this.query(`
      INSERT INTO agents (id, name, type, status, version, description, capabilities, configuration, health_check, metrics, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      agent.id, agent.name, agent.type, agent.status, agent.version,
      agent.description, agent.capabilities, agent.configuration,
      agent.health_check, agent.metrics, agent.created_at, agent.updated_at
    ]);

    return result.rows[0];
  }

  async createWorkflow(workflowData: any = {}): Promise<any> {
    const defaultWorkflow = {
      id: faker.string.uuid(),
      name: faker.word.words(3),
      description: faker.lorem.sentence(),
      version: '1.0.0',
      status: 'active',
      definition: JSON.stringify({ steps: [] }),
      metadata: JSON.stringify({ tags: ['test'], category: 'automation' }),
      execution_stats: JSON.stringify({ totalRuns: 0, successfulRuns: 0 }),
      created_by: faker.string.uuid(),
      created_at: new Date(),
      updated_at: new Date()
    };

    const workflow = { ...defaultWorkflow, ...workflowData };

    const result = await this.query(`
      INSERT INTO workflows (id, name, description, version, status, definition, metadata, execution_stats, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      workflow.id, workflow.name, workflow.description, workflow.version,
      workflow.status, workflow.definition, workflow.metadata,
      workflow.execution_stats, workflow.created_by, workflow.created_at, workflow.updated_at
    ]);

    return result.rows[0];
  }

  async truncateTable(tableName: string): Promise<void> {
    await this.query(`TRUNCATE TABLE ${tableName} CASCADE`);
  }

  async truncateAllTables(): Promise<void> {
    const tables = [
      'workflow_executions',
      'workflow_steps',
      'workflows',
      'agent_tasks',
      'agents',
      'user_permissions',
      'organization_members',
      'organizations',
      'users'
    ];

    for (const table of tables) {
      try {
        await this.truncateTable(table);
      } catch (error) {
        // Table might not exist, ignore error
        console.warn(`Could not truncate table ${table}: ${error}`);
      }
    }
  }

  async cleanup(): Promise<void> {
    try {
      await this.truncateAllTables();
    } catch (error) {
      console.warn('Error during database cleanup:', error);
    }

    if (this.client) {
      this.client.release();
      this.client = undefined;
    }
  }

  async close(): Promise<void> {
    await this.cleanup();
    await this.pool.end();
  }

  // Utility methods for test assertions
  async countRecords(tableName: string, whereClause?: string, params?: any[]): Promise<number> {
    const query = whereClause
      ? `SELECT COUNT(*) FROM ${tableName} WHERE ${whereClause}`
      : `SELECT COUNT(*) FROM ${tableName}`;

    const result = await this.query(query, params);
    return parseInt(result.rows[0].count);
  }

  async findRecord(tableName: string, whereClause: string, params: any[]): Promise<any> {
    const result = await this.query(
      `SELECT * FROM ${tableName} WHERE ${whereClause} LIMIT 1`,
      params
    );
    return result.rows[0];
  }

  async findRecords(tableName: string, whereClause?: string, params?: any[]): Promise<any[]> {
    const query = whereClause
      ? `SELECT * FROM ${tableName} WHERE ${whereClause}`
      : `SELECT * FROM ${tableName}`;

    const result = await this.query(query, params);
    return result.rows;
  }
}