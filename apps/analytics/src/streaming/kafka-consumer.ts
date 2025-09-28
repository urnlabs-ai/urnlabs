import { Kafka, Consumer, EachMessagePayload, ConsumerConfig } from 'kafkajs';
import { Logger } from '../utils/logger.js';
import { ClickHouseService } from './clickhouse-service.js';
import { StreamingMetric } from './kafka-producer.js';

export class KafkaConsumerService {
  private kafka: Kafka;
  private consumer: Consumer;
  private logger: Logger;
  private clickHouse: ClickHouseService;
  private isRunning: boolean = false;
  private processingBuffer: Map<string, StreamingMetric[]> = new Map();
  private flushInterval: NodeJS.Timeout;

  constructor(logger: Logger, clickHouse: ClickHouseService, config?: ConsumerConfig) {
    this.logger = logger;
    this.clickHouse = clickHouse;
    
    this.kafka = new Kafka({
      clientId: 'urnlabs-analytics-consumer',
      brokers: [process.env.KAFKA_BROKERS || 'localhost:29092'],
      retry: {
        initialRetryTime: 100,
        retries: 10,
        maxRetryTime: 30000,
        factor: 2
      },
      connectionTimeout: 3000,
      requestTimeout: 30000
    });

    this.consumer = this.kafka.consumer({
      groupId: 'analytics-consumer-group',
      sessionTimeout: 30000,
      rebalanceTimeout: 60000,
      heartbeatInterval: 3000,
      maxBytesPerPartition: 1048576, // 1MB
      minBytes: 1,
      maxBytes: 10485760, // 10MB
      maxWaitTimeInMs: 5000,
      ...config
    });

    // Flush buffer every 10 seconds for better batching
    this.flushInterval = setInterval(() => {
      this.flushBuffer().catch(error => {
        this.logger.error('Failed to flush processing buffer', { error });
      });
    }, 10000);
  }

  async start(): Promise<void> {
    try {
      await this.consumer.connect();
      
      // Subscribe to all analytics topics
      await this.consumer.subscribe({
        topics: [
          'analytics.performance',
          'analytics.agent',
          'analytics.business',
          'analytics.api',
          'analytics.workflow',
          'analytics.user',
          'analytics.error',
          'analytics.resource',
          'analytics.health'
        ],
        fromBeginning: false
      });

      await this.consumer.run({
        eachMessage: this.processMessage.bind(this),
        partitionsConsumedConcurrently: 3 // Process up to 3 partitions concurrently
      });

      this.isRunning = true;
      this.logger.info('Kafka consumer started successfully');
    } catch (error) {
      this.logger.error('Failed to start Kafka consumer', { error });
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      this.isRunning = false;
      
      // Flush any remaining buffered data
      await this.flushBuffer();
      
      await this.consumer.disconnect();
      
      if (this.flushInterval) {
        clearInterval(this.flushInterval);
      }
      
      this.logger.info('Kafka consumer stopped');
    } catch (error) {
      this.logger.error('Error stopping Kafka consumer', { error });
      throw error;
    }
  }

