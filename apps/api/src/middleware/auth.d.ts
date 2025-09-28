import { FastifyRequest, FastifyReply } from 'fastify';
interface JWTPayload {
    userId: string;
    email: string;
    role: string;
    organizationId?: string;
    permissions: string[];
    iat: number;
    exp: number;
}
declare module 'fastify' {
    interface FastifyRequest {
        jwtUser?: JWTPayload;
    }
}
export declare function authMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void>;
export declare function requirePermission(permission: string): (request: FastifyRequest, reply: FastifyReply) => Promise<undefined>;
export declare function requireRole(role: string): (request: FastifyRequest, reply: FastifyReply) => Promise<undefined>;
export declare function requireOrganizationAccess(): (request: FastifyRequest, reply: FastifyReply) => Promise<undefined>;
export {};
//# sourceMappingURL=auth.d.ts.map