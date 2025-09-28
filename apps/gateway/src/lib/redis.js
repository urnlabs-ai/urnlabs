import Redis from 'ioredis';
import config from './config.js';
import logger from './logger.js';
class RedisManager {
    client;
    isConnected = false;
    constructor() {
        this.client = new Redis(config.redis.url, {
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
    async connect() {
        if (!this.isConnected) {
            await this.client.connect();
        }
    }
    async disconnect() {
        await this.client.disconnect();
    }
    getClient() {
        return this.client;
    }
    isHealthy() {
        return this.isConnected && this.client.status === 'ready';
    }
    // Cache management methods
    async get(key) {
        try {
            return await this.client.get(key);
        }
        catch (error) {
            logger.error({ error, key }, 'Failed to get value from Redis');
            return null;
        }
    }
    async set(key, value, ttl) {
        try {
            if (ttl) {
                await this.client.setex(key, ttl, value);
            }
            else {
                await this.client.set(key, value);
            }
            return true;
        }
        catch (error) {
            logger.error({ error, key }, 'Failed to set value in Redis');
            return false;
        }
    }
    async del(key) {
        try {
            await this.client.del(key);
            return true;
        }
        catch (error) {
            logger.error({ error, key }, 'Failed to delete key from Redis');
            return false;
        }
    }
    async exists(key) {
        try {
            const result = await this.client.exists(key);
            return result === 1;
        }
        catch (error) {
            logger.error({ error, key }, 'Failed to check key existence in Redis');
            return false;
        }
    }
    async incr(key, ttl) {
        try {
            const result = await this.client.incr(key);
            if (ttl && result === 1) {
                await this.client.expire(key, ttl);
            }
            return result;
        }
        catch (error) {
            logger.error({ error, key }, 'Failed to increment key in Redis');
            return 0;
        }
    }
    async publish(channel, message) {
        try {
            await this.client.publish(channel, message);
        }
        catch (error) {
            logger.error({ error, channel }, 'Failed to publish message to Redis');
        }
    }
    async subscribe(channel, callback) {
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
//# sourceMappingURL=redis.js.map