import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';

export async function usersRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  // Get current user profile
  fastify.get('/me', {
    schema: {
      tags: ['Users'],
      summary: 'Get current user profile',
      description: 'Get authenticated user information',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const user = await request.server.prisma.user.findUnique({
      where: { id: request.user!.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        organizationId: true,
        isActive: true,
        emailVerified: true,
        createdAt: true,
        lastLoginAt: true,
        lastActivityAt: true,
      },
    });

    if (!user) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'User not found',
      });
    }

    return reply.send({ user });
  });
}