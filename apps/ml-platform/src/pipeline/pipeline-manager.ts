import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import fs from 'fs/promises';
import path from 'path';
import { 
  FineTuningJob, 
  Dataset, 
  HyperParameters, 
  TrainingMetrics,
  DatasetValidation,
  ModelRequest,
  ModelResponse 
} from '../types/index.js';
import { ModelManager } from '../models/model-manager.js';
import { VectorDatabaseManager } from '../vector/vector-manager.js';
import { logger } from '../lib/logger.js';
import { config } from '../lib/config.js';

export class MLPipelineManager {
  private redis: IORedis;
  private fineTuningQueue: Queue;
  private trainingQueue: Queue;
  private deploymentQueue: Queue;
  private fineTuningWorker: Worker;
  private trainingWorker: Worker;
  private deploymentWorker: Worker;
  private modelManager: ModelManager;
  private vectorManager: VectorDatabaseManager;
  private jobs: Map<string, FineTuningJob> = new Map();

  constructor(modelManager: ModelManager, vectorManager: VectorDatabaseManager) {
    this.modelManager = modelManager;
    this.vectorManager = vectorManager;
    
    // Initialize Redis connection
    this.redis = new IORedis({
      host: config.REDIS_HOST || 'localhost',
      port: config.REDIS_PORT || 6379,
      password: config.REDIS_PASSWORD,
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
    });

    // Initialize queues
    this.fineTuningQueue = new Queue('fine-tuning', { connection: this.redis });
    this.trainingQueue = new Queue('training', { connection: this.redis });
    this.deploymentQueue = new Queue('deployment', { connection: this.redis });

    // Initialize workers
    this.initializeWorkers();
  }

  private initializeWorkers(): void {
    // Fine-tuning worker
    this.fineTuningWorker = new Worker(
      'fine-tuning',
      async (job: Job) => {
        const fineTuningJob = job.data as FineTuningJob;
        return await this.processFineTuningJob(fineTuningJob, job);
      },
      { 
        connection: this.redis,
        concurrency: 2,
        limiter: {
          max: 5,
          duration: 60000, // 1 minute
        }
      }
    );

    // Custom training worker
    this.trainingWorker = new Worker(
      'training',
      async (job: Job) => {
        const trainingJob = job.data;
        return await this.processCustomTrainingJob(trainingJob, job);
      },
      { 
        connection: this.redis,
        concurrency: 1, // Resource intensive, limit concurrency
      }
    );

    // Deployment worker
    this.deploymentWorker = new Worker(
      'deployment',
      async (job: Job) => {
        const deploymentJob = job.data;
        return await this.processDeploymentJob(deploymentJob, job);
      },
      { 
        connection: this.redis,
        concurrency: 3,
      }
    );

    // Set up error handlers
    [this.fineTuningWorker, this.trainingWorker, this.deploymentWorker].forEach(worker => {
      worker.on('error', (error) => {
        logger.error('Worker error:', error);
      });

      worker.on('failed', (job, error) => {
        logger.error(`Job ${job?.id} failed:`, error);
      });

      worker.on('completed', (job) => {
        logger.info(`Job ${job.id} completed successfully`);
      });
    });

    logger.info('ML Pipeline workers initialized');
  }

