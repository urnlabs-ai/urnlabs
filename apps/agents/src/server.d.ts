import { PrismaClient } from '@prisma/client';
import { AgentOrchestrator } from '@/orchestrator/agent-orchestrator.js';
import { QueueManager } from '@/queue/queue-manager.js';
import { WebSocketManager } from '@/lib/websocket-manager.js';
declare module 'fastify' {
    interface FastifyInstance {
        prisma: PrismaClient;
        orchestrator: AgentOrchestrator;
        queueManager: QueueManager;
        wsManager: WebSocketManager;
    }
}
declare function buildServer(): Promise<import("fastify").FastifyInstance<import("http").Server<typeof import("http").IncomingMessage, typeof import("http").ServerResponse>, import("http").IncomingMessage, import("http").ServerResponse<import("http").IncomingMessage>, any, import("fastify").FastifyTypeProviderDefault>>;
export { buildServer };
//# sourceMappingURL=server.d.ts.map