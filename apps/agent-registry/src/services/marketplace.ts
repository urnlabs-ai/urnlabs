import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import {
  MarketplaceItem,
  MarketplaceSearch,
  AgentInstallation,
  AgentDeployment,
  DeploymentStatus,
  AgentCollection,
  AgentTemplate,
  Agent,
  ApiResponse,
  PaginatedResponse,
  ValidationError,
  TemplateNotFoundError
} from '../types/index.js';

export class MarketplaceService {
  private prisma: PrismaClient;
  private redis: Redis;
  private readonly CACHE_TTL = 600; // 10 minutes

  constructor(prisma: PrismaClient, redis: Redis) {
    this.prisma = prisma;
    this.redis = redis;
  }

  /**
   * Search marketplace items (agents and templates)
   */
  async searchMarketplace(query: MarketplaceSearch): Promise<PaginatedResponse<MarketplaceItem>> {
    try {
      // Check cache for popular searches
      const cacheKey = this.generateSearchCacheKey(query);
      const cached = await this.redis.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached);
      }

      let items: MarketplaceItem[] = [];
      let total = 0;

      if (query.type === 'agent' || query.type === 'all') {
        const agentResults = await this.searchAgents(query);
        items.push(...agentResults.items);
        total += agentResults.total;
      }

      if (query.type === 'template' || query.type === 'all') {
        const templateResults = await this.searchTemplates(query);
        items.push(...templateResults.items);
        total += templateResults.total;
      }

      // Sort and paginate results
      const sortedItems = this.sortMarketplaceItems(items, query.sortBy, query.sortOrder);
      const paginatedItems = sortedItems.slice(query.offset, query.offset + query.limit);

      const response: PaginatedResponse<MarketplaceItem> = {
        success: true,
        data: paginatedItems,
        meta: {
          total,
          page: Math.floor(query.offset / query.limit) + 1,
          limit: query.limit,
          hasNext: query.offset + query.limit < total,
          hasPrev: query.offset > 0
        }
      };

      // Cache popular searches
      if (this.isPopularSearch(query)) {
        await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(response));
      }

      return response;
    } catch (error) {
      throw new Error(`Failed to search marketplace: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get marketplace item by ID
   */
  async getMarketplaceItem(itemId: string): Promise<ApiResponse<MarketplaceItem>> {
    try {
      // Check cache first
      const cached = await this.redis.get(`marketplace_item:${itemId}`);
      if (cached) {
        return {
          success: true,
          data: JSON.parse(cached)
        };
      }

      // Try to find as agent first, then as template
      let item: MarketplaceItem | null = null;

      // Check if it's an agent
      const agent = await this.prisma.agent.findUnique({
        where: { id: itemId }
      });

      if (agent) {
        item = await this.convertAgentToMarketplaceItem(agent);
      } else {
        // Check if it's a template (assuming we have a templates table)
        // For now, we'll create a mock template structure
        const templateItem = await this.getTemplateMarketplaceItem(itemId);
        if (templateItem) {
          item = templateItem;
        }
      }

      if (!item) {
        throw new Error(`Marketplace item not found: ${itemId}`);
      }

      // Cache the item
      await this.redis.setex(`marketplace_item:${itemId}`, this.CACHE_TTL, JSON.stringify(item));

      return {
        success: true,
        data: item
      };
    } catch (error) {
      throw new Error(`Failed to get marketplace item: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Install/deploy an agent from marketplace
   */
  async installAgent(installation: AgentInstallation): Promise<ApiResponse<AgentDeployment>> {
    try {
      this.validateInstallation(installation);

      // Get the marketplace item
      const itemResponse = await this.getMarketplaceItem(installation.marketplaceItemId);
      if (!itemResponse.success || !itemResponse.data) {
        throw new Error('Marketplace item not found');
      }

      const item = itemResponse.data;

      // Create deployment record
      const deployment: AgentDeployment = {
        id: this.generateId(),
        name: installation.name,
        organizationId: installation.organizationId,
        status: DeploymentStatus.PENDING,
        config: {
          replicas: 1,
          environment: installation.configuration || {}
        },
        healthStatus: 'unknown',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      if (item.type === 'agent' && item.agent) {
        deployment.agentId = item.agent.id;
      } else if (item.type === 'template' && item.template) {
        deployment.templateId = item.template.id;
      }

      // Store deployment (in a real implementation, this would be in a deployments table)
      await this.redis.setex(
        `deployment:${deployment.id}`,
        86400, // 24 hours
        JSON.stringify(deployment)
      );

      // Trigger actual deployment process (async)
      this.triggerDeployment(deployment).catch(error => {
        console.error(`Deployment failed for ${deployment.id}:`, error);
      });

      return {
        success: true,
        data: deployment,
        message: 'Agent installation initiated'
      };
    } catch (error) {
      throw new Error(`Failed to install agent: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get user's deployments
   */
  async getDeployments(organizationId: string): Promise<ApiResponse<AgentDeployment[]>> {
    try {
      // Get all deployment keys for the organization
      const pattern = `deployment:*`;
      const keys = await this.redis.keys(pattern);
      
      const deployments: AgentDeployment[] = [];
      
      for (const key of keys) {
        const deploymentData = await this.redis.get(key);
        if (deploymentData) {
          const deployment: AgentDeployment = JSON.parse(deploymentData);
          if (deployment.organizationId === organizationId) {
            deployments.push(deployment);
          }
        }
      }

      // Sort by creation date (newest first)
      deployments.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      return {
        success: true,
        data: deployments
      };
    } catch (error) {
      throw new Error(`Failed to get deployments: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get deployment by ID
   */
  async getDeployment(deploymentId: string): Promise<ApiResponse<AgentDeployment>> {
    try {
      const deploymentData = await this.redis.get(`deployment:${deploymentId}`);
      
      if (!deploymentData) {
        throw new Error(`Deployment not found: ${deploymentId}`);
      }

      const deployment: AgentDeployment = JSON.parse(deploymentData);

      return {
        success: true,
        data: deployment
      };
    } catch (error) {
      throw new Error(`Failed to get deployment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update deployment status
   */
  async updateDeploymentStatus(
    deploymentId: string,
    status: DeploymentStatus,
    message?: string
  ): Promise<ApiResponse<AgentDeployment>> {
    try {
      const deploymentResponse = await this.getDeployment(deploymentId);
      if (!deploymentResponse.success || !deploymentResponse.data) {
        throw new Error(`Deployment not found: ${deploymentId}`);
      }

      const deployment = deploymentResponse.data;
      deployment.status = status;
      deployment.updatedAt = new Date();

      if (status === DeploymentStatus.RUNNING) {
        deployment.deployedAt = new Date();
      }

      // Add event
      if (!deployment.events) {
        deployment.events = [];
      }

      deployment.events.push({
        timestamp: new Date(),
        type: status === DeploymentStatus.FAILED ? 'error' : 'info',
        message: message || `Deployment status changed to ${status}`,
        source: 'marketplace-service'
      });

      // Update in Redis
      await this.redis.setex(
        `deployment:${deploymentId}`,
        86400,
        JSON.stringify(deployment)
      );

      return {
        success: true,
        data: deployment
      };
    } catch (error) {
      throw new Error(`Failed to update deployment status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Stop deployment
   */
  async stopDeployment(deploymentId: string): Promise<ApiResponse<void>> {
    try {
      await this.updateDeploymentStatus(deploymentId, DeploymentStatus.STOPPED, 'Deployment stopped by user');

      return {
        success: true,
        message: 'Deployment stopped successfully'
      };
    } catch (error) {
      throw new Error(`Failed to stop deployment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create agent collection
   */
  async createCollection(collection: Omit<AgentCollection, 'id' | 'createdAt' | 'updatedAt'>): Promise<ApiResponse<AgentCollection>> {
    try {
      const newCollection: AgentCollection = {
        ...collection,
        id: this.generateId(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Store collection
      await this.redis.setex(
        `collection:${newCollection.id}`,
        86400 * 7, // 7 days
        JSON.stringify(newCollection)
      );

      // Add to organization collections list
      await this.redis.sadd(`org_collections:${collection.organizationId}`, newCollection.id);

      return {
        success: true,
        data: newCollection,
        message: 'Collection created successfully'
      };
    } catch (error) {
      throw new Error(`Failed to create collection: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get featured marketplace items
   */
  async getFeaturedItems(limit: number = 10): Promise<ApiResponse<MarketplaceItem[]>> {
    try {
      // Check cache first
      const cached = await this.redis.get(`featured_items:${limit}`);
      if (cached) {
        return JSON.parse(cached);
      }

      // Get featured agents
      const featuredAgents = await this.prisma.agent.findMany({
        where: { status: 'active' },
        orderBy: { updatedAt: 'desc' },
        take: Math.ceil(limit / 2)
      });

      const items: MarketplaceItem[] = await Promise.all(
        featuredAgents.map(agent => this.convertAgentToMarketplaceItem(agent))
      );

      // Add some mock featured templates
      const featuredTemplates = await this.getMockFeaturedTemplates(limit - items.length);
      items.push(...featuredTemplates);

      const response = {
        success: true,
        data: items.slice(0, limit)
      };

      // Cache for 30 minutes
      await this.redis.setex(`featured_items:${limit}`, 1800, JSON.stringify(response));

      return response;
    } catch (error) {
      throw new Error(`Failed to get featured items: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Private helper methods

  private async searchAgents(query: MarketplaceSearch): Promise<{ items: MarketplaceItem[], total: number }> {
    const whereClause: any = {
      status: 'active'
    };

    if (query.capabilities && query.capabilities.length > 0) {
      whereClause.capabilities = {
        hasEvery: query.capabilities
      };
    }

    if (query.query) {
      whereClause.OR = [
        { name: { contains: query.query, mode: 'insensitive' } },
        { description: { contains: query.query, mode: 'insensitive' } },
        { type: { contains: query.query, mode: 'insensitive' } }
      ];
    }

    const [agents, total] = await Promise.all([
      this.prisma.agent.findMany({
        where: whereClause,
        orderBy: { updatedAt: 'desc' },
        take: query.limit,
        skip: query.offset
      }),
      this.prisma.agent.count({ where: whereClause })
    ]);

    const items = await Promise.all(
      agents.map(agent => this.convertAgentToMarketplaceItem(agent))
    );

    return { items, total };
  }

  private async searchTemplates(query: MarketplaceSearch): Promise<{ items: MarketplaceItem[], total: number }> {
    // Mock template search - in a real implementation, this would query a templates table
    const mockTemplates = await this.getMockTemplates(query);
    return mockTemplates;
  }

  private async convertAgentToMarketplaceItem(agent: any): Promise<MarketplaceItem> {
    // Get additional stats from cache
    const stats = await this.getAgentStats(agent.id);

    return {
      id: agent.id,
      type: 'agent',
      agent: {
        id: agent.id,
        name: agent.name,
        type: agent.type,
        description: agent.description,
        version: agent.version,
        capabilities: [], // Would be populated from capabilities table
        specializations: agent.specializations,
        status: agent.status,
        healthStatus: 'unknown',
        config: agent.config,
        tools: agent.tools,
        organizationId: agent.organizationId,
        registeredAt: agent.createdAt
      },
      featured: false,
      trending: false,
      verified: false,
      stats: {
        downloads: stats.downloads || 0,
        deployments: stats.deployments || 0,
        activeInstances: stats.activeInstances || 0,
        rating: stats.rating,
        reviewCount: stats.reviewCount || 0,
        lastUpdated: agent.updatedAt
      },
      categories: []
    };
  }

  private async getAgentStats(agentId: string): Promise<any> {
    const statsKey = `agent_stats:${agentId}`;
    const cached = await this.redis.hgetall(statsKey);
    
    return {
      downloads: parseInt(cached.downloads || '0'),
      deployments: parseInt(cached.deployments || '0'),
      activeInstances: parseInt(cached.activeInstances || '0'),
      rating: cached.rating ? parseFloat(cached.rating) : undefined,
      reviewCount: parseInt(cached.reviewCount || '0')
    };
  }

  private async getMockTemplates(query: MarketplaceSearch): Promise<{ items: MarketplaceItem[], total: number }> {
    // Mock template data - in a real implementation, this would come from a database
    const mockTemplates: MarketplaceItem[] = [
      {
        id: 'template-1',
        type: 'template',
        template: {
          id: 'template-1',
          name: 'Code Review Agent',
          displayName: 'Code Review Agent',
          description: 'Automated code review agent with security scanning',
          category: 'code_review',
          complexity: 'intermediate',
          version: '1.0.0',
          agentType: 'code-reviewer',
          capabilities: [
            { name: 'code_analysis', version: '1.0.0' },
            { name: 'security_scan', version: '1.0.0' }
          ],
          configTemplate: { maxConcurrency: 1 },
          createdAt: new Date(),
          updatedAt: new Date()
        },
        featured: true,
        trending: true,
        verified: true,
        stats: {
          downloads: 150,
          deployments: 45,
          activeInstances: 32,
          rating: 4.5,
          reviewCount: 23,
          lastUpdated: new Date()
        },
        categories: ['featured', 'trending']
      }
    ];

    // Filter based on query
    let filteredTemplates = mockTemplates;
    
    if (query.query) {
      filteredTemplates = mockTemplates.filter(item => 
        item.template?.name.toLowerCase().includes(query.query!.toLowerCase()) ||
        item.template?.description.toLowerCase().includes(query.query!.toLowerCase())
      );
    }

    return {
      items: filteredTemplates.slice(query.offset, query.offset + query.limit),
      total: filteredTemplates.length
    };
  }

  private async getMockFeaturedTemplates(count: number): Promise<MarketplaceItem[]> {
    const mockResult = await this.getMockTemplates({
      type: 'template',
      sortBy: 'rating',
      sortOrder: 'desc',
      limit: count,
      offset: 0
    });

    return mockResult.items;
  }

  private async getTemplateMarketplaceItem(templateId: string): Promise<MarketplaceItem | null> {
    // Mock implementation - would query templates table in real implementation
    const mockTemplates = await this.getMockTemplates({
      type: 'template',
      limit: 100,
      offset: 0
    });

    return mockTemplates.items.find(item => item.id === templateId) || null;
  }

  private sortMarketplaceItems(
    items: MarketplaceItem[],
    sortBy: string = 'relevance',
    sortOrder: 'asc' | 'desc' = 'desc'
  ): MarketplaceItem[] {
    return items.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          const nameA = a.agent?.name || a.template?.name || '';
          const nameB = b.agent?.name || b.template?.name || '';
          comparison = nameA.localeCompare(nameB);
          break;
        case 'rating':
          comparison = (a.stats.rating || 0) - (b.stats.rating || 0);
          break;
        case 'downloads':
          comparison = a.stats.downloads - b.stats.downloads;
          break;
        case 'updated':
          comparison = a.stats.lastUpdated.getTime() - b.stats.lastUpdated.getTime();
          break;
        default: // relevance
          // Score based on multiple factors
          const scoreA = this.calculateRelevanceScore(a);
          const scoreB = this.calculateRelevanceScore(b);
          comparison = scoreA - scoreB;
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }

  private calculateRelevanceScore(item: MarketplaceItem): number {
    let score = 0;

    // Featured items get higher score
    if (item.featured) score += 100;
    if (item.trending) score += 50;
    if (item.verified) score += 25;

    // Rating contributes to score
    if (item.stats.rating) score += item.stats.rating * 10;

    // Downloads and deployments contribute
    score += Math.log(item.stats.downloads + 1) * 2;
    score += Math.log(item.stats.deployments + 1) * 3;

    // Recent updates get bonus
    const daysSinceUpdate = (Date.now() - item.stats.lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceUpdate < 30) score += 10;

    return score;
  }

  private validateInstallation(installation: AgentInstallation): void {
    if (!installation.marketplaceItemId) {
      throw new ValidationError('Marketplace item ID is required');
    }

    if (!installation.name || installation.name.trim().length === 0) {
      throw new ValidationError('Installation name is required');
    }

    if (!installation.organizationId) {
      throw new ValidationError('Organization ID is required');
    }
  }

  private async triggerDeployment(deployment: AgentDeployment): Promise<void> {
    try {
      // Update status to deploying
      await this.updateDeploymentStatus(deployment.id!, DeploymentStatus.DEPLOYING, 'Starting deployment process');

      // Simulate deployment process
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Update to running
      await this.updateDeploymentStatus(deployment.id!, DeploymentStatus.RUNNING, 'Deployment completed successfully');

    } catch (error) {
      await this.updateDeploymentStatus(
        deployment.id!,
        DeploymentStatus.FAILED,
        `Deployment failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private generateSearchCacheKey(query: MarketplaceSearch): string {
    const keyParts = [
      'marketplace_search',
      query.type,
      query.query || 'all',
      (query.capabilities || []).sort().join(','),
      query.sortBy || 'relevance',
      query.sortOrder,
      query.limit,
      query.offset
    ];
    return keyParts.join(':');
  }

  private isPopularSearch(query: MarketplaceSearch): boolean {
    // Cache searches without very specific filters
    return !query.query && (!query.capabilities || query.capabilities.length <= 2);
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}