  // Dataset Management
  async validateDataset(dataset: Dataset): Promise<DatasetValidation> {
    try {
      const filePath = dataset.path;
      const fileContent = await fs.readFile(filePath, 'utf-8');
      
      let samples: any[] = [];
      const errors: string[] = [];
      const warnings: string[] = [];

      // Parse based on format
      switch (dataset.format) {
        case 'jsonl':
          const lines = fileContent.trim().split('\n');
          for (let i = 0; i < lines.length; i++) {
            try {
              const sample = JSON.parse(lines[i]);
              samples.push(sample);
            } catch (e) {
              errors.push(`Line ${i + 1}: Invalid JSON`);
            }
          }
          break;

        case 'json':
          try {
            samples = JSON.parse(fileContent);
            if (!Array.isArray(samples)) {
              errors.push('JSON file must contain an array of samples');
            }
          } catch (e) {
            errors.push('Invalid JSON format');
          }
          break;

        case 'csv':
          // Basic CSV parsing (could be enhanced with a proper CSV library)
          const csvLines = fileContent.trim().split('\n');
          const headers = csvLines[0].split(',');
          for (let i = 1; i < csvLines.length; i++) {
            const values = csvLines[i].split(',');
            if (values.length !== headers.length) {
              errors.push(`Line ${i + 1}: Column count mismatch`);
              continue;
            }
            const sample: any = {};
            headers.forEach((header, index) => {
              sample[header.trim()] = values[index].trim();
            });
            samples.push(sample);
          }
          break;

        default:
          errors.push(`Unsupported format: ${dataset.format}`);
      }

      // Validate dataset type-specific requirements
      switch (dataset.type) {
        case 'conversation':
          for (let i = 0; i < samples.length; i++) {
            const sample = samples[i];
            if (!sample.messages || !Array.isArray(sample.messages)) {
              errors.push(`Sample ${i + 1}: Missing or invalid 'messages' field`);
            } else {
              for (const message of sample.messages) {
                if (!message.role || !message.content) {
                  errors.push(`Sample ${i + 1}: Message missing 'role' or 'content'`);
                }
              }
            }
          }
          break;

        case 'completion':
          for (let i = 0; i < samples.length; i++) {
            const sample = samples[i];
            if (!sample.prompt || !sample.completion) {
              errors.push(`Sample ${i + 1}: Missing 'prompt' or 'completion' field`);
            }
          }
          break;

        case 'classification':
          for (let i = 0; i < samples.length; i++) {
            const sample = samples[i];
            if (!sample.text || sample.label === undefined) {
              errors.push(`Sample ${i + 1}: Missing 'text' or 'label' field`);
            }
          }
          break;
      }

      // Calculate statistics
      const lengths = samples.map(sample => {
        const text = dataset.type === 'conversation' 
          ? sample.messages?.map((m: any) => m.content).join(' ') || ''
          : sample.prompt || sample.text || JSON.stringify(sample);
        return text.length;
      });

      const statistics = {
        avgLength: lengths.reduce((a, b) => a + b, 0) / lengths.length || 0,
        minLength: Math.min(...lengths) || 0,
        maxLength: Math.max(...lengths) || 0,
        uniqueSamples: new Set(samples.map(s => JSON.stringify(s))).size
      };

      // Check for potential issues
      if (statistics.uniqueSamples < samples.length) {
        warnings.push(`${samples.length - statistics.uniqueSamples} duplicate samples detected`);
      }

      if (statistics.avgLength < 10) {
        warnings.push('Average sample length is very short');
      }

      if (statistics.maxLength > 8000) {
        warnings.push('Some samples exceed recommended maximum length');
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        statistics
      };

    } catch (error) {
      logger.error('Dataset validation error:', error);
      return {
        isValid: false,
        errors: [`Failed to validate dataset: ${error}`],
        warnings: [],
        statistics: {
          avgLength: 0,
          minLength: 0,
          maxLength: 0,
          uniqueSamples: 0
        }
      };
    }
  }

  async createDataset(
    name: string,
    type: Dataset['type'],
    format: Dataset['format'],
    filePath: string,
    metadata?: Record<string, any>
  ): Promise<Dataset> {
    const stats = await fs.stat(filePath);
    
    // Count samples based on format
    let samples = 0;
    const fileContent = await fs.readFile(filePath, 'utf-8');
    
    switch (format) {
      case 'jsonl':
        samples = fileContent.trim().split('\n').length;
        break;
      case 'json':
        const jsonData = JSON.parse(fileContent);
        samples = Array.isArray(jsonData) ? jsonData.length : 1;
        break;
      case 'csv':
        samples = fileContent.trim().split('\n').length - 1; // Exclude header
        break;
    }

    const dataset: Dataset = {
      id: `dataset_${Date.now()}`,
      name,
      type,
      path: filePath,
      size: stats.size,
      samples,
      format,
      metadata
    };

    // Validate the dataset
    dataset.validation = await this.validateDataset(dataset);

    logger.info(`Created dataset: ${name} with ${samples} samples`);
    return dataset;
  }

  // Fine-tuning Jobs
  async createFineTuningJob(
    modelId: string,
    provider: string,
    dataset: Dataset,
    hyperparameters: HyperParameters = {},
    metadata?: Record<string, any>
  ): Promise<FineTuningJob> {
    const job: FineTuningJob = {
      id: `ft_${Date.now()}`,
      model: modelId,
      provider,
      dataset,
      hyperparameters: {
        learningRate: 0.0001,
        batchSize: 16,
        epochs: 3,
        ...hyperparameters
      },
      status: 'pending',
      createdAt: new Date()
    };

    this.jobs.set(job.id, job);

    // Add to queue
    await this.fineTuningQueue.add('fine-tune', job, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: 10,
      removeOnFail: 5
    });

