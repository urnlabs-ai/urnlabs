export declare const config: {
    NODE_ENV: "development" | "staging" | "production";
    PORT: number;
    HOST: string;
    DATABASE_URL: string;
    AGENT_QUEUE_CONCURRENCY: number;
    LOG_LEVEL: "error" | "info" | "warn" | "fatal" | "debug" | "trace";
    JWT_SECRET: string;
    DATABASE_POOL_SIZE: number;
    JWT_EXPIRES_IN: string;
    BCRYPT_SALT_ROUNDS: number;
    CORS_ORIGINS: string[];
    RATE_LIMIT_MAX: number;
    RATE_LIMIT_WINDOW: string;
    READINESS_REQUIRE_SCHEMA: boolean;
    REDIS_URL?: string | undefined;
    CLAUDE_API_KEY?: string | undefined;
    OPENAI_API_KEY?: string | undefined;
    GITHUB_TOKEN?: string | undefined;
    SLACK_BOT_TOKEN?: string | undefined;
    SLACK_TEAM_ID?: string | undefined;
    MONITORING_API_KEY?: string | undefined;
    SMTP_HOST?: string | undefined;
    SMTP_PORT?: number | undefined;
    SMTP_USER?: string | undefined;
    SMTP_PASS?: string | undefined;
    S3_BUCKET?: string | undefined;
    S3_REGION?: string | undefined;
    S3_ACCESS_KEY_ID?: string | undefined;
    S3_SECRET_ACCESS_KEY?: string | undefined;
};
export declare const isDevelopment: boolean;
export declare const isProduction: boolean;
export declare const isStaging: boolean;
export declare const features: {
    readonly githubIntegration: boolean;
    readonly slackNotifications: boolean;
    readonly claudeIntegration: boolean;
    readonly redisCache: boolean;
    readonly emailNotifications: boolean;
    readonly fileUploads: boolean;
};
export declare const databaseConfig: {
    readonly url: string;
    readonly poolSize: number;
    readonly ssl: false | {
        rejectUnauthorized: boolean;
    };
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