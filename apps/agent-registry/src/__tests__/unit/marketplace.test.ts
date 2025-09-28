import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { MarketplaceService } from '../../services/marketplace.js';
import {
  MarketplaceSearch,
  AgentInstallation,
  DeploymentStatus,
  ValidationError
} from '../../types/index.js';

// Mock dependencies
vi.mock('@prisma/client');
vi.mock('ioredis');

describe('MarketplaceService', () => {
  let marketplaceService: MarketplaceService;
  let prismaMock: any;
  let redisMock: any;

  beforeEach(() => {
    prismaMock = {
      agent: {
        findMany: vi.fn(),
        count: vi.fn()
      }
    };

    redisMock = {
      get: vi.fn(),
      setex: vi.fn(),
      hgetall: vi.fn(),
      keys: vi.fn(),
      sadd: vi.fn()
    };

    marketplaceService = new MarketplaceService(prismaMock, redisMock);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('searchMarketplace', () => {
    it('should return cached results when available', async () => {
      const mockCachedResult = {
        success: true,
        data: [],
        meta: { total: 0, page: 1, limit: 20, hasNext: false, hasPrev: false }
      };

      redisMock.get.mockResolvedValue(JSON.stringify(mockCachedResult));

      const query: MarketplaceSearch = {
        query: 'test',
        type: 'all',
        limit: 20,
        offset: 0
      };

      const result = await marketplaceService.searchMarketplace(query);

      expect(result).toEqual(mockCachedResult);
      expect(redisMock.get).toHaveBeenCalled();
      expect(prismaMock.agent.findMany).not.toHaveBeenCalled();
    });

    it('should search agents and templates when cache miss', async () => {
      const mockAgents = [
        {
          id: 'agent-1',
          name: 'Code Review Agent',
          type: 'code-reviewer',
          description: 'Automated code review',
          status: 'active',
          capabilities: ['code_analysis'],
          specializations: ['javascript'],
          tools: ['eslint'],
          organizationId: 'org-123',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      redisMock.get.mockResolvedValue(null); // Cache miss
      prismaMock.agent.findMany.mockResolvedValue(mockAgents);
      prismaMock.agent.count.mockResolvedValue(1);
      redisMock.hgetall.mockResolvedValue({}); // Empty agent stats
      redisMock.setex.mockResolvedValue('OK');

      const query: MarketplaceSearch = {
        query: 'code',
        type: 'agent',
        limit: 20,
        offset: 0
      };

      const result = await marketplaceService.searchMarketplace(query);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].type).toBe('agent');
      expect(result.data![0].agent?.name).toBe('Code Review Agent');
      expect(prismaMock.agent.findMany).toHaveBeenCalled();
    });

    it('should filter agents by capabilities', async () => {
      const query: MarketplaceSearch = {
        capabilities: ['code_analysis'],
        type: 'agent',
        limit: 20,
        offset: 0
      };

      prismaMock.agent.findMany.mockResolvedValue([]);
      prismaMock.agent.count.mockResolvedValue(0);
      redisMock.get.mockResolvedValue(null);

      await marketplaceService.searchMarketplace(query);

      expect(prismaMock.agent.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          capabilities: {
            hasEvery: ['code_analysis']
          }
        }),
        orderBy: { updatedAt: 'desc' },
        take: 20,
        skip: 0
      });
    });

    it('should sort results by relevance', async () => {
      const mockAgents = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          type: 'code-reviewer',
          status: 'active',
          updatedAt: new Date(),
          capabilities: [],
          specializations: [],
          tools: [],
          organizationId: 'org-123',
          createdAt: new Date()
        },
        {
          id: 'agent-2',
          name: 'Agent 2',
          type: 'deployment-agent',
          status: 'active',
          updatedAt: new Date(),
          capabilities: [],
          specializations: [],
          tools: [],
          organizationId: 'org-123',
          createdAt: new Date()
        }
      ];

      redisMock.get.mockResolvedValue(null);
      prismaMock.agent.findMany.mockResolvedValue(mockAgents);
      prismaMock.agent.count.mockResolvedValue(2);
      redisMock.hgetall.mockResolvedValue({});

      // Mock agent stats to create different relevance scores
      redisMock.hgetall
        .mockResolvedValueOnce({ downloads: '100', rating: '4.5' })
        .mockResolvedValueOnce({ downloads: '50', rating: '3.0' });

      const query: MarketplaceSearch = {
        type: 'agent',
        sortBy: 'relevance',
        sortOrder: 'desc',
        limit: 20,
        offset: 0
      };

      const result = await marketplaceService.searchMarketplace(query);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });
  });

  describe('getMarketplaceItem', () => {
    it('should return cached item when available', async () => {
      const mockItem = {
        id: 'agent-1',
        type: 'agent',
        agent: { id: 'agent-1', name: 'Test Agent' }
      };

      redisMock.get.mockResolvedValue(JSON.stringify(mockItem));

      const result = await marketplaceService.getMarketplaceItem('agent-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockItem);
      expect(redisMock.get).toHaveBeenCalledWith('marketplace_item:agent-1');
    });

    it('should fetch agent from database when cache miss', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        type: 'code-reviewer',
        description: 'Test agent',
        status: 'active',
        version: '1.0.0',
        capabilities: ['code_analysis'],
        specializations: ['javascript'],
        tools: ['eslint'],
        organizationId: 'org-123',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      redisMock.get.mockResolvedValue(null); // Cache miss
      prismaMock.agent.findUnique.mockResolvedValue(mockAgent);
      redisMock.hgetall.mockResolvedValue({}); // Empty stats
      redisMock.setex.mockResolvedValue('OK');

      const result = await marketplaceService.getMarketplaceItem('agent-1');

      expect(result.success).toBe(true);
      expect(result.data?.type).toBe('agent');
      expect(result.data?.agent?.name).toBe('Test Agent');
      expect(redisMock.setex).toHaveBeenCalled(); // Should cache result
    });

    it('should throw error when item not found', async () => {
      redisMock.get.mockResolvedValue(null);
      prismaMock.agent.findUnique.mockResolvedValue(null);

      await expect(
        marketplaceService.getMarketplaceItem('nonexistent-item')
      ).rejects.toThrow('Marketplace item not found: nonexistent-item');
    });
  });

  describe('installAgent', () => {
    const mockInstallation: AgentInstallation = {
      marketplaceItemId: 'agent-1',
      name: 'My Agent Instance',
      organizationId: 'org-123',
      configuration: { timeout: 30000 },
      autoStart: true
    };

    it('should successfully install agent', async () => {
      const mockMarketplaceItem = {
        id: 'agent-1',
        type: 'agent',
        agent: {
          id: 'agent-1',
          name: 'Test Agent',
          type: 'code-reviewer'
        }
      };

      // Mock marketplace item retrieval
      vi.spyOn(marketplaceService, 'getMarketplaceItem').mockResolvedValue({
        success: true,
        data: mockMarketplaceItem
      });

      redisMock.setex.mockResolvedValue('OK');

      const result = await marketplaceService.installAgent(mockInstallation);

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe(mockInstallation.name);
      expect(result.data?.status).toBe(DeploymentStatus.PENDING);
      expect(result.data?.agentId).toBe('agent-1');
      expect(result.message).toBe('Agent installation initiated');
    });

    it('should throw ValidationError for missing required fields', async () => {
      const invalidInstallation = {
        ...mockInstallation,
        marketplaceItemId: '', // Missing required field
        name: '' // Missing required field
      };

      await expect(
        marketplaceService.installAgent(invalidInstallation)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw error when marketplace item not found', async () => {
      vi.spyOn(marketplaceService, 'getMarketplaceItem').mockResolvedValue({
        success: false,
        data: null
      });

      await expect(
        marketplaceService.installAgent(mockInstallation)
      ).rejects.toThrow('Marketplace item not found');
    });
  });

  describe('getDeployments', () => {
    it('should return deployments for organization', async () => {
      const organizationId = 'org-123';
      const mockDeployments = [
        {
          id: 'deployment-1',
          name: 'Agent Instance 1',
          organizationId,
          status: DeploymentStatus.RUNNING,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'deployment-2',
          name: 'Agent Instance 2',
          organizationId,
          status: DeploymentStatus.STOPPED,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      redisMock.keys.mockResolvedValue(['deployment:deployment-1', 'deployment:deployment-2']);
      redisMock.get
        .mockResolvedValueOnce(JSON.stringify(mockDeployments[0]))
        .mockResolvedValueOnce(JSON.stringify(mockDeployments[1]));

      const result = await marketplaceService.getDeployments(organizationId);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data![0].organizationId).toBe(organizationId);
    });

    it('should return empty array for organization with no deployments', async () => {
      redisMock.keys.mockResolvedValue([]);

      const result = await marketplaceService.getDeployments('org-empty');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });
  });

  describe('updateDeploymentStatus', () => {
    const deploymentId = 'deployment-123';

    it('should successfully update deployment status', async () => {
      const mockDeployment = {
        id: deploymentId,
        name: 'Test Deployment',
        status: DeploymentStatus.PENDING,
        events: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.spyOn(marketplaceService, 'getDeployment').mockResolvedValue({
        success: true,
        data: mockDeployment
      });

      redisMock.setex.mockResolvedValue('OK');

      const result = await marketplaceService.updateDeploymentStatus(
        deploymentId,
        DeploymentStatus.RUNNING,
        'Deployment started successfully'
      );

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe(DeploymentStatus.RUNNING);
      expect(result.data?.events).toHaveLength(1);
      expect(result.data?.events![0].message).toBe('Deployment started successfully');
    });

    it('should throw error when deployment not found', async () => {
      vi.spyOn(marketplaceService, 'getDeployment').mockResolvedValue({
        success: false,
        data: null
      });

      await expect(
        marketplaceService.updateDeploymentStatus(deploymentId, DeploymentStatus.RUNNING)
      ).rejects.toThrow(`Deployment not found: ${deploymentId}`);
    });
  });

  describe('getFeaturedItems', () => {
    it('should return cached featured items when available', async () => {
      const mockFeaturedItems = {
        success: true,
        data: [
          {
            id: 'agent-1',
            type: 'agent',
            featured: true,
            stats: { downloads: 1000, rating: 4.8 }
          }
        ]
      };

      redisMock.get.mockResolvedValue(JSON.stringify(mockFeaturedItems));

      const result = await marketplaceService.getFeaturedItems(10);

      expect(result).toEqual(mockFeaturedItems);
      expect(redisMock.get).toHaveBeenCalledWith('featured_items:10');
    });

    it('should fetch and cache featured items when cache miss', async () => {
      const mockAgents = [
        {
          id: 'agent-1',
          name: 'Featured Agent',
          type: 'code-reviewer',
          status: 'active',
          updatedAt: new Date(),
          capabilities: [],
          specializations: [],
          tools: [],
          organizationId: 'org-123',
          createdAt: new Date()
        }
      ];

      redisMock.get.mockResolvedValue(null); // Cache miss
      prismaMock.agent.findMany.mockResolvedValue(mockAgents);
      redisMock.hgetall.mockResolvedValue({}); // Empty stats
      redisMock.setex.mockResolvedValue('OK');

      const result = await marketplaceService.getFeaturedItems(5);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(redisMock.setex).toHaveBeenCalled(); // Should cache result
    });
  });

  describe('createCollection', () => {
    it('should successfully create agent collection', async () => {
      const collectionData = {
        name: 'CI/CD Pipeline Agents',
        description: 'Collection of agents for CI/CD workflow',
        organizationId: 'org-123',
        agentIds: ['agent-1', 'agent-2'],
        tags: ['cicd', 'automation'],
        isPublic: false,
        createdBy: 'user-123'
      };

      redisMock.setex.mockResolvedValue('OK');
      redisMock.sadd.mockResolvedValue(1);

      const result = await marketplaceService.createCollection(collectionData);

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe(collectionData.name);
      expect(result.data?.id).toBeDefined();
      expect(result.data?.createdAt).toBeInstanceOf(Date);
      expect(result.message).toBe('Collection created successfully');

      expect(redisMock.setex).toHaveBeenCalled();
      expect(redisMock.sadd).toHaveBeenCalledWith(
        `org_collections:${collectionData.organizationId}`,
        expect.any(String)
      );
    });
  });

  describe('Relevance Scoring', () => {
    it('should calculate higher relevance score for featured items', () => {
      const featuredItem = {
        id: 'item-1',
        type: 'agent',
        featured: true,
        trending: false,
        verified: false,
        stats: {
          downloads: 100,
          deployments: 50,
          rating: 4.0,
          lastUpdated: new Date()
        }
      };

      const regularItem = {
        id: 'item-2',
        type: 'agent',
        featured: false,
        trending: false,
        verified: false,
        stats: {
          downloads: 100,
          deployments: 50,
          rating: 4.0,
          lastUpdated: new Date()
        }
      };

      const featuredScore = (marketplaceService as any).calculateRelevanceScore(featuredItem);
      const regularScore = (marketplaceService as any).calculateRelevanceScore(regularItem);

      expect(featuredScore).toBeGreaterThan(regularScore);
    });

    it('should calculate higher relevance score for higher ratings', () => {
      const highRatedItem = {
        id: 'item-1',
        type: 'agent',
        featured: false,
        trending: false,
        verified: false,
        stats: {
          downloads: 100,
          deployments: 50,
          rating: 5.0,
          lastUpdated: new Date()
        }
      };

      const lowRatedItem = {
        id: 'item-2',
        type: 'agent',
        featured: false,
        trending: false,
        verified: false,
        stats: {
          downloads: 100,
          deployments: 50,
          rating: 2.0,
          lastUpdated: new Date()
        }
      };

      const highScore = (marketplaceService as any).calculateRelevanceScore(highRatedItem);
      const lowScore = (marketplaceService as any).calculateRelevanceScore(lowRatedItem);

      expect(highScore).toBeGreaterThan(lowScore);
    });
  });
});