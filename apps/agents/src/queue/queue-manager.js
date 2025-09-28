import { Queue, Worker } from 'bullmq';
import { EventEmitter } from 'events';
import Redis from 'ioredis';
import { logger, logQueueOperation } from '@/lib/logger.js';
import { queueConfig } from '@/lib/config.js';
export class QueueManager extends EventEmitter {
    redis;
    taskQueue;
    taskWorker;
    orchestrator; // Will be set via dependency injection
    constructor(redisUrl) {
        super();
        // Initialize Redis connection
        this.redis = new Redis(redisUrl, {
            // retryDelayOnFailure: queueConfig.redis.retryDelayOnFailure,
            maxRetriesPerRequest: queueConfig.redis.maxRetriesPerRequest,
            lazyConnect: true,
        });
        // Initialize task queue
        this.taskQueue = new Queue('agent-tasks', {
            connection: this.redis,
            defaultJobOptions: queueConfig.defaultJobOptions,
        });
        // Initialize worker
        this.taskWorker = new Worker('agent-tasks', async (job) => {
            return this.processTask(job);
        }, {
            connection: this.redis,
            concurrency: queueConfig.defaultJobOptions.attempts || 5,
        });
        this.setupEventListeners();
    }
    setOrchestrator(orchestrator) {
        this.orchestrator = orchestrator;
    }
    async startProcessing() {
        try {
            // Redis connection is handled automatically by BullMQ
            logger.info('Queue manager started processing tasks');
        }
        catch (error) {
            logger.error(error, 'Failed to start queue processing');
            throw error;
        }
    }
    async shutdown() {
        try {
            await this.taskWorker.close();
            await this.taskQueue.close();
            await this.redis.quit();
            logger.info('Queue manager shut down successfully');
        }
        catch (error) {
            logger.error(error, 'Error during queue manager shutdown');
        }
    }
    async addTask(context, priority = 0) {
        const jobData = {
            context,
            priority,
        };
        const job = await this.taskQueue.add('execute-task', jobData, {
            priority: priority,
            delay: 0,
        });
        logger.info({
            jobId: job.id,
            taskExecutionId: context.taskExecutionId,
            agentId: context.agentId,
            priority,
        }, 'Task added to queue');
        return job.id;
    }
    async getQueueStats() {
        const waiting = await this.taskQueue.getWaiting();
        const active = await this.taskQueue.getActive();
        const completed = await this.taskQueue.getCompleted();
        const failed = await this.taskQueue.getFailed();
        return {
            waiting: waiting.length,
            active: active.length,
            completed: completed.length,
            failed: failed.length,
            total: waiting.length + active.length + completed.length + failed.length,
        };
    }
    async getJobStatus(jobId) {
        const job = await this.taskQueue.getJob(jobId);
        if (!job) {
            throw new Error(`Job not found: ${jobId}`);
        }
        return {
            id: job.id,
            name: job.name,
            data: job.data,
            opts: job.opts,
            progress: job.progress,
            returnvalue: job.returnvalue,
            failedReason: job.failedReason,
            stacktrace: job.stacktrace,
            processedOn: job.processedOn,
            finishedOn: job.finishedOn,
            timestamp: job.timestamp,
        };
    }
    async retryFailedJobs() {
        const failedJobs = await this.taskQueue.getFailed();
        let retriedCount = 0;
        for (const job of failedJobs) {
            try {
                await job.retry();
                retriedCount++;
            }
            catch (error) {
                logger.error(error, `Failed to retry job ${job.id}`);
            }
        }
        logger.info({ retriedCount }, 'Retried failed jobs');
        return retriedCount;
    }
    async cleanQueue(maxAge = 86400000) {
        // Clean completed jobs older than maxAge (default 24 hours)
        await this.taskQueue.clean(maxAge, 100, 'completed');
        await this.taskQueue.clean(maxAge, 50, 'failed');
        logger.info({ maxAge }, 'Queue cleaned');
    }
    async processTask(job) {
        const startTime = Date.now();
        const { context } = job.data;
        try {
            logQueueOperation('process_task', 'agent-tasks', job.id, 'started');
            // Update job progress
            await job.updateProgress(0);
            if (!this.orchestrator) {
                throw new Error('Orchestrator not set on queue manager');
            }
            // Execute task through orchestrator
            await job.updateProgress(25);
            const result = await this.orchestrator.executeTask(context);
            await job.updateProgress(100);
            const duration = Date.now() - startTime;
            logQueueOperation('process_task', 'agent-tasks', job.id, 'completed', duration);
            this.emit('task_completed', {
                jobId: job.id,
                taskExecutionId: context.taskExecutionId,
                result,
                duration,
            });
            return result;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);
            logQueueOperation('process_task', 'agent-tasks', job.id, 'failed', duration, errorMessage);
            this.emit('task_failed', {
                jobId: job.id,
                taskExecutionId: context.taskExecutionId,
                error: errorMessage,
                duration,
            });
            throw error;
        }
    }
    setupEventListeners() {
        // Queue event listeners
        this.taskQueue.on('error', (error) => {
            logger.error(error, 'Task queue error');
        });
        this.taskQueue.on('waiting', (job) => {
            logger.debug({ jobId: job.id }, 'Job waiting in queue');
        });
        // Worker event listeners
        this.taskWorker.on('completed', (job) => {
            logger.info({
                jobId: job.id,
                duration: job.finishedOn ? job.finishedOn - job.processedOn : undefined,
            }, 'Task completed');
        });
        this.taskWorker.on('failed', (job, error) => {
            logger.error({
                jobId: job?.id,
                error: error.message,
                attemptsMade: job?.attemptsMade,
                attemptsTotal: job?.opts.attempts,
            }, 'Task failed');
        });
        this.taskWorker.on('error', (error) => {
            logger.error(error, 'Task worker error');
        });
        this.taskWorker.on('stalled', (jobId) => {
            logger.warn({ jobId }, 'Task stalled');
        });
        // Redis connection events
        this.redis.on('connect', () => {
            logger.info('Redis connected');
        });
        this.redis.on('error', (error) => {
            logger.error(error, 'Redis connection error');
        });
        this.redis.on('close', () => {
            logger.info('Redis connection closed');
        });
    }
}
//# sourceMappingURL=queue-manager.js.map