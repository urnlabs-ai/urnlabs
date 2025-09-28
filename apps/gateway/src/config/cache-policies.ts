import { CachePolicy } from '../types/index.js';

/**
 * Default cache policies for common endpoint patterns
 */
export const DEFAULT_CACHE_POLICIES: CachePolicy[] = [
  {
    id: 'health-checks',
    name: 'Health Check Endpoints',
    pattern: '/health*',
    ttl: 30, // 30 seconds
    enabled: true,
    conditions: {
      methods: ['GET'],
      statusCodes: [200],
      contentTypes: ['application/json'],
      maxSize: 10240 // 10KB
    },
    varyHeaders: [],
    tags: ['health', 'system'],
    priority: 10
  },
  {
    id: 'api-endpoints',
    name: 'General API Endpoints',
    pattern: '/api/*',
    ttl: 300, // 5 minutes
    enabled: true,
    conditions: {
      methods: ['GET'],
      statusCodes: [200, 201, 202],
      contentTypes: ['application/json'],
      maxSize: 1024 * 1024 // 1MB
    },
    varyHeaders: ['authorization', 'user-agent'],
    tags: ['api'],
    priority: 5
  },
  {
    id: 'user-profiles',
    name: 'User Profile Data',
    pattern: '/api/users/*/profile',
    ttl: 600, // 10 minutes
    enabled: true,
    conditions: {
      methods: ['GET'],
      statusCodes: [200],
      contentTypes: ['application/json'],
      userRoles: ['USER', 'ADMIN', 'PREMIUM']
    },
    varyHeaders: ['authorization'],
    tags: ['user', 'profile'],
    priority: 8
  },
  {
    id: 'static-assets',
    name: 'Static Assets',
    pattern: '/static/*',
    ttl: 3600, // 1 hour
    enabled: true,
    conditions: {
      methods: ['GET'],
      statusCodes: [200, 304],
      contentTypes: ['image/*', 'text/css', 'application/javascript', 'font/*'],
      maxSize: 10 * 1024 * 1024 // 10MB
    },
    varyHeaders: ['accept-encoding'],
    tags: ['static', 'assets'],
    priority: 9
  },
  {
    id: 'admin-readonly',
    name: 'Admin Read-Only Endpoints',
    pattern: '/admin/*/stats',
    ttl: 60, // 1 minute
    enabled: true,
    conditions: {
      methods: ['GET'],
      statusCodes: [200],
      contentTypes: ['application/json'],
      userRoles: ['ADMIN', 'SYSTEM']
    },
    varyHeaders: ['authorization'],
    tags: ['admin', 'stats'],
    priority: 7
  },
  {
    id: 'service-discovery',
    name: 'Service Discovery',
    pattern: '/admin/routing/*',
    ttl: 120, // 2 minutes
    enabled: true,
    conditions: {
      methods: ['GET'],
      statusCodes: [200],
      contentTypes: ['application/json'],
      userRoles: ['ADMIN', 'SYSTEM']
    },
    varyHeaders: ['authorization'],
    tags: ['routing', 'discovery'],
    priority: 6
  },
  {
    id: 'public-data',
    name: 'Public Data Endpoints',
    pattern: '/public/*',
    ttl: 1800, // 30 minutes
    enabled: true,
    conditions: {
      methods: ['GET'],
      statusCodes: [200],
      contentTypes: ['application/json', 'text/plain'],
      maxSize: 512 * 1024 // 512KB
    },
    varyHeaders: ['accept-language'],
    tags: ['public'],
    priority: 4
  },
  {
    id: 'metrics-data',
    name: 'Metrics and Analytics',
    pattern: '/metrics*',
    ttl: 60, // 1 minute
    enabled: true,
    conditions: {
      methods: ['GET'],
      statusCodes: [200],
      contentTypes: ['application/json', 'text/plain'],
      userRoles: ['ADMIN', 'SYSTEM']
    },
    varyHeaders: ['authorization'],
    tags: ['metrics', 'analytics'],
    priority: 6
  },
  {
    id: 'auth-endpoints',
    name: 'Authentication Data',
    pattern: '/auth/user',
    ttl: 300, // 5 minutes
    enabled: true,
    conditions: {
      methods: ['GET'],
      statusCodes: [200],
      contentTypes: ['application/json']
    },
    varyHeaders: ['authorization'],
    tags: ['auth', 'user'],
    priority: 8
  },
  {
    id: 'documentation',
    name: 'API Documentation',
    pattern: '/docs*',
    ttl: 3600, // 1 hour
    enabled: true,
    conditions: {
      methods: ['GET'],
      statusCodes: [200],
      contentTypes: ['text/html', 'application/json', 'text/css', 'application/javascript']
    },
    varyHeaders: ['accept-encoding'],
    tags: ['docs', 'static'],
    priority: 3
  }
];

