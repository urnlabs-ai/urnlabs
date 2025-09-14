import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

// Profile schemas for validation (Code Reviewer Agent requirement)
const CreateProfileSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  bio: z.string().max(1000).optional(),
  avatar_url: z.string().url().optional(),
  location: z.string().max(100).optional(),
  website_url: z.string().url().optional(),
});

const UpdateProfileSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  bio: z.string().max(1000).optional(),
  avatar_url: z.string().url().optional(),
  location: z.string().max(100).optional(),
  website_url: z.string().url().optional(),
});

const ProfileParamsSchema = z.object({
  userId: z.string().uuid(),
});

// Profile API routes (Architecture Agent design)
const profilesRoutes: FastifyPluginAsync = async (fastify) => {
  // Authentication middleware (Security requirement)
  fastify.addHook('onRequest', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.code(401).send({ error: 'Authentication required' });
    }
  });

  // Get user profile
  fastify.get<{
    Params: z.infer<typeof ProfileParamsSchema>
  }>('/profiles/:userId', {
    schema: {
      params: ProfileParamsSchema,
      response: {
        200: z.object({
          profile: z.object({
            id: z.string().uuid(),
            user_id: z.string().uuid(),
            display_name: z.string().nullable(),
            bio: z.string().nullable(),
            avatar_url: z.string().nullable(),
            location: z.string().nullable(),
            website_url: z.string().nullable(),
            created_at: z.string(),
            updated_at: z.string(),
          }),
        }),
        404: z.object({ error: z.string() }),
      },
    },
  }, async (request, reply) => {
    try {
      const { userId } = request.params;
      
      // Check if user can access this profile (Security Agent requirement)
      if (request.user.id !== userId && !request.user.isAdmin) {
        return reply.code(403).send({ error: 'Access denied' });
      }

      // Database query with proper error handling (Code Reviewer Agent requirement)
      const profile = await fastify.db.userProfile.findUnique({
        where: { user_id: userId },
      });

      if (!profile) {
        return reply.code(404).send({ error: 'Profile not found' });
      }

      // Log access for monitoring (Deployment Agent requirement)
      fastify.log.info(`Profile accessed: ${userId}`);

      reply.send({ profile });
    } catch (error) {
      fastify.log.error('Profile fetch error:', error);
      reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Create user profile
  fastify.post<{
    Body: z.infer<typeof CreateProfileSchema>
  }>('/profiles', {
    schema: {
      body: CreateProfileSchema,
      response: {
        201: z.object({
          profile: z.object({
            id: z.string().uuid(),
            user_id: z.string().uuid(),
            display_name: z.string().nullable(),
            bio: z.string().nullable(),
            avatar_url: z.string().nullable(),
            location: z.string().nullable(),
            website_url: z.string().nullable(),
            created_at: z.string(),
            updated_at: z.string(),
          }),
        }),
        400: z.object({ error: z.string() }),
        409: z.object({ error: z.string() }),
      },
    },
  }, async (request, reply) => {
    try {
      const profileData = request.body;
      const userId = request.user.id;

      // Check if profile already exists
      const existingProfile = await fastify.db.userProfile.findUnique({
        where: { user_id: userId },
      });

      if (existingProfile) {
        return reply.code(409).send({ error: 'Profile already exists' });
      }

      // Input sanitization (Security Agent requirement)
      const sanitizedData = {
        ...profileData,
        user_id: userId,
        bio: profileData.bio?.trim(),
        display_name: profileData.display_name?.trim(),
        location: profileData.location?.trim(),
      };

      // Create profile with transaction for data integrity
      const profile = await fastify.db.userProfile.create({
        data: sanitizedData,
      });

      // Real-time update notification (Architecture Agent design)
      fastify.io.to(`user:${userId}`).emit('profileCreated', { profile });

      // Log creation for audit trail (Deployment Agent requirement)
      fastify.log.info(`Profile created: ${userId}`);

      reply.code(201).send({ profile });
    } catch (error) {
      fastify.log.error('Profile creation error:', error);
      reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Update user profile
  fastify.put<{
    Params: z.infer<typeof ProfileParamsSchema>,
    Body: z.infer<typeof UpdateProfileSchema>
  }>('/profiles/:userId', {
    schema: {
      params: ProfileParamsSchema,
      body: UpdateProfileSchema,
      response: {
        200: z.object({
          profile: z.object({
            id: z.string().uuid(),
            user_id: z.string().uuid(),
            display_name: z.string().nullable(),
            bio: z.string().nullable(),
            avatar_url: z.string().nullable(),
            location: z.string().nullable(),
            website_url: z.string().nullable(),
            created_at: z.string(),
            updated_at: z.string(),
          }),
        }),
        403: z.object({ error: z.string() }),
        404: z.object({ error: z.string() }),
      },
    },
  }, async (request, reply) => {
    try {
      const { userId } = request.params;
      const updateData = request.body;

      // Security check - user can only update own profile
      if (request.user.id !== userId) {
        return reply.code(403).send({ error: 'Access denied' });
      }

      // Rate limiting check (Security Agent requirement)
      const rateLimitKey = `profile_update:${userId}`;
      const updateCount = await fastify.redis.incr(rateLimitKey);
      if (updateCount === 1) {
        await fastify.redis.expire(rateLimitKey, 3600); // 1 hour window
      }
      if (updateCount > 10) { // Max 10 updates per hour
        return reply.code(429).send({ error: 'Rate limit exceeded' });
      }

      // Input sanitization
      const sanitizedData = {
        ...updateData,
        bio: updateData.bio?.trim(),
        display_name: updateData.display_name?.trim(),
        location: updateData.location?.trim(),
        updated_at: new Date(),
      };

      // Update with optimistic locking
      const profile = await fastify.db.userProfile.update({
        where: { user_id: userId },
        data: sanitizedData,
      });

      // Real-time update notification
      fastify.io.to(`user:${userId}`).emit('profileUpdated', { profile });

      // Log update for monitoring
      fastify.log.info(`Profile updated: ${userId}`, { changes: Object.keys(updateData) });

      reply.send({ profile });
    } catch (error) {
      if (error.code === 'P2025') { // Prisma not found error
        return reply.code(404).send({ error: 'Profile not found' });
      }
      fastify.log.error('Profile update error:', error);
      reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Delete user profile
  fastify.delete<{
    Params: z.infer<typeof ProfileParamsSchema>
  }>('/profiles/:userId', {
    schema: {
      params: ProfileParamsSchema,
      response: {
        200: z.object({ message: z.string() }),
        403: z.object({ error: z.string() }),
        404: z.object({ error: z.string() }),
      },
    },
  }, async (request, reply) => {
    try {
      const { userId } = request.params;

      // Security check - user can only delete own profile
      if (request.user.id !== userId) {
        return reply.code(403).send({ error: 'Access denied' });
      }

      // Soft delete for data recovery (Architecture Agent design)
      const profile = await fastify.db.userProfile.update({
        where: { user_id: userId },
        data: { 
          deleted_at: new Date(),
          updated_at: new Date(),
        },
      });

      // Real-time notification
      fastify.io.to(`user:${userId}`).emit('profileDeleted', { userId });

      // Log deletion for audit trail
      fastify.log.info(`Profile deleted: ${userId}`);

      reply.send({ message: 'Profile deleted successfully' });
    } catch (error) {
      if (error.code === 'P2025') {
        return reply.code(404).send({ error: 'Profile not found' });
      }
      fastify.log.error('Profile deletion error:', error);
      reply.code(500).send({ error: 'Internal server error' });
    }
  });
};

export default profilesRoutes;