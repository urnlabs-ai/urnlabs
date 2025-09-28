export type ThreatLevel = 'none' | 'low' | 'medium' | 'high' | 'critical' | 'unknown';

export type WAFAction = 'allow' | 'block' | 'log' | 'challenge';

export type WAFRuleCategory =
  | 'sql_injection'
  | 'xss'
  | 'path_traversal'
  | 'command_injection'
  | 'csrf'
  | 'lfi'
  | 'rfi'
  | 'ssrf'
  | 'xxe'
  | 'ldap_injection'
  | 'nosql_injection'
  | 'http_verb_tampering'
  | 'session_fixation'
  | 'information_disclosure'
  | 'rate_limiting'
  | 'bot_detection'
  | 'geo_blocking'
  | 'custom';

/**
 * WAF Rule Definition
 */
export interface WAFRule {
  id: string;
  name: string;
  description: string;
  category: WAFRuleCategory;
  threatLevel: ThreatLevel;
  action: WAFAction;
  enabled: boolean;

  // Pattern matching
  customPattern?: string;
  patterns?: string[];

  // Conditions
  methods?: string[];
  paths?: string[];
  headers?: Record<string, string>;

  // Rate limiting specific
  rateLimit?: {
    maxRequests: number;
    window: number; // in seconds
    byIP?: boolean;
    byUserAgent?: boolean;
    bySession?: boolean;
  };

  // Geo blocking specific
  geoBlocking?: {
    blockedCountries?: string[];
    allowedCountries?: string[];
  };

  // Bot detection specific
  botDetection?: {
    allowedBots?: string[];
    blockedBots?: string[];
    requireChallengeResponse?: boolean;
  };

  // Custom metadata
  metadata?: Record<string, any>;
  tags?: string[];

  // Rule management
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  version?: string;
}

/**
 * Request Analysis Result
 */
export interface RequestAnalysis {
  allowed: boolean;
  threatLevel: ThreatLevel;
  ruleMatches: string[];
  reason?: string;
  action?: WAFAction;
  error?: string;
  processingTime?: number;
  confidence?: number; // 0-1 confidence score
}

/**
 * WAF Configuration
 */
export interface WAFConfig {
  enabled: boolean;

  // Global settings
  failOpen: boolean; // Allow traffic if WAF fails
  blockOnCritical: boolean;
  logAllRequests: boolean;

  // Rate limiting
  rateLimiting: {
    enabled: boolean;
    maxRequests: number;
    window: number; // seconds
    keyGenerator?: 'ip' | 'user' | 'session' | 'custom';
  };

  // Geo blocking
  geoBlocking?: {
    enabled: boolean;
    blockedCountries: string[];
    allowedCountries: string[];
    blockUnknown: boolean;
  };

  // Bot protection
  botProtection: {
    enabled: boolean;
    challengeUnknownBots: boolean;
    allowSearchEngines: boolean;
    blockHeadlessBrowsers: boolean;
  };

  // OWASP protection
  owaspProtection: {
    sqlInjection: boolean;
    xss: boolean;
    pathTraversal: boolean;
    commandInjection: boolean;
    csrf: boolean;
    xxe: boolean;
    lfi: boolean;
    rfi: boolean;
    ssrf: boolean;
  };

  // Response settings
  customErrorPages?: {
    blocked: string;
    rateLimit: string;
    geoBlocked: string;
  };

  // Monitoring
  monitoring: {
    realTimeAlerts: boolean;
    emailNotifications: boolean;
    slackWebhook?: string;
    webhookUrl?: string;
  };

  // Performance
  performance: {
    maxProcessingTime: number; // milliseconds
    enableCaching: boolean;
    cacheSize: number;
  };

  // Bypass settings
  bypass: {
    trustedIPs: string[];
    trustedNetworks: string[];
    adminPaths: string[];
  };
}

/**
 * WAF Statistics
 */
export interface WAFStats {
  totalRequests: number;
  blockedRequests: number;
  allowedRequests: number;
  avgProcessingTime: number;
  errors: number;

  // Threat breakdown
  threatsByLevel?: Record<ThreatLevel, number>;
  threatsByCategory?: Record<WAFRuleCategory, number>;

  // Time-based stats
  requestsPerHour?: number[];
  blockedPerHour?: number[];

  // Top threats
  topBlockedIPs?: Array<{ ip: string; count: number }>;
  topThreatRules?: Array<{ ruleId: string; count: number }>;
  topBlockedPaths?: Array<{ path: string; count: number }>;

