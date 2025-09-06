export interface ServiceEndpoint {
  name: string;
  url: string;
  healthCheck: string;
  timeout: number;
  retries: number;
  status: 'healthy' | 'unhealthy' | 'unknown';
  lastCheck?: Date;
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
}

export interface ProxyRoute {
  prefix: string;
  target: string;
  changeOrigin?: boolean;
  pathRewrite?: Record<string, string>;
  onProxyReq?: (proxyReq: any, req: any, res: any) => void;
  onProxyRes?: (proxyRes: any, req: any, res: any) => void;
  onError?: (err: any, req: any, res: any) => void;
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