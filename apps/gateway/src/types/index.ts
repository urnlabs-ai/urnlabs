export interface ServiceEndpoint {
  name: string;
  url: string;
  healthCheck: string;
  timeout: number;
  retries: number;
  status: 'healthy' | 'unhealthy' | 'unknown';
  lastCheck?: Date;
  weight?: number;
  version?: string;
  instances?: ServiceInstance[];
}

export interface ServiceInstance {
  id: string;
  url: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  weight: number;
  responseTime: number;
  connections: number;
  version: string;
  priority?: number;
  region?: string;
  lastHealthCheck?: number;
  metadata?: Record<string, any>;
}

export interface GatewayConfig {
  port: number;
  services: {
    api: ServiceEndpoint;
    agents: ServiceEndpoint;
    bridge: ServiceEndpoint;
    dashboard: ServiceEndpoint;
    maestro: ServiceEndpoint;
    monitoring: ServiceEndpoint;
    mcpIntegration: ServiceEndpoint;
    testing: ServiceEndpoint;
    security: ServiceEndpoint;
  };
  redis: {
    url: string;
    keyPrefix: string;
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
  rateLimiting: {
    global: {
      max: number;
      timeWindow: number;
    };
    perUser: {
      max: number;
      timeWindow: number;
    };
  };
  cors: {
    origin: string[] | boolean;
    credentials: boolean;
  };
  cache: CacheConfiguration;
}

export interface ProxyRoute {
  prefix: string;
  target: string;
  changeOrigin?: boolean;
  pathRewrite?: Record<string, string>;
  onProxyReq?: (proxyReq: any, req: any, res: any) => void;
  onProxyRes?: (proxyRes: any, req: any, res: any) => void;
  onError?: (err: any, req: any, res: any) => void;
  loadBalancer?: LoadBalancerConfig;
  routingStrategy?: RoutingStrategy;
}

export type LoadBalancerAlgorithm = 'round-robin' | 'least-connections' | 'weighted' | 'ip-hash' | 'random';

export interface LoadBalancerConfig {
  algorithm: LoadBalancerAlgorithm;
  healthCheck: boolean;
  failover: boolean;
  canaryConfig?: CanaryConfig;
}

export interface CanaryConfig {
  enabled: boolean;
  versions: VersionConfig[];
  trafficSplit: Record<string, number>;
  rolloutStrategy: 'progressive' | 'instant' | 'blue-green';
}

export interface VersionConfig {
  version: string;
  weight: number;
  instances: string[];
}

export interface RoutingStrategy {
  type: 'path' | 'header' | 'query' | 'canary' | 'default';
  rules: RoutingRule[];
}

export interface RoutingRule {
  match: {
    path?: string;
    headers?: Record<string, string>;
    query?: Record<string, string>;
    method?: string;
  };
  target: {
    service: string;
    version?: string;
    weight?: number;
  };
  priority: number;
}

export interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'unhealthy';
  responseTime: number;
  error?: string;
  timestamp: Date;
}

export interface MetricsData {
  requests: {
    total: number;
    success: number;
    errors: number;
    avgResponseTime: number;
  };
  services: Record<string, {
    status: string;
    responseTime: number;
    uptime: number;
  }>;
  resources: {
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu: {
      usage: number;
    };
  };
}

export interface WebSocketMessage {
  type: 'ping' | 'pong' | 'notification' | 'metrics' | 'workflow_update' | 'agent_status';
  payload: any;
  timestamp: Date;
  userId?: string;
  organizationId?: string;
}

export interface AuthenticatedRequest {
  userId: string;
  organizationId: string;
  role: string;
  permissions: string[];
}

// Cache-related types
export interface CacheConfiguration {
  enabled: boolean;
  defaultTtl: number;
  maxSize: number;
  policies: CachePolicy[];
  redis: {
    keyPrefix: string;
    compressionEnabled: boolean;
  };
}

export interface CachePolicy {
  id: string;
  name: string;
  pattern: string;
  ttl: number;
  enabled: boolean;
  conditions: {
    methods?: string[];
    statusCodes?: number[];
    contentTypes?: string[];
    maxSize?: number;
    userRoles?: string[];
  };
  varyHeaders: string[];
  tags: string[];
  priority: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalRequests: number;
  totalSize: number;
  entriesCount: number;
  avgResponseTime: number;
  memoryUsage: {
    used: number;
    percentage: number;
  };
}

export interface CacheHealthStatus {
  overall: 'healthy' | 'warning' | 'critical';
  components: {
    hitRate: { status: 'healthy' | 'warning' | 'critical'; value: number; threshold: number };
    memoryUsage: { status: 'healthy' | 'warning' | 'critical'; value: number; threshold: number };
    responseTime: { status: 'healthy' | 'warning' | 'critical'; value: number; threshold: number };
    errorRate: { status: 'healthy' | 'warning' | 'critical'; value: number; threshold: number };
  };
  recommendations: string[];
}