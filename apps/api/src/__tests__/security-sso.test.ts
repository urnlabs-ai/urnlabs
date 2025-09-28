import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { build } from '../server.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

/**
 * SSO Security Tests
 *
 * Comprehensive security testing for Single Sign-On integration including:
 * - SAML assertion manipulation
 * - OAuth token theft and replay attacks
 * - Provider spoofing and man-in-the-middle attacks
 * - Session fixation in SSO flows
 * - Cross-site request forgery in SSO callbacks
 * - JWT token manipulation in OAuth flows
 */
describe('SSO Security Tests', () => {
  let app: FastifyInstance;
  let validSamlAssertion: string;
  let validOAuthToken: string;
  let maliciousOAuthToken: string;

  beforeAll(async () => {
    app = build({
      logger: false,
      disableRequestLogging: true,
    });

    await app.ready();

    // Generate valid SAML assertion for testing
    validSamlAssertion = generateValidSamlAssertion();
    validOAuthToken = generateValidOAuthToken();
    maliciousOAuthToken = generateMaliciousOAuthToken();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    setupSSOUserMocks();
  });

  function setupSSOUserMocks() {
    // Mock SSO user lookup
    vi.mocked(app.prisma.user.findUnique).mockImplementation(async ({ where }) => {
      if (where.email === 'sso@example.com') {
        return {
          id: 'sso-user-123',
          email: 'sso@example.com',
          role: 'user',
          isActive: true,
          organizationId: 'sso-org',
          lastLoginAt: new Date(),
          lastActivityAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          passwordHash: null, // SSO users don't have passwords
          firstName: 'SSO',
          lastName: 'User',
          profilePicture: null,
          timezone: 'UTC',
          language: 'en',
          emailVerified: true,
          emailVerifiedAt: new Date(),
          twoFactorEnabled: false,
          twoFactorSecret: null,
          backupCodes: null,
          lastPasswordChange: null,
          loginAttempts: 0,
          lockedUntil: null,
          resetPasswordToken: null,
          resetPasswordExpires: null,
        };
      }
      return null;
    });

    // Mock SSO provider configuration
    vi.mocked(app.prisma.ssoProvider.findUnique).mockImplementation(async ({ where }) => {
      if (where.id === 'test-saml-provider') {
        return {
          id: 'test-saml-provider',
          name: 'Test SAML Provider',
          type: 'SAML',
          config: {
            entityId: 'https://test-provider.example.com',
            ssoUrl: 'https://test-provider.example.com/sso',
            certificate: 'test-certificate',
            attributeMapping: {
              email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
              firstName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
              lastName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
            },
          },
          organizationId: 'sso-org',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      } else if (where.id === 'test-oauth-provider') {
        return {
          id: 'test-oauth-provider',
          name: 'Test OAuth Provider',
          type: 'OAUTH',
          config: {
            clientId: 'test-client-id',
            clientSecret: 'test-client-secret',
            authorizeUrl: 'https://oauth-provider.example.com/authorize',
            tokenUrl: 'https://oauth-provider.example.com/token',
            userInfoUrl: 'https://oauth-provider.example.com/userinfo',
            scopes: ['openid', 'email', 'profile'],
          },
          organizationId: 'sso-org',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
      return null;
    });
  }

  function generateValidSamlAssertion(): string {
    const assertion = {
      'saml2:Assertion': {
        '@_ID': 'test-assertion-id',
        '@_IssueInstant': new Date().toISOString(),
        '@_Version': '2.0',
        'saml2:Issuer': 'https://test-provider.example.com',
        'saml2:Subject': {
          'saml2:NameID': 'sso@example.com',
        },
        'saml2:AttributeStatement': {
          'saml2:Attribute': [
            {
              '@_Name': 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
              'saml2:AttributeValue': 'sso@example.com',
            },
            {
              '@_Name': 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
              'saml2:AttributeValue': 'SSO',
            },
            {
              '@_Name': 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
              'saml2:AttributeValue': 'User',
            },
          ],
        },
      },
    };

    const builder = new XMLBuilder({ ignoreAttributes: false });
    return builder.build(assertion);
  }

  function generateValidOAuthToken(): string {
    return jwt.sign(
      {
        sub: 'sso-user-123',
        email: 'sso@example.com',
        given_name: 'SSO',
        family_name: 'User',
        iss: 'https://oauth-provider.example.com',
        aud: 'test-client-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
      },
      'oauth-provider-secret',
      { algorithm: 'HS256' }
    );
  }

  function generateMaliciousOAuthToken(): string {
    return jwt.sign(
      {
        sub: 'admin-user',
        email: 'admin@evil.com',
        given_name: 'Evil',
        family_name: 'Admin',
        iss: 'https://malicious-provider.com',
        aud: 'test-client-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        role: 'admin', // Privilege escalation attempt
      },
      'malicious-secret',
      { algorithm: 'HS256' }
    );
  }

  describe('SAML Security Tests', () => {
    it('should validate SAML assertion signatures', async () => {
      // Test with unsigned assertion
      const unsignedAssertion = validSamlAssertion.replace(
        '<saml2:Assertion',
        '<saml2:Assertion xmlns:saml2="urn:oasis:names:tc:SAML:2.0:assertion"'
      );

      const response = await app.inject({
        method: 'POST',
        url: '/sso/saml/callback',
        payload: {
          SAMLResponse: Buffer.from(unsignedAssertion).toString('base64'),
          RelayState: 'test-state',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: 'INVALID_SAML_RESPONSE',
        message: 'SAML assertion signature validation failed',
      });
    });

    it('should prevent SAML assertion replay attacks', async () => {
      const replayAssertion = validSamlAssertion.replace(
        '@_ID="test-assertion-id"',
        '@_ID="replayed-assertion-id"'
      );

      // Mock assertion already processed
      vi.mocked(app.prisma.ssoAssertion.findUnique).mockResolvedValueOnce({
        id: 'assertion-1',
        assertionId: 'replayed-assertion-id',
        providerId: 'test-saml-provider',
        userId: 'sso-user-123',
        processedAt: new Date(Date.now() - 60000), // 1 minute ago
        expiresAt: new Date(Date.now() + 3600000),
        createdAt: new Date(),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/sso/saml/callback',
        payload: {
          SAMLResponse: Buffer.from(replayAssertion).toString('base64'),
          RelayState: 'test-state',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: 'ASSERTION_ALREADY_PROCESSED',
        message: 'SAML assertion has already been processed',
      });
    });

    it('should validate SAML assertion timestamps', async () => {
      // Create expired assertion
      const expiredAssertion = validSamlAssertion.replace(
        new Date().toISOString(),
        new Date(Date.now() - 3600000).toISOString() // 1 hour ago
      );

      const response = await app.inject({
        method: 'POST',
        url: '/sso/saml/callback',
        payload: {
          SAMLResponse: Buffer.from(expiredAssertion).toString('base64'),
          RelayState: 'test-state',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: 'ASSERTION_EXPIRED',
        message: 'SAML assertion has expired',
      });
    });

    it('should prevent SAML assertion manipulation', async () => {
      // Modify assertion to escalate privileges
      const maliciousAssertion = validSamlAssertion
        .replace('sso@example.com', 'admin@example.com')
        .replace('<saml2:AttributeValue>User</saml2:AttributeValue>', '<saml2:AttributeValue>Admin</saml2:AttributeValue>');

      const response = await app.inject({
        method: 'POST',
        url: '/sso/saml/callback',
        payload: {
          SAMLResponse: Buffer.from(maliciousAssertion).toString('base64'),
          RelayState: 'test-state',
        },
      });

      // Should fail due to signature validation
      expect(response.statusCode).toBe(400);
    });

    it('should validate SAML issuer authenticity', async () => {
      // Create assertion from unauthorized issuer
      const fakeIssuerAssertion = validSamlAssertion.replace(
        'https://test-provider.example.com',
        'https://malicious-provider.com'
      );

      const response = await app.inject({
        method: 'POST',
        url: '/sso/saml/callback',
        payload: {
          SAMLResponse: Buffer.from(fakeIssuerAssertion).toString('base64'),
          RelayState: 'test-state',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: 'UNKNOWN_ISSUER',
        message: 'SAML assertion from unknown or unauthorized issuer',
      });
    });

    it('should prevent XML external entity (XXE) attacks', async () => {
      const xxeAssertion = `<?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE foo [
          <!ENTITY xxe SYSTEM "file:///etc/passwd">
        ]>
        <saml2:Assertion xmlns:saml2="urn:oasis:names:tc:SAML:2.0:assertion">
          <saml2:Issuer>&xxe;</saml2:Issuer>
          <saml2:Subject>
            <saml2:NameID>sso@example.com</saml2:NameID>
          </saml2:Subject>
        </saml2:Assertion>`;

      const response = await app.inject({
        method: 'POST',
        url: '/sso/saml/callback',
        payload: {
          SAMLResponse: Buffer.from(xxeAssertion).toString('base64'),
          RelayState: 'test-state',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('INVALID_SAML_FORMAT');
    });
  });

  describe('OAuth Security Tests', () => {
    it('should validate OAuth state parameter (CSRF protection)', async () => {
      // Missing state parameter
      const response1 = await app.inject({
        method: 'GET',
        url: '/sso/oauth/callback?code=test-code',
      });

      expect(response1.statusCode).toBe(400);
      expect(response1.json()).toMatchObject({
        error: 'MISSING_STATE',
        message: 'State parameter is required',
      });

      // Invalid state parameter
      const response2 = await app.inject({
        method: 'GET',
        url: '/sso/oauth/callback?code=test-code&state=invalid-state',
      });

      expect(response2.statusCode).toBe(400);
      expect(response2.json()).toMatchObject({
        error: 'INVALID_STATE',
        message: 'Invalid state parameter',
      });
    });

    it('should prevent OAuth authorization code replay', async () => {
      const authCode = 'test-auth-code-123';

      // Mock code already used
      vi.mocked(app.prisma.oauthCodeExchange.findUnique).mockResolvedValueOnce({
        id: 'exchange-1',
        code: authCode,
        providerId: 'test-oauth-provider',
        userId: 'sso-user-123',
        exchangedAt: new Date(Date.now() - 60000),
        expiresAt: new Date(Date.now() + 3600000),
        createdAt: new Date(),
      });

      const response = await app.inject({
        method: 'GET',
        url: `/sso/oauth/callback?code=${authCode}&state=valid-state`,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: 'CODE_ALREADY_USED',
        message: 'Authorization code has already been exchanged',
      });
    });

    it('should validate OAuth token issuer and audience', async () => {
      // Mock token exchange with malicious token
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: maliciousOAuthToken,
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/sso/oauth/callback?code=test-code&state=valid-state',
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: 'INVALID_TOKEN_ISSUER',
        message: 'Token from unauthorized issuer',
      });
    });

    it('should prevent OAuth token manipulation', async () => {
      // Create token with modified claims
      const modifiedToken = jwt.sign(
        {
          sub: 'sso-user-123',
          email: 'sso@example.com',
          given_name: 'SSO',
          family_name: 'User',
          iss: 'https://oauth-provider.example.com',
          aud: 'test-client-id',
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000),
          role: 'admin', // Privilege escalation attempt
          permissions: ['admin:*'], // Additional malicious claims
        },
        'different-secret', // Wrong signing key
        { algorithm: 'HS256' }
      );

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: modifiedToken,
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/sso/oauth/callback?code=test-code&state=valid-state',
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('TOKEN_VERIFICATION_FAILED');
    });

    it('should validate OAuth scope permissions', async () => {
      // Token with limited scopes
      const limitedScopeToken = jwt.sign(
        {
          sub: 'sso-user-123',
          email: 'sso@example.com',
          iss: 'https://oauth-provider.example.com',
          aud: 'test-client-id',
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000),
          scope: 'email', // Missing 'profile' scope
        },
        'oauth-provider-secret',
        { algorithm: 'HS256' }
      );

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: limitedScopeToken,
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/sso/oauth/callback?code=test-code&state=valid-state',
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: 'INSUFFICIENT_SCOPE',
        message: 'Token does not have required scopes',
      });
    });
  });

  describe('SSO Session Security', () => {
    it('should prevent session fixation in SSO flows', async () => {
      // Initiate SSO login
      const initiateResponse = await app.inject({
        method: 'GET',
        url: '/sso/initiate/test-saml-provider',
      });

      expect(initiateResponse.statusCode).toBe(302);
      const location = initiateResponse.headers.location as string;
      const urlParams = new URL(location);
      const relayState = urlParams.searchParams.get('RelayState');

      // Complete SSO login
      const callbackResponse = await app.inject({
        method: 'POST',
        url: '/sso/saml/callback',
        payload: {
          SAMLResponse: Buffer.from(validSamlAssertion).toString('base64'),
          RelayState: relayState,
        },
      });

      expect(callbackResponse.statusCode).toBe(200);
      const { sessionToken } = callbackResponse.json();

      // Old session should be invalidated
      const oldSessionResponse = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: `Bearer ${relayState}`, // Using old relay state as token
        },
      });

      expect(oldSessionResponse.statusCode).toBe(401);

      // New session should work
      const newSessionResponse = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
      });

      expect(newSessionResponse.statusCode).toBe(200);
    });

    it('should handle concurrent SSO login attempts', async () => {
      const concurrentRequests = Array.from({ length: 5 }, () =>
        app.inject({
          method: 'POST',
          url: '/sso/saml/callback',
          payload: {
            SAMLResponse: Buffer.from(validSamlAssertion).toString('base64'),
            RelayState: 'test-concurrent-state',
          },
        })
      );

      const responses = await Promise.all(concurrentRequests);

      // Only one should succeed to prevent session duplication
      const successfulResponses = responses.filter(r => r.statusCode === 200);
      expect(successfulResponses.length).toBeLessThanOrEqual(1);
    });

    it('should validate SSO session timeouts', async () => {
      // Mock expired SSO session
      vi.mocked(app.prisma.ssoSession.findUnique).mockResolvedValueOnce({
        id: 'sso-session-1',
        providerId: 'test-saml-provider',
        userId: 'sso-user-123',
        sessionId: 'test-session-id',
        expiresAt: new Date(Date.now() - 3600000), // Expired 1 hour ago
        createdAt: new Date(),
        lastAccessedAt: new Date(),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: 'Bearer expired-sso-token',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        error: 'SESSION_EXPIRED',
        message: 'SSO session has expired',
      });
    });
  });

  describe('Cross-Provider Security', () => {
    it('should prevent provider confusion attacks', async () => {
      // Attempt to use SAML assertion against OAuth endpoint
      const response1 = await app.inject({
        method: 'POST',
        url: '/sso/oauth/callback',
        payload: {
          SAMLResponse: Buffer.from(validSamlAssertion).toString('base64'),
        },
      });

      expect(response1.statusCode).toBe(400);

      // Attempt to use OAuth token against SAML endpoint
      const response2 = await app.inject({
        method: 'POST',
        url: '/sso/saml/callback',
        payload: {
          access_token: validOAuthToken,
        },
      });

      expect(response2.statusCode).toBe(400);
    });

    it('should validate provider organization boundaries', async () => {
      // Mock provider from different organization
      vi.mocked(app.prisma.ssoProvider.findUnique).mockResolvedValueOnce({
        id: 'other-org-provider',
        name: 'Other Org Provider',
        type: 'SAML',
        config: {},
        organizationId: 'other-org', // Different organization
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/sso/initiate/other-org-provider',
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        error: 'PROVIDER_NOT_ACCESSIBLE',
        message: 'SSO provider is not accessible to your organization',
      });
    });

    it('should prevent SSO provider spoofing', async () => {
      // Attempt to create malicious provider configuration
      const maliciousProviderConfig = {
        name: 'Legitimate Provider',
        type: 'SAML',
        config: {
          entityId: 'https://legitimate-provider.com',
          ssoUrl: 'https://malicious-attacker.com/sso',
          certificate: 'malicious-certificate',
        },
      };

      const response = await app.inject({
        method: 'POST',
        url: '/admin/sso-providers',
        headers: {
          authorization: 'Bearer admin-token',
        },
        payload: maliciousProviderConfig,
      });

      // Should validate provider authenticity
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('PROVIDER_VERIFICATION_FAILED');
    });
  });

  describe('SSO Logout Security', () => {
    it('should implement secure SSO logout (SLO)', async () => {
      const logoutResponse = await app.inject({
        method: 'POST',
        url: '/sso/logout',
        headers: {
          authorization: 'Bearer sso-session-token',
        },
        payload: {
          providerId: 'test-saml-provider',
        },
      });

      expect(logoutResponse.statusCode).toBe(200);
      expect(logoutResponse.json()).toMatchObject({
        logoutUrl: expect.stringContaining('https://test-provider.example.com'),
        sessionTerminated: true,
      });
    });

    it('should handle SSO logout callback securely', async () => {
      const logoutRequest = `<?xml version="1.0" encoding="UTF-8"?>
        <samlp:LogoutRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol">
          <saml2:Issuer xmlns:saml2="urn:oasis:names:tc:SAML:2.0:assertion">
            https://test-provider.example.com
          </saml2:Issuer>
          <saml2:NameID xmlns:saml2="urn:oasis:names:tc:SAML:2.0:assertion">
            sso@example.com
          </saml2:NameID>
        </samlp:LogoutRequest>`;

      const response = await app.inject({
        method: 'POST',
        url: '/sso/saml/logout-callback',
        payload: {
          SAMLRequest: Buffer.from(logoutRequest).toString('base64'),
          RelayState: 'logout-state',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        message: 'Logout successful',
        allSessionsTerminated: true,
      });
    });

    it('should prevent logout CSRF attacks', async () => {
      // Attempt logout without proper state validation
      const response = await app.inject({
        method: 'POST',
        url: '/sso/logout',
        payload: {
          providerId: 'test-saml-provider',
          // Missing CSRF token or state validation
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        error: 'CSRF_TOKEN_MISSING',
        message: 'CSRF token is required for logout',
      });
    });
  });
});