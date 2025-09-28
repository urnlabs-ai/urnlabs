import { GatewayConfig } from '../types/index.js';

export const config: GatewayConfig = {
  port: parseInt(process.env.GATEWAY_PORT || '7000'),
  
  services: {
    api: {
      name: 'API Service',
      url: process.env.API_ENDPOINT || 'http://api:7001',
      healthCheck: '/health',
      timeout: 5000,
      retries: 3,
      status: 'unknown'
    },
    agents: {
      name: 'Agents Service',
      url: process.env.AGENTS_ENDPOINT || 'http://agents:7002',
      healthCheck: '/health',
      timeout: 5000,
      retries: 3,
      status: 'unknown'
    },
    bridge: {
      name: 'Bridge Service',
      url: process.env.BRIDGE_ENDPOINT || 'http://bridge:7003',
      healthCheck: '/health',
      timeout: 5000,
      retries: 3,
      status: 'unknown'
    },
    dashboard: {
      name: 'Dashboard Service',
      url: process.env.DASHBOARD_ENDPOINT || 'http://dashboard:7004',
      healthCheck: '/health',
      timeout: 5000,
      retries: 3,
      status: 'unknown'
    },
    maestro: {
      name: 'URN Maestro Service',
      url: process.env.MAESTRO_ENDPOINT || 'http://urn-maestro:7005',
      healthCheck: '/health',
      timeout: 5000,
      retries: 3,
      status: 'unknown'
    },
    monitoring: {
      name: 'Monitoring Service',
      url: process.env.MONITORING_ENDPOINT || 'http://monitoring:7006',
      healthCheck: '/health',
      timeout: 5000,
      retries: 3,
      status: 'unknown'
    },
    mcpIntegration: {
      name: 'MCP Integration Service',
      url: process.env.MCP_INTEGRATION_ENDPOINT || 'http://mcp-integration:7007',
      healthCheck: '/health',
      timeout: 5000,
      retries: 3,
      status: 'unknown'
    },
    testing: {
      name: 'Testing Service',
      url: process.env.TESTING_ENDPOINT || 'http://testing:7008',
      healthCheck: '/health',
      timeout: 5000,
      retries: 3,
      status: 'unknown'
    },
    security: {
      name: 'Security Service',
      url: process.env.SECURITY_ENDPOINT || 'http://security:7009',
      healthCheck: '/health',
      timeout: 5000,
      retries: 3,
      status: 'unknown'
    }
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    keyPrefix: 'urnlabs:gateway:'
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-minimum-32-characters-long',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  },

  rateLimiting: {
    global: {
      max: parseInt(process.env.RATE_LIMIT_GLOBAL_MAX || '10000'),
      timeWindow: parseInt(process.env.RATE_LIMIT_GLOBAL_WINDOW || '60000') // 1 minute
    },
    perUser: {
      max: parseInt(process.env.RATE_LIMIT_USER_MAX || '1000'),
      timeWindow: parseInt(process.env.RATE_LIMIT_USER_WINDOW || '60000') // 1 minute
    },
    advanced: {
      global: {
        id: 'global',
        name: 'Global Rate Limit',
        algorithm: 'sliding-window' as const,
        windowSize: parseInt(process.env.RATE_LIMIT_GLOBAL_WINDOW || '60'), // seconds
        maxRequests: parseInt(process.env.RATE_LIMIT_GLOBAL_MAX || '10000'),
        keyGenerator: 'composite' as const,
        headers: true,
        message: 'Too many requests from this origin',
        statusCode: 429
      },
      perUser: {
        id: 'per-user',
        name: 'Per User Rate Limit',
        algorithm: 'token-bucket' as const,
        windowSize: parseInt(process.env.RATE_LIMIT_USER_WINDOW || '60'), // seconds
        maxRequests: parseInt(process.env.RATE_LIMIT_USER_MAX || '1000'),
        keyGenerator: 'user' as const,
        headers: true,
        message: 'Too many requests for this user',
        statusCode: 429
      },
      perEndpoint: {
        id: 'per-endpoint',
        name: 'Per Endpoint Rate Limit',
        algorithm: 'fixed-window' as const,
        windowSize: parseInt(process.env.RATE_LIMIT_ENDPOINT_WINDOW || '60'), // seconds
        maxRequests: parseInt(process.env.RATE_LIMIT_ENDPOINT_MAX || '500'),
        keyGenerator: 'endpoint' as const,
        headers: true,
        message: 'Too many requests to this endpoint',
        statusCode: 429
      },
      perIp: {
        id: 'per-ip',
        name: 'Per IP Rate Limit',
        algorithm: 'sliding-window' as const,
        windowSize: parseInt(process.env.RATE_LIMIT_IP_WINDOW || '60'), // seconds
        maxRequests: parseInt(process.env.RATE_LIMIT_IP_MAX || '2000'),
        keyGenerator: 'ip' as const,
        headers: true,
        message: 'Too many requests from this IP address',
        statusCode: 429
      },
      bypass: {
        adminUsers: (process.env.RATE_LIMIT_BYPASS_USERS || '').split(',').filter(Boolean),
        monitoringIps: (process.env.RATE_LIMIT_BYPASS_IPS || '127.0.0.1,::1').split(','),
        internalServices: ['urnlabs-monitoring', 'urnlabs-health-check', 'prometheus'],
        bypassHeader: 'x-bypass-rate-limit'
      }
    }
  },

  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? (process.env.CORS_ORIGINS?.split(',') || false)
      : true,
    credentials: true
  },

  cache: {
    enabled: process.env.CACHE_ENABLED !== 'false',
    defaultTtl: parseInt(process.env.CACHE_DEFAULT_TTL || '300'), // 5 minutes
    maxSize: parseInt(process.env.CACHE_MAX_SIZE || '1048576'), // 1MB
    policies: [], // Will be populated by CacheManager
    redis: {
      keyPrefix: 'urnlabs:cache:',
      compressionEnabled: process.env.CACHE_COMPRESSION_ENABLED !== 'false'
    }
  }
};

// Validation
if (!config.jwt.secret || config.jwt.secret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters long');
}

export default config;