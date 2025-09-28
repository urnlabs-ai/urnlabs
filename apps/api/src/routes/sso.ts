import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authMiddleware, requirePermission } from '@/middleware/auth.js';
import { SsoService } from '@/services/sso-service.js';
import { SamlAuthService } from '@/services/saml-auth-service.js';
import { OAuthAuthService } from '@/services/oauth-auth-service.js';
import {
  CreateSsoProviderRequest,
  UpdateSsoProviderRequest,
  SsoProvidersQuery,
  TestSsoProviderRequest,
  InitiateSsoRequest,
  SsoCallbackRequest,
  SSO_PROVIDER_TYPES,
} from '@/lib/schemas/sso.js';
import { logSecurityEvent } from '@/lib/logger.js';

// Type definitions for authenticated requests
interface AuthenticatedRequest extends FastifyRequest {
  user: {
    userId: string;
    email: string;
    role: string;
    organizationId: string;
    permissions: string[];
  };
}

export async function ssoRoutes(fastify: FastifyInstance) {
  // Initialize SSO services
  const ssoService = new SsoService(fastify.prisma);
  const samlAuthService = new SamlAuthService(fastify.prisma);
  const oauthAuthService = new OAuthAuthService(fastify.prisma);

  // Add auth middleware to admin routes
  fastify.addHook('preHandler', async (request, reply) => {
    // Skip auth for public SSO authentication endpoints
    const publicPaths = ['/auth/initiate', '/auth/callback', '/auth/complete'];
    const isPublicPath = publicPaths.some(path => request.url.includes(path));

    if (!isPublicPath) {
      await authMiddleware(request, reply);
    }
  });

  // ============================================================================
  // SSO PROVIDER MANAGEMENT (Admin Only)
  // ============================================================================

  /**
   * Create SSO Provider
   * POST /sso/providers
   */
  fastify.post('/providers', {
    schema: {
      description: 'Create a new SSO provider configuration',
      tags: ['SSO Management'],
      body: {
        oneOf: [
          {
            type: 'object',
            properties: {
              name: { type: 'string', minLength: 1, maxLength: 100 },
              type: { type: 'string', enum: ['saml'] },
              domain: { type: 'string' },
              entityId: { type: 'string', minLength: 1 },
              ssoUrl: { type: 'string', format: 'uri' },
              sloUrl: { type: 'string', format: 'uri' },
              certificate: { type: 'string', minLength: 1 },
              nameIdFormat: { type: 'string' },
              signRequests: { type: 'boolean' },
              wantAssertionsSigned: { type: 'boolean' },
              attributeMapping: { type: 'object', additionalProperties: true },
              roleMapping: { type: 'object', additionalProperties: true },
              defaultRole: { type: 'string' },
              isActive: { type: 'boolean' },
              isDefault: { type: 'boolean' },
              autoCreateUsers: { type: 'boolean' },
              requireMfa: { type: 'boolean' },
            },
            required: ['name', 'type', 'entityId', 'ssoUrl', 'certificate'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              name: { type: 'string', minLength: 1, maxLength: 100 },
              type: { type: 'string', enum: ['oauth2'] },
              domain: { type: 'string' },
              clientId: { type: 'string', minLength: 1 },
              clientSecret: { type: 'string', minLength: 1 },
              authorizeUrl: { type: 'string', format: 'uri' },
              tokenUrl: { type: 'string', format: 'uri' },
              userinfoUrl: { type: 'string', format: 'uri' },
              scopes: { type: 'array', items: { type: 'string' } },
              attributeMapping: { type: 'object', additionalProperties: true },
              roleMapping: { type: 'object', additionalProperties: true },
              defaultRole: { type: 'string' },
              isActive: { type: 'boolean' },
              isDefault: { type: 'boolean' },
              autoCreateUsers: { type: 'boolean' },
              requireMfa: { type: 'boolean' },
            },
            required: ['name', 'type', 'clientId', 'clientSecret', 'authorizeUrl', 'tokenUrl'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              name: { type: 'string', minLength: 1, maxLength: 100 },
              type: { type: 'string', enum: ['openid-connect'] },
              domain: { type: 'string' },
              clientId: { type: 'string', minLength: 1 },
              clientSecret: { type: 'string', minLength: 1 },
              issuer: { type: 'string', format: 'uri' },
              scopes: { type: 'array', items: { type: 'string' } },
              attributeMapping: { type: 'object', additionalProperties: true },
              roleMapping: { type: 'object', additionalProperties: true },
              defaultRole: { type: 'string' },
              isActive: { type: 'boolean' },
              isDefault: { type: 'boolean' },
              autoCreateUsers: { type: 'boolean' },
              requireMfa: { type: 'boolean' },
            },
            required: ['name', 'type', 'clientId', 'clientSecret', 'issuer'],
            additionalProperties: false,
          },
        ],
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            type: { type: 'string' },
            domain: { type: 'string', nullable: true },
            isActive: { type: 'boolean' },
            isDefault: { type: 'boolean' },
            autoCreateUsers: { type: 'boolean' },
            requireMfa: { type: 'boolean' },
            organizationId: { type: 'string' },
            createdAt: { type: 'string' },
            updatedAt: { type: 'string' },
            lastUsedAt: { type: 'string', nullable: true },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
        403: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
    preHandler: [requirePermission('sso:create')],
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const data = CreateSsoProviderRequest.parse(request.body);

      const provider = await ssoService.createProvider(
        request.user.organizationId,
        data,
        request.user.userId
      );

      return reply.status(201).send(provider);

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create SSO provider';
      return reply.status(400).send({
        error: 'Bad Request',
        message,
      });
    }
  });

  /**
   * List SSO Providers
   * GET /sso/providers
   */
  fastify.get('/providers', {
    schema: {
      description: 'List SSO providers for the organization',
      tags: ['SSO Management'],
      querystring: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['saml', 'oauth2', 'openid-connect', 'ldap'] },
          isActive: { type: 'boolean' },
          domain: { type: 'string' },
          page: { type: 'number', minimum: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100 },
        },
        additionalProperties: false,
      },
      response: {
        200: {
          type: 'object',
          properties: {
            providers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  type: { type: 'string' },
                  domain: { type: 'string', nullable: true },
                  isActive: { type: 'boolean' },
                  isDefault: { type: 'boolean' },
                  autoCreateUsers: { type: 'boolean' },
                  requireMfa: { type: 'boolean' },
                  organizationId: { type: 'string' },
                  createdAt: { type: 'string' },
                  updatedAt: { type: 'string' },
                  lastUsedAt: { type: 'string', nullable: true },
                },
              },
            },
            total: { type: 'number' },
            page: { type: 'number' },
            limit: { type: 'number' },
          },
        },
      },
    },
    preHandler: [requirePermission('sso:read')],
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const query = SsoProvidersQuery.parse({
        ...request.query,
        organizationId: request.user.organizationId,
      });

      const result = await ssoService.listProviders(query);
      return reply.send(result);

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list SSO providers';
      return reply.status(400).send({
        error: 'Bad Request',
        message,
      });
    }
  });

  /**
   * Get SSO Provider
   * GET /sso/providers/:id
   */
  fastify.get('/providers/:id', {
    schema: {
      description: 'Get a specific SSO provider',
      tags: ['SSO Management'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            type: { type: 'string' },
            domain: { type: 'string', nullable: true },
            isActive: { type: 'boolean' },
            isDefault: { type: 'boolean' },
            autoCreateUsers: { type: 'boolean' },
            requireMfa: { type: 'boolean' },
            organizationId: { type: 'string' },
            createdAt: { type: 'string' },
            updatedAt: { type: 'string' },
            lastUsedAt: { type: 'string', nullable: true },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
    preHandler: [requirePermission('sso:read')],
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };

      const provider = await ssoService.getProvider(id, request.user.organizationId);
      return reply.send(provider);

    } catch (error) {
      if (error instanceof Error && error.message === 'SSO provider not found') {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'SSO provider not found',
        });
      }

      const message = error instanceof Error ? error.message : 'Failed to get SSO provider';
      return reply.status(400).send({
        error: 'Bad Request',
        message,
      });
    }
  });

  /**
   * Update SSO Provider
   * PUT /sso/providers/:id
   */
  fastify.put('/providers/:id', {
    schema: {
      description: 'Update an SSO provider configuration',
      tags: ['SSO Management'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          domain: { type: 'string' },
          entityId: { type: 'string' },
          ssoUrl: { type: 'string', format: 'uri' },
          sloUrl: { type: 'string', format: 'uri' },
          certificate: { type: 'string' },
          issuer: { type: 'string', format: 'uri' },
          clientId: { type: 'string' },
          clientSecret: { type: 'string' },
          scopes: { type: 'array', items: { type: 'string' } },
          authorizeUrl: { type: 'string', format: 'uri' },
          tokenUrl: { type: 'string', format: 'uri' },
          userinfoUrl: { type: 'string', format: 'uri' },
          jwksUrl: { type: 'string', format: 'uri' },
          signRequests: { type: 'boolean' },
          wantAssertionsSigned: { type: 'boolean' },
          nameIdFormat: { type: 'string' },
          attributeMapping: { type: 'object', additionalProperties: true },
          roleMapping: { type: 'object', additionalProperties: true },
          defaultRole: { type: 'string' },
          isActive: { type: 'boolean' },
          isDefault: { type: 'boolean' },
          autoCreateUsers: { type: 'boolean' },
          requireMfa: { type: 'boolean' },
        },
        additionalProperties: false,
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            type: { type: 'string' },
            domain: { type: 'string', nullable: true },
            isActive: { type: 'boolean' },
            isDefault: { type: 'boolean' },
            autoCreateUsers: { type: 'boolean' },
            requireMfa: { type: 'boolean' },
            organizationId: { type: 'string' },
            createdAt: { type: 'string' },
            updatedAt: { type: 'string' },
            lastUsedAt: { type: 'string', nullable: true },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
    preHandler: [requirePermission('sso:update')],
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const data = UpdateSsoProviderRequest.parse(request.body);

      const provider = await ssoService.updateProvider(
        id,
        request.user.organizationId,
        data,
        request.user.userId
      );

      return reply.send(provider);

    } catch (error) {
      if (error instanceof Error && error.message === 'SSO provider not found') {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'SSO provider not found',
        });
      }

      const message = error instanceof Error ? error.message : 'Failed to update SSO provider';
      return reply.status(400).send({
        error: 'Bad Request',
        message,
      });
    }
  });

  /**
   * Delete SSO Provider
   * DELETE /sso/providers/:id
   */
  fastify.delete('/providers/:id', {
    schema: {
      description: 'Delete an SSO provider',
      tags: ['SSO Management'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      response: {
        204: {
          type: 'null',
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
    preHandler: [requirePermission('sso:delete')],
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };

      await ssoService.deleteProvider(id, request.user.organizationId, request.user.userId);
      return reply.status(204).send();

    } catch (error) {
      if (error instanceof Error && error.message === 'SSO provider not found') {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'SSO provider not found',
        });
      }

      const message = error instanceof Error ? error.message : 'Failed to delete SSO provider';
      return reply.status(400).send({
        error: 'Bad Request',
        message,
      });
    }
  });

  /**
   * Test SSO Provider
   * POST /sso/providers/:id/test
   */
  fastify.post('/providers/:id/test', {
    schema: {
      description: 'Test SSO provider configuration',
      tags: ['SSO Management'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      body: {
        type: 'object',
        properties: {
          testEmail: { type: 'string', format: 'email' },
        },
        additionalProperties: false,
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            details: { type: 'object', additionalProperties: true },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
    preHandler: [requirePermission('sso:test')],
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const { testEmail } = TestSsoProviderRequest.parse(request.body);

      const result = await ssoService.testProvider(id, request.user.organizationId, testEmail);
      return reply.send(result);

    } catch (error) {
      if (error instanceof Error && error.message === 'SSO provider not found') {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'SSO provider not found',
        });
      }

      const message = error instanceof Error ? error.message : 'Failed to test SSO provider';
      return reply.status(400).send({
        error: 'Bad Request',
        message,
      });
    }
  });

  // ============================================================================
  // SSO AUTHENTICATION ENDPOINTS (Public)
  // ============================================================================

  /**
   * Initiate SSO Authentication
   * POST /sso/auth/initiate
   */
  fastify.post('/auth/initiate', {
    schema: {
      description: 'Initiate SSO authentication flow',
      tags: ['SSO Authentication'],
      body: {
        type: 'object',
        properties: {
          providerId: { type: 'string' },
          email: { type: 'string', format: 'email' },
          returnUrl: { type: 'string', format: 'uri' },
        },
        additionalProperties: false,
      },
      response: {
        200: {
          type: 'object',
          properties: {
            sessionId: { type: 'string' },
            redirectUrl: { type: 'string' },
            method: { type: 'string', enum: ['GET', 'POST'] },
            samlRequest: { type: 'string' },
            relayState: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = InitiateSsoRequest.parse(request.body);

      // Auto-detect provider if not specified
      let providerId = data.providerId;
      if (!providerId && data.email) {
        const domain = data.email.split('@')[1];
        const provider = await ssoService.findProviderByDomain(domain);
        if (!provider) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'No SSO provider found for this email domain',
          });
        }
        providerId = provider.id;
      }

      if (!providerId) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Provider ID or email is required',
        });
      }

      // Get provider to determine type
      const provider = await ssoService.getProvider(providerId, ''); // Will validate later in specific handlers

      // Handle SAML authentication
      if (provider.type === SSO_PROVIDER_TYPES.SAML) {
        const samlResponse = await samlAuthService.initiateSamlAuth({
          providerId,
          redirectUrl: data.returnUrl,
          userAgent: request.headers['user-agent'],
          ipAddress: request.ip,
        });

        return reply.send({
          sessionId: samlResponse.sessionId,
          redirectUrl: samlResponse.redirectUrl,
          method: 'POST',
          samlRequest: samlResponse.samlRequest,
          relayState: samlResponse.relayState,
        });
      }

      // Handle OAuth 2.0 and OpenID Connect authentication
      if (provider.type === SSO_PROVIDER_TYPES.OAUTH2 || provider.type === SSO_PROVIDER_TYPES.OPENID_CONNECT) {
        const oauthResponse = await oauthAuthService.initiateOAuthAuth({
          providerId,
          redirectUrl: data.returnUrl,
          userAgent: request.headers['user-agent'],
          ipAddress: request.ip,
        });

        return reply.send({
          sessionId: oauthResponse.sessionId,
          redirectUrl: oauthResponse.redirectUrl,
          method: 'GET',
          state: oauthResponse.state,
        });
      }

      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Unsupported provider type',
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to initiate SSO';
      return reply.status(400).send({
        error: 'Bad Request',
        message,
      });
    }
  });

  /**
   * SSO Authentication Callback
   * POST /sso/auth/callback
   */
  fastify.post('/auth/callback', {
    schema: {
      description: 'Handle SSO authentication callback',
      tags: ['SSO Authentication'],
      body: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
          SAMLResponse: { type: 'string' },
          RelayState: { type: 'string' },
          code: { type: 'string' },
          state: { type: 'string' },
          error: { type: 'string' },
          error_description: { type: 'string' },
        },
        required: ['sessionId'],
        additionalProperties: false,
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                role: { type: 'string' },
                organizationId: { type: 'string', nullable: true },
              },
            },
            tokens: {
              type: 'object',
              properties: {
                accessToken: { type: 'string' },
                refreshToken: { type: 'string' },
                expiresIn: { type: 'number' },
              },
            },
            requiresMfa: { type: 'boolean' },
            mfaSessionId: { type: 'string' },
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = SsoCallbackRequest.parse(request.body);

      // Get SSO session
      const session = await ssoService.getSsoSession(data.sessionId);

      // Handle OAuth/OIDC error responses
      if (data.error) {
        await ssoService.updateSsoSession(data.sessionId, {
          status: 'failed',
          errorCode: data.error,
          errorMessage: data.error_description || data.error,
        });

        logSecurityEvent('sso_authentication_failed', 'medium', {
          sessionId: data.sessionId,
          providerId: session.providerId,
          error: data.error,
          ip: request.ip,
        });

        return reply.send({
          success: false,
          error: data.error,
          message: data.error_description || 'SSO authentication failed',
        });
      }

      // Handle SAML callback
      if (data.SAMLResponse && session.provider.type === SSO_PROVIDER_TYPES.SAML) {
        const samlResult = await samlAuthService.processSamlCallback({
          sessionId: data.sessionId,
          samlResponse: data.SAMLResponse,
          relayState: data.RelayState,
        });

        if (!samlResult.success) {
          logSecurityEvent('sso_authentication_failed', 'medium', {
            sessionId: data.sessionId,
            providerId: session.providerId,
            error: samlResult.error,
            ip: request.ip,
          });

          return reply.send({
            success: false,
            error: samlResult.error,
            message: samlResult.message,
          });
        }

        // TODO: Create or update user and generate tokens
        // For now, return SAML user data
        return reply.send({
          success: true,
          message: samlResult.message,
          user: {
            id: `saml-${samlResult.user!.nameId}`,
            email: samlResult.user!.email,
            firstName: samlResult.user!.firstName || 'SAML',
            lastName: samlResult.user!.lastName || 'User',
            role: samlResult.user!.role || 'USER',
            organizationId: session.provider.organizationId,
          },
          tokens: {
            accessToken: 'placeholder-saml-access-token',
            refreshToken: 'placeholder-saml-refresh-token',
            expiresIn: 900, // 15 minutes
          },
          requiresMfa: false,
        });
      }

      // Handle OAuth2/OIDC callback
      if (data.code && (session.provider.type === SSO_PROVIDER_TYPES.OAUTH2 || session.provider.type === SSO_PROVIDER_TYPES.OPENID_CONNECT)) {
        const oauthResult = await oauthAuthService.processOAuthCallback({
          sessionId: data.sessionId,
          code: data.code,
          state: data.state || '',
          error: data.error,
          errorDescription: data.error_description,
        });

        if (!oauthResult.success) {
          logSecurityEvent('sso_authentication_failed', 'medium', {
            sessionId: data.sessionId,
            providerId: session.providerId,
            error: oauthResult.error,
            ip: request.ip,
          });

          return reply.send({
            success: false,
            error: oauthResult.error,
            message: oauthResult.message,
          });
        }

        // TODO: Create or update user and generate tokens
        // For now, return OAuth user data
        return reply.send({
          success: true,
          message: oauthResult.message,
          user: {
            id: `oauth-${oauthResult.user!.sub}`,
            email: oauthResult.user!.email,
            firstName: oauthResult.user!.firstName || 'OAuth',
            lastName: oauthResult.user!.lastName || 'User',
            role: oauthResult.user!.role || 'USER',
            organizationId: session.provider.organizationId,
          },
          tokens: {
            accessToken: 'placeholder-oauth-access-token',
            refreshToken: 'placeholder-oauth-refresh-token',
            expiresIn: 900, // 15 minutes
          },
          requiresMfa: false,
        });
      }

      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid callback data for provider type',
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : 'SSO callback failed';
      return reply.status(400).send({
        error: 'Bad Request',
        message,
      });
    }
  });

  // ============================================================================
  // UTILITY ENDPOINTS
  // ============================================================================

  /**
   * Clean up expired SSO sessions
   * POST /sso/cleanup
   */
  fastify.post('/cleanup', {
    schema: {
      description: 'Clean up expired SSO sessions',
      tags: ['SSO Management'],
      response: {
        200: {
          type: 'object',
          properties: {
            cleaned: { type: 'number' },
            message: { type: 'string' },
          },
        },
      },
    },
    preHandler: [requirePermission('system:maintenance')],
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const cleaned = await ssoService.cleanupExpiredSessions();

      return reply.send({
        cleaned,
        message: `Cleaned up ${cleaned} expired SSO sessions`,
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to cleanup sessions';
      return reply.status(500).send({
        error: 'Internal Server Error',
        message,
      });
    }
  });
}