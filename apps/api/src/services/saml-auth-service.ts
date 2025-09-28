import { SAML } from 'passport-saml';
import { parseString } from 'xml2js';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { logger } from '@/lib/logger.js';
import { SsoProviderResponse } from '@/lib/schemas/sso.js';

// ============================================================================
// SAML 2.0 AUTHENTICATION SERVICE
// ============================================================================

export interface SamlAuthRequest {
  providerId: string;
  redirectUrl?: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface SamlAuthResponse {
  sessionId: string;
  redirectUrl: string;
  samlRequest: string;
  relayState: string;
}

export interface SamlCallbackData {
  sessionId: string;
  samlResponse: string;
  relayState?: string;
}

export interface SamlUserData {
  nameId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  attributes: Record<string, any>;
}

export interface SamlAuthResult {
  success: boolean;
  user?: SamlUserData;
  error?: string;
  message: string;
}

export class SamlAuthService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Initiate SAML authentication request
   */
  async initiateSamlAuth(request: SamlAuthRequest): Promise<SamlAuthResponse> {
    try {
      // Get SSO provider configuration
      const provider = await this.prisma.ssoProvider.findFirst({
        where: {
          id: request.providerId,
          type: 'saml',
          isActive: true,
        },
      });

      if (!provider) {
        throw new Error('SAML provider not found or inactive');
      }

      // Create SAML configuration
      const samlConfig = this.createSamlConfig(provider);
      const saml = new SAML(samlConfig);

      // Generate session for tracking
      const sessionId = crypto.randomUUID();
      const relayState = this.encodeRelayState({
        sessionId,
        providerId: request.providerId,
        redirectUrl: request.redirectUrl,
      });

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
        },
      });

      // Generate SAML authentication request
      const samlRequest = await new Promise<string>((resolve, reject) => {
        saml.getAuthorizeRequest(relayState, (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        });
      });

      logger.info('SAML authentication initiated', {
        sessionId,
        providerId: request.providerId,
        providerName: provider.name,
      });

      return {
        sessionId,
        redirectUrl: provider.ssoUrl!,
        samlRequest,
        relayState,
      };
    } catch (error) {
      logger.error('Failed to initiate SAML authentication', {
        providerId: request.providerId,
        error: error instanceof Error ? error.message : error,
      });
      throw new Error('SAML authentication initiation failed');
    }
  }

  /**
   * Process SAML callback response
   */
  async processSamlCallback(data: SamlCallbackData): Promise<SamlAuthResult> {
    try {
      // Decode relay state to get session info
      const relayState = this.decodeRelayState(data.relayState || '');
      const sessionId = relayState?.sessionId || data.sessionId;

      if (!sessionId) {
        throw new Error('Invalid session ID in SAML callback');
      }

      // Get SSO session
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

      if (session.provider.type !== 'saml') {
        throw new Error('Invalid provider type for SAML callback');
      }

      // Create SAML configuration for verification
      const samlConfig = this.createSamlConfig(session.provider);
      const saml = new SAML(samlConfig);

      // Validate SAML response
      const samlResult = await new Promise<any>((resolve, reject) => {
        saml.validatePostResponse(data.samlResponse, (err, profile) => {
          if (err) {
            reject(err);
          } else {
            resolve(profile);
          }
        });
      });

      if (!samlResult) {
        throw new Error('SAML response validation failed');
      }

      // Extract user data from SAML response
      const userData = this.extractUserData(samlResult, session.provider);

      // Update session with success
      await this.prisma.ssoSession.update({
        where: { sessionId },
        data: {
          status: 'authenticated',
          userInfo: userData,
          authenticatedAt: new Date(),
        },
      });

      logger.info('SAML authentication successful', {
        sessionId,
        providerId: session.providerId,
        email: userData.email,
      });

      return {
        success: true,
        user: userData,
        message: 'SAML authentication successful',
      };
    } catch (error) {
      logger.error('SAML callback processing failed', {
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
              errorCode: 'SAML_VALIDATION_FAILED',
              errorMessage: error instanceof Error ? error.message : 'Unknown error',
            },
          });
        } catch (updateError) {
          logger.error('Failed to update session with error', { updateError });
        }
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'SAML authentication failed',
        message: 'SAML authentication failed',
      };
    }
  }

  /**
   * Create SAML configuration from SSO provider
   */
  private createSamlConfig(provider: SsoProviderResponse | any) {
    const callbackUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/sso/callback/saml`;

    return {
      entryPoint: provider.ssoUrl,
      issuer: provider.entityId || `urnlabs-saml-${provider.id}`,
      callbackUrl,
      cert: this.formatCertificate(provider.certificate),
      signatureAlgorithm: 'sha256',
      digestAlgorithm: 'sha256',
      acceptedClockSkewMs: -1,
      attributeConsumingServiceIndex: false,
      disableRequestedAuthnContext: true,
      forceAuthn: false,
      identifierFormat: provider.nameIdFormat || 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
      wantAssertionsSigned: provider.wantAssertionsSigned ?? true,
      wantAuthnResponseSigned: true,
      validateInResponseTo: false,
      requestIdExpirationPeriodMs: 28800000, // 8 hours
    };
  }

  /**
   * Format certificate for SAML validation
   */
  private formatCertificate(certificate: string): string {
    if (!certificate) {
      throw new Error('Certificate is required for SAML authentication');
    }

    // Remove existing headers/footers and whitespace
    let formatted = certificate
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\s/g, '');

    // Add proper headers
    return `-----BEGIN CERTIFICATE-----\n${formatted.match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE-----`;
  }

  /**
   * Encode relay state with session information
   */
  private encodeRelayState(data: any): string {
    try {
      const json = JSON.stringify(data);
      return Buffer.from(json).toString('base64url');
    } catch (error) {
      logger.error('Failed to encode relay state', { error });
      return '';
    }
  }

  /**
   * Decode relay state to get session information
   */
  private decodeRelayState(relayState: string): any {
    try {
      if (!relayState) return null;
      const json = Buffer.from(relayState, 'base64url').toString('utf-8');
      return JSON.parse(json);
    } catch (error) {
      logger.debug('Failed to decode relay state', { relayState, error });
      return null;
    }
  }

  /**
   * Extract user data from SAML response
   */
  private extractUserData(samlProfile: any, provider: any): SamlUserData {
    const attributeMapping = provider.attributeMapping || {};
    const roleMapping = provider.roleMapping || {};

    // Extract basic attributes
    const nameId = samlProfile.nameID || samlProfile.nameId;
    const email = this.getAttributeValue(samlProfile, attributeMapping.email || 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress')
                  || this.getAttributeValue(samlProfile, 'email')
                  || nameId;

    const firstName = this.getAttributeValue(samlProfile, attributeMapping.firstName || 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname')
                     || this.getAttributeValue(samlProfile, 'firstName')
                     || this.getAttributeValue(samlProfile, 'givenName');

    const lastName = this.getAttributeValue(samlProfile, attributeMapping.lastName || 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname')
                    || this.getAttributeValue(samlProfile, 'lastName')
                    || this.getAttributeValue(samlProfile, 'surname');

    // Extract and map role
    const roleAttribute = this.getAttributeValue(samlProfile, attributeMapping.role || 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role')
                         || this.getAttributeValue(samlProfile, 'role')
                         || this.getAttributeValue(samlProfile, 'groups');

    const role = this.mapRole(roleAttribute, roleMapping) || provider.defaultRole || 'USER';

    return {
      nameId,
      email,
      firstName,
      lastName,
      role,
      attributes: samlProfile,
    };
  }

  /**
   * Get attribute value from SAML profile
   */
  private getAttributeValue(profile: any, attributeName: string): string | undefined {
    if (!profile || !attributeName) return undefined;

    // Direct property access
    if (profile[attributeName]) {
      const value = profile[attributeName];
      return Array.isArray(value) ? value[0] : value;
    }

    // Check in attributes object
    if (profile.attributes && profile.attributes[attributeName]) {
      const value = profile.attributes[attributeName];
      return Array.isArray(value) ? value[0] : value;
    }

    // Check case-insensitive
    const keys = Object.keys(profile.attributes || {});
    const matchingKey = keys.find(key => key.toLowerCase() === attributeName.toLowerCase());
    if (matchingKey) {
      const value = profile.attributes[matchingKey];
      return Array.isArray(value) ? value[0] : value;
    }

    return undefined;
  }

  /**
   * Map SAML role to application role
   */
  private mapRole(samlRole: string | undefined, roleMapping: Record<string, string>): string | undefined {
    if (!samlRole) return undefined;

    // Direct mapping
    if (roleMapping[samlRole]) {
      return roleMapping[samlRole];
    }

    // Case-insensitive mapping
    const lowerSamlRole = samlRole.toLowerCase();
    const mappingKeys = Object.keys(roleMapping);
    const matchingKey = mappingKeys.find(key => key.toLowerCase() === lowerSamlRole);

    return matchingKey ? roleMapping[matchingKey] : undefined;
  }

  /**
   * Validate SAML provider configuration
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

      if (provider.type !== 'saml') {
        errors.push('Provider is not a SAML provider');
      }

      if (!provider.ssoUrl) {
        errors.push('SSO URL is required');
      } else {
        try {
          new URL(provider.ssoUrl);
        } catch {
          errors.push('Invalid SSO URL format');
        }
      }

      if (!provider.certificate) {
        errors.push('Certificate is required');
      } else {
        try {
          this.formatCertificate(provider.certificate);
        } catch {
          errors.push('Invalid certificate format');
        }
      }

      if (!provider.entityId) {
        errors.push('Entity ID is required');
      }

      return { valid: errors.length === 0, errors };
    } catch (error) {
      logger.error('Failed to validate SAML provider config', {
        providerId,
        error: error instanceof Error ? error.message : error,
      });
      return { valid: false, errors: ['Validation failed'] };
    }
  }
}

export default SamlAuthService;