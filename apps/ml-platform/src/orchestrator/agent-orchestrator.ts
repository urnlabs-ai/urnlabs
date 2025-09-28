import { EventEmitter } from 'events';
import { 
  AgentWorkflow, 
  WorkflowAgent, 
  AgentConfig, 
  AgentConnection, 
  WorkflowExecution, 
  ExecutionStep, 
  StepMetrics,
  ModelRequest,
  ModelResponse 
} from '../types/index.js';
import { ModelManager } from '../models/model-manager.js';
import { MLPipelineManager } from '../pipeline/pipeline-manager.js';
import { logger, orchestratorLogger, logAgentExecution } from '../lib/logger.js';

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (params: any, context: ExecutionContext) => Promise<any>;
}

export interface ExecutionContext {
  workflowId: string;
  executionId: string;
  stepId: string;
  previousResults: Map<string, any>;
  globalVariables: Map<string, any>;
  userId?: string;
  metadata: Record<string, any>;
}

export interface CollaborationPattern {
  id: string;
  name: string;
  description: string;
  agents: string[];
  workflow: any;
}

export class AgentOrchestrator extends EventEmitter {
  private workflows: Map<string, AgentWorkflow> = new Map();
  private executions: Map<string, WorkflowExecution> = new Map();
  private tools: Map<string, AgentTool> = new Map();
  private collaborationPatterns: Map<string, CollaborationPattern> = new Map();
  private modelManager: ModelManager;
  private pipelineManager: MLPipelineManager;

  constructor(modelManager: ModelManager, pipelineManager: MLPipelineManager) {
    super();
    this.modelManager = modelManager;
    this.pipelineManager = pipelineManager;
    
    this.initializeBuiltInTools();
    this.initializeCollaborationPatterns();
  }

  private initializeBuiltInTools(): void {
    // Model Inference Tool
    this.registerTool({
      name: 'model_inference',
      description: 'Execute model inference with specified parameters',
      parameters: {
        model: { type: 'string', required: true },
        prompt: { type: 'string', required: true },
        temperature: { type: 'number', default: 0.7 },
        maxTokens: { type: 'number', default: 1000 }
      },
      execute: async (params: any, context: ExecutionContext) => {
        const request: ModelRequest = {
          model: params.model,
          prompt: params.prompt,
          temperature: params.temperature,
          maxTokens: params.maxTokens,
          metadata: { workflowId: context.workflowId, stepId: context.stepId }
        };

        const response = await this.modelManager.generateCompletion(request);
        return {
          content: response.content,
          usage: response.usage,
          model: response.model
        };
      }
    });

    // Vector Search Tool
    this.registerTool({
      name: 'vector_search',
      description: 'Search for similar documents in vector database',
      parameters: {
        index: { type: 'string', required: true },
        query: { type: 'string', required: true },
        topK: { type: 'number', default: 5 }
      },
      execute: async (params: any, context: ExecutionContext) => {
        // This would integrate with VectorDatabaseManager
        // For now, return mock results
        return {
          results: [
            { id: '1', content: 'Sample document 1', score: 0.95 },
            { id: '2', content: 'Sample document 2', score: 0.87 }
          ],
          query: params.query,
          topK: params.topK
        };
      }
    });

    // Data Processing Tool
    this.registerTool({
      name: 'data_processing',
      description: 'Process and transform data',
      parameters: {
        operation: { type: 'string', required: true },
        data: { type: 'any', required: true },
        parameters: { type: 'object', default: {} }
      },
      execute: async (params: any, context: ExecutionContext) => {
        const { operation, data, parameters } = params;

        switch (operation) {
          case 'filter':
            return Array.isArray(data) ? data.filter(item => 
              parameters.condition ? this.evaluateCondition(item, parameters.condition) : true
            ) : data;

          case 'transform':
            return Array.isArray(data) ? data.map(item => 
              this.applyTransformation(item, parameters.transformation)
            ) : this.applyTransformation(data, parameters.transformation);

          case 'aggregate':
            return this.aggregateData(data, parameters.aggregation);

          default:
            throw new Error(`Unknown data processing operation: ${operation}`);
        }
      }
    });

    // Decision Making Tool
    this.registerTool({
      name: 'decision_maker',
      description: 'Make decisions based on criteria and data',
      parameters: {
        criteria: { type: 'object', required: true },
        options: { type: 'array', required: true },
        data: { type: 'any', required: true }
      },
      execute: async (params: any, context: ExecutionContext) => {
        const { criteria, options, data } = params;
        
        // Simple decision making logic
        const scores = options.map((option: any) => ({
          option,
          score: this.calculateDecisionScore(option, criteria, data)
        }));

        scores.sort((a, b) => b.score - a.score);
        
        return {
          selectedOption: scores[0].option,
          confidence: scores[0].score,
          allScores: scores,
          reasoning: `Selected based on highest score (${scores[0].score.toFixed(2)})`
        };
      }
    });

    // Workflow Control Tool
    this.registerTool({
      name: 'workflow_control',
      description: 'Control workflow execution flow',
      parameters: {
        action: { type: 'string', required: true },
        target: { type: 'string' },
        condition: { type: 'any' }
      },
      execute: async (params: any, context: ExecutionContext) => {
        const { action, target, condition } = params;

        switch (action) {
          case 'skip':
            return { action: 'skip', target, reason: 'Conditional skip executed' };
          
          case 'repeat':
            return { action: 'repeat', target, condition };
          
          case 'branch':
            return { action: 'branch', target, condition };
          
          case 'parallel':
            return { action: 'parallel', targets: Array.isArray(target) ? target : [target] };
          
          default:
            throw new Error(`Unknown workflow control action: ${action}`);
        }
      }
    });

    orchestratorLogger.info(`Initialized ${this.tools.size} built-in tools`);
  }

  private initializeCollaborationPatterns(): void {
    // Sequential Processing Pattern
    this.collaborationPatterns.set('sequential', {
      id: 'sequential',
      name: 'Sequential Processing',
      description: 'Agents process data in sequence, each building on the previous result',
      agents: ['data_processor', 'analyzer', 'summarizer'],
      workflow: {
        type: 'sequential',
        steps: [
          { agent: 'data_processor', output: 'processed_data' },
          { agent: 'analyzer', input: 'processed_data', output: 'analysis' },
          { agent: 'summarizer', input: 'analysis', output: 'summary' }
        ]
      }
    });

    // Parallel Processing Pattern
    this.collaborationPatterns.set('parallel', {
      id: 'parallel',
      name: 'Parallel Processing',
      description: 'Multiple agents process the same input in parallel, results are aggregated',
      agents: ['specialist_1', 'specialist_2', 'specialist_3', 'aggregator'],
      workflow: {
        type: 'parallel',
        parallel_steps: [
          { agent: 'specialist_1', output: 'result_1' },
          { agent: 'specialist_2', output: 'result_2' },
          { agent: 'specialist_3', output: 'result_3' }
        ],
        aggregation_step: {
          agent: 'aggregator',
          inputs: ['result_1', 'result_2', 'result_3'],
          output: 'final_result'
        }
      }
    });

    // Hierarchical Decision Making Pattern
    this.collaborationPatterns.set('hierarchical', {
      id: 'hierarchical',
      name: 'Hierarchical Decision Making',
      description: 'Manager agent coordinates specialist agents based on input analysis',
      agents: ['manager', 'classifier', 'specialist_a', 'specialist_b', 'reviewer'],
      workflow: {
        type: 'hierarchical',
        steps: [
          { agent: 'classifier', output: 'classification' },
          { 
            agent: 'manager', 
            input: 'classification',
            decision: {
              'type_a': 'specialist_a',
              'type_b': 'specialist_b'
            },
            output: 'specialist_result'
          },
          { agent: 'reviewer', input: 'specialist_result', output: 'final_result' }
        ]
      }
    });

    // Consensus Building Pattern
    this.collaborationPatterns.set('consensus', {
      id: 'consensus',
      name: 'Consensus Building',
      description: 'Multiple agents provide opinions, consensus mechanism determines final decision',
      agents: ['expert_1', 'expert_2', 'expert_3', 'consensus_builder'],
      workflow: {
        type: 'consensus',
        steps: [
          {
            parallel_opinions: [
              { agent: 'expert_1', output: 'opinion_1' },
              { agent: 'expert_2', output: 'opinion_2' },
              { agent: 'expert_3', output: 'opinion_3' }
            ]
          },
          {
            agent: 'consensus_builder',
            inputs: ['opinion_1', 'opinion_2', 'opinion_3'],
            method: 'weighted_average',
            output: 'consensus'
          }
        ]
      }
    });

    // Debate Pattern
    this.collaborationPatterns.set('debate', {
      id: 'debate',
      name: 'Adversarial Debate',
      description: 'Two agents debate opposing viewpoints, judge determines winner',
      agents: ['advocate', 'opponent', 'judge'],
      workflow: {
        type: 'debate',
        rounds: 3,
        steps: [
          { agent: 'advocate', role: 'initial_argument', output: 'arg_1' },
          { agent: 'opponent', input: 'arg_1', role: 'counter_argument', output: 'counter_1' },
          { agent: 'advocate', input: 'counter_1', role: 'rebuttal', output: 'rebuttal_1' },
          { agent: 'opponent', input: 'rebuttal_1', role: 'final_counter', output: 'final_counter' },
          { 
            agent: 'judge', 
            inputs: ['arg_1', 'counter_1', 'rebuttal_1', 'final_counter'],
            role: 'judge',
            output: 'verdict'
          }
        ]
      }
    });

    orchestratorLogger.info(`Initialized ${this.collaborationPatterns.size} collaboration patterns`);
  }

  // Tool Management
  registerTool(tool: AgentTool): void {
    this.tools.set(tool.name, tool);
    orchestratorLogger.info(`Registered tool: ${tool.name}`);
  }

  getTool(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  getAvailableTools(): string[] {
    return Array.from(this.tools.keys());
  }

  // Workflow Management
  async createWorkflow(workflow: Omit<AgentWorkflow, 'id'>): Promise<string> {
    const id = `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const fullWorkflow: AgentWorkflow = {
      id,
      ...workflow,
      status: 'draft'
    };

    // Validate workflow
    await this.validateWorkflow(fullWorkflow);

    this.workflows.set(id, fullWorkflow);
    orchestratorLogger.info(`Created workflow: ${workflow.name} (${id})`);
    
    return id;
  }

  private async validateWorkflow(workflow: AgentWorkflow): Promise<void> {
    // Validate agents exist and have valid configurations
    for (const agent of workflow.agents) {
      if (!agent.config) {
        throw new Error(`Agent ${agent.id} missing configuration`);
      }

      // Validate model exists if specified
      if (agent.config.model) {
        const model = this.modelManager.getModel(agent.config.model);
        if (!model) {
          throw new Error(`Model ${agent.config.model} not found for agent ${agent.id}`);
        }
      }

      // Validate tools exist if specified
      if (agent.config.tools) {
        for (const toolName of agent.config.tools) {
          if (!this.tools.has(toolName)) {
            throw new Error(`Tool ${toolName} not found for agent ${agent.id}`);
          }
        }
      }
    }

    // Validate connections form a valid DAG
    this.validateWorkflowConnections(workflow);

    orchestratorLogger.info(`Workflow validation passed: ${workflow.id}`);
  }

  private validateWorkflowConnections(workflow: AgentWorkflow): void {
    const agentIds = new Set(workflow.agents.map(a => a.id));
    
    // Check all connections reference valid agents
    for (const connection of workflow.connections) {
      if (!agentIds.has(connection.from)) {
        throw new Error(`Connection references unknown agent: ${connection.from}`);
      }
      if (!agentIds.has(connection.to)) {
        throw new Error(`Connection references unknown agent: ${connection.to}`);
      }
    }

    // Check for cycles (simplified cycle detection)
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    const hasCycle = (agentId: string): boolean => {
      visited.add(agentId);
      recursionStack.add(agentId);
      
      const outgoingConnections = workflow.connections.filter(c => c.from === agentId);
      
      for (const connection of outgoingConnections) {
        if (!visited.has(connection.to)) {
          if (hasCycle(connection.to)) return true;
        } else if (recursionStack.has(connection.to)) {
          return true;
        }
      }
      
      recursionStack.delete(agentId);
      return false;
    };

    for (const agent of workflow.agents) {
      if (!visited.has(agent.id)) {
        if (hasCycle(agent.id)) {
          throw new Error('Workflow contains cycles');
        }
      }
    }
  }

  async executeWorkflow(workflowId: string, input: any, metadata?: Record<string, any>): Promise<string> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    if (workflow.status !== 'active') {
      throw new Error(`Workflow ${workflowId} is not active`);
    }

    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const execution: WorkflowExecution = {
      id: executionId,
      workflowId,
      status: 'running',
      input,
      steps: [],
      startedAt: new Date()
    };

    this.executions.set(executionId, execution);

    // Start execution asynchronously
    this.runWorkflowExecution(execution, workflow, metadata || {})
      .catch(error => {
        orchestratorLogger.error(`Workflow execution failed: ${executionId}`, error);
        execution.status = 'failed';
        execution.error = error.message;
        execution.completedAt = new Date();
      });

    orchestratorLogger.info(`Started workflow execution: ${executionId} for workflow: ${workflowId}`);
    return executionId;
  }

  private async runWorkflowExecution(
    execution: WorkflowExecution,
    workflow: AgentWorkflow,
    metadata: Record<string, any>
  ): Promise<void> {
    try {
      const context: ExecutionContext = {
        workflowId: workflow.id,
        executionId: execution.id,
        stepId: '',
        previousResults: new Map(),
        globalVariables: new Map(),
        metadata
      };

      // Execute workflow based on collaboration pattern or custom logic
      if (workflow.metadata?.pattern) {
        await this.executeCollaborationPattern(execution, workflow, context);
      } else {
        await this.executeCustomWorkflow(execution, workflow, context);
      }

      execution.status = 'completed';
      execution.completedAt = new Date();
      
      orchestratorLogger.info(`Workflow execution completed: ${execution.id}`);
      this.emit('workflowCompleted', execution);

    } catch (error) {
      execution.status = 'failed';
      execution.error = error instanceof Error ? error.message : String(error);
      execution.completedAt = new Date();
      
      orchestratorLogger.error(`Workflow execution failed: ${execution.id}`, error);
      this.emit('workflowFailed', execution, error);
    }
  }

  private async executeCollaborationPattern(
    execution: WorkflowExecution,
    workflow: AgentWorkflow,
    context: ExecutionContext
  ): Promise<void> {
    const patternId = workflow.metadata?.pattern;
    const pattern = this.collaborationPatterns.get(patternId);
    
    if (!pattern) {
      throw new Error(`Collaboration pattern ${patternId} not found`);
    }

    orchestratorLogger.info(`Executing collaboration pattern: ${pattern.name}`);

    switch (pattern.id) {
      case 'sequential':
        await this.executeSequentialPattern(execution, workflow, context);
        break;
      case 'parallel':
        await this.executeParallelPattern(execution, workflow, context);
        break;
      case 'hierarchical':
        await this.executeHierarchicalPattern(execution, workflow, context);
        break;
      case 'consensus':
        await this.executeConsensusPattern(execution, workflow, context);
        break;
      case 'debate':
        await this.executeDebatePattern(execution, workflow, context);
        break;
      default:
        throw new Error(`Collaboration pattern ${pattern.id} not implemented`);
    }
  }

  private async executeSequentialPattern(
    execution: WorkflowExecution,
    workflow: AgentWorkflow,
    context: ExecutionContext
  ): Promise<void> {
    let currentOutput = execution.input;

    for (const agent of workflow.agents) {
      const stepResult = await this.executeAgent(agent, currentOutput, context);
      
      execution.steps.push(stepResult);
      currentOutput = stepResult.output;
      
      if (stepResult.status === 'failed') {
        throw new Error(`Sequential step failed: ${stepResult.error}`);
      }
    }

    execution.output = currentOutput;
  }

  private async executeParallelPattern(
    execution: WorkflowExecution,
    workflow: AgentWorkflow,
    context: ExecutionContext
  ): Promise<void> {
    // Execute all agents in parallel except the last one (aggregator)
    const parallelAgents = workflow.agents.slice(0, -1);
    const aggregatorAgent = workflow.agents[workflow.agents.length - 1];

    const parallelPromises = parallelAgents.map(agent => 
      this.executeAgent(agent, execution.input, context)
    );

    const parallelResults = await Promise.allSettled(parallelPromises);
    
    // Add parallel steps to execution
    for (const result of parallelResults) {
      if (result.status === 'fulfilled') {
        execution.steps.push(result.value);
      } else {
        execution.steps.push({
          agentId: 'unknown',
          status: 'failed',
          input: execution.input,
          error: result.reason?.message || 'Unknown error',
          startedAt: new Date(),
          completedAt: new Date(),
          metrics: { duration: 0 }
        });
      }
    }

    // Aggregate results
    const successfulResults = parallelResults
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as PromiseFulfilledResult<ExecutionStep>).value.output);

    const aggregatorResult = await this.executeAgent(aggregatorAgent, successfulResults, context);
    execution.steps.push(aggregatorResult);
    execution.output = aggregatorResult.output;
  }

  private async executeHierarchicalPattern(
    execution: WorkflowExecution,
    workflow: AgentWorkflow,
    context: ExecutionContext
  ): Promise<void> {
    // This would implement hierarchical decision making
    // For now, execute sequentially
    await this.executeSequentialPattern(execution, workflow, context);
  }

  private async executeConsensusPattern(
    execution: WorkflowExecution,
    workflow: AgentWorkflow,
    context: ExecutionContext
  ): Promise<void> {
    // Execute expert agents in parallel
    const expertAgents = workflow.agents.slice(0, -1);
    const consensusAgent = workflow.agents[workflow.agents.length - 1];

    const expertPromises = expertAgents.map(agent => 
      this.executeAgent(agent, execution.input, context)
    );

    const expertResults = await Promise.all(expertPromises);
    execution.steps.push(...expertResults);

    // Build consensus
    const opinions = expertResults.map(result => result.output);
    const consensusResult = await this.executeAgent(consensusAgent, opinions, context);
    
    execution.steps.push(consensusResult);
    execution.output = consensusResult.output;
  }

  private async executeDebatePattern(
    execution: WorkflowExecution,
    workflow: AgentWorkflow,
    context: ExecutionContext
  ): Promise<void> {
    const [advocate, opponent, judge] = workflow.agents;
    
    // Initial argument
    const advocateResult1 = await this.executeAgent(advocate, execution.input, context);
    execution.steps.push(advocateResult1);

    // Counter argument
    const opponentResult1 = await this.executeAgent(opponent, advocateResult1.output, context);
    execution.steps.push(opponentResult1);

    // Rebuttal
    const advocateResult2 = await this.executeAgent(advocate, opponentResult1.output, context);
    execution.steps.push(advocateResult2);

    // Final judgment
    const allArguments = [advocateResult1.output, opponentResult1.output, advocateResult2.output];
    const judgeResult = await this.executeAgent(judge, allArguments, context);
    
    execution.steps.push(judgeResult);
    execution.output = judgeResult.output;
  }

  private async executeCustomWorkflow(
    execution: WorkflowExecution,
    workflow: AgentWorkflow,
    context: ExecutionContext
  ): Promise<void> {
    // Build execution order based on connections
    const executionOrder = this.buildExecutionOrder(workflow);
    
    for (const agentId of executionOrder) {
      const agent = workflow.agents.find(a => a.id === agentId);
      if (!agent) continue;

      // Get input for this agent based on connections
      const input = this.getAgentInput(agentId, workflow.connections, context);
      
      const stepResult = await this.executeAgent(agent, input, context);
      execution.steps.push(stepResult);
      
      // Store result for downstream agents
      context.previousResults.set(agentId, stepResult.output);
      
      if (stepResult.status === 'failed') {
        throw new Error(`Agent ${agentId} failed: ${stepResult.error}`);
      }
    }

    // Set final output (from last agent or specified output agent)
    const outputAgentId = workflow.metadata?.outputAgent || executionOrder[executionOrder.length - 1];
    execution.output = context.previousResults.get(outputAgentId);
  }

  private buildExecutionOrder(workflow: AgentWorkflow): string[] {
    // Topological sort to determine execution order
    const inDegree = new Map<string, number>();
    const adjacencyList = new Map<string, string[]>();

    // Initialize
    for (const agent of workflow.agents) {
      inDegree.set(agent.id, 0);
      adjacencyList.set(agent.id, []);
    }

    // Build graph
    for (const connection of workflow.connections) {
      adjacencyList.get(connection.from)?.push(connection.to);
      inDegree.set(connection.to, (inDegree.get(connection.to) || 0) + 1);
    }

    // Topological sort
    const queue: string[] = [];
    const result: string[] = [];

    // Find nodes with no incoming edges
    for (const [agentId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(agentId);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      for (const neighbor of adjacencyList.get(current) || []) {
        inDegree.set(neighbor, inDegree.get(neighbor)! - 1);
        if (inDegree.get(neighbor) === 0) {
          queue.push(neighbor);
        }
      }
    }

    return result;
  }

  private getAgentInput(
    agentId: string,
    connections: AgentConnection[],
    context: ExecutionContext
  ): any {
    const incomingConnections = connections.filter(c => c.to === agentId);
    
    if (incomingConnections.length === 0) {
      // No incoming connections, use workflow input
      return context.previousResults.get('__input__') || {};
    }

    if (incomingConnections.length === 1) {
      // Single input
      const connection = incomingConnections[0];
      return context.previousResults.get(connection.from);
    }

    // Multiple inputs, combine them
    const combinedInput: any = {};
    for (const connection of incomingConnections) {
      const result = context.previousResults.get(connection.from);
      if (connection.transform) {
        // Apply transformation if specified
        combinedInput[connection.from] = this.applyTransformation(result, connection.transform);
      } else {
        combinedInput[connection.from] = result;
      }
    }

    return combinedInput;
  }

  private async executeAgent(
    agent: WorkflowAgent,
    input: any,
    context: ExecutionContext
  ): Promise<ExecutionStep> {
    const startTime = Date.now();
    context.stepId = `${agent.id}_${startTime}`;

    const step: ExecutionStep = {
      agentId: agent.id,
      status: 'running',
      input,
      startedAt: new Date(),
      metrics: { duration: 0 }
    };

    try {
      logAgentExecution(context.workflowId, agent.id, 'started');

      let output: any;

      switch (agent.type) {
        case 'model':
          output = await this.executeModelAgent(agent, input, context);
          break;
        case 'tool':
          output = await this.executeToolAgent(agent, input, context);
          break;
        case 'workflow':
          output = await this.executeWorkflowAgent(agent, input, context);
          break;
        case 'human':
          output = await this.executeHumanAgent(agent, input, context);
          break;
        default:
          throw new Error(`Unknown agent type: ${agent.type}`);
      }

      const duration = Date.now() - startTime;
      
      step.status = 'completed';
      step.output = output;
      step.completedAt = new Date();
      step.metrics = { duration };

      logAgentExecution(context.workflowId, agent.id, 'completed', duration);
      
      return step;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      step.status = 'failed';
      step.error = error instanceof Error ? error.message : String(error);
      step.completedAt = new Date();
      step.metrics = { duration };

      logAgentExecution(context.workflowId, agent.id, 'failed', duration);
      
      return step;
    }
  }

  private async executeModelAgent(
    agent: WorkflowAgent,
    input: any,
    context: ExecutionContext
  ): Promise<any> {
    const config = agent.config;
    
    if (!config.model) {
      throw new Error('Model agent missing model configuration');
    }

    // Prepare prompt with input
    let prompt = config.prompt || '';
    if (typeof input === 'string') {
      prompt = prompt.replace('{{input}}', input);
    } else if (typeof input === 'object') {
      // Replace template variables
      for (const [key, value] of Object.entries(input)) {
        prompt = prompt.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
      }
    }

    const request: ModelRequest = {
      model: config.model,
      prompt,
      temperature: config.parameters?.temperature || 0.7,
      maxTokens: config.parameters?.maxTokens || 1000,
      metadata: { workflowId: context.workflowId, stepId: context.stepId }
    };

    const response = await this.modelManager.generateCompletion(request);
    
    return {
      content: response.content,
      usage: response.usage,
      model: response.model,
      metadata: response.metadata
    };
  }

  private async executeToolAgent(
    agent: WorkflowAgent,
    input: any,
    context: ExecutionContext
  ): Promise<any> {
    const config = agent.config;
    
    if (!config.tools || config.tools.length === 0) {
      throw new Error('Tool agent missing tool configuration');
    }

    const toolName = config.tools[0]; // Use first tool for now
    const tool = this.tools.get(toolName);
    
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }

    // Prepare tool parameters
    const toolParams = {
      ...config.parameters,
      ...input
    };

    return await tool.execute(toolParams, context);
  }

  private async executeWorkflowAgent(
    agent: WorkflowAgent,
    input: any,
    context: ExecutionContext
  ): Promise<any> {
    // This would execute a sub-workflow
    // For now, return the input
    orchestratorLogger.info(`Executing sub-workflow agent: ${agent.id}`);
    return input;
  }

  private async executeHumanAgent(
    agent: WorkflowAgent,
    input: any,
    context: ExecutionContext
  ): Promise<any> {
    // This would wait for human input
    // For now, return a placeholder
    orchestratorLogger.info(`Human agent ${agent.id} requires input`);
    
    return {
      status: 'pending_human_input',
      input,
      message: 'Waiting for human agent to provide input',
      agentId: agent.id
    };
  }

  // Utility methods
  private evaluateCondition(item: any, condition: any): boolean {
    // Simple condition evaluation
    if (typeof condition === 'function') {
      return condition(item);
    }
    
    if (typeof condition === 'object') {
      for (const [key, value] of Object.entries(condition)) {
        if (item[key] !== value) {
          return false;
        }
      }
      return true;
    }
    
    return true;
  }

  private applyTransformation(data: any, transformation: any): any {
    if (typeof transformation === 'function') {
      return transformation(data);
    }
    
    if (typeof transformation === 'string') {
      // Simple field extraction
      return data[transformation];
    }
    
    return data;
  }

  private aggregateData(data: any[], aggregation: any): any {
    switch (aggregation.method) {
      case 'sum':
        return data.reduce((sum, item) => sum + (item[aggregation.field] || 0), 0);
      
      case 'average':
        const sum = data.reduce((sum, item) => sum + (item[aggregation.field] || 0), 0);
        return sum / data.length;
      
      case 'max':
        return Math.max(...data.map(item => item[aggregation.field] || 0));
      
      case 'min':
        return Math.min(...data.map(item => item[aggregation.field] || 0));
      
      case 'count':
        return data.length;
      
      default:
        return data;
    }
  }

  private calculateDecisionScore(option: any, criteria: any, data: any): number {
    // Simple scoring based on criteria weights
    let score = 0;
    
    for (const [criterion, weight] of Object.entries(criteria)) {
      const value = option[criterion] || 0;
      score += (value as number) * (weight as number);
    }
    
    return score;
  }

  // Public API methods
  getWorkflow(id: string): AgentWorkflow | undefined {
    return this.workflows.get(id);
  }

  getExecution(id: string): WorkflowExecution | undefined {
    return this.executions.get(id);
  }

  getCollaborationPatterns(): CollaborationPattern[] {
    return Array.from(this.collaborationPatterns.values());
  }

  async activateWorkflow(id: string): Promise<void> {
    const workflow = this.workflows.get(id);
    if (!workflow) {
      throw new Error(`Workflow ${id} not found`);
    }

    workflow.status = 'active';
    orchestratorLogger.info(`Activated workflow: ${id}`);
  }

  async pauseWorkflow(id: string): Promise<void> {
    const workflow = this.workflows.get(id);
    if (!workflow) {
      throw new Error(`Workflow ${id} not found`);
    }

    workflow.status = 'paused';
    orchestratorLogger.info(`Paused workflow: ${id}`);
  }

  async cancelExecution(id: string): Promise<void> {
    const execution = this.executions.get(id);
    if (!execution) {
      throw new Error(`Execution ${id} not found`);
    }

    execution.status = 'cancelled';
    execution.completedAt = new Date();
    
    orchestratorLogger.info(`Cancelled execution: ${id}`);
    this.emit('executionCancelled', execution);
  }

  getActiveExecutions(): WorkflowExecution[] {
    return Array.from(this.executions.values()).filter(e => e.status === 'running');
  }

  getExecutionMetrics(id: string): any {
    const execution = this.executions.get(id);
    if (!execution) return null;

    const totalDuration = execution.completedAt 
      ? execution.completedAt.getTime() - execution.startedAt.getTime()
      : Date.now() - execution.startedAt.getTime();

    const stepMetrics = execution.steps.map(step => ({
      agentId: step.agentId,
      duration: step.metrics?.duration || 0,
      status: step.status
    }));

    return {
      executionId: id,
      workflowId: execution.workflowId,
      status: execution.status,
      totalDuration,
      stepCount: execution.steps.length,
      successfulSteps: execution.steps.filter(s => s.status === 'completed').length,
      failedSteps: execution.steps.filter(s => s.status === 'failed').length,
      stepMetrics
    };
  }
}