  /**
   * Process individual Kafka message
   */
  private async processMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, partition, message } = payload;
    
    try {
      if (!message.value) {
        this.logger.warn('Received empty message', { topic, partition });
        return;
      }

      const messageData = JSON.parse(message.value.toString());
      const metric: StreamingMetric = {
        ...messageData,
        timestamp: new Date(messageData.timestamp)
      };

      // Add to processing buffer for batch insertion
      if (!this.processingBuffer.has(topic)) {
        this.processingBuffer.set(topic, []);
      }
      this.processingBuffer.get(topic)!.push(metric);

      // Log processing
      this.logger.debug('Message processed', { 
        topic, 
        partition, 
        offset: message.offset,
        metricType: metric.type,
        service: metric.service
      });

      // Flush buffer if it gets too large (500 messages per topic)
      if (this.processingBuffer.get(topic)!.length >= 500) {
        await this.flushTopicBuffer(topic);
      }

    } catch (error) {
      this.logger.error('Failed to process Kafka message', { 
        error, 
        topic, 
        partition, 
        offset: message.offset 
      });
      
      // In production, you might want to send failed messages to a dead letter queue
      // For now, we'll log and continue
    }
  }

  /**
   * Flush all buffered data to ClickHouse
   */
  private async flushBuffer(): Promise<void> {
    if (this.processingBuffer.size === 0) {
      return;
    }

    const topics = Array.from(this.processingBuffer.keys());
    
    for (const topic of topics) {
      await this.flushTopicBuffer(topic);
    }
  }

  /**
   * Flush specific topic buffer to ClickHouse
   */
  private async flushTopicBuffer(topic: string): Promise<void> {
    const metrics = this.processingBuffer.get(topic);
    if (!metrics || metrics.length === 0) {
      return;
    }

    // Clear buffer immediately to prevent reprocessing
    this.processingBuffer.set(topic, []);

    try {
      // Group metrics by type for appropriate table insertion
      const groupedMetrics = this.groupMetricsByType(metrics);

      // Insert into appropriate ClickHouse tables
      for (const [metricType, metricsList] of groupedMetrics.entries()) {
        await this.insertMetricsToClickHouse(metricType, metricsList);
      }

      this.logger.info('Flushed metrics to ClickHouse', { 
        topic, 
        count: metrics.length 
      });

    } catch (error) {
      this.logger.error('Failed to flush metrics to ClickHouse', { 
        error, 
        topic, 
        count: metrics.length 
      });
      
      // Re-add metrics to buffer for retry
      this.processingBuffer.set(topic, [
        ...(this.processingBuffer.get(topic) || []),
        ...metrics
      ]);
    }
  }

  /**
   * Group metrics by type for appropriate table insertion
   */
  private groupMetricsByType(metrics: StreamingMetric[]): Map<string, StreamingMetric[]> {
    const grouped = new Map<string, StreamingMetric[]>();
    
    for (const metric of metrics) {
      if (!grouped.has(metric.type)) {
        grouped.set(metric.type, []);
      }
      grouped.get(metric.type)!.push(metric);
    }
    
    return grouped;
  }

  /**
   * Insert metrics into appropriate ClickHouse tables
   */
  private async insertMetricsToClickHouse(metricType: string, metrics: StreamingMetric[]): Promise<void> {
    switch (metricType) {
      case 'performance':
        await this.clickHouse.insertPerformanceMetrics(metrics);
        break;
      
      case 'agent':
        await this.clickHouse.insertAgentMetrics(metrics);
        break;
      
      case 'business':
        await this.clickHouse.insertBusinessMetrics(metrics);
        break;
      
      case 'api':
        await this.clickHouse.insertApiMetrics(metrics);
        break;
      
      case 'workflow':
        await this.clickHouse.insertWorkflowMetrics(metrics);
        break;
      
      case 'user':
        await this.clickHouse.insertUserBehaviorMetrics(metrics);
        break;
      
      case 'error':
        await this.clickHouse.insertErrorLogs(metrics);
        break;
      
      case 'resource':
        await this.clickHouse.insertResourceMetrics(metrics);
        break;
      
      default:
        this.logger.warn('Unknown metric type', { metricType });
    }
  }

  /**
   * Get consumer metrics
   */
  getMetrics(): {
    isRunning: boolean;
    bufferSize: number;
    topicBufferSizes: Record<string, number>;
  } {
    const topicBufferSizes: Record<string, number> = {};
    let totalBufferSize = 0;
    
    for (const [topic, metrics] of this.processingBuffer.entries()) {
      topicBufferSizes[topic] = metrics.length;
      totalBufferSize += metrics.length;
    }

    return {
      isRunning: this.isRunning,
      bufferSize: totalBufferSize,
      topicBufferSizes
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      return this.isRunning && this.clickHouse.isConnected();
    } catch (error) {
      this.logger.error('Consumer health check failed', { error });
      return false;
    }
  }

  /**
   * Get lag information for monitoring
   */
  async getLagInfo(): Promise<Record<string, any>> {
    try {
      const admin = this.kafka.admin();
      await admin.connect();
      
      // Get consumer group information
      const groups = await admin.listGroups();
      const analyticsGroup = groups.groups.find(g => g.groupId === 'analytics-consumer-group');
      
      if (!analyticsGroup) {
        return { error: 'Consumer group not found' };
      }

      // Get consumer group offsets
      const offsets = await admin.fetchOffsets({
        groupId: 'analytics-consumer-group',
        topics: [
          'analytics.performance',
          'analytics.agent',
          'analytics.business',
          'analytics.api',
          'analytics.workflow',
          'analytics.user',
          'analytics.error',
          'analytics.resource'
        ]
      });

      await admin.disconnect();
      
      return {
        consumerGroup: 'analytics-consumer-group',
        offsets: offsets
      };
      
    } catch (error) {
      this.logger.error('Failed to get lag info', { error });
      return { error: error.message };
    }
  }
}