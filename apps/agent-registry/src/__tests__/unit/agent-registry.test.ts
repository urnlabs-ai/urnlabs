import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { AgentRegistryService } from '../../services/agent-registry.js';
import {
  AgentRegistration,
  AgentStatus,
  HealthStatus,
  LoadBalancingAlgorithm,
  AgentNotFoundError,
  ValidationError
} from '../../types/index.js';

// Mock dependencies
vi.mock('@prisma/client');
vi.mock('ioredis');

describe('AgentRegistryService', () => {
  let agentRegistryService: AgentRegistryService;
  let prismaMock: any;
  let redisMock: any;

  beforeEach(() => {
    prismaMock = {
      agent: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        count: vi.fn()
      }
    };

    redisMock = {
      setex: vi.fn(),
      get: vi.fn(),
      del: vi.fn(),
      keys: vi.fn(),
      incrby: vi.fn(),
      hgetall: vi.fn(),
      hset: vi.fn()
    };

    agentRegistryService = new AgentRegistryService(prismaMock, redisMock);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('registerAgent', () => {
    const mockRegistration: AgentRegistration = {
      name: 'test-agent',
      type: 'code-reviewer',
      description: 'Test agent for code review',
      version: '1.0.0',
      capabilities: [
        { name: 'code_analysis', version: '1.0.0' },
        { name: 'security_scan', version: '1.0.0' }
      ],
      specializations: ['javascript', 'typescript'],
      tools: ['eslint', 'typescript-checker']
    };

    const organizationId = 'org-123';

    it('should successfully register a new agent', async () => {
      // Setup mocks
      prismaMock.agent.findFirst.mockResolvedValue(null); // No existing agent
      prismaMock.agent.create.mockResolvedValue({
        id: 'agent-123',
        name: mockRegistration.name,
        type: mockRegistration.type,
        description: mockRegistration.description,
        version: mockRegistration.version,
        capabilities: mockRegistration.capabilities.map(cap => cap.name),
        specializations: mockRegistration.specializations,
        status: AgentStatus.ACTIVE,
        tools: mockRegistration.tools,
        organizationId,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      redisMock.setex.mockResolvedValue('OK');
      redisMock.incrby.mockResolvedValue(1);

      // Execute
      const result = await agentRegistryService.registerAgent(mockRegistration, organizationId);

      // Verify
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.name).toBe(mockRegistration.name);
      expect(result.message).toBe('Agent registered successfully');

      expect(prismaMock.agent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: mockRegistration.name,
          type: mockRegistration.type,
          organizationId
        })
      });

      expect(redisMock.setex).toHaveBeenCalled(); // Cache agent
      expect(redisMock.incrby).toHaveBeenCalled(); // Update org count
    });

    it('should throw ValidationError for duplicate agent name', async () => {
      // Setup mocks
      prismaMock.agent.findFirst.mockResolvedValue({
        id: 'existing-agent',
        name: mockRegistration.name,
        organizationId
      });

      // Execute & Verify
      await expect(
        agentRegistryService.registerAgent(mockRegistration, organizationId)
      ).rejects.toThrow(ValidationError);

      expect(prismaMock.agent.create).not.toHaveBeenCalled();
    });

    it('should throw ValidationError for invalid registration data', async () => {
      const invalidRegistration = {
        ...mockRegistration,
        name: '', // Invalid empty name
        version: 'invalid-version' // Invalid semver
      };

      await expect(
        agentRegistryService.registerAgent(invalidRegistration as any, organizationId)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('discoverAgents', () => {
    it('should return cached results when available', async () => {
      const mockCachedResult = {
        success: true,
        data: [],
        meta: { total: 0, page: 1, limit: 10, hasNext: false, hasPrev: false }
      };

      redisMock.get.mockResolvedValue(JSON.stringify(mockCachedResult));

      const query = {
        capabilities: ['code_analysis'],
        limit: 10,
        offset: 0
      };

      const result = await agentRegistryService.discoverAgents(query);

      expect(result).toEqual(mockCachedResult);
      expect(redisMock.get).toHaveBeenCalled();
      expect(prismaMock.agent.findMany).not.toHaveBeenCalled();
    });

    it('should query database and apply load balancing when cache miss', async () => {
      const mockAgents = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          type: 'code-reviewer',
          capabilities: ['code_analysis'],
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'agent-2',
          name: 'Agent 2',
          type: 'code-reviewer',
          capabilities: ['code_analysis'],
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      redisMock.get.mockResolvedValue(null); // Cache miss
      prismaMock.agent.count.mockResolvedValue(2);
      prismaMock.agent.findMany.mockResolvedValue(mockAgents);
      redisMock.setex.mockResolvedValue('OK');

      const query = {
        capabilities: ['code_analysis'],
        loadBalancing: LoadBalancingAlgorithm.LEAST_CONNECTIONS,
        limit: 10,
        offset: 0
      };

      const result = await agentRegistryService.discoverAgents(query);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(prismaMock.agent.findMany).toHaveBeenCalled();
    });
  });

  describe('getAgent', () => {
    const agentId = 'agent-123';

    it('should return cached agent when available', async () => {
      const mockAgent = {
        id: agentId,
        name: 'Test Agent',
        type: 'code-reviewer',
        status: AgentStatus.ACTIVE,
        healthStatus: HealthStatus.HEALTHY
      };

      redisMock.get.mockResolvedValue(JSON.stringify(mockAgent));

      const result = await agentRegistryService.getAgent(agentId);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockAgent);
      expect(redisMock.get).toHaveBeenCalledWith(`agent:${agentId}`);
      expect(prismaMock.agent.findUnique).not.toHaveBeenCalled();
    });

    it('should fetch from database when cache miss', async () => {
      const mockDbAgent = {
        id: agentId,
        name: 'Test Agent',
        type: 'code-reviewer',
        status: AgentStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
        capabilities: ['code_analysis'],
        specializations: ['javascript'],
        tools: ['eslint'],
        organizationId: 'org-123'
      };

      redisMock.get.mockResolvedValue(null); // Cache miss
      prismaMock.agent.findUnique.mockResolvedValue(mockDbAgent);
      redisMock.setex.mockResolvedValue('OK');

      const result = await agentRegistryService.getAgent(agentId);

      expect(result.success).toBe(true);
      expect(result.data?.id).toBe(agentId);
      expect(prismaMock.agent.findUnique).toHaveBeenCalledWith({
        where: { id: agentId }
      });
      expect(redisMock.setex).toHaveBeenCalled(); // Cache result
    });

    it('should throw AgentNotFoundError when agent does not exist', async () => {
      redisMock.get.mockResolvedValue(null);
      prismaMock.agent.findUnique.mockResolvedValue(null);

      await expect(
        agentRegistryService.getAgent(agentId)
      ).rejects.toThrow(AgentNotFoundError);
    });
  });

  describe('updateAgent', () => {
    const agentId = 'agent-123';
    const organizationId = 'org-123';

    it('should successfully update agent', async () => {
      const existingAgent = {
        id: agentId,
        organizationId,
        config: { maxConcurrency: 1 }
      };

      const updateData = {
        status: AgentStatus.MAINTENANCE,
        config: { maxConcurrency: 2 }
      };

      const updatedAgent = {
        ...existingAgent,
        ...updateData,
        config: { maxConcurrency: 2 },
        updatedAt: new Date()
      };

      prismaMock.agent.findFirst.mockResolvedValue(existingAgent);
      prismaMock.agent.update.mockResolvedValue(updatedAgent);
      redisMock.setex.mockResolvedValue('OK');
      redisMock.keys.mockResolvedValue([]);

      const result = await agentRegistryService.updateAgent(agentId, updateData, organizationId);

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe(AgentStatus.MAINTENANCE);
      expect(prismaMock.agent.update).toHaveBeenCalledWith({
        where: { id: agentId },
        data: expect.objectContaining({
          status: updateData.status,
          config: updateData.config
        })
      });
    });

    it('should throw AgentNotFoundError when agent does not exist', async () => {
      prismaMock.agent.findFirst.mockResolvedValue(null);

      await expect(
        agentRegistryService.updateAgent(agentId, {}, organizationId)
      ).rejects.toThrow(AgentNotFoundError);
    });
  });

  describe('deregisterAgent', () => {
    const agentId = 'agent-123';
    const organizationId = 'org-123';

    it('should successfully deregister agent', async () => {
      const existingAgent = {
        id: agentId,
        organizationId,
        status: AgentStatus.ACTIVE
      };

      prismaMock.agent.findFirst.mockResolvedValue(existingAgent);
      prismaMock.agent.update.mockResolvedValue({
        ...existingAgent,
        status: AgentStatus.INACTIVE
      });
      redisMock.del.mockResolvedValue(1);
      redisMock.incrby.mockResolvedValue(0);
      redisMock.keys.mockResolvedValue([]);

      const result = await agentRegistryService.deregisterAgent(agentId, organizationId);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Agent deregistered successfully');
      expect(prismaMock.agent.update).toHaveBeenCalledWith({
        where: { id: agentId },
        data: {
          status: AgentStatus.INACTIVE,
          updatedAt: expect.any(Date)
        }
      });
      expect(redisMock.del).toHaveBeenCalledWith(`agent:${agentId}`);
    });
  });

  describe('getAgentsByCapability', () => {
    it('should return agents with specified capability', async () => {
      const capability = 'code_analysis';
      const organizationId = 'org-123';

      const mockResult = {
        success: true,
        data: [
          {
            id: 'agent-1',
            capabilities: [{ name: capability, version: '1.0.0' }]
          }
        ]
      };

      // Mock the discoverAgents method call
      vi.spyOn(agentRegistryService, 'discoverAgents').mockResolvedValue(mockResult as any);

      const result = await agentRegistryService.getAgentsByCapability(capability, organizationId);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResult.data);
      expect(agentRegistryService.discoverAgents).toHaveBeenCalledWith({
        capabilities: [capability],
        organizationId,
        status: [AgentStatus.ACTIVE],
        healthStatus: [HealthStatus.HEALTHY, HealthStatus.DEGRADED],
        limit: 50,
        offset: 0
      });
    });
  });

  describe('Load Balancing', () => {
    it('should apply least connections algorithm correctly', async () => {
      const agents = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          metrics: { activeConnections: 5 }
        },
        {
          id: 'agent-2',
          name: 'Agent 2',
          metrics: { activeConnections: 2 }
        },
        {
          id: 'agent-3',
          name: 'Agent 3',
          metrics: { activeConnections: 8 }
        }
      ];

      // Use reflection to access the private method for testing
      const sortedAgents = (agentRegistryService as any).applyLoadBalancing(
        agents,
        LoadBalancingAlgorithm.LEAST_CONNECTIONS
      );

      // Should be sorted by least connections first
      expect(sortedAgents[0].id).toBe('agent-2'); // 2 connections
      expect(sortedAgents[1].id).toBe('agent-1'); // 5 connections
      expect(sortedAgents[2].id).toBe('agent-3'); // 8 connections
    });

    it('should apply performance-based algorithm correctly', async () => {
      const agents = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          metrics: { responseTime: 100, throughput: 10, errorRate: 5 }
        },
        {
          id: 'agent-2',
          name: 'Agent 2',
          metrics: { responseTime: 50, throughput: 15, errorRate: 2 }
        }
      ];

      const sortedAgents = (agentRegistryService as any).applyLoadBalancing(
        agents,
        LoadBalancingAlgorithm.PERFORMANCE_BASED
      );

      // Agent 2 should have better performance score
      expect(sortedAgents[0].id).toBe('agent-2');
    });
  });
});