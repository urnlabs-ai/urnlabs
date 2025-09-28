import { Kafka, Producer, ProducerConfig } from 'kafkajs';
import { Logger } from '../utils/logger.js';

export interface KafkaMessage {
  topic: string;
  key?: string;
  value: string;
  headers?: Record<string, string>;
  timestamp?: Date;
}

export interface StreamingMetric {
  id: string;
  timestamp: Date;
  service: string;
  type: 'performance' | 'agent' | 'business' | 'api' | 'workflow' | 'user' | 'error' | 'resource';
  data: Record<string, any>;
  metadata?: Record<string, any>;
}

export class KafkaProducerService {
  private kafka: Kafka;
  private producer: Producer;
  private logger: Logger;
  private isConnected: boolean = false;
  private messageBuffer: KafkaMessage[] = [];
  private flushInterval: NodeJS.Timeout;

  constructor(logger: Logger, config?: ProducerConfig) {
    this.logger = logger;
    
    this.kafka = new Kafka({
      clientId: 'urnlabs-analytics-producer',
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

    this.producer = this.kafka.producer({
      maxInFlightRequests: 1,
      idempotent: true,
      transactionTimeout: 30000,
      ...config
    });

    // Flush buffer every 5 seconds
    this.flushInterval = setInterval(() => {
      this.flushBuffer().catch(error => {
        this.logger.error('Failed to flush Kafka message buffer', { error });
      });
    }, 5000);
  }

  async connect(): Promise<void> {
    try {
      await this.producer.connect();
      this.isConnected = true;
      this.logger.info('Kafka producer connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect Kafka producer', { error });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      // Flush any remaining messages
      await this.flushBuffer();
      
      await this.producer.disconnect();
      this.isConnected = false;
      
      if (this.flushInterval) {
        clearInterval(this.flushInterval);
      }
      
      this.logger.info('Kafka producer disconnected');
    } catch (error) {
      this.logger.error('Error disconnecting Kafka producer', { error });
      throw error;
    }
  }

  /**
   * Send a streaming metric to Kafka
   */
  async sendMetric(metric: StreamingMetric): Promise<void> {
    const message: KafkaMessage = {
      topic: `analytics.${metric.type}`,
      key: metric.id,
      value: JSON.stringify({
        ...metric,
        timestamp: metric.timestamp.toISOString()
      }),
      headers: {
        'content-type': 'application/json',
        'service': metric.service,
        'metric-type': metric.type,
        'timestamp': metric.timestamp.getTime().toString()
      },
      timestamp: metric.timestamp
    };

    await this.sendMessage(message);
  }

  /**
   * Send performance metrics to Kafka
   */
  async sendPerformanceMetric(data: {
    id: string;
    service: string;
    endpoint?: string;
    metric_type: string;
    value: number;
    unit: string;
    tags?: Record<string, string>;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const metric: StreamingMetric = {
      id: data.id,
      timestamp: new Date(),
      service: data.service,
      type: 'performance',
      data,
      metadata: data.metadata
    };

    await this.sendMetric(metric);
  }

  /**
   * Send agent performance metrics to Kafka
   */
  async sendAgentMetric(data: {
    id: string;
    service: string;
    agent_id: string;
    workflow_id?: string;
    success: boolean;
    execution_time_ms: number;
    cost_cents: number;
    tokens_used?: number;
    tags?: Record<string, string>;
  }): Promise<void> {
    const metric: StreamingMetric = {
      id: data.id,
      timestamp: new Date(),
      service: data.service,
      type: 'agent',
      data
    };

    await this.sendMetric(metric);
  }

  /**
   * Send API request metrics to Kafka
   */
  async sendApiMetric(data: {
    id: string;
    method: string;
    endpoint: string;
    status_code: number;
    response_time_ms: number;
    request_size_bytes: number;
    response_size_bytes: number;
    user_id?: string;
    ip_address: string;
    user_agent: string;
    error_message?: string;
  }): Promise<void> {
    const metric: StreamingMetric = {
      id: data.id,
      timestamp: new Date(),
      service: 'api-gateway',
      type: 'api',
      data
    };

    await this.sendMetric(metric);
  }

  /**
   * Send workflow execution metrics to Kafka
   */
  async sendWorkflowMetric(data: {
    id: string;
    workflow_id: string;
    workflow_name: string;
    execution_id: string;
    status: string;
    duration_ms?: number;
    agent_count: number;
    total_cost_cents: number;
    success_rate: number;
    error_message?: string;
    metadata?: Record<string, string>;
  }): Promise<void> {
    const metric: StreamingMetric = {
      id: data.id,
      timestamp: new Date(),
      service: 'workflow-engine',
      type: 'workflow',
      data
    };

    await this.sendMetric(metric);
  }

  /**
   * Send user behavior metrics to Kafka
   */
  async sendUserBehaviorMetric(data: {
    id: string;
    user_id: string;
    session_id: string;
    event_type: string;
    page_path: string;
    duration_ms: number;
    metadata?: Record<string, string>;
  }): Promise<void> {
    const metric: StreamingMetric = {
      id: data.id,
      timestamp: new Date(),
      service: 'web-analytics',
      type: 'user',
      data
    };

    await this.sendMetric(metric);
  }

  /**
   * Send error log to Kafka
   */
  async sendErrorLog(data: {
    id: string;
    service: string;
    level: string;
    message: string;
    stack_trace?: string;
    request_id?: string;
    user_id?: string;
    metadata?: Record<string, string>;
  }): Promise<void> {
    const metric: StreamingMetric = {
      id: data.id,
      timestamp: new Date(),
      service: data.service,
      type: 'error',
      data
    };

    await this.sendMetric(metric);
  }

  /**
   * Send resource utilization metrics to Kafka
   */
  async sendResourceMetric(data: {
    id: string;
    service: string;
    instance_id: string;
    cpu_percent: number;
    memory_percent: number;
    disk_percent: number;
    network_in_bytes: number;
    network_out_bytes: number;
  }): Promise<void> {
    const metric: StreamingMetric = {
      id: data.id,
      timestamp: new Date(),
      service: data.service,
      type: 'resource',
      data
    };

    await this.sendMetric(metric);
  }

  /**
   * Send a message to Kafka (with buffering for reliability)
   */
  private async sendMessage(message: KafkaMessage): Promise<void> {
    if (!this.isConnected) {
      // Buffer message if not connected
      this.messageBuffer.push(message);
      this.logger.warn('Kafka not connected, buffering message', { 
        topic: message.topic, 
        bufferSize: this.messageBuffer.length 
      });
      return;
    }

    try {
      await this.producer.send({
        topic: message.topic,
        messages: [{
          key: message.key,
          value: message.value,
          headers: message.headers,
          timestamp: message.timestamp?.getTime().toString()
        }]
      });

      this.logger.debug('Message sent to Kafka', { 
        topic: message.topic, 
        key: message.key 
      });
    } catch (error) {
      this.logger.error('Failed to send message to Kafka', { 
        error, 
        topic: message.topic, 
        key: message.key 
      });
      
      // Add to buffer for retry
      this.messageBuffer.push(message);
      throw error;
    }
  }

  /**
   * Flush buffered messages
   */
  private async flushBuffer(): Promise<void> {
    if (this.messageBuffer.length === 0 || !this.isConnected) {
      return;
    }

    const messagesToSend = [...this.messageBuffer];
    this.messageBuffer = [];

    this.logger.info('Flushing Kafka message buffer', { count: messagesToSend.length });

    for (const message of messagesToSend) {
      try {
        await this.sendMessage(message);
      } catch (error) {
        // Message will be re-added to buffer by sendMessage on failure
        this.logger.error('Failed to flush message', { 
          error, 
          topic: message.topic 
        });
      }
    }
  }

  /**
   * Get producer metrics
   */
  getMetrics(): {
    isConnected: boolean;
    bufferSize: number;
  } {
    return {
      isConnected: this.isConnected,
      bufferSize: this.messageBuffer.length
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      // Send a test message to verify connection
      await this.producer.send({
        topic: 'analytics.health',
        messages: [{
          value: JSON.stringify({
            type: 'health_check',
            timestamp: new Date().toISOString(),
            service: 'analytics'
          })
        }]
      });

      return true;
    } catch (error) {
      this.logger.error('Kafka health check failed', { error });
      return false;
    }
  }
}