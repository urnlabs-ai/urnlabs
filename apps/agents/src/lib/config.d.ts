export declare const config: {
    NODE_ENV: "development" | "staging" | "production";
    AGENT_SERVICE_PORT: number;
    HOST: string;
    DATABASE_URL: string;
    REDIS_URL: string;
    AGENT_QUEUE_CONCURRENCY: number;
    AGENT_TASK_TIMEOUT: number;
    AGENT_MAX_RETRIES: number;
    AGENT_MEMORY_LIMIT: number;
    QUEUE_REDIS_PREFIX: string;
    QUEUE_DEFAULT_DELAY: number;
    QUEUE_MAX_ATTEMPTS: number;
    QUEUE_BACKOFF_TYPE: "fixed" | "exponential";
    QUEUE_BACKOFF_DELAY: number;
    LOG_LEVEL: "error" | "info" | "warn" | "fatal" | "debug" | "trace";
    METRICS_ENABLED: boolean;
    PERFORMANCE_MONITORING: boolean;
    API_KEY_HEADER: string;
    ENABLE_WEBSOCKETS: boolean;
    ENABLE_REAL_TIME_MONITORING: boolean;
    ENABLE_WORKFLOW_CACHING: boolean;
    ENABLE_AGENT_LEARNING: boolean;
    CLAUDE_API_KEY?: string | undefined;
    OPENAI_API_KEY?: string | undefined;
    ANTHROPIC_API_KEY?: string | undefined;
    JWT_SECRET?: string | undefined;
    GITHUB_TOKEN?: string | undefined;
    SLACK_BOT_TOKEN?: string | undefined;
    SLACK_WEBHOOK_URL?: string | undefined;
};
export declare const isDevelopment: boolean;
export declare const isProduction: boolean;
export declare const isStaging: boolean;
export declare const features: {
    readonly websockets: boolean;
    readonly realTimeMonitoring: boolean;
    readonly workflowCaching: boolean;
    readonly agentLearning: boolean;
    readonly githubIntegration: boolean;
    readonly slackNotifications: boolean;
    readonly openaiSupport: boolean;
};
export declare const agentConfig: {
    readonly maxConcurrency: number;
    readonly taskTimeout: number;
    readonly maxRetries: number;
    readonly memoryLimit: number;
};
export declare const queueConfig: {
    readonly redis: {
        readonly host: string;
        readonly port: number;
        readonly password: string | undefined;
        readonly db: number;
        readonly retryDelayOnFailure: 5000;
        readonly maxRetriesPerRequest: null;
    };
    readonly prefix: string;
    readonly defaultJobOptions: {
        readonly delay: number;
        readonly attempts: number;
        readonly backoff: {
            readonly type: "fixed" | "exponential";
            readonly delay: number;
        };
        readonly removeOnComplete: 100;
        readonly removeOnFail: 50;
    };
};
export declare const modelConfig: {
    readonly claude: {
        readonly apiKey: string | undefined;
        readonly model: "claude-3-5-sonnet-20241022";
        readonly maxTokens: 4096;
        readonly temperature: 0.1;
        readonly timeout: 60000;
    };
    readonly openai: {
        apiKey: string;
        model: string;
        maxTokens: number;
        temperature: number;
        timeout: number;
    } | null;
};
export declare const logConfig: {
    readonly level: "error" | "info" | "warn" | "fatal" | "debug" | "trace";
    readonly transport: {
        target: string;
        options: {
            colorize: boolean;
            translateTime: string;
            ignore: string;
        };
    } | undefined;
};
//# sourceMappingURL=config.d.ts.map