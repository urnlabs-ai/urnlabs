/**
 * Agent Executor Service
 * Interfaces with the agent registry to execute workflow steps
 */

import { 
  StepExecution, 
  ExecutionContext, 
  ExecutionLog,
  ExecutionError 
} from '@/types/workflow.js';
import axios, { AxiosResponse } from 'axios';

/**
 * Agent execution result
 */
export interface AgentExecutionResult {
  output: Record<string, any>;
  logs: ExecutionLog[];
  metrics?: Record<string, number>;
}

/**
 * Agent registry configuration
 */
export interface AgentRegistryConfig {
  baseUrl: string;
  timeout: number;
  retries: number;
  apiKey?: string;
}

/**
 * Agent information from registry
 */
export interface AgentInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  capabilities: string[];
  endpoints: {
    execute: string;
    health: string;
  };
  configuration: {
    timeout: number;
    retries: number;
    inputSchema?: object;
    outputSchema?: object;
  };
}

/**
 * Agent Executor Service
 */
export class AgentExecutorService {
  private config: AgentRegistryConfig;
  private agentCache: Map<string, AgentInfo> = new Map();

  constructor(config: AgentRegistryConfig) {
    this.config = config;
  }

  /**
   * Execute workflow step using appropriate agent
   */
  public async executeStep(
    stepExecution: StepExecution,
    context: ExecutionContext
  ): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    const logs: ExecutionLog[] = [];

