import { WAFRule } from '../types.js';

/**
 * Rate Limiting and Traffic Control Rules
 */
export const RATE_LIMITING_RULES: WAFRule[] = [
  // Global Rate Limiting
  {
    id: 'rate_001_global_limit',
    name: 'Global Rate Limiting',
    description: 'Global rate limiting for all requests',
    category: 'rate_limiting',
    threatLevel: 'medium',
    action: 'block',
    enabled: true,
    rateLimit: {
      maxRequests: 1000,
      window: 60, // 1 minute
      byIP: true
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['rate-limiting', 'global', 'dos-protection']
  },

  // API Endpoint Rate Limiting
  {
    id: 'rate_002_api_limit',
    name: 'API Endpoint Rate Limiting',
    description: 'Rate limiting for API endpoints',
    category: 'rate_limiting',
    threatLevel: 'medium',
    action: 'block',
    enabled: true,
    paths: ['/api/*', '/v1/*', '/v2/*'],
    rateLimit: {
      maxRequests: 100,
      window: 60, // 1 minute
      byIP: true
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['rate-limiting', 'api', 'dos-protection']
  },

  // Authentication Endpoint Rate Limiting
  {
    id: 'rate_003_auth_limit',
    name: 'Authentication Rate Limiting',
    description: 'Strict rate limiting for authentication endpoints',
    category: 'rate_limiting',
    threatLevel: 'high',
    action: 'block',
    enabled: true,
    paths: [
      '/api/auth/*',
      '/auth/*',
      '/login',
      '/signin',
      '/register',
      '/signup',
      '/password/reset',
      '/password/forgot'
    ],
    methods: ['POST'],
    rateLimit: {
      maxRequests: 5,
      window: 300, // 5 minutes
      byIP: true
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['rate-limiting', 'authentication', 'brute-force-protection']
  },

  // GraphQL Rate Limiting
  {
    id: 'rate_004_graphql_limit',
    name: 'GraphQL Rate Limiting',
    description: 'Rate limiting for GraphQL endpoints',
    category: 'rate_limiting',
    threatLevel: 'medium',
    action: 'block',
    enabled: true,
    paths: ['/graphql', '/api/graphql'],
    methods: ['POST'],
    rateLimit: {
      maxRequests: 50,
      window: 60, // 1 minute
      byIP: true
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['rate-limiting', 'graphql', 'dos-protection']
  },

  // File Upload Rate Limiting
  {
    id: 'rate_005_upload_limit',
    name: 'File Upload Rate Limiting',
    description: 'Rate limiting for file upload endpoints',
    category: 'rate_limiting',
    threatLevel: 'medium',
    action: 'block',
    enabled: true,
    paths: ['/upload', '/api/upload', '/files', '/api/files'],
    methods: ['POST', 'PUT'],
    rateLimit: {
      maxRequests: 10,
      window: 300, // 5 minutes
      byIP: true
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['rate-limiting', 'upload', 'dos-protection']
  },

  // Search Endpoint Rate Limiting
  {
    id: 'rate_006_search_limit',
    name: 'Search Rate Limiting',
    description: 'Rate limiting for search endpoints',
    category: 'rate_limiting',
    threatLevel: 'medium',
    action: 'block',
    enabled: true,
    paths: ['/search', '/api/search', '/find', '/api/find'],
    rateLimit: {
      maxRequests: 30,
      window: 60, // 1 minute
      byIP: true
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['rate-limiting', 'search', 'dos-protection']
  },

  // Admin Endpoint Rate Limiting
  {
    id: 'rate_007_admin_limit',
    name: 'Admin Endpoint Rate Limiting',
    description: 'Strict rate limiting for admin endpoints',
    category: 'rate_limiting',
    threatLevel: 'high',
    action: 'block',
    enabled: true,
    paths: ['/admin/*', '/administrator/*', '/management/*'],
    rateLimit: {
      maxRequests: 20,
      window: 300, // 5 minutes
      byIP: true
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['rate-limiting', 'admin', 'privilege-protection']
  },

  // Password Reset Rate Limiting
  {
    id: 'rate_008_password_reset',
    name: 'Password Reset Rate Limiting',
    description: 'Rate limiting for password reset requests',
    category: 'rate_limiting',
    threatLevel: 'high',
    action: 'block',
    enabled: true,
    paths: [
      '/password/reset',
      '/password/forgot',
      '/api/password/reset',
      '/api/password/forgot',
      '/forgot-password',
      '/reset-password'
    ],
    methods: ['POST'],
    rateLimit: {
      maxRequests: 3,
      window: 3600, // 1 hour
      byIP: true
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['rate-limiting', 'password-reset', 'abuse-prevention']
  },

  // Registration Rate Limiting
  {
    id: 'rate_009_registration_limit',
    name: 'Registration Rate Limiting',
    description: 'Rate limiting for user registration',
    category: 'rate_limiting',
    threatLevel: 'medium',
    action: 'block',
    enabled: true,
    paths: [
      '/register',
      '/signup',
      '/api/register',
      '/api/signup',
      '/api/users',
      '/users/create'
    ],
    methods: ['POST'],
    rateLimit: {
      maxRequests: 5,
      window: 3600, // 1 hour
      byIP: true
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['rate-limiting', 'registration', 'spam-prevention']
  },

  // Contact Form Rate Limiting
  {
    id: 'rate_010_contact_limit',
    name: 'Contact Form Rate Limiting',
    description: 'Rate limiting for contact forms',
    category: 'rate_limiting',
    threatLevel: 'low',
    action: 'block',
    enabled: true,
    paths: [
      '/contact',
      '/api/contact',
      '/support',
      '/api/support',
      '/feedback',
      '/api/feedback'
    ],
    methods: ['POST'],
    rateLimit: {
      maxRequests: 3,
      window: 1800, // 30 minutes
      byIP: true
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['rate-limiting', 'contact', 'spam-prevention']
  },

  // Email Verification Rate Limiting
  {
    id: 'rate_011_email_verification',
    name: 'Email Verification Rate Limiting',
    description: 'Rate limiting for email verification requests',
    category: 'rate_limiting',
    threatLevel: 'medium',
    action: 'block',
    enabled: true,
    paths: [
      '/verify-email',
      '/api/verify-email',
      '/email/verify',
      '/api/email/verify',
      '/resend-verification',
      '/api/resend-verification'
    ],
    methods: ['POST'],
    rateLimit: {
      maxRequests: 3,
      window: 1800, // 30 minutes
      byIP: true
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['rate-limiting', 'email-verification', 'abuse-prevention']
  },

  // WebSocket Connection Rate Limiting
  {
    id: 'rate_012_websocket_limit',
    name: 'WebSocket Connection Rate Limiting',
    description: 'Rate limiting for WebSocket connections',
    category: 'rate_limiting',
    threatLevel: 'medium',
    action: 'block',
    enabled: true,
    paths: ['/ws', '/websocket', '/socket.io'],
    headers: {
      'Upgrade': 'websocket'
    },
    rateLimit: {
      maxRequests: 10,
      window: 60, // 1 minute
      byIP: true
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['rate-limiting', 'websocket', 'connection-abuse']
  },

  // Options Method Rate Limiting (CORS Preflight)
  {
    id: 'rate_013_options_limit',
    name: 'OPTIONS Method Rate Limiting',
    description: 'Rate limiting for OPTIONS requests (CORS preflight)',
    category: 'rate_limiting',
    threatLevel: 'low',
    action: 'block',
    enabled: true,
    methods: ['OPTIONS'],
    rateLimit: {
      maxRequests: 50,
      window: 60, // 1 minute
      byIP: true
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['rate-limiting', 'options', 'cors-preflight']
  },

  // Health Check Rate Limiting
  {
    id: 'rate_014_health_limit',
    name: 'Health Check Rate Limiting',
    description: 'Rate limiting for health check endpoints',
    category: 'rate_limiting',
    threatLevel: 'low',
    action: 'block',
    enabled: true,
    paths: [
      '/health',
      '/healthcheck',
      '/status',
      '/ping',
      '/api/health',
      '/api/status'
    ],
    rateLimit: {
      maxRequests: 30,
      window: 60, // 1 minute
      byIP: true
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['rate-limiting', 'health-check', 'monitoring']
  },

  // Static Asset Rate Limiting
  {
    id: 'rate_015_static_limit',
    name: 'Static Asset Rate Limiting',
    description: 'Rate limiting for static assets to prevent scraping',
    category: 'rate_limiting',
    threatLevel: 'low',
    action: 'block',
    enabled: true,
    paths: [
      '/static/*',
      '/assets/*',
      '/images/*',
      '/css/*',
      '/js/*',
      '/fonts/*'
    ],
    rateLimit: {
      maxRequests: 200,
      window: 60, // 1 minute
      byIP: true
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['rate-limiting', 'static-assets', 'scraping-prevention']
  },

  // Sitemap Rate Limiting
  {
    id: 'rate_016_sitemap_limit',
    name: 'Sitemap Rate Limiting',
    description: 'Rate limiting for sitemap requests',
    category: 'rate_limiting',
    threatLevel: 'low',
    action: 'block',
    enabled: true,
    paths: [
      '/sitemap.xml',
      '/sitemap.txt',
      '/robots.txt',
      '/sitemap-*.xml'
    ],
    rateLimit: {
      maxRequests: 10,
      window: 300, // 5 minutes
      byIP: true
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['rate-limiting', 'sitemap', 'crawling-control']
  },

  // API Documentation Rate Limiting
  {
    id: 'rate_017_docs_limit',
    name: 'API Documentation Rate Limiting',
    description: 'Rate limiting for API documentation endpoints',
    category: 'rate_limiting',
    threatLevel: 'low',
    action: 'block',
    enabled: true,
    paths: [
      '/docs',
      '/api-docs',
      '/swagger',
      '/api/docs',
      '/documentation',
      '/redoc'
    ],
    rateLimit: {
      maxRequests: 20,
      window: 300, // 5 minutes
      byIP: true
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['rate-limiting', 'documentation', 'access-control']
  },

  // Aggressive Scraper Detection
  {
    id: 'rate_018_aggressive_scraper',
    name: 'Aggressive Scraper Detection',
    description: 'Detects and blocks aggressive scraping patterns',
    category: 'rate_limiting',
    threatLevel: 'high',
    action: 'block',
    enabled: true,
    rateLimit: {
      maxRequests: 500,
      window: 60, // 1 minute
      byIP: true
    },
    metadata: {
      blockDuration: 3600 // Block for 1 hour
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['rate-limiting', 'scraper-detection', 'aggressive-behavior']
  },

  // Burst Traffic Protection
  {
    id: 'rate_019_burst_protection',
    name: 'Burst Traffic Protection',
    description: 'Protects against sudden traffic bursts',
    category: 'rate_limiting',
    threatLevel: 'medium',
    action: 'block',
    enabled: true,
    rateLimit: {
      maxRequests: 100,
      window: 10, // 10 seconds
      byIP: true
    },
    metadata: {
      burstProtection: true,
      cooldownPeriod: 300 // 5 minutes
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['rate-limiting', 'burst-protection', 'traffic-shaping']
  },

  // Slow Loris Attack Protection
  {
    id: 'rate_020_slow_loris',
    name: 'Slow Loris Attack Protection',
    description: 'Protects against slow connection attacks',
    category: 'rate_limiting',
    threatLevel: 'high',
    action: 'block',
    enabled: true,
    metadata: {
      maxConnectionTime: 30000, // 30 seconds
      maxConcurrentConnections: 10,
      requestTimeout: 10000 // 10 seconds
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['rate-limiting', 'slow-loris', 'connection-timeout']
  }
];

export default RATE_LIMITING_RULES;