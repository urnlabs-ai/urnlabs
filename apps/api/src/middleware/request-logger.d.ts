import { FastifyInstance, FastifyPluginOptions } from 'fastify';
export declare function requestLogger(fastify: FastifyInstance, _opts: FastifyPluginOptions): Promise<void>;
declare module 'fastify' {
    interface FastifyRequest {
        startTime?: number;
    }
}
//# sourceMappingURL=request-logger.d.ts.map