  // Geographic stats
  requestsByCountry?: Record<string, number>;
  blockedByCountry?: Record<string, number>;

  // User agent stats
  topUserAgents?: Array<{ userAgent: string; count: number }>;
  blockedUserAgents?: Array<{ userAgent: string; count: number }>;
}

/**
 * WAF Event for logging and monitoring
 */
export interface WAFEvent {
  id: string;
  timestamp: Date;
  type: string;
  ip: string;
  url: string;
  method: string;
  threatLevel: ThreatLevel;
  ruleMatches: string[];
  reason: string;
  userAgent: string;

  // Additional context
  geo?: {
    country: string;
    region: string;
    city: string;
  };

  fingerprint?: string;
  sessionId?: string;
  userId?: string;

  // Request details
  headers?: Record<string, string>;
  queryParams?: Record<string, any>;
  bodySize?: number;

  // Response details
  responseCode?: number;
  responseTime?: number;

  // Risk scoring
  riskScore?: number;
  confidence?: number;

  // Metadata
  metadata?: Record<string, any>;
}

/**
 * WAF Rule Match Result
 */
export interface RuleMatchResult {
  ruleId: string;
  matched: boolean;
  threatLevel: ThreatLevel;
  confidence: number;
  matchedPattern?: string;
  matchedValue?: string;
  metadata?: Record<string, any>;
}

/**
 * WAF Middleware Options
 */
export interface WAFMiddlewareOptions {
  config: WAFConfig;
  redisClient: any;

  // Custom handlers
  onThreatDetected?: (event: WAFEvent) => void | Promise<void>;
  onRequestBlocked?: (event: WAFEvent) => void | Promise<void>;
  onError?: (error: Error, context: any) => void | Promise<void>;

  // Custom rule evaluators
  customEvaluators?: Record<string, (request: any, rule: WAFRule) => Promise<RuleMatchResult>>;

  // Integration hooks
  beforeAnalysis?: (request: any) => void | Promise<void>;
  afterAnalysis?: (request: any, result: RequestAnalysis) => void | Promise<void>;
}

/**
 * WAF Performance Metrics
 */
export interface WAFPerformanceMetrics {
  processingTime: {
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  };

  throughput: {
    requestsPerSecond: number;
    requestsPerMinute: number;
    requestsPerHour: number;
  };

  memory: {
    ruleEngineMemory: number;
    cacheMemory: number;
    totalMemory: number;
  };

  cache: {
    hitRate: number;
    missRate: number;
    size: number;
  };
}

/**
 * WAF Rule Template for common patterns
 */
export interface WAFRuleTemplate {
  id: string;
  name: string;
  description: string;
  category: WAFRuleCategory;
  template: Omit<WAFRule, 'id' | 'createdAt' | 'updatedAt'>;
  variables?: Record<string, any>;
}

/**
 * WAF Configuration Validation Result
 */
export interface WAFConfigValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

/**
 * WAF Threat Intelligence Feed
 */
export interface ThreatIntelligence {
  maliciousIPs: string[];
  maliciousUserAgents: string[];
  suspiciousPatterns: string[];
  knownAttackSignatures: string[];
  lastUpdated: Date;
  source: string;
}

/**
 * WAF Bypass Configuration
 */
export interface WAFBypass {
  id: string;
  type: 'ip' | 'cidr' | 'user_agent' | 'path' | 'header';
  value: string;
  reason: string;
  enabled: boolean;
  expiresAt?: Date;
  createdBy: string;
  createdAt: Date;
}

/**
 * WAF Alert Configuration
 */
export interface WAFAlert {
  id: string;
  name: string;
  description: string;
  conditions: {
    threatLevel?: ThreatLevel[];
    categories?: WAFRuleCategory[];
    minOccurrences?: number;
    timeWindow?: number; // minutes
  };
  notifications: {
    email?: string[];
    slack?: string;
    webhook?: string;
  };
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export default {
  ThreatLevel,
  WAFAction,
  WAFRuleCategory,
  WAFRule,
  RequestAnalysis,
  WAFConfig,
  WAFStats,
  WAFEvent,
  RuleMatchResult,
  WAFMiddlewareOptions,
  WAFPerformanceMetrics,
  WAFRuleTemplate,
  WAFConfigValidation,
  ThreatIntelligence,
  WAFBypass,
  WAFAlert
};