import { FastifyInstance } from 'fastify';
import { getPrisma } from '@/lib/database.js';
declare module 'fastify' {
    interface FastifyInstance {
        prisma: ReturnType<typeof getPrisma> extends infer T ? (T extends object ? T : any) : any;
    }
}
declare function buildServer(): Promise<FastifyInstance>;
export { buildServer };
//# sourceMappingURL=server.d.ts.map