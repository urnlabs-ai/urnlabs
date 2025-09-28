import Redis from 'ioredis';
declare class RedisManager {
    private client;
    private isConnected;
    constructor();
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    getClient(): Redis;
    isHealthy(): boolean;
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttl?: number): Promise<boolean>;
    del(key: string): Promise<boolean>;
    exists(key: string): Promise<boolean>;
    incr(key: string, ttl?: number): Promise<number>;
    publish(channel: string, message: string): Promise<void>;
    subscribe(channel: string, callback: (message: string) => void): Promise<void>;
}
export declare const redisManager: RedisManager;
export default redisManager;
//# sourceMappingURL=redis.d.ts.map