/**
 * Environment-specific cache policies
 */
export const ENVIRONMENT_POLICIES = {
  development: [
    {
      id: 'dev-short-cache',
      name: 'Development Short Cache',
      pattern: '*',
      ttl: 30, // Short cache in development
      enabled: true,
      conditions: {
        methods: ['GET'],
        statusCodes: [200]
      },
      varyHeaders: [],
      tags: ['dev'],
      priority: 1
    }
  ],
  production: [
    {
      id: 'prod-aggressive-cache',
      name: 'Production Aggressive Caching',
      pattern: '/api/config/*',
      ttl: 7200, // 2 hours for config
      enabled: true,
      conditions: {
        methods: ['GET'],
        statusCodes: [200],
        contentTypes: ['application/json']
      },
      varyHeaders: [],
      tags: ['config', 'production'],
      priority: 9
    }
  ]
};

/**
 * Cache invalidation rules
 */
export const INVALIDATION_RULES = {
  // When user data changes, invalidate user-related caches
  userUpdate: ['user', 'profile'],

  // When system config changes, invalidate config caches
  configUpdate: ['config', 'admin'],

  // When services are updated, invalidate routing caches
  serviceUpdate: ['routing', 'discovery'],

  // When static assets change, invalidate asset caches
  assetUpdate: ['static', 'assets'],

  // Emergency: clear all caches
  emergency: ['*']
};

/**
 * Cache warming strategies
 */
export const CACHE_WARMING_ENDPOINTS = [
  { method: 'GET', url: '/health' },
  { method: 'GET', url: '/api/health' },
  { method: 'GET', url: '/admin/routing/stats' },
  { method: 'GET', url: '/metrics' }
];

/**
 * Performance targets for cache optimization
 */
export const PERFORMANCE_TARGETS = {
  hitRate: {
    minimum: 60,
    target: 80,
    excellent: 90
  },
  responseTime: {
    maximum: 500,
    target: 200,
    excellent: 100
  },
  memoryEfficiency: {
    minimum: 70,
    target: 85,
    excellent: 95
  }
};

/**
 * Get cache policies for the current environment
 */
export function getCachePoliciesForEnvironment(env: string = 'development'): CachePolicy[] {
  const basePolicies = [...DEFAULT_CACHE_POLICIES];
  const envPolicies = ENVIRONMENT_POLICIES[env as keyof typeof ENVIRONMENT_POLICIES] || [];

  return [...basePolicies, ...envPolicies].sort((a, b) => b.priority - a.priority);
}

/**
 * Get cache configuration based on environment
 */
export function getCacheConfigForEnvironment(env: string = 'development') {
  const isDevelopment = env === 'development';

  return {
    enabled: true,
    defaultTtl: isDevelopment ? 60 : 300,
    maxSize: isDevelopment ? 512 * 1024 : 1024 * 1024, // 512KB dev, 1MB prod
    debugMode: isDevelopment,
    etagEnabled: true,
    conditionalRequestsEnabled: true,
    compressionEnabled: !isDevelopment, // Disable compression in dev for debugging
    ignoreHeaders: ['authorization', 'cookie', 'set-cookie', 'x-request-id'],
    bypassHeader: 'x-cache-bypass'
  };
}