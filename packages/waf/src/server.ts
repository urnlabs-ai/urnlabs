import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import Redis from 'ioredis';
import winston from 'winston';
import { createWAFMiddleware, WAFMiddleware } from './middleware/waf-middleware.js';
import { createWAFAPIRouter } from './routes/waf-api.js';
import { WAFEngine } from './services/waf-engine.js';

interface WAFServerConfig {
  port: number;
  host: string;
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  adminApiKey: string;
  enableDevMode: boolean;
  logLevel: string;
  cors: {
    origin: string[];
    credentials: boolean;
  };
  rateLimit: {
    windowMs: number;
    max: number;
  };
  ssl?: {
    cert: string;
    key: string;
  };
}

export class WAFServer {
  private app: Application;
  private server: any;
  private redis: Redis;
  private logger: winston.Logger;
  private wafEngine: WAFEngine;
  private wafMiddleware: WAFMiddleware;
  private config: WAFServerConfig;

  constructor(config: WAFServerConfig) {
    this.config = config;
    this.app = express();
    this.setupLogger();
    this.setupRedis();
  }

  private setupLogger(): void {
    this.logger = winston.createLogger({
      level: this.config.logLevel,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'waf-server' },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        }),
        new winston.transports.File({
          filename: 'logs/waf-error.log',
          level: 'error'
        }),
        new winston.transports.File({
          filename: 'logs/waf-combined.log'
        })
      ]
    });

    this.logger.info('WAF Server logger initialized', {
      logLevel: this.config.logLevel,
      enableDevMode: this.config.enableDevMode
    });
  }

  private setupRedis(): void {
    this.redis = new Redis({
      host: this.config.redis.host,
      port: this.config.redis.port,
      password: this.config.redis.password,
      db: this.config.redis.db,
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      connectTimeout: 10000,
      commandTimeout: 5000
    });

    this.redis.on('connect', () => {
      this.logger.info('Connected to Redis', {
        host: this.config.redis.host,
        port: this.config.redis.port,
        db: this.config.redis.db
      });
    });

    this.redis.on('error', (error) => {
      this.logger.error('Redis connection error', { error: error.message });
    });

    this.redis.on('ready', () => {
      this.logger.info('Redis connection ready');
    });

    this.redis.on('reconnecting', () => {
      this.logger.warn('Redis reconnecting...');
    });
  }

  private setupMiddleware(): void {
    // Trust proxy for accurate IP detection
    this.app.set('trust proxy', true);

    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"]
        }
      },
      crossOriginEmbedderPolicy: false
    }));

    // CORS configuration
    this.app.use(cors({
      origin: this.config.cors.origin,
      credentials: this.config.cors.credentials,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-WAF-Bypass']
    }));

    // Compression
    this.app.use(compression());

    // Rate limiting for API endpoints
    const limiter = rateLimit({
      windowMs: this.config.rateLimit.windowMs,
      max: this.config.rateLimit.max,
      message: {
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil(this.config.rateLimit.windowMs / 1000)
      },
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => {
        // Skip rate limiting for health checks
        return req.path.startsWith('/health') || req.path.startsWith('/metrics');
      }
    });

    this.app.use('/api', limiter);

    // Request logging
    this.app.use((req, res, next) => {
      const startTime = Date.now();

      res.on('finish', () => {
        const duration = Date.now() - startTime;
        this.logger.info('HTTP Request', {
          method: req.method,
          url: req.url,
          status: res.statusCode,
          duration,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });
      });

      next();
    });

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  }

  private setupRoutes(): void {
    // Health check endpoint (no authentication required)
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        service: 'waf-server'
      });
    });

    // Metrics endpoint for monitoring
    this.app.get('/metrics', async (req: Request, res: Response) => {
      try {
        const stats = await this.wafEngine.getStatistics();

        const metrics = `
# HELP waf_server_uptime_seconds Server uptime in seconds
# TYPE waf_server_uptime_seconds gauge
waf_server_uptime_seconds ${process.uptime()}

# HELP waf_server_memory_usage_bytes Memory usage in bytes
# TYPE waf_server_memory_usage_bytes gauge
waf_server_memory_usage_bytes ${process.memoryUsage().heapUsed}

# HELP waf_rules_total Total number of WAF rules
# TYPE waf_rules_total gauge
waf_rules_total ${stats.rulesCount}

# HELP waf_rules_enabled Number of enabled WAF rules
# TYPE waf_rules_enabled gauge
waf_rules_enabled ${stats.enabledRulesCount}
`;

        res.setHeader('Content-Type', 'text/plain');
        res.send(metrics);
      } catch (error) {
        this.logger.error('Failed to generate metrics', { error });
        res.status(500).json({ error: 'Failed to generate metrics' });
      }
    });

    // Status endpoint with detailed information
    this.app.get('/status', async (req: Request, res: Response) => {
      try {
        const stats = await this.wafEngine.getStatistics();
        const redisInfo = await this.redis.info('memory');

        res.json({
          server: {
            status: 'running',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            node_version: process.version,
            platform: process.platform
          },
          waf: stats,
          redis: {
            connected: this.redis.status === 'ready',
            memory: redisInfo
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Failed to get status', { error });
        res.status(500).json({ error: 'Failed to get server status' });
      }
    });

    // WAF API routes
    const wafAPIRouter = createWAFAPIRouter({
      wafEngine: this.wafEngine,
      wafMiddleware: this.wafMiddleware,
      redis: this.redis,
      logger: this.logger,
      requireAuth: true,
      adminApiKey: this.config.adminApiKey
    });

    this.app.use('/api/waf', wafAPIRouter);

    // Test endpoint for WAF functionality
    this.app.post('/test', this.wafMiddleware.middleware(), (req: Request, res: Response) => {
      const wafRequest = req as any;
      res.json({
        message: 'Request passed WAF analysis',
        waf: wafRequest.waf,
        timestamp: new Date().toISOString()
      });
    });

    // Catch-all error handler
    this.app.use((error: Error, req: Request, res: Response, next: any) => {
      this.logger.error('Unhandled error', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        ip: req.ip
      });

      res.status(500).json({
        error: 'Internal server error',
        message: this.config.enableDevMode ? error.message : 'Something went wrong',
        timestamp: new Date().toISOString()
      });
    });

    // 404 handler
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not found',
        message: 'The requested endpoint does not exist',
        path: req.path,
        timestamp: new Date().toISOString()
      });
    });
  }

  private setupWAF(): void {
    // Initialize WAF engine
    this.wafEngine = new WAFEngine(this.redis, this.logger);

    // Initialize WAF middleware
    this.wafMiddleware = new WAFMiddleware({
      redis: this.redis,
      logger: this.logger,
      enableDevMode: this.config.enableDevMode,
      bypassTokens: [], // Will be loaded from Redis
      whitelistIPs: [], // Will be loaded from Redis
      rateLimitHeaders: true,
      logAllRequests: !this.config.enableDevMode
    });

    this.logger.info('WAF components initialized');
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      this.logger.info(`Received ${signal}, starting graceful shutdown...`);

      // Stop accepting new connections
      this.server.close(() => {
        this.logger.info('HTTP server closed');
      });

      // Close Redis connection
      if (this.redis) {
        await this.redis.quit();
        this.logger.info('Redis connection closed');
      }

      // Exit process
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception', { error: error.message, stack: error.stack });
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled rejection', { reason, promise });
      process.exit(1);
    });
  }

  public async start(): Promise<void> {
    try {
      // Wait for Redis connection
      await this.redis.ping();
      this.logger.info('Redis connection verified');

      // Setup WAF components
      this.setupWAF();

      // Setup Express middleware and routes
      this.setupMiddleware();
      this.setupRoutes();

      // Setup graceful shutdown
      this.setupGracefulShutdown();

      // Start HTTP server
      this.server = this.app.listen(this.config.port, this.config.host, () => {
        this.logger.info('WAF Server started', {
          host: this.config.host,
          port: this.config.port,
          environment: this.config.enableDevMode ? 'development' : 'production',
          pid: process.pid
        });
      });

      // Handle server errors
      this.server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          this.logger.error(`Port ${this.config.port} is already in use`);
        } else {
          this.logger.error('Server error', { error: error.message });
        }
        process.exit(1);
      });

    } catch (error) {
      this.logger.error('Failed to start WAF server', { error: error.message });
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(async () => {
          if (this.redis) {
            await this.redis.quit();
          }
          this.logger.info('WAF Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  public getApp(): Application {
    return this.app;
  }

  public getWAFEngine(): WAFEngine {
    return this.wafEngine;
  }

  public getWAFMiddleware(): WAFMiddleware {
    return this.wafMiddleware;
  }
}

// Configuration loading
function loadConfig(): WAFServerConfig {
  return {
    port: parseInt(process.env.WAF_PORT || '7010'),
    host: process.env.WAF_HOST || '0.0.0.0',
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0')
    },
    adminApiKey: process.env.WAF_ADMIN_API_KEY || 'dev-admin-key-change-in-production',
    enableDevMode: process.env.NODE_ENV !== 'production',
    logLevel: process.env.LOG_LEVEL || 'info',
    cors: {
      origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
      credentials: true
    },
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX || '100')
    }
  };
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  const wafServer = new WAFServer(config);

  wafServer.start().catch((error) => {
    console.error('Failed to start WAF server:', error);
    process.exit(1);
  });
}

export { WAFServer, loadConfig };