    try {
      // Get step definition from step execution
      const stepType = stepExecution.metadata?.stepType || 'agent-task';
      const agentId = stepExecution.metadata?.agentId;

      logs.push({
        level: 'info',
        message: `Starting step execution: ${stepExecution.stepId}`,
        timestamp: new Date(),
        data: { stepType, agentId }
      });

      // Route to appropriate execution method
      let result: AgentExecutionResult;

      switch (stepType) {
        case 'agent-task':
          result = await this.executeAgentTask(stepExecution, context, agentId);
          break;
        case 'http-request':
          result = await this.executeHttpRequest(stepExecution, context);
          break;
        case 'script':
          result = await this.executeScript(stepExecution, context);
          break;
        case 'condition':
          result = await this.evaluateCondition(stepExecution, context);
          break;
        case 'wait':
          result = await this.executeWait(stepExecution, context);
          break;
        case 'data-transform':
          result = await this.executeDataTransform(stepExecution, context);
          break;
        case 'notification':
          result = await this.sendNotification(stepExecution, context);
          break;
        default:
          throw new Error(`Unsupported step type: ${stepType}`);
      }

      // Add execution logs
      result.logs.unshift(...logs);

      // Add timing metrics
      const executionTime = Date.now() - startTime;
      result.metrics = {
        ...result.metrics,
        executionTimeMs: executionTime
      };

      logs.push({
        level: 'info',
        message: `Step execution completed successfully`,
        timestamp: new Date(),
        data: { 
          executionTimeMs: executionTime,
          outputKeys: Object.keys(result.output)
        }
      });

      return result;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      logs.push({
        level: 'error',
        message: `Step execution failed: ${error.message}`,
        timestamp: new Date(),
        data: { 
          error: error.message,
          executionTimeMs: executionTime
        }
      });

      throw this.normalizeExecutionError(error);
    }
  }

  /**
   * Execute agent task
   */
  private async executeAgentTask(
    stepExecution: StepExecution,
    context: ExecutionContext,
    agentId?: string
  ): Promise<AgentExecutionResult> {
    if (!agentId) {
      throw new Error('Agent ID is required for agent-task step type');
    }

    // Get agent information
    const agent = await this.getAgentInfo(agentId);
    
    // Prepare request payload
    const payload = {
      stepId: stepExecution.stepId,
      input: stepExecution.input,
      context: this.sanitizeContext(context),
      configuration: stepExecution.metadata?.configuration || {}
    };

    // Execute agent
    const response = await this.callAgent(agent, payload);
    
    return {
      output: response.data.output || {},
      logs: response.data.logs || [],
      metrics: response.data.metrics
    };
  }

  /**
   * Execute HTTP request
   */
  private async executeHttpRequest(
    stepExecution: StepExecution,
    context: ExecutionContext
  ): Promise<AgentExecutionResult> {
    const config = stepExecution.metadata?.configuration;
    if (!config?.url) {
      throw new Error('URL is required for HTTP request step');
    }

    const method = config.method || 'GET';
    const headers = config.headers || {};
    const body = config.body || stepExecution.input;

    try {
      const response = await axios({
        method,
        url: config.url,
        headers,
        data: body,
        timeout: config.timeout || this.config.timeout
      });

      return {
        output: {
          status: response.status,
          headers: response.headers,
          data: response.data
        },
        logs: [{
          level: 'info',
          message: `HTTP ${method} request completed`,
          timestamp: new Date(),
          data: { status: response.status, url: config.url }
        }]
      };

    } catch (error) {
      throw this.normalizeHttpError(error);
    }
  }

  /**
   * Execute script
   */
  private async executeScript(
    stepExecution: StepExecution,
    context: ExecutionContext
  ): Promise<AgentExecutionResult> {
    const config = stepExecution.metadata?.configuration;
    if (!config?.script) {
      throw new Error('Script is required for script step');
    }

    // For security, only allow predefined scripts or use sandboxed execution
    // This is a simplified implementation
    const scriptType = config.scriptType || 'javascript';
    
    if (scriptType !== 'javascript') {
      throw new Error(`Unsupported script type: ${scriptType}`);
    }

    try {
      // Create isolated context for script execution
      const scriptContext = {
        input: stepExecution.input,
        context: this.sanitizeContext(context),
        console: {
          log: (...args: any[]) => console.log('[Script]', ...args)
        }
      };

      // Execute script (in production, use proper sandboxing)
      const result = await this.executeJavaScript(config.script, scriptContext);

      return {
        output: result || {},
        logs: [{
          level: 'info',
          message: 'Script executed successfully',
          timestamp: new Date()
        }]
      };

    } catch (error) {
      throw new Error(`Script execution failed: ${error.message}`);
    }
  }

  /**
   * Evaluate condition
   */
  private async evaluateCondition(
    stepExecution: StepExecution,
    context: ExecutionContext
  ): Promise<AgentExecutionResult> {
    const config = stepExecution.metadata?.configuration;
    if (!config?.condition) {
      throw new Error('Condition is required for condition step');
    }

    try {
      const conditionResult = await this.evaluateExpression(
        config.condition,
        stepExecution.input,
        context
      );

      return {
        output: {
          result: conditionResult,
          condition: config.condition
        },
        logs: [{
          level: 'info',
          message: `Condition evaluated to: ${conditionResult}`,
          timestamp: new Date(),
          data: { condition: config.condition }
        }]
      };

    } catch (error) {
      throw new Error(`Condition evaluation failed: ${error.message}`);
    }
  }

  /**
   * Execute wait step
   */
  private async executeWait(
    stepExecution: StepExecution,
    context: ExecutionContext
  ): Promise<AgentExecutionResult> {
    const config = stepExecution.metadata?.configuration;
    const duration = config?.duration || 1000; // Default 1 second

    await new Promise(resolve => setTimeout(resolve, duration));

    return {
      output: {
        waitDuration: duration,
        completedAt: new Date().toISOString()
      },
      logs: [{
        level: 'info',
        message: `Waited for ${duration}ms`,
        timestamp: new Date(),
        data: { duration }
      }]
    };
  }

  /**
   * Execute data transformation
   */
  private async executeDataTransform(
    stepExecution: StepExecution,
    context: ExecutionContext
  ): Promise<AgentExecutionResult> {
    const config = stepExecution.metadata?.configuration;
    if (!config?.transformations) {
      throw new Error('Transformations are required for data-transform step');
    }

    const transformations = config.transformations;
    const input = stepExecution.input;
    let output = { ...input };

    for (const transformation of transformations) {
      output = await this.applyTransformation(output, transformation);
    }

    return {
      output,
      logs: [{
        level: 'info',
        message: `Applied ${transformations.length} transformations`,
        timestamp: new Date(),
        data: { transformationCount: transformations.length }
      }]
    };
  }

  /**
   * Send notification
   */
  private async sendNotification(
    stepExecution: StepExecution,
    context: ExecutionContext
  ): Promise<AgentExecutionResult> {
    const config = stepExecution.metadata?.configuration;
    if (!config?.message) {
      throw new Error('Message is required for notification step');
    }

    // Mock notification sending
    console.log(`Notification: ${config.message}`);

    return {
      output: {
        message: config.message,
        sentAt: new Date().toISOString(),
        recipient: config.recipient || context.userId
      },
      logs: [{
        level: 'info',
        message: 'Notification sent successfully',
        timestamp: new Date(),
        data: { recipient: config.recipient || context.userId }
      }]
    };
  }

  /**
   * Get agent information from registry
   */
  private async getAgentInfo(agentId: string): Promise<AgentInfo> {
    // Check cache first
    if (this.agentCache.has(agentId)) {
      return this.agentCache.get(agentId)!;
    }

    try {
      const response = await axios.get(
        `${this.config.baseUrl}/agents/${agentId}`,
        {
          timeout: this.config.timeout,
          headers: this.getAuthHeaders()
        }
      );

      const agentInfo = response.data;
      this.agentCache.set(agentId, agentInfo);
      
      return agentInfo;

    } catch (error) {
      throw new Error(`Failed to get agent info for ${agentId}: ${error.message}`);
    }
  }

  /**
   * Call agent execution endpoint
   */
  private async callAgent(agent: AgentInfo, payload: any): Promise<AxiosResponse> {
    const maxRetries = agent.configuration.retries || this.config.retries;
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await axios.post(
          agent.endpoints.execute,
          payload,
          {
            timeout: agent.configuration.timeout || this.config.timeout,
            headers: this.getAuthHeaders()
          }
        );

      } catch (error) {
        lastError = error;
        
        if (attempt < maxRetries && this.isRetryableError(error)) {
          const delay = Math.pow(2, attempt - 1) * 1000; // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        throw error;
      }
    }

    throw lastError!;
  }

  /**
   * Sanitize execution context for external calls
   */
  private sanitizeContext(context: ExecutionContext): Partial<ExecutionContext> {
    return {
      userId: context.userId,
      sessionId: context.sessionId,
      environment: context.environment,
      variables: context.variables,
      permissions: context.permissions
      // Exclude secrets for security
    };
  }

  /**
   * Get authentication headers
   */
  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    return headers;
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    if (error.response) {
      const status = error.response.status;
      return status >= 500 || status === 429; // Server errors or rate limiting
    }
    
    return error.code === 'ECONNREFUSED' || 
           error.code === 'ETIMEDOUT' || 
           error.code === 'ENOTFOUND';
  }

  /**
   * Normalize execution error
   */
  private normalizeExecutionError(error: any): ExecutionError {
    return {
      code: error.code || 'EXECUTION_ERROR',
      message: error.message || 'Unknown execution error',
      retryable: this.isRetryableError(error),
      category: 'system',
      details: {
        originalError: error.toString()
      }
    };
  }

  /**
   * Normalize HTTP error
   */
  private normalizeHttpError(error: any): ExecutionError {
    if (error.response) {
      return {
        code: `HTTP_${error.response.status}`,
        message: `HTTP request failed with status ${error.response.status}`,
        retryable: error.response.status >= 500 || error.response.status === 429,
        category: 'network',
        details: {
          status: error.response.status,
          data: error.response.data
        }
      };
    }

    return {
      code: 'HTTP_ERROR',
      message: error.message || 'HTTP request failed',
      retryable: true,
      category: 'network'
    };
  }

  /**
   * Execute JavaScript code (simplified - use proper sandboxing in production)
   */
  private async executeJavaScript(script: string, context: any): Promise<any> {
    // WARNING: This is unsafe for production use
    // Use a proper sandboxing solution like vm2 or isolated-vm
    const func = new Function('context', `
      const { input, console } = context;
      ${script}
    `);

    return func(context);
  }

  /**
   * Evaluate expression
   */
  private async evaluateExpression(
    expression: string,
    input: any,
    context: ExecutionContext
  ): Promise<boolean> {
    // Simplified expression evaluation
    // In production, use a proper expression evaluator
    try {
      const func = new Function('input', 'context', `return ${expression}`);
      return !!func(input, context);
    } catch (error) {
      throw new Error(`Invalid expression: ${expression}`);
    }
  }

  /**
   * Apply data transformation
   */
  private async applyTransformation(data: any, transformation: any): Promise<any> {
    // Simplified transformation logic
    // In production, implement comprehensive transformation engine
    switch (transformation.type) {
      case 'map':
        return transformation.mapping ? this.mapData(data, transformation.mapping) : data;
      case 'filter':
        return transformation.condition ? this.filterData(data, transformation.condition) : data;
      case 'aggregate':
        return transformation.operation ? this.aggregateData(data, transformation.operation) : data;
      default:
        return data;
    }
  }

  /**
   * Map data based on mapping configuration
   */
  private mapData(data: any, mapping: Record<string, string>): any {
    const result: any = {};
    
    for (const [targetKey, sourceKey] of Object.entries(mapping)) {
      if (data[sourceKey] !== undefined) {
        result[targetKey] = data[sourceKey];
      }
    }
    
    return result;
  }

  /**
   * Filter data based on condition
   */
  private filterData(data: any, condition: string): any {
    // Simplified filtering
    return data;
  }

  /**
   * Aggregate data based on operation
   */
  private aggregateData(data: any, operation: string): any {
    // Simplified aggregation
    return data;
  }
}