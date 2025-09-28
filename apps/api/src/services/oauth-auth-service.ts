import * as openidClient from 'openid-client';

const { Client, Issuer, generators } = openidClient;
type UserinfoResponse = any; // Fallback type
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { logger } from '@/lib/logger.js';
import { SsoProviderResponse, SSO_PROVIDER_TYPES } from '@/lib/schemas/sso.js';

// ============================================================================
// OAUTH 2.0 / OPENID CONNECT AUTHENTICATION SERVICE
// ============================================================================

export interface OAuthAuthRequest {
  providerId: string;
  redirectUrl?: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface OAuthAuthResponse {
  sessionId: string;
  redirectUrl: string;
  state: string;
  codeVerifier?: string; // For PKCE
}

export interface OAuthCallbackData {
  sessionId: string;
  code: string;
  state: string;
  error?: string;
  errorDescription?: string;
}

export interface OAuthUserData {
  sub: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  attributes: Record<string, any>;
}

export interface OAuthAuthResult {
  success: boolean;
  user?: OAuthUserData;
  error?: string;
  message: string;
}

export class OAuthAuthService {
  private prisma: PrismaClient;
  private clientCache = new Map<string, Client>();

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Initiate OAuth 2.0/OIDC authentication request
   */
  async initiateOAuthAuth(request: OAuthAuthRequest): Promise<OAuthAuthResponse> {
    try {
      // Get SSO provider configuration
      const provider = await this.prisma.ssoProvider.findFirst({
        where: {
          id: request.providerId,
          type: { in: [SSO_PROVIDER_TYPES.OAUTH2, SSO_PROVIDER_TYPES.OPENID_CONNECT] },
          isActive: true,
        },
      });

      if (!provider) {
        throw new Error('OAuth provider not found or inactive');
      }

      // Get or create OAuth client
      const client = await this.getOAuthClient(provider);

      // Generate session for tracking
      const sessionId = crypto.randomUUID();
      const state = generators.state();
      let codeVerifier: string | undefined;

      // Use PKCE for enhanced security (especially for public clients)
      if (provider.type === SSO_PROVIDER_TYPES.OPENID_CONNECT) {
        codeVerifier = generators.codeVerifier();
      }

      // Create SSO session record
      await this.prisma.ssoSession.create({
        data: {
          sessionId,
          providerId: request.providerId,
          redirectUrl: request.redirectUrl,
          userAgent: request.userAgent,
          ipAddress: request.ipAddress,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
          status: 'pending',
          // Store OAuth-specific data
          authorizationCode: state, // Temporarily store state here
          accessToken: codeVerifier, // Temporarily store code verifier here
        },
      });

      // Build authorization URL
      const callbackUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/sso/callback/oauth`;

      let authorizationUrl: string;

      if (provider.type === SSO_PROVIDER_TYPES.OPENID_CONNECT && codeVerifier) {
        // OpenID Connect with PKCE
        const codeChallenge = generators.codeChallenge(codeVerifier);
        authorizationUrl = client.authorizationUrl({
          scope: provider.scopes?.join(' ') || 'openid profile email',
          state,
          redirect_uri: callbackUrl,
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
        });
      } else {
        // Regular OAuth 2.0
        authorizationUrl = client.authorizationUrl({
          scope: provider.scopes?.join(' ') || 'profile email',
          state,
          redirect_uri: callbackUrl,
        });
      }

      logger.info('OAuth authentication initiated', {
        sessionId,
        providerId: request.providerId,
        providerName: provider.name,
        providerType: provider.type,
      });

      return {
        sessionId,
        redirectUrl: authorizationUrl,
        state,
        codeVerifier,
      };
    } catch (error) {
      logger.error('Failed to initiate OAuth authentication', {
        providerId: request.providerId,
        error: error instanceof Error ? error.message : error,
      });
      throw new Error('OAuth authentication initiation failed');
    }
  }

  /**
   * Process OAuth callback response
   */
  async processOAuthCallback(data: OAuthCallbackData): Promise<OAuthAuthResult> {
    try {
      if (data.error) {
        throw new Error(`OAuth error: ${data.error} - ${data.errorDescription || 'Unknown error'}`);
      }

      // Get SSO session
      const session = await this.prisma.ssoSession.findUnique({
        where: { sessionId: data.sessionId },
        include: { provider: true },
      });

      if (!session) {
        throw new Error('SSO session not found');
      }

      if (session.expiresAt < new Date()) {
        throw new Error('SSO session expired');
      }

      if (!session.provider || !([SSO_PROVIDER_TYPES.OAUTH2, SSO_PROVIDER_TYPES.OPENID_CONNECT].includes(session.provider.type as any))) {
        throw new Error('Invalid provider type for OAuth callback');
      }

      // Verify state parameter
      const storedState = session.authorizationCode; // We stored state here temporarily
      if (data.state !== storedState) {
        throw new Error('Invalid state parameter - possible CSRF attack');
      }

      // Get OAuth client
      const client = await this.getOAuthClient(session.provider);

      // Exchange authorization code for tokens
      const callbackUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/sso/callback/oauth`;
      const codeVerifier = session.accessToken; // We stored code verifier here temporarily

      let tokenSet;
      try {
        const tokenParams: any = {
          code: data.code,
          redirect_uri: callbackUrl,
        };

        // Add PKCE verifier for OIDC
        if (session.provider.type === SSO_PROVIDER_TYPES.OPENID_CONNECT && codeVerifier) {
          tokenParams.code_verifier = codeVerifier;
        }

        tokenSet = await client.callback(callbackUrl, { code: data.code, state: data.state }, {
          code_verifier: codeVerifier,
        });
      } catch (tokenError) {
        logger.error('Token exchange failed', {
          sessionId: data.sessionId,
          error: tokenError instanceof Error ? tokenError.message : tokenError,
        });
        throw new Error('Failed to exchange authorization code for tokens');
      }

      // Get user information
      let userInfo: UserinfoResponse | any;

      if (session.provider.type === SSO_PROVIDER_TYPES.OPENID_CONNECT) {
        // Use userinfo endpoint for OIDC
        userInfo = await client.userinfo(tokenSet.access_token!);
      } else {
        // For OAuth 2.0, try to get user info from userinfo URL if available
        if (session.provider.userinfoUrl && tokenSet.access_token) {
          try {
            const response = await fetch(session.provider.userinfoUrl, {
              headers: {
                'Authorization': `Bearer ${tokenSet.access_token}`,
                'Accept': 'application/json',
              },
            });

            if (response.ok) {
              userInfo = await response.json();
            } else {
              throw new Error(`Userinfo request failed: ${response.status}`);
            }
          } catch (fetchError) {
            logger.warn('Failed to fetch user info from userinfo URL', {
              error: fetchError instanceof Error ? fetchError.message : fetchError,
            });
            // Fall back to token claims if available
            userInfo = tokenSet.claims() || {};
          }
        } else {
          // Use token claims as fallback
          userInfo = tokenSet.claims() || {};
        }
      }

      // Extract user data from OAuth/OIDC response
      const userData = this.extractUserData(userInfo, tokenSet, session.provider);

      // Update session with success
      await this.prisma.ssoSession.update({
        where: { sessionId: data.sessionId },
        data: {
          status: 'authenticated',
          userInfo: userData,
          authenticatedAt: new Date(),
          accessToken: this.hashToken(tokenSet.access_token), // Store hashed for security
          refreshToken: tokenSet.refresh_token ? this.hashToken(tokenSet.refresh_token) : null,
          idToken: tokenSet.id_token ? this.hashToken(tokenSet.id_token) : null,
        },
      });

      logger.info('OAuth authentication successful', {
        sessionId: data.sessionId,
        providerId: session.providerId,
        email: userData.email,
        providerType: session.provider.type,
      });

      return {
        success: true,
        user: userData,
        message: 'OAuth authentication successful',
      };
    } catch (error) {
      logger.error('OAuth callback processing failed', {
        sessionId: data.sessionId,
        error: error instanceof Error ? error.message : error,
      });

      // Update session with error
      if (data.sessionId) {
        try {
          await this.prisma.ssoSession.update({
            where: { sessionId: data.sessionId },
            data: {
              status: 'failed',
              errorCode: 'OAUTH_VALIDATION_FAILED',
              errorMessage: error instanceof Error ? error.message : 'Unknown error',
            },
          });
        } catch (updateError) {
          logger.error('Failed to update session with error', { updateError });
        }
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'OAuth authentication failed',
        message: 'OAuth authentication failed',
      };
    }
  }

  /**
   * Get or create OAuth client for provider
   */
  private async getOAuthClient(provider: SsoProviderResponse | any): Promise<Client> {
    const cacheKey = `${provider.id}-${provider.type}`;

    if (this.clientCache.has(cacheKey)) {
      return this.clientCache.get(cacheKey)!;
    }

    try {
      let client: Client;

      if (provider.type === SSO_PROVIDER_TYPES.OPENID_CONNECT) {
        // Discover OIDC configuration
        const issuer = await Issuer.discover(provider.issuer);
        client = new issuer.Client({
          client_id: provider.clientId,
          client_secret: provider.clientSecret,
          response_types: ['code'],
          grant_types: ['authorization_code'],
        });
      } else {
        // Manual OAuth 2.0 configuration
        const issuer = new Issuer({
          issuer: provider.issuer || provider.authorizeUrl,
          authorization_endpoint: provider.authorizeUrl,
          token_endpoint: provider.tokenUrl,
          userinfo_endpoint: provider.userinfoUrl,
          jwks_uri: provider.jwksUrl,
        });

        client = new issuer.Client({
          client_id: provider.clientId,
          client_secret: provider.clientSecret,
          response_types: ['code'],
          grant_types: ['authorization_code'],
        });
      }

      // Cache the client
      this.clientCache.set(cacheKey, client);

      return client;
    } catch (error) {
      logger.error('Failed to create OAuth client', {
        providerId: provider.id,
        providerType: provider.type,
        error: error instanceof Error ? error.message : error,
      });
      throw new Error('Failed to initialize OAuth client');
    }
  }

  /**
   * Extract user data from OAuth/OIDC response
   */
  private extractUserData(userInfo: any, tokenSet: any, provider: any): OAuthUserData {
    const attributeMapping = provider.attributeMapping || {};
    const roleMapping = provider.roleMapping || {};

    // Extract basic attributes based on OAuth/OIDC standards
    const sub = userInfo.sub || userInfo.id || userInfo.user_id;
    const email = this.getAttributeValue(userInfo, attributeMapping.email || 'email') ||
                 this.getAttributeValue(userInfo, 'email_address') ||
                 this.getAttributeValue(userInfo, 'mail');

    const firstName = this.getAttributeValue(userInfo, attributeMapping.firstName || 'given_name') ||
                     this.getAttributeValue(userInfo, 'first_name') ||
                     this.getAttributeValue(userInfo, 'name')?.split(' ')[0];

    const lastName = this.getAttributeValue(userInfo, attributeMapping.lastName || 'family_name') ||
                    this.getAttributeValue(userInfo, 'last_name') ||
                    this.getAttributeValue(userInfo, 'name')?.split(' ').slice(1).join(' ');

    // Extract and map role
    const roleAttribute = this.getAttributeValue(userInfo, attributeMapping.role || 'role') ||
                         this.getAttributeValue(userInfo, 'roles') ||
                         this.getAttributeValue(userInfo, 'groups') ||
                         this.getAttributeValue(userInfo, 'authorities');

    const role = this.mapRole(roleAttribute, roleMapping) || provider.defaultRole || 'USER';

    // Include token claims for additional context
    const tokenClaims = tokenSet.claims?.() || {};

    return {
      sub,
      email,
      firstName,
      lastName,
      role,
      attributes: {
        ...userInfo,
        ...tokenClaims,
        provider_type: provider.type,
        provider_id: provider.id,
      },
    };
  }

  /**
   * Get attribute value from user info object
   */
  private getAttributeValue(userInfo: any, attributeName: string): string | undefined {
    if (!userInfo || !attributeName) return undefined;

    // Direct property access
    if (userInfo[attributeName]) {
      const value = userInfo[attributeName];
      return Array.isArray(value) ? value[0] : value;
    }

    // Check case-insensitive
    const keys = Object.keys(userInfo);
    const matchingKey = keys.find(key => key.toLowerCase() === attributeName.toLowerCase());
    if (matchingKey) {
      const value = userInfo[matchingKey];
      return Array.isArray(value) ? value[0] : value;
    }

    return undefined;
  }

  /**
   * Map OAuth role to application role
   */
  private mapRole(oauthRole: string | string[] | undefined, roleMapping: Record<string, string>): string | undefined {
    if (!oauthRole) return undefined;

    const roles = Array.isArray(oauthRole) ? oauthRole : [oauthRole];

    for (const role of roles) {
      // Direct mapping
      if (roleMapping[role]) {
        return roleMapping[role];
      }

      // Case-insensitive mapping
      const lowerRole = role.toLowerCase();
      const mappingKeys = Object.keys(roleMapping);
      const matchingKey = mappingKeys.find(key => key.toLowerCase() === lowerRole);

      if (matchingKey) {
        return roleMapping[matchingKey];
      }
    }

    return undefined;
  }

  /**
   * Hash sensitive tokens for storage
   */
  private hashToken(token?: string): string | undefined {
    if (!token) return undefined;

    // In production, use proper encryption
    // For now, we'll hash it for security
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Validate OAuth provider configuration
   */
  async validateProviderConfig(providerId: string): Promise<{ valid: boolean; errors: string[] }> {
    try {
      const provider = await this.prisma.ssoProvider.findUnique({
        where: { id: providerId },
      });

      if (!provider) {
        return { valid: false, errors: ['Provider not found'] };
      }

      const errors: string[] = [];

      if (![SSO_PROVIDER_TYPES.OAUTH2, SSO_PROVIDER_TYPES.OPENID_CONNECT].includes(provider.type as any)) {
        errors.push('Provider is not an OAuth 2.0 or OpenID Connect provider');
      }

      if (!provider.clientId) {
        errors.push('Client ID is required');
      }

      if (!provider.clientSecret) {
        errors.push('Client secret is required');
      }

      if (provider.type === SSO_PROVIDER_TYPES.OPENID_CONNECT) {
        if (!provider.issuer) {
          errors.push('Issuer URL is required for OpenID Connect');
        } else {
          try {
            new URL(provider.issuer);
          } catch {
            errors.push('Invalid issuer URL format');
          }
        }

        if (!provider.scopes?.includes('openid')) {
          errors.push('OpenID Connect provider must include "openid" scope');
        }
      } else {
        // OAuth 2.0 validation
        if (!provider.authorizeUrl) {
          errors.push('Authorization URL is required for OAuth 2.0');
        } else {
          try {
            new URL(provider.authorizeUrl);
          } catch {
            errors.push('Invalid authorization URL format');
          }
        }

        if (!provider.tokenUrl) {
          errors.push('Token URL is required for OAuth 2.0');
        } else {
          try {
            new URL(provider.tokenUrl);
          } catch {
            errors.push('Invalid token URL format');
          }
        }
      }

      return { valid: errors.length === 0, errors };
    } catch (error) {
      logger.error('Failed to validate OAuth provider config', {
        providerId,
        error: error instanceof Error ? error.message : error,
      });
      return { valid: false, errors: ['Validation failed'] };
    }
  }

  /**
   * Clear client cache (useful for testing or when provider config changes)
   */
  clearClientCache(providerId?: string): void {
    if (providerId) {
      // Clear specific provider clients
      const keysToDelete = Array.from(this.clientCache.keys()).filter(key => key.startsWith(`${providerId}-`));
      keysToDelete.forEach(key => this.clientCache.delete(key));
    } else {
      // Clear all clients
      this.clientCache.clear();
    }
  }
}

export default OAuthAuthService;