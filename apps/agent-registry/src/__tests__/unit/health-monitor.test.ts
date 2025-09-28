import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { HealthMonitorService } from '../../services/health-monitor.js';
import {
  Heartbeat,
  AgentStatus,
  HealthStatus,
  AgentMetrics
} from '../../types/index.js';

// Mock dependencies
vi.mock('@prisma/client');
vi.mock('ioredis');
vi.mock('ws');

describe('HealthMonitorService', () => {
  let healthMonitorService: HealthMonitorService;
  let prismaMock: any;
  let redisMock: any;

  beforeEach(() => {
    prismaMock = {
      agent: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn()
      }
    };

    redisMock = {
      hgetall: vi.fn(),
      hset: vi.fn(),
      expire: vi.fn(),
      hget: vi.fn(),
      keys: vi.fn()
    };

    healthMonitorService = new HealthMonitorService(prismaMock, redisMock);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('processHeartbeat', () => {
    const mockHeartbeat: Heartbeat = {
      agentId: 'agent-123',
      timestamp: new Date(),
      status: AgentStatus.ACTIVE,
      healthStatus: HealthStatus.HEALTHY,
      metrics: {
        responseTime: 100,
        throughput: 10,
        errorRate: 2,
        activeConnections: 5,
        totalRequests: 1000,
        successfulRequests: 980,
        failedRequests: 20,
        lastUpdated: new Date()
      }
    };

    it('should successfully process a valid heartbeat', async () => {
      prismaMock.agent.update.mockResolvedValue({
        id: mockHeartbeat.agentId,
        status: mockHeartbeat.status
      });

      redisMock.hset.mockResolvedValue(1);
      redisMock.expire.mockResolvedValue(1);

      // Mock event emission
      const emitSpy = vi.spyOn(healthMonitorService, 'emit');

      await healthMonitorService.processHeartbeat(mockHeartbeat);

      expect(prismaMock.agent.update).toHaveBeenCalledWith({
        where: { id: mockHeartbeat.agentId },
        data: {
          status: mockHeartbeat.status,
          updatedAt: expect.any(Date)
        }
      });

      expect(redisMock.hset).toHaveBeenCalledWith(
        `agent_health:${mockHeartbeat.agentId}`,
        expect.objectContaining({
          status: mockHeartbeat.status,
          healthStatus: mockHeartbeat.healthStatus,
          lastHeartbeat: mockHeartbeat.timestamp.toISOString(),
          metrics: JSON.stringify(mockHeartbeat.metrics)
        })
      );

      expect(emitSpy).toHaveBeenCalledWith('agentHealthUpdate', expect.objectContaining({
        agentId: mockHeartbeat.agentId,
        status: mockHeartbeat.status,
        healthStatus: mockHeartbeat.healthStatus
      }));
    });

    it('should throw error for invalid heartbeat data', async () => {
      const invalidHeartbeat = {
        ...mockHeartbeat,
        agentId: '', // Invalid empty agent ID
        status: 'invalid-status' as any
      };

      await expect(
        healthMonitorService.processHeartbeat(invalidHeartbeat)
      ).rejects.toThrow('Agent ID is required in heartbeat');
    });

    it('should handle heartbeat without metrics', async () => {
      const heartbeatWithoutMetrics = {
        agentId: 'agent-123',
        timestamp: new Date(),
        status: AgentStatus.ACTIVE,
        healthStatus: HealthStatus.HEALTHY
      };

      prismaMock.agent.update.mockResolvedValue({});
      redisMock.hset.mockResolvedValue(1);
      redisMock.expire.mockResolvedValue(1);

      await healthMonitorService.processHeartbeat(heartbeatWithoutMetrics);

      expect(redisMock.hset).toHaveBeenCalledWith(
        `agent_health:${heartbeatWithoutMetrics.agentId}`,
        expect.objectContaining({
          status: heartbeatWithoutMetrics.status,
          healthStatus: heartbeatWithoutMetrics.healthStatus,
          lastHeartbeat: heartbeatWithoutMetrics.timestamp.toISOString()
        })
      );
    });
  });

  describe('getAgentHealth', () => {
    const agentId = 'agent-123';

    it('should return cached health data when available', async () => {
      const mockCachedHealth = {
        status: AgentStatus.ACTIVE,
        healthStatus: HealthStatus.HEALTHY,
        metrics: JSON.stringify({
          responseTime: 100,
          throughput: 10,
          errorRate: 2
        }),
        lastHeartbeat: new Date().toISOString()
      };

      redisMock.hgetall.mockResolvedValue(mockCachedHealth);

      const result = await healthMonitorService.getAgentHealth(agentId);

      expect(result).toEqual({
        status: mockCachedHealth.status,
        healthStatus: mockCachedHealth.healthStatus,
        metrics: JSON.parse(mockCachedHealth.metrics),
        lastHeartbeat: new Date(mockCachedHealth.lastHeartbeat)
      });

      expect(redisMock.hgetall).toHaveBeenCalledWith(`agent_health:${agentId}`);
      expect(prismaMock.agent.findUnique).not.toHaveBeenCalled();
    });

    it('should fallback to database when cache miss', async () => {
      const mockDbAgent = {
        id: agentId,
        status: AgentStatus.ACTIVE,
        updatedAt: new Date()
      };

      redisMock.hgetall.mockResolvedValue({}); // Empty cache
      prismaMock.agent.findUnique.mockResolvedValue(mockDbAgent);

      const result = await healthMonitorService.getAgentHealth(agentId);

      expect(result).toEqual({
        status: mockDbAgent.status,
        healthStatus: HealthStatus.UNKNOWN,
        lastHeartbeat: mockDbAgent.updatedAt
      });

      expect(prismaMock.agent.findUnique).toHaveBeenCalledWith({
        where: { id: agentId },
        select: {
          status: true,
          updatedAt: true
        }
      });
    });

    it('should return null when agent does not exist', async () => {
      redisMock.hgetall.mockResolvedValue({});
      prismaMock.agent.findUnique.mockResolvedValue(null);

      const result = await healthMonitorService.getAgentHealth(agentId);

      expect(result).toBeNull();
    });
  });

  describe('getOrganizationHealthOverview', () => {
    const organizationId = 'org-123';

    it('should return correct health overview', async () => {
      const mockAgents = [
        { id: 'agent-1', status: AgentStatus.ACTIVE },
        { id: 'agent-2', status: AgentStatus.ACTIVE },
        { id: 'agent-3', status: AgentStatus.INACTIVE }
      ];

      prismaMock.agent.findMany.mockResolvedValue(mockAgents);

      // Mock health responses for each agent
      const getAgentHealthSpy = vi.spyOn(healthMonitorService, 'getAgentHealth')
        .mockResolvedValueOnce({
          status: AgentStatus.ACTIVE,
          healthStatus: HealthStatus.HEALTHY,
          lastHeartbeat: new Date()
        })
        .mockResolvedValueOnce({
          status: AgentStatus.ACTIVE,
          healthStatus: HealthStatus.DEGRADED,
          lastHeartbeat: new Date()
        })
        .mockResolvedValueOnce({
          status: AgentStatus.INACTIVE,
          healthStatus: HealthStatus.UNKNOWN,
          lastHeartbeat: new Date()
        });

      const result = await healthMonitorService.getOrganizationHealthOverview(organizationId);

      expect(result).toEqual({
        total: 3,
        healthy: 1,
        unhealthy: 0,
        degraded: 1,
        unknown: 0,
        offline: 1
      });

      expect(prismaMock.agent.findMany).toHaveBeenCalledWith({
        where: { organizationId },
        select: { id: true, status: true }
      });

      expect(getAgentHealthSpy).toHaveBeenCalledTimes(3);
    });

    it('should handle empty organization', async () => {
      prismaMock.agent.findMany.mockResolvedValue([]);

      const result = await healthMonitorService.getOrganizationHealthOverview(organizationId);

      expect(result).toEqual({
        total: 0,
        healthy: 0,
        unhealthy: 0,
        degraded: 0,
        unknown: 0,
        offline: 0
      });
    });
  });

  describe('triggerHealthCheck', () => {
    const agentId = 'agent-123';

    it('should trigger health check for existing agent', async () => {
      const mockAgent = {
        id: agentId,
        name: 'Test Agent',
        status: AgentStatus.ACTIVE
      };

      prismaMock.agent.findUnique.mockResolvedValue(mockAgent);

      // Mock the performHealthCheck private method
      const performHealthCheckSpy = vi.spyOn(healthMonitorService as any, 'performHealthCheck')
        .mockResolvedValue(undefined);

      await healthMonitorService.triggerHealthCheck(agentId);

      expect(prismaMock.agent.findUnique).toHaveBeenCalledWith({
        where: { id: agentId }
      });

      expect(performHealthCheckSpy).toHaveBeenCalledWith(mockAgent);
    });

    it('should throw error when agent not found', async () => {
      prismaMock.agent.findUnique.mockResolvedValue(null);

      await expect(
        healthMonitorService.triggerHealthCheck(agentId)
      ).rejects.toThrow(`Agent ${agentId} not found`);
    });
  });

  describe('Health Status Calculation', () => {
    it('should calculate healthy status for good metrics', () => {
      const goodMetrics: AgentMetrics = {
        responseTime: 50,
        throughput: 20,
        errorRate: 1,
        totalRequests: 1000,
        successfulRequests: 990,
        failedRequests: 10,
        activeConnections: 5,
        lastUpdated: new Date()
      };

      const healthStatus = (healthMonitorService as any).calculateHealthStatus(goodMetrics);
      expect(healthStatus).toBe(HealthStatus.HEALTHY);
    });

    it('should calculate degraded status for moderate metrics', () => {
      const moderateMetrics: AgentMetrics = {
        responseTime: 200,
        throughput: 8,
        errorRate: 15,
        totalRequests: 1000,
        successfulRequests: 750,
        failedRequests: 250,
        activeConnections: 10,
        lastUpdated: new Date()
      };

      const healthStatus = (healthMonitorService as any).calculateHealthStatus(moderateMetrics);
      expect(healthStatus).toBe(HealthStatus.DEGRADED);
    });

    it('should calculate unhealthy status for poor metrics', () => {
      const poorMetrics: AgentMetrics = {
        responseTime: 5000,
        throughput: 1,
        errorRate: 60,
        totalRequests: 1000,
        successfulRequests: 400,
        failedRequests: 600,
        activeConnections: 20,
        lastUpdated: new Date()
      };

      const healthStatus = (healthMonitorService as any).calculateHealthStatus(poorMetrics);
      expect(healthStatus).toBe(HealthStatus.UNHEALTHY);
    });

    it('should return unknown for missing metrics', () => {
      const healthStatus = (healthMonitorService as any).calculateHealthStatus(null);
      expect(healthStatus).toBe(HealthStatus.UNKNOWN);
    });
  });

  describe('WebSocket Broadcasting', () => {
    it('should handle empty client list gracefully', async () => {
      const message = {
        type: 'agent_health_update',
        data: { agentId: 'agent-123', status: AgentStatus.ACTIVE },
        timestamp: new Date(),
        id: 'msg-123'
      };

      // Mock empty clients set
      (healthMonitorService as any).connectedClients = new Set();

      await expect(
        (healthMonitorService as any).broadcastHealthUpdate(message)
      ).resolves.not.toThrow();
    });
  });

  describe('Heartbeat Validation', () => {
    it('should validate required heartbeat fields', () => {
      const invalidHeartbeats = [
        { agentId: '', timestamp: new Date(), status: AgentStatus.ACTIVE, healthStatus: HealthStatus.HEALTHY },
        { agentId: 'agent-123', timestamp: null, status: AgentStatus.ACTIVE, healthStatus: HealthStatus.HEALTHY },
        { agentId: 'agent-123', timestamp: new Date(), status: 'invalid', healthStatus: HealthStatus.HEALTHY },
        { agentId: 'agent-123', timestamp: new Date(), status: AgentStatus.ACTIVE, healthStatus: 'invalid' }
      ];

      invalidHeartbeats.forEach((heartbeat, index) => {
        expect(() => {
          (healthMonitorService as any).validateHeartbeat(heartbeat);
        }).toThrow();
      });
    });

    it('should pass validation for valid heartbeat', () => {
      const validHeartbeat = {
        agentId: 'agent-123',
        timestamp: new Date(),
        status: AgentStatus.ACTIVE,
        healthStatus: HealthStatus.HEALTHY
      };

      expect(() => {
        (healthMonitorService as any).validateHeartbeat(validHeartbeat);
      }).not.toThrow();
    });
  });
});