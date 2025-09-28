import { FastifyRequest, FastifyReply } from 'fastify';
export declare function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
export declare function authorize(permissions?: string[]): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
export declare function optionalAuth(request: FastifyRequest, reply: FastifyReply): Promise<void>;
export declare function generateToken(user: {
    userId: string;
    organizationId: string;
    role: string;
    permissions: string[];
}): Promise<string>;
export declare function revokeToken(token: string): Promise<void>;
//# sourceMappingURL=auth.d.ts.map