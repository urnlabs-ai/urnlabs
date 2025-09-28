import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import semver from 'semver';
import {
  Agent,
  AgentRegistration,
  AgentUpdate,
  AgentDiscoveryQuery,
  AgentStatus,
  HealthStatus,
  LoadBalancingAlgorithm,
  AgentNotFoundError,
  ValidationError,
  ApiResponse,
  PaginatedResponse
} from '../types/index.js';

export class AgentRegistryService {
  private prisma: PrismaClient;
  private redis: Redis;
  private readonly CACHE_TTL = 300; // 5 minutes
  private readonly HEARTBEAT_TIMEOUT = 90000; // 90 seconds

  constructor(prisma: PrismaClient, redis: Redis) {
    this.prisma = prisma;
    this.redis = redis;
  }

  /**
   * Register a new agent in the registry
   */
  async registerAgent(
    registration: AgentRegistration,
    organizationId: string
  ): Promise<ApiResponse<Agent>> {
    try {
      // Validate registration data
      this.validateRegistration(registration);

      // Check if agent with same name exists in organization
      const existingAgent = await this.prisma.agent.findFirst({
        where: {
          name: registration.name,
          organizationId,
          status: { not: AgentStatus.ERROR }
        }
      });

      if (existingAgent) {
        throw new ValidationError(`Agent with name '${registration.name}' already exists`);
      }

      // Create agent record
      const agent = await this.prisma.agent.create({
        data: {
          name: registration.name,
          type: registration.type,
          description: registration.description || '',
          systemPrompt: `AI Agent: ${registration.name}`,
          capabilities: registration.capabilities.map(cap => cap.name),
          specializations: registration.specializations,
          status: AgentStatus.ACTIVE,
          version: registration.version,
          config: registration.config || {},
          tools: registration.tools,
          organizationId,
          maxConcurrency: registration.config?.maxConcurrency || 1
        }
      });

      // Convert to Agent type and cache
      const agentData: Agent = {
        id: agent.id,
        name: agent.name,
        type: agent.type,
        description: agent.description,
        version: agent.version,
        capabilities: registration.capabilities,
        specializations: agent.specializations,
        status: agent.status as any,
        healthStatus: HealthStatus.UNKNOWN,
        config: registration.config,
        tools: agent.tools,
        organizationId: agent.organizationId,
        registeredAt: agent.createdAt,
        endpoint: registration.endpoint,
        metadata: registration.metadata
      };

      // Cache agent data
      await this.cacheAgent(agentData);

      // Update organization agent count in cache
      await this.updateOrganizationAgentCount(organizationId, 1);

      return {
        success: true,
        data: agentData,
        message: 'Agent registered successfully'
      };
    } catch (error) {
      if (error instanceof ValidationError || error instanceof AgentNotFoundError) {
        throw error;
      }
      throw new Error(`Failed to register agent: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Discover agents based on query criteria
   */
  async discoverAgents(query: AgentDiscoveryQuery): Promise<PaginatedResponse<Agent>> {
    try {
      // Check cache first for popular queries
      const cacheKey = this.generateDiscoveryCacheKey(query);
      const cached = await this.redis.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached);
      }

      // Build database query
      const whereClause = this.buildDiscoveryWhereClause(query);
      
      // Get total count
      const total = await this.prisma.agent.count({ where: whereClause });
      
      // Get agents with pagination
      const agents = await this.prisma.agent.findMany({
        where: whereClause,
        orderBy: this.buildDiscoveryOrderBy(query),
        skip: query.offset,
        take: query.limit
      });

      // Convert to Agent type and apply load balancing
      const agentData = await Promise.all(
        agents.map(async (agent) => {
          const cached = await this.getCachedAgent(agent.id);
          if (cached) return cached;

          return this.convertPrismaToAgent(agent);
        })
      );

      // Apply load balancing algorithm
      const sortedAgents = this.applyLoadBalancing(agentData, query.loadBalancing);

      const response: PaginatedResponse<Agent> = {
        success: true,
        data: sortedAgents,
        meta: {
          total,
          page: Math.floor(query.offset / query.limit) + 1,
          limit: query.limit,
          hasNext: query.offset + query.limit < total,
          hasPrev: query.offset > 0
        }
      };

      // Cache popular queries
      if (this.isPopularQuery(query)) {
        await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(response));
      }

      return response;
    } catch (error) {
      throw new Error(`Failed to discover agents: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get agent by ID
   */
  async getAgent(agentId: string): Promise<ApiResponse<Agent>> {
    try {
      // Check cache first
      let agent = await this.getCachedAgent(agentId);
      
      if (!agent) {
        // Fetch from database
        const dbAgent = await this.prisma.agent.findUnique({
          where: { id: agentId }
        });

        if (!dbAgent) {
          throw new AgentNotFoundError(agentId);
        }

        agent = this.convertPrismaToAgent(dbAgent);
        await this.cacheAgent(agent);
      }

      return {
        success: true,
        data: agent
      };
    } catch (error) {
      if (error instanceof AgentNotFoundError) {
        throw error;
      }
      throw new Error(`Failed to get agent: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update agent information
   */
  async updateAgent(
    agentId: string,
    update: AgentUpdate,
    organizationId: string
  ): Promise<ApiResponse<Agent>> {
    try {
      // Verify agent exists and belongs to organization
      const existingAgent = await this.prisma.agent.findFirst({
        where: { id: agentId, organizationId }
      });

      if (!existingAgent) {
        throw new AgentNotFoundError(agentId);
      }

      // Update agent
      const updatedAgent = await this.prisma.agent.update({
        where: { id: agentId },
        data: {
          status: update.status,
          capabilities: update.capabilities?.map(cap => cap.name),
          specializations: update.specializations,
          tools: update.tools,
          config: update.config ? { ...existingAgent.config, ...update.config } : existingAgent.config,
          updatedAt: new Date()
        }
      });

      const agent = this.convertPrismaToAgent(updatedAgent);

      // Update cache
      await this.cacheAgent(agent);

      // Invalidate related caches
      await this.invalidateDiscoveryCache(organizationId);

      return {
        success: true,
        data: agent,
        message: 'Agent updated successfully'
      };
    } catch (error) {
      if (error instanceof AgentNotFoundError) {
        throw error;
      }
      throw new Error(`Failed to update agent: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Deregister agent
   */
  async deregisterAgent(agentId: string, organizationId: string): Promise<ApiResponse<void>> {
    try {
      // Verify agent exists and belongs to organization
      const agent = await this.prisma.agent.findFirst({
        where: { id: agentId, organizationId }
      });

      if (!agent) {
        throw new AgentNotFoundError(agentId);
      }

      // Soft delete - mark as inactive
      await this.prisma.agent.update({
        where: { id: agentId },
        data: {
          status: AgentStatus.INACTIVE,
          updatedAt: new Date()
        }
      });

      // Remove from cache
      await this.removeCachedAgent(agentId);

      // Update organization agent count
      await this.updateOrganizationAgentCount(organizationId, -1);

      // Invalidate related caches
      await this.invalidateDiscoveryCache(organizationId);

      return {
        success: true,
        message: 'Agent deregistered successfully'
      };
    } catch (error) {
      if (error instanceof AgentNotFoundError) {
        throw error;
      }
      throw new Error(`Failed to deregister agent: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get agents by capability
   */
  async getAgentsByCapability(
    capability: string,
    organizationId?: string
  ): Promise<ApiResponse<Agent[]>> {
    try {
      const query: AgentDiscoveryQuery = {
        capabilities: [capability],
        organizationId,
        status: [AgentStatus.ACTIVE],
        healthStatus: [HealthStatus.HEALTHY, HealthStatus.DEGRADED],
        limit: 50,
        offset: 0
      };

      const result = await this.discoverAgents(query);
      return {
        success: true,
        data: result.data || []
      };
    } catch (error) {
      throw new Error(`Failed to get agents by capability: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get organization agents
   */
  async getOrganizationAgents(
    organizationId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<PaginatedResponse<Agent>> {
    try {
      const query: AgentDiscoveryQuery = {
        organizationId,
        limit,
        offset
      };

      return await this.discoverAgents(query);
    } catch (error) {
      throw new Error(`Failed to get organization agents: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Private helper methods

  private validateRegistration(registration: AgentRegistration): void {
    if (!registration.name || registration.name.trim().length === 0) {
      throw new ValidationError('Agent name is required');
    }

    if (!registration.type || registration.type.trim().length === 0) {
      throw new ValidationError('Agent type is required');
    }

    if (!semver.valid(registration.version)) {
      throw new ValidationError('Agent version must be valid semver format');
    }

    if (!registration.capabilities || registration.capabilities.length === 0) {
      throw new ValidationError('Agent must have at least one capability');
    }
  }

  private buildDiscoveryWhereClause(query: AgentDiscoveryQuery): any {
    const where: any = {};

    if (query.organizationId) {
      where.organizationId = query.organizationId;
    }

    if (query.type) {
      where.type = query.type;
    }

    if (query.status && query.status.length > 0) {
      where.status = { in: query.status };
    }

    if (query.capabilities && query.capabilities.length > 0) {
      where.capabilities = {
        hasEvery: query.capabilities
      };
    }

    if (query.specializations && query.specializations.length > 0) {
      where.specializations = {
        hasSome: query.specializations
      };
    }

    if (query.minVersion || query.maxVersion) {
      const versionConditions: any = {};
      if (query.minVersion) {
        versionConditions.gte = query.minVersion;
      }
      if (query.maxVersion) {
        versionConditions.lte = query.maxVersion;
      }
      where.version = versionConditions;
    }

    return where;
  }

  private buildDiscoveryOrderBy(query: AgentDiscoveryQuery): any {
    // Default ordering by updated date
    return { updatedAt: 'desc' };
  }

  private applyLoadBalancing(
    agents: Agent[],
    algorithm?: LoadBalancingAlgorithmType
  ): Agent[] {
    if (!algorithm || agents.length <= 1) {
      return agents;
    }

    switch (algorithm) {
      case LoadBalancingAlgorithm.ROUND_ROBIN:
        // Simple round-robin - return as is, client handles rotation
        return agents;

      case LoadBalancingAlgorithm.LEAST_CONNECTIONS:
        return agents.sort((a, b) => {
          const aConnections = a.metrics?.activeConnections || 0;
          const bConnections = b.metrics?.activeConnections || 0;
          return aConnections - bConnections;
        });

      case LoadBalancingAlgorithm.PERFORMANCE_BASED:
        return agents.sort((a, b) => {
          const aScore = this.calculatePerformanceScore(a);
          const bScore = this.calculatePerformanceScore(b);
          return bScore - aScore; // Higher score first
        });

      case LoadBalancingAlgorithm.CAPABILITY_BASED:
        // Prioritize agents with more capabilities
        return agents.sort((a, b) => b.capabilities.length - a.capabilities.length);

      default:
        return agents;
    }
  }

  private calculatePerformanceScore(agent: Agent): number {
    if (!agent.metrics) return 0;

    const responseTimeScore = Math.max(0, 100 - (agent.metrics.responseTime / 100));
    const throughputScore = Math.min(100, agent.metrics.throughput * 10);
    const errorRateScore = Math.max(0, 100 - agent.metrics.errorRate);

    return (responseTimeScore + throughputScore + errorRateScore) / 3;
  }

  private generateDiscoveryCacheKey(query: AgentDiscoveryQuery): string {
    const keyParts = [
      'discovery',
      query.organizationId || 'global',
      query.type || 'any',
      (query.capabilities || []).sort().join(','),
      (query.status || []).sort().join(','),
      query.limit,
      query.offset
    ];
    return keyParts.join(':');
  }

  private isPopularQuery(query: AgentDiscoveryQuery): boolean {
    // Consider queries popular if they don't have very specific filters
    return !query.organizationId && (!query.capabilities || query.capabilities.length <= 2);
  }

  private async cacheAgent(agent: Agent): Promise<void> {
    await this.redis.setex(`agent:${agent.id}`, this.CACHE_TTL, JSON.stringify(agent));
  }

  private async getCachedAgent(agentId: string): Promise<Agent | null> {
    const cached = await this.redis.get(`agent:${agentId}`);
    return cached ? JSON.parse(cached) : null;
  }

  private async removeCachedAgent(agentId: string): Promise<void> {
    await this.redis.del(`agent:${agentId}`);
  }

  private async updateOrganizationAgentCount(organizationId: string, delta: number): Promise<void> {
    await this.redis.incrby(`org:${organizationId}:agent_count`, delta);
  }

  private async invalidateDiscoveryCache(organizationId: string): Promise<void> {
    const pattern = `discovery:${organizationId}:*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  private convertPrismaToAgent(dbAgent: any): Agent {
    return {
      id: dbAgent.id,
      name: dbAgent.name,
      type: dbAgent.type,
      description: dbAgent.description,
      version: dbAgent.version,
      capabilities: [], // Will be populated from separate capability records
      specializations: dbAgent.specializations,
      status: dbAgent.status,
      healthStatus: HealthStatus.UNKNOWN, // Will be updated by health monitoring
      config: dbAgent.config,
      tools: dbAgent.tools,
      organizationId: dbAgent.organizationId,
      registeredAt: dbAgent.createdAt,
      lastSeen: dbAgent.updatedAt
    };
  }
}