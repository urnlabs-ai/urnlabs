import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { z } from 'zod';
import {
  CreateSsoProviderRequest,
  UpdateSsoProviderRequest,
  SsoProvidersQuery,
  InitiateSsoRequest,
  SsoCallbackRequest,
  SsoProviderResponse,
  SSO_PROVIDER_TYPES,
} from '@/lib/schemas/sso.js';
import { logSecurityEvent, logBusinessMetric } from '@/lib/logger.js';

/**
 * SSO Provider Management Service
 * Handles SAML, OAuth 2.0, and OpenID Connect integrations
 */
export class SsoService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Create a new SSO provider
   */
  async createProvider(
    organizationId: string,
    data: CreateSsoProviderRequest,
    createdBy: string
  ): Promise<SsoProviderResponse> {
    // Validate organization exists
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new Error('Organization not found');
    }

    // Check for duplicate provider names within organization
    const existingProvider = await this.prisma.ssoProvider.findFirst({
      where: {
        organizationId,
        name: data.name,
      },
    });

    if (existingProvider) {
      throw new Error('SSO provider with this name already exists');
    }

    // If setting as default, unset other defaults
    if (data.isDefault) {
      await this.prisma.ssoProvider.updateMany({
        where: {
          organizationId,
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
      });
    }

    // Encrypt sensitive data
    const encryptedData = this.encryptSensitiveFields(data);

    // Create the provider
    const provider = await this.prisma.ssoProvider.create({
      data: {
        organizationId,
        name: data.name,
        type: data.type,
        domain: data.domain,
        entityId: data.entityId,
        ssoUrl: data.ssoUrl,
        sloUrl: data.sloUrl,
        certificate: data.certificate,
        issuer: data.issuer,
        clientId: data.clientId,
        clientSecret: encryptedData.clientSecret,
        scopes: data.scopes || [],
        authorizeUrl: data.authorizeUrl,
        tokenUrl: data.tokenUrl,
        userinfoUrl: data.userinfoUrl,
        jwksUrl: data.jwksUrl,
        signRequests: data.signRequests || false,
        wantAssertionsSigned: data.wantAssertionsSigned ?? true,
        nameIdFormat: data.nameIdFormat,
        attributeMapping: data.attributeMapping || {},
        roleMapping: data.roleMapping || {},
        defaultRole: data.defaultRole || 'USER',
        isActive: data.isActive ?? true,
        isDefault: data.isDefault || false,
        autoCreateUsers: data.autoCreateUsers ?? true,
        requireMfa: data.requireMfa || false,
      },
    });

    // Log security event
    logSecurityEvent('sso_provider_created', 'low', {
      providerId: provider.id,
      providerName: provider.name,
      providerType: provider.type,
      organizationId,
      createdBy,
    });

    logBusinessMetric('sso_provider_created', 1, 'count', {
      providerType: provider.type,
    });

    return this.toResponseFormat(provider);
  }

  /**
   * Update an existing SSO provider
   */
  async updateProvider(
    providerId: string,
    organizationId: string,
    data: UpdateSsoProviderRequest,
    updatedBy: string
  ): Promise<SsoProviderResponse> {
    // Find existing provider
    const existingProvider = await this.prisma.ssoProvider.findFirst({
      where: {
        id: providerId,
        organizationId,
      },
    });

    if (!existingProvider) {
      throw new Error('SSO provider not found');
    }

    // Check for duplicate names if name is being changed
    if (data.name && data.name !== existingProvider.name) {
      const duplicateProvider = await this.prisma.ssoProvider.findFirst({
        where: {
          organizationId,
          name: data.name,
          id: { not: providerId },
        },
      });

      if (duplicateProvider) {
        throw new Error('SSO provider with this name already exists');
      }
    }

    // If setting as default, unset other defaults
    if (data.isDefault === true) {
      await this.prisma.ssoProvider.updateMany({
        where: {
          organizationId,
          isDefault: true,
          id: { not: providerId },
        },
        data: {
          isDefault: false,
        },
      });
    }

    // Encrypt sensitive data if provided
    const encryptedData = this.encryptSensitiveFields(data);

    // Update the provider
    const provider = await this.prisma.ssoProvider.update({
      where: { id: providerId },
      data: {
        ...data,
        clientSecret: encryptedData.clientSecret || existingProvider.clientSecret,
      },
    });

    // Log security event
    logSecurityEvent('sso_provider_updated', 'low', {
      providerId: provider.id,
      providerName: provider.name,
      organizationId,
      updatedBy,
      changes: Object.keys(data),
    });

    return this.toResponseFormat(provider);
  }

  /**
   * Delete an SSO provider
   */
  async deleteProvider(
    providerId: string,
    organizationId: string,
    deletedBy: string
  ): Promise<void> {
    // Check if provider exists and belongs to organization
    const provider = await this.prisma.ssoProvider.findFirst({
      where: {
        id: providerId,
        organizationId,
      },
    });

    if (!provider) {
      throw new Error('SSO provider not found');
    }

    // Check if there are users currently using this provider
    const usersCount = await this.prisma.user.count({
      where: { ssoProviderId: providerId },
    });

    if (usersCount > 0) {
      throw new Error(`Cannot delete SSO provider: ${usersCount} users are still using it`);
    }

    // Delete the provider (cascade will handle related records)
    await this.prisma.ssoProvider.delete({
      where: { id: providerId },
    });

    // Log security event
    logSecurityEvent('sso_provider_deleted', 'medium', {
      providerId,
      providerName: provider.name,
      organizationId,
      deletedBy,
    });

    logBusinessMetric('sso_provider_deleted', 1, 'count', {
      providerType: provider.type,
    });
  }

  /**
   * List SSO providers for an organization
   */
  async listProviders(query: SsoProvidersQuery): Promise<{
    providers: SsoProviderResponse[];
    total: number;
    page: number;
    limit: number;
  }> {
    const where: any = {};

    if (query.organizationId) {
      where.organizationId = query.organizationId;
    }

    if (query.type) {
      where.type = query.type;
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.domain) {
      where.domain = query.domain;
    }

    const [providers, total] = await Promise.all([
      this.prisma.ssoProvider.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [
          { isDefault: 'desc' },
          { isActive: 'desc' },
          { name: 'asc' },
        ],
      }),
      this.prisma.ssoProvider.count({ where }),
    ]);

    return {
      providers: providers.map(p => this.toResponseFormat(p)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  /**
   * Get a specific SSO provider
   */
  async getProvider(
    providerId: string,
    organizationId: string
  ): Promise<SsoProviderResponse> {
    const provider = await this.prisma.ssoProvider.findFirst({
      where: {
        id: providerId,
        organizationId,
      },
    });

    if (!provider) {
      throw new Error('SSO provider not found');
    }

    return this.toResponseFormat(provider);
  }

  /**
   * Find provider by domain for auto-detection
   */
  async findProviderByDomain(domain: string): Promise<SsoProviderResponse | null> {
    const provider = await this.prisma.ssoProvider.findFirst({
      where: {
        domain,
        isActive: true,
      },
    });

    return provider ? this.toResponseFormat(provider) : null;
  }

  /**
   * Test SSO provider configuration
   */
  async testProvider(
    providerId: string,
    organizationId: string,
    testEmail?: string
  ): Promise<{ success: boolean; message: string; details?: any }> {
    const provider = await this.prisma.ssoProvider.findFirst({
      where: {
        id: providerId,
        organizationId,
      },
    });

    if (!provider) {
      throw new Error('SSO provider not found');
    }

    try {
      // Perform provider-specific validation
      switch (provider.type) {
        case SSO_PROVIDER_TYPES.SAML:
          return this.testSamlProvider(provider);
        case SSO_PROVIDER_TYPES.OAUTH2:
          return this.testOAuth2Provider(provider);
        case SSO_PROVIDER_TYPES.OPENID_CONNECT:
          return this.testOidcProvider(provider);
        default:
          return {
            success: false,
            message: `Provider type ${provider.type} is not supported for testing`,
          };
      }
    } catch (error) {
      logSecurityEvent('sso_provider_test_failed', 'medium', {
        providerId,
        providerType: provider.type,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        message: error instanceof Error ? error.message : 'Test failed',
      };
    }
  }

  /**
   * Create SSO session for authentication flow
   */
  async createSsoSession(
    providerId: string,
    redirectUrl?: string,
    userAgent?: string,
    ipAddress?: string
  ): Promise<{
    sessionId: string;
    expiresAt: Date;
  }> {
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await this.prisma.ssoSession.create({
      data: {
        sessionId,
        providerId,
        redirectUrl,
        userAgent,
        ipAddress,
        expiresAt,
        status: 'pending',
      },
    });

    return { sessionId, expiresAt };
  }

  /**
   * Get SSO session
   */
  async getSsoSession(sessionId: string) {
    const session = await this.prisma.ssoSession.findUnique({
      where: { sessionId },
      include: { provider: true },
    });

    if (!session) {
      throw new Error('SSO session not found');
    }

    if (session.expiresAt < new Date()) {
      throw new Error('SSO session expired');
    }

    return session;
  }

  /**
   * Update SSO session with authentication data
   */
  async updateSsoSession(
    sessionId: string,
    data: {
      status?: string;
      userId?: string;
      userInfo?: any;
      authorizationCode?: string;
      accessToken?: string;
      refreshToken?: string;
      idToken?: string;
      samlResponse?: string;
      errorCode?: string;
      errorMessage?: string;
    }
  ) {
    return this.prisma.ssoSession.update({
      where: { sessionId },
      data: {
        ...data,
        lastAccessedAt: new Date(),
        authenticatedAt: data.status === 'authenticated' ? new Date() : undefined,
      },
    });
  }

  /**
   * Clean up expired SSO sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    const result = await this.prisma.ssoSession.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    return result.count;
  }

  // Private helper methods

  private encryptSensitiveFields(data: any): any {
    const encrypted = { ...data };

    if (data.clientSecret) {
      // In production, use proper encryption
      // For now, we'll just store it (should be encrypted in real implementation)
      encrypted.clientSecret = data.clientSecret;
    }

    return encrypted;
  }

  private toResponseFormat(provider: any): SsoProviderResponse {
    return {
      id: provider.id,
      name: provider.name,
      type: provider.type,
      domain: provider.domain,
      isActive: provider.isActive,
      isDefault: provider.isDefault,
      autoCreateUsers: provider.autoCreateUsers,
      requireMfa: provider.requireMfa,
      organizationId: provider.organizationId,
      createdAt: provider.createdAt.toISOString(),
      updatedAt: provider.updatedAt.toISOString(),
      lastUsedAt: provider.lastUsedAt?.toISOString() || null,
    };
  }

  private async testSamlProvider(provider: any): Promise<{ success: boolean; message: string }> {
    // Basic SAML configuration validation
    const requiredFields = ['entityId', 'ssoUrl', 'certificate'];
    const missingFields = requiredFields.filter(field => !provider[field]);

    if (missingFields.length > 0) {
      return {
        success: false,
        message: `Missing required SAML fields: ${missingFields.join(', ')}`,
      };
    }

    // Validate certificate format (basic check)
    if (!provider.certificate.includes('BEGIN CERTIFICATE')) {
      return {
        success: false,
        message: 'Invalid certificate format',
      };
    }

    // Validate URLs
    try {
      new URL(provider.ssoUrl);
      if (provider.sloUrl) {
        new URL(provider.sloUrl);
      }
    } catch {
      return {
        success: false,
        message: 'Invalid SSO or SLO URL format',
      };
    }

    return {
      success: true,
      message: 'SAML provider configuration is valid',
    };
  }

  private async testOAuth2Provider(provider: any): Promise<{ success: boolean; message: string }> {
    // Basic OAuth2 configuration validation
    const requiredFields = ['clientId', 'clientSecret', 'authorizeUrl', 'tokenUrl'];
    const missingFields = requiredFields.filter(field => !provider[field]);

    if (missingFields.length > 0) {
      return {
        success: false,
        message: `Missing required OAuth2 fields: ${missingFields.join(', ')}`,
      };
    }

    // Validate URLs
    try {
      new URL(provider.authorizeUrl);
      new URL(provider.tokenUrl);
      if (provider.userinfoUrl) {
        new URL(provider.userinfoUrl);
      }
    } catch {
      return {
        success: false,
        message: 'Invalid OAuth2 URL format',
      };
    }

    return {
      success: true,
      message: 'OAuth2 provider configuration is valid',
    };
  }

  private async testOidcProvider(provider: any): Promise<{ success: boolean; message: string }> {
    // Basic OIDC configuration validation
    const requiredFields = ['clientId', 'clientSecret', 'issuer'];
    const missingFields = requiredFields.filter(field => !provider[field]);

    if (missingFields.length > 0) {
      return {
        success: false,
        message: `Missing required OIDC fields: ${missingFields.join(', ')}`,
      };
    }

    // Validate issuer URL
    try {
      new URL(provider.issuer);
    } catch {
      return {
        success: false,
        message: 'Invalid issuer URL format',
      };
    }

    // Validate scopes include 'openid'
    if (!provider.scopes?.includes('openid')) {
      return {
        success: false,
        message: 'OIDC provider must include "openid" scope',
      };
    }

    return {
      success: true,
      message: 'OIDC provider configuration is valid',
    };
  }
}