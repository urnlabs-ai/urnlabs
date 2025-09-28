import { PrismaClient } from '@prisma/client';
export declare function getPrisma(): PrismaClient;
export declare function disconnectPrisma(): Promise<void>;
export type DbHealth = {
    ok: boolean;
    latencyMs?: number;
    error?: string;
    schema?: {
        users?: boolean;
        agents?: boolean;
        workflows?: boolean;
    };
};
export declare function testConnection(): Promise<DbHealth>;
export declare function checkSchema(): Promise<DbHealth>;
export declare function connectWithRetry(opts?: {
    attempts?: number;
    delayMs?: number;
}): Promise<void>;
export declare function databaseHealth(): Promise<{
    ready: boolean;
    details: DbHealth & {
        urlMasked: string;
    };
}>;
//# sourceMappingURL=database.d.ts.map