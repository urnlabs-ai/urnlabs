import { createClient, RedisClientType } from 'redis';

export interface RedisConfig {
  host: string;
  port: number;
  db: number;
  password?: string;
}

export class TestRedisManager {
  private config: RedisConfig;
  private client: RedisClientType;
  private connected = false;

  constructor(config: RedisConfig) {
    this.config = config;
    this.client = createClient({
      socket: {
        host: config.host,
        port: config.port
      },
      password: config.password,
      database: config.db
    });

    this.client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });
  }

  async initialize(): Promise<void> {
    try {
      await this.client.connect();
      this.connected = true;

      // Test connection
      await this.client.ping();

      // Clear any existing test data
      await this.clear();
    } catch (error) {
      throw new Error(`Failed to initialize test Redis: ${error}`);
    }
  }

  async clear(): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      await this.client.flushDb();
    } catch (error) {
      console.warn('Error clearing Redis database:', error);
    }
  }

  async cleanup(): Promise<void> {
    if (this.connected) {
      await this.clear();
      await this.client.disconnect();
      this.connected = false;
    }
  }

  // Redis operations for testing
  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.client.setEx(key, ttl, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  async setJson(key: string, value: any, ttl?: number): Promise<void> {
    const json = JSON.stringify(value);
    if (ttl) {
      await this.client.setEx(key, ttl, json);
    } else {
      await this.client.set(key, json);
    }
  }

  async getJson<T = any>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    return value ? JSON.parse(value) : null;
  }

  async del(key: string): Promise<number> {
    return await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  async keys(pattern: string): Promise<string[]> {
    return await this.client.keys(pattern);
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    return (await this.client.expire(key, seconds)) === 1;
  }

  async ttl(key: string): Promise<number> {
    return await this.client.ttl(key);
  }

  // Hash operations
  async hSet(key: string, field: string, value: string): Promise<number> {
    return await this.client.hSet(key, field, value);
  }

  async hGet(key: string, field: string): Promise<string | undefined> {
    return await this.client.hGet(key, field);
  }

  async hGetAll(key: string): Promise<Record<string, string>> {
    return await this.client.hGetAll(key);
  }

  async hDel(key: string, field: string): Promise<number> {
    return await this.client.hDel(key, field);
  }

  // List operations
  async lPush(key: string, ...values: string[]): Promise<number> {
    return await this.client.lPush(key, values);
  }

  async rPush(key: string, ...values: string[]): Promise<number> {
    return await this.client.rPush(key, values);
  }

  async lPop(key: string): Promise<string | null> {
    return await this.client.lPop(key);
  }

  async rPop(key: string): Promise<string | null> {
    return await this.client.rPop(key);
  }

  async lLen(key: string): Promise<number> {
    return await this.client.lLen(key);
  }

  async lRange(key: string, start: number, stop: number): Promise<string[]> {
    return await this.client.lRange(key, start, stop);
  }

  // Set operations
  async sAdd(key: string, ...members: string[]): Promise<number> {
    return await this.client.sAdd(key, members);
  }

  async sMembers(key: string): Promise<string[]> {
    return await this.client.sMembers(key);
  }

  async sIsMember(key: string, member: string): Promise<boolean> {
    return await this.client.sIsMember(key, member);
  }

  async sRem(key: string, ...members: string[]): Promise<number> {
    return await this.client.sRem(key, members);
  }

  async sCard(key: string): Promise<number> {
    return await this.client.sCard(key);
  }

  // Sorted set operations
  async zAdd(key: string, score: number, member: string): Promise<number> {
    return await this.client.zAdd(key, { score, value: member });
  }

  async zRange(key: string, start: number, stop: number): Promise<string[]> {
    return await this.client.zRange(key, start, stop);
  }

  async zRangeWithScores(key: string, start: number, stop: number): Promise<Array<{ value: string; score: number }>> {
    return await this.client.zRangeWithScores(key, start, stop);
  }

  async zScore(key: string, member: string): Promise<number | null> {
    return await this.client.zScore(key, member);
  }

  async zRem(key: string, ...members: string[]): Promise<number> {
    return await this.client.zRem(key, members);
  }

  async zCard(key: string): Promise<number> {
    return await this.client.zCard(key);
  }

  // Test utility methods
  async createTestSession(userId: string, sessionData: any = {}): Promise<string> {
    const sessionId = `session:${userId}:${Date.now()}`;
    const session = {
      userId,
      createdAt: new Date().toISOString(),
      lastAccess: new Date().toISOString(),
      ...sessionData
    };

    await this.setJson(sessionId, session, 3600); // 1 hour TTL
    return sessionId;
  }

  async createTestCache(key: string, data: any, ttl: number = 300): Promise<void> {
    await this.setJson(`cache:${key}`, {
      data,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString()
    }, ttl);
  }

  async createTestQueue(queueName: string, jobs: any[] = []): Promise<void> {
    for (const job of jobs) {
      await this.rPush(`queue:${queueName}`, JSON.stringify({
        id: `job:${Date.now()}:${Math.random()}`,
        data: job,
        createdAt: new Date().toISOString(),
        status: 'pending'
      }));
    }
  }

  async createTestMetrics(metricName: string, values: Array<{ timestamp: number; value: number }>): Promise<void> {
    for (const { timestamp, value } of values) {
      await this.zAdd(`metrics:${metricName}`, timestamp, value.toString());
    }
  }

  // Assertion helpers
  async assertKeyExists(key: string): Promise<boolean> {
    const exists = await this.exists(key);
    if (!exists) {
      throw new Error(`Expected Redis key '${key}' to exist`);
    }
    return true;
  }

  async assertKeyNotExists(key: string): Promise<boolean> {
    const exists = await this.exists(key);
    if (exists) {
      throw new Error(`Expected Redis key '${key}' to not exist`);
    }
    return true;
  }

  async assertKeyValue(key: string, expectedValue: string): Promise<boolean> {
    const value = await this.get(key);
    if (value !== expectedValue) {
      throw new Error(`Expected Redis key '${key}' to have value '${expectedValue}', got '${value}'`);
    }
    return true;
  }

  async assertKeyJsonValue(key: string, expectedValue: any): Promise<boolean> {
    const value = await this.getJson(key);
    if (JSON.stringify(value) !== JSON.stringify(expectedValue)) {
      throw new Error(`Expected Redis key '${key}' to have JSON value '${JSON.stringify(expectedValue)}', got '${JSON.stringify(value)}'`);
    }
    return true;
  }

  async getKeyCount(pattern: string = '*'): Promise<number> {
    const keys = await this.keys(pattern);
    return keys.length;
  }
}