    logger.info(`Created fine-tuning job: ${job.id} for model: ${modelId}`);
    return job;
  }

  private async processFineTuningJob(job: FineTuningJob, queueJob: Job): Promise<any> {
    try {
      // Update job status
      job.status = 'running';
      job.startedAt = new Date();
      this.jobs.set(job.id, job);

      await queueJob.updateProgress(10);

      // Validate dataset first
      if (!job.dataset.validation?.isValid) {
        throw new Error('Dataset validation failed');
      }

      await queueJob.updateProgress(20);

      // Handle different providers
      let result: any;
      
      switch (job.provider) {
        case 'openai':
          result = await this.processOpenAIFineTuning(job, queueJob);
          break;
        case 'anthropic':
          // Anthropic doesn't support fine-tuning yet
          throw new Error('Anthropic fine-tuning not supported');
        case 'huggingface':
          result = await this.processHuggingFaceFineTuning(job, queueJob);
          break;
        default:
          throw new Error(`Fine-tuning not supported for provider: ${job.provider}`);
      }

      await queueJob.updateProgress(90);

      // Update job with results
      job.status = 'completed';
      job.completedAt = new Date();
      job.metrics = result.metrics;
      this.jobs.set(job.id, job);

      await queueJob.updateProgress(100);

      logger.info(`Fine-tuning job completed: ${job.id}`);
      return result;

    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : String(error);
      job.completedAt = new Date();
      this.jobs.set(job.id, job);

      logger.error(`Fine-tuning job failed: ${job.id}`, error);
      throw error;
    }
  }

  private async processOpenAIFineTuning(job: FineTuningJob, queueJob: Job): Promise<any> {
    // This would integrate with OpenAI's fine-tuning API
    // For now, simulate the process
    
    await queueJob.updateProgress(30);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate training

    await queueJob.updateProgress(50);
    await new Promise(resolve => setTimeout(resolve, 2000));

    await queueJob.updateProgress(70);
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Simulate training metrics
    const metrics: TrainingMetrics = {
      loss: 0.1 + Math.random() * 0.5,
      accuracy: 0.8 + Math.random() * 0.15,
      perplexity: 1.5 + Math.random() * 0.5
    };

    return {
      modelId: `${job.model}-ft-${job.id}`,
      metrics,
      provider: 'openai'
    };
  }

  private async processHuggingFaceFineTuning(job: FineTuningJob, queueJob: Job): Promise<any> {
    // This would integrate with Hugging Face's training infrastructure
    // For now, simulate the process
    
    await queueJob.updateProgress(30);
    await new Promise(resolve => setTimeout(resolve, 3000));

    await queueJob.updateProgress(60);
    await new Promise(resolve => setTimeout(resolve, 3000));

    const metrics: TrainingMetrics = {
      loss: 0.15 + Math.random() * 0.4,
      f1: 0.75 + Math.random() * 0.2,
      precision: 0.8 + Math.random() * 0.15,
      recall: 0.78 + Math.random() * 0.17
    };

    return {
      modelId: `${job.model}-ft-${job.id}`,
      metrics,
      provider: 'huggingface'
    };
  }

  // Custom Training Jobs
  async createCustomTrainingJob(
    modelArchitecture: string,
    dataset: Dataset,
    hyperparameters: HyperParameters,
    outputPath: string
  ): Promise<string> {
    const jobId = `train_${Date.now()}`;
    
    const trainingJob = {
      id: jobId,
      architecture: modelArchitecture,
      dataset,
      hyperparameters,
      outputPath,
      status: 'pending',
      createdAt: new Date()
    };

    await this.trainingQueue.add('custom-train', trainingJob, {
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 10000,
      }
    });

    logger.info(`Created custom training job: ${jobId}`);
    return jobId;
  }

  private async processCustomTrainingJob(trainingJob: any, queueJob: Job): Promise<any> {
    // This would implement custom model training using TensorFlow.js or similar
    // For now, simulate the process
    
    await queueJob.updateProgress(20);
    await new Promise(resolve => setTimeout(resolve, 5000));

    await queueJob.updateProgress(40);
    await new Promise(resolve => setTimeout(resolve, 5000));

    await queueJob.updateProgress(60);
    await new Promise(resolve => setTimeout(resolve, 5000));

    await queueJob.updateProgress(80);
    await new Promise(resolve => setTimeout(resolve, 3000));

    await queueJob.updateProgress(100);

    logger.info(`Custom training job completed: ${trainingJob.id}`);
    return {
      modelPath: path.join(trainingJob.outputPath, `model_${trainingJob.id}`),
      metrics: {
        loss: 0.2 + Math.random() * 0.3,
        accuracy: 0.85 + Math.random() * 0.1
      }
    };
  }

  // Model Deployment
  async deployModel(
    modelId: string,
    modelPath: string,
    deployment: {
      name: string;
      environment: 'development' | 'staging' | 'production';
      resources: {
        cpu: string;
        memory: string;
        gpu?: string;
      };
      scaling: {
        minReplicas: number;
        maxReplicas: number;
        targetCPU: number;
      };
    }
  ): Promise<string> {
    const deploymentId = `deploy_${Date.now()}`;
    
    const deploymentJob = {
      id: deploymentId,
      modelId,
      modelPath,
      deployment,
      status: 'pending',
      createdAt: new Date()
    };

    await this.deploymentQueue.add('deploy', deploymentJob, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      }
    });

    logger.info(`Created deployment job: ${deploymentId} for model: ${modelId}`);
    return deploymentId;
  }

  private async processDeploymentJob(deploymentJob: any, queueJob: Job): Promise<any> {
    await queueJob.updateProgress(25);
    
    // Simulate container build
    await new Promise(resolve => setTimeout(resolve, 3000));
    await queueJob.updateProgress(50);

    // Simulate deployment
    await new Promise(resolve => setTimeout(resolve, 2000));
    await queueJob.updateProgress(75);

    // Simulate health check
    await new Promise(resolve => setTimeout(resolve, 1000));
    await queueJob.updateProgress(100);

    const endpoint = `https://api.urnlabs.ai/models/${deploymentJob.modelId}/predict`;
    
    logger.info(`Model deployed: ${deploymentJob.modelId} at ${endpoint}`);
    return {
      endpoint,
      status: 'healthy',
      deployment: deploymentJob.deployment
    };
  }

  // Job Management
  getFineTuningJob(jobId: string): FineTuningJob | undefined {
    return this.jobs.get(jobId);
  }

  getAllFineTuningJobs(): FineTuningJob[] {
    return Array.from(this.jobs.values());
  }

  async cancelJob(jobId: string): Promise<boolean> {
    const job = await this.fineTuningQueue.getJob(jobId) || 
               await this.trainingQueue.getJob(jobId) ||
               await this.deploymentQueue.getJob(jobId);

    if (job) {
      await job.remove();
      
      // Update local job if it exists
      const localJob = this.jobs.get(jobId);
      if (localJob) {
        localJob.status = 'cancelled';
        this.jobs.set(jobId, localJob);
      }
      
      logger.info(`Cancelled job: ${jobId}`);
      return true;
    }

    return false;
  }

  async getQueueStats(): Promise<any> {
    const [fineTuningStats, trainingStats, deploymentStats] = await Promise.all([
      this.fineTuningQueue.getWaiting(),
      this.trainingQueue.getWaiting(),
      this.deploymentQueue.getWaiting()
    ]);

    return {
      fineTuning: {
        waiting: fineTuningStats.length,
        active: (await this.fineTuningQueue.getActive()).length,
        completed: (await this.fineTuningQueue.getCompleted()).length,
        failed: (await this.fineTuningQueue.getFailed()).length
      },
      training: {
        waiting: trainingStats.length,
        active: (await this.trainingQueue.getActive()).length,
        completed: (await this.trainingQueue.getCompleted()).length,
        failed: (await this.trainingQueue.getFailed()).length
      },
      deployment: {
        waiting: (await this.deploymentQueue.getWaiting()).length,
        active: (await this.deploymentQueue.getActive()).length,
        completed: (await this.deploymentQueue.getCompleted()).length,
        failed: (await this.deploymentQueue.getFailed()).length
      }
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch (error) {
      logger.error('Pipeline manager health check failed:', error);
      return false;
    }
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down ML Pipeline Manager...');
    
    await Promise.all([
      this.fineTuningWorker.close(),
      this.trainingWorker.close(),
      this.deploymentWorker.close()
    ]);

    await Promise.all([
      this.fineTuningQueue.close(),
      this.trainingQueue.close(),
      this.deploymentQueue.close()
    ]);

    await this.redis.disconnect();
    logger.info('ML Pipeline Manager shutdown complete');
  }
}