import Redis from 'ioredis';
import config from './config.js';
import logger from './logger.js';

class RedisManager {
  private client: Redis;
  private isConnected = false;

  constructor() {
    this.client = new Redis(config.redis.url, {
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keyPrefix: config.redis.keyPrefix
    });

    this.client.on('connect', () => {
      logger.info('Redis connection established');
      this.isConnected = true;
    });

    this.client.on('error', (err) => {
      logger.error({ error: err }, 'Redis connection error');
      this.isConnected = false;
    });

    this.client.on('close', () => {
      logger.warn('Redis connection closed');
      this.isConnected = false;
    });
  }

  async connect(): Promise<void> {
    if (!this.isConnected) {
      await this.client.connect();
    }
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect();
  }

  getClient(): Redis {
    return this.client;
  }

  isHealthy(): boolean {
    return this.isConnected && this.client.status === 'ready';
  }

  // Cache management methods
  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (error) {
      logger.error({ error, key }, 'Failed to get value from Redis');
      return null;
    }
  }

  async set(key: string, value: string, ttl?: number): Promise<boolean> {
    try {
      if (ttl) {
        await this.client.setex(key, ttl, value);
      } else {
        await this.client.set(key, value);
      }
      return true;
    } catch (error) {
      logger.error({ error, key }, 'Failed to set value in Redis');
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error({ error, key }, 'Failed to delete key from Redis');
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error({ error, key }, 'Failed to check key existence in Redis');
      return false;
    }
  }

  async incr(key: string, ttl?: number): Promise<number> {
    try {
      const result = await this.client.incr(key);
      if (ttl && result === 1) {
        await this.client.expire(key, ttl);
      }
      return result;
    } catch (error) {
      logger.error({ error, key }, 'Failed to increment key in Redis');
      return 0;
    }
  }

  async publish(channel: string, message: string): Promise<void> {
    try {
      await this.client.publish(channel, message);
    } catch (error) {
      logger.error({ error, channel }, 'Failed to publish message to Redis');
    }
  }

  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    const subscriber = this.client.duplicate();
    await subscriber.subscribe(channel);
    subscriber.on('message', (receivedChannel, message) => {
      if (receivedChannel === channel) {
        callback(message);
      }
    });
  }
}

export const redisManager = new RedisManager();
export default redisManager;