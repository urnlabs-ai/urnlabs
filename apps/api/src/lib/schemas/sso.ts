import { z } from 'zod';

// ============================================================================
// SSO PROVIDER SCHEMAS
// ============================================================================

/**
 * Base SSO provider configuration schema
 */
export const SsoProviderConfigSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['saml', 'oauth2', 'openid-connect', 'ldap']),
  domain: z.string().email().optional().or(z.string().regex(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)).optional(),

  // Provider configuration
  entityId: z.string().optional(), // SAML Entity ID or OAuth Client ID
  ssoUrl: z.string().url().optional(), // SAML SSO URL or OAuth Authorization URL
  sloUrl: z.string().url().optional(), // SAML SLO URL
  certificate: z.string().optional(), // SAML Certificate or OAuth/OIDC Public Key
  issuer: z.string().url().optional(), // OAuth/OIDC Issuer URL

  // OAuth/OIDC specific
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  scopes: z.array(z.string()).default(['openid', 'profile', 'email']),
  authorizeUrl: z.string().url().optional(),
  tokenUrl: z.string().url().optional(),
  userinfoUrl: z.string().url().optional(),
  jwksUrl: z.string().url().optional(),

  // SAML specific
  signRequests: z.boolean().default(false),
  wantAssertionsSigned: z.boolean().default(true),
  nameIdFormat: z.string().optional(),

  // User mapping configuration
  attributeMapping: z.record(z.string()).default({}),
  roleMapping: z.record(z.string()).default({}),
  defaultRole: z.string().default('USER'),

  // Provider settings
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  autoCreateUsers: z.boolean().default(true),
  requireMfa: z.boolean().default(false),
});

/**
 * SAML-specific provider schema
 */
export const SamlProviderSchema = SsoProviderConfigSchema.extend({
  type: z.literal('saml'),
  entityId: z.string().min(1), // Required for SAML
  ssoUrl: z.string().url(), // Required for SAML
  certificate: z.string().min(1), // Required for SAML
  nameIdFormat: z.string().default('urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'),
}).omit({
  clientId: true,
  clientSecret: true,
  scopes: true,
  authorizeUrl: true,
  tokenUrl: true,
  userinfoUrl: true,
  jwksUrl: true,
});

/**
 * OAuth 2.0 provider schema
 */
export const OAuth2ProviderSchema = SsoProviderConfigSchema.extend({
  type: z.literal('oauth2'),
  clientId: z.string().min(1), // Required for OAuth2
  clientSecret: z.string().min(1), // Required for OAuth2
  authorizeUrl: z.string().url(), // Required for OAuth2
  tokenUrl: z.string().url(), // Required for OAuth2
}).omit({
  entityId: true,
  certificate: true,
  sloUrl: true,
  signRequests: true,
  wantAssertionsSigned: true,
  nameIdFormat: true,
  jwksUrl: true,
});

/**
 * OpenID Connect provider schema
 */
export const OidcProviderSchema = SsoProviderConfigSchema.extend({
  type: z.literal('openid-connect'),
  clientId: z.string().min(1), // Required for OIDC
  clientSecret: z.string().min(1), // Required for OIDC
  issuer: z.string().url(), // Required for OIDC
  scopes: z.array(z.string()).default(['openid', 'profile', 'email']),
}).omit({
  entityId: true,
  certificate: true,
  sloUrl: true,
  signRequests: true,
  wantAssertionsSigned: true,
  nameIdFormat: true,
  authorizeUrl: true,
  tokenUrl: true,
  userinfoUrl: true,
});

/**
 * Request schemas
 */
export const CreateSsoProviderRequest = z.discriminatedUnion('type', [
  SamlProviderSchema,
  OAuth2ProviderSchema,
  OidcProviderSchema,
]);

export const UpdateSsoProviderRequest = SsoProviderConfigSchema.partial().omit({
  type: true, // Cannot change provider type after creation
});

export const TestSsoProviderRequest = z.object({
  providerId: z.string().cuid(),
  testEmail: z.string().email().optional(),
});

/**
 * SSO Authentication Request schemas
 */
export const InitiateSsoRequest = z.object({
  providerId: z.string().cuid().optional(), // If not provided, auto-detect from email domain
  email: z.string().email().optional(), // For provider auto-detection
  returnUrl: z.string().url().optional(), // Post-authentication redirect
});

export const SsoCallbackRequest = z.object({
  sessionId: z.string(),
  // SAML
  SAMLResponse: z.string().optional(),
  RelayState: z.string().optional(),
  // OAuth/OIDC
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

/**
 * Response schemas
 */
export const SsoProviderResponse = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  domain: z.string().nullable(),
  isActive: z.boolean(),
  isDefault: z.boolean(),
  autoCreateUsers: z.boolean(),
  requireMfa: z.boolean(),
  organizationId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastUsedAt: z.string().nullable(),
  // Sensitive fields omitted (clientSecret, certificate, etc.)
});

export const SsoProvidersListResponse = z.object({
  providers: z.array(SsoProviderResponse),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});

export const SsoInitiateResponse = z.object({
  sessionId: z.string(),
  redirectUrl: z.string(),
  method: z.enum(['GET', 'POST']),
  // For SAML POST binding
  samlRequest: z.string().optional(),
  relayState: z.string().optional(),
});

export const SsoAuthenticateResponse = z.object({
  success: z.boolean(),
  user: z.object({
    id: z.string(),
    email: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    role: z.string(),
    organizationId: z.string().nullable(),
  }).optional(),
  tokens: z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    expiresIn: z.number(),
  }).optional(),
  requiresMfa: z.boolean().default(false),
  mfaSessionId: z.string().optional(),
  error: z.string().optional(),
  message: z.string(),
});

/**
 * Query schemas
 */
export const SsoProvidersQuery = z.object({
  organizationId: z.string().cuid().optional(),
  type: z.enum(['saml', 'oauth2', 'openid-connect', 'ldap']).optional(),
  isActive: z.boolean().optional(),
  domain: z.string().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(10),
});

/**
 * Type exports
 */
export type SsoProviderConfig = z.infer<typeof SsoProviderConfigSchema>;
export type SamlProvider = z.infer<typeof SamlProviderSchema>;
export type OAuth2Provider = z.infer<typeof OAuth2ProviderSchema>;
export type OidcProvider = z.infer<typeof OidcProviderSchema>;
export type CreateSsoProviderRequest = z.infer<typeof CreateSsoProviderRequest>;
export type UpdateSsoProviderRequest = z.infer<typeof UpdateSsoProviderRequest>;
export type TestSsoProviderRequest = z.infer<typeof TestSsoProviderRequest>;
export type InitiateSsoRequest = z.infer<typeof InitiateSsoRequest>;
export type SsoCallbackRequest = z.infer<typeof SsoCallbackRequest>;
export type SsoProviderResponse = z.infer<typeof SsoProviderResponse>;
export type SsoProvidersListResponse = z.infer<typeof SsoProvidersListResponse>;
export type SsoInitiateResponse = z.infer<typeof SsoInitiateResponse>;
export type SsoAuthenticateResponse = z.infer<typeof SsoAuthenticateResponse>;
export type SsoProvidersQuery = z.infer<typeof SsoProvidersQuery>;

/**
 * Constants for SSO configuration
 */
export const SSO_PROVIDER_TYPES = {
  SAML: 'saml',
  OAUTH2: 'oauth2',
  OPENID_CONNECT: 'openid-connect',
  LDAP: 'ldap',
} as const;

export const DEFAULT_SAML_NAME_ID_FORMAT = 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress';

export const DEFAULT_OIDC_SCOPES = ['openid', 'profile', 'email'];

export const COMMON_SSO_PROVIDERS = {
  AZURE_AD: {
    name: 'Azure Active Directory',
    type: 'openid-connect',
    issuer: 'https://login.microsoftonline.com/{tenant}/v2.0',
    scopes: ['openid', 'profile', 'email'],
  },
  GOOGLE: {
    name: 'Google Workspace',
    type: 'openid-connect',
    issuer: 'https://accounts.google.com',
    scopes: ['openid', 'profile', 'email'],
  },
  OKTA: {
    name: 'Okta',
    type: 'openid-connect',
    issuer: 'https://{domain}.okta.com/oauth2/default',
    scopes: ['openid', 'profile', 'email'],
  },
  AUTH0: {
    name: 'Auth0',
    type: 'openid-connect',
    issuer: 'https://{domain}.auth0.com/',
    scopes: ['openid', 'profile', 'email'],
  },
} as const;