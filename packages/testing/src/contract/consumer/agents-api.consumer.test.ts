import { PactV3, MatchersV3, SpecificationVersion } from '@pact-foundation/pact';
import { describe, test, beforeAll, afterAll, expect } from 'vitest';
import path from 'path';

const { eachLike, like, term } = MatchersV3;

describe('Agents API Consumer Contract Tests', () => {
  const provider = new PactV3({
    consumer: 'testing-service',
    provider: 'agents-api',
    dir: path.resolve(__dirname, '../pacts'),
    spec: SpecificationVersion.SPECIFICATION_VERSION_V3,
    host: '127.0.0.1',
    port: 4001
  });

  beforeAll(async () => {
    await provider.setup();
  });

  afterAll(async () => {
    await provider.finalize();
  });

  describe('GET /agents', () => {
    test('should return a list of agents', async () => {
      // Define the expected contract
      await provider
        .given('agents exist')
        .uponReceiving('a request for all agents')
        .withRequest({
          method: 'GET',
          path: '/agents',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': like('Bearer token-123')
          }
        })
        .willRespondWith({
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          },
          body: {
            agents: eachLike({
              id: like('agent-123'),
              name: like('Test Agent'),
              type: term({
                generate: 'automation',
                matcher: '^(automation|analysis|integration|monitoring)$'
              }),
              status: term({
                generate: 'active',
                matcher: '^(active|inactive|error|pending)$'
              }),
              version: like('1.0.0'),
              description: like('A test automation agent'),
              capabilities: eachLike('file-processing'),
              configuration: like({
                maxConcurrentTasks: like(5),
                timeout: like(30000)
              }),
              healthCheck: like({
                status: 'healthy',
                lastCheck: like('2024-01-01T00:00:00.000Z'),
                responseTime: like(150)
              }),
              metrics: like({
                tasksExecuted: like(100),
                averageExecutionTime: like(2500),
                successRate: like(0.95),
                errorCount: like(5)
              }),
              createdAt: like('2024-01-01T00:00:00.000Z'),
              updatedAt: like('2024-01-01T00:00:00.000Z')
            }),
            pagination: like({
              page: like(1),
              limit: like(10),
              total: like(100),
              totalPages: like(10)
            })
          }
        });

      // Make the actual request
      const response = await fetch(`${provider.mockService.baseUrl}/agents`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token-123'
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data).toHaveProperty('agents');
      expect(data).toHaveProperty('pagination');
      expect(Array.isArray(data.agents)).toBe(true);

      if (data.agents.length > 0) {
        const agent = data.agents[0];
        expect(agent).toHaveProperty('id');
        expect(agent).toHaveProperty('name');
        expect(agent).toHaveProperty('type');
        expect(agent).toHaveProperty('status');
        expect(['automation', 'analysis', 'integration', 'monitoring']).toContain(agent.type);
        expect(['active', 'inactive', 'error', 'pending']).toContain(agent.status);
      }
    });
  });

  describe('GET /agents/:id', () => {
    test('should return a specific agent', async () => {
      const agentId = 'agent-123';

      await provider
        .given(`agent with id ${agentId} exists`)
        .uponReceiving('a request for a specific agent')
        .withRequest({
          method: 'GET',
          path: `/agents/${agentId}`,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': like('Bearer token-123')
          }
        })
        .willRespondWith({
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          },
          body: {
            id: like(agentId),
            name: like('Test Agent'),
            type: like('automation'),
            status: like('active'),
            version: like('1.0.0'),
            description: like('A test automation agent'),
            capabilities: eachLike('file-processing'),
            configuration: like({
              maxConcurrentTasks: like(5),
              timeout: like(30000)
            }),
            healthCheck: like({
              status: 'healthy',
              lastCheck: like('2024-01-01T00:00:00.000Z'),
              responseTime: like(150)
            }),
            metrics: like({
              tasksExecuted: like(100),
              averageExecutionTime: like(2500),
              successRate: like(0.95),
              errorCount: like(5)
            }),
            createdAt: like('2024-01-01T00:00:00.000Z'),
            updatedAt: like('2024-01-01T00:00:00.000Z')
          }
        });

      const response = await fetch(`${provider.mockService.baseUrl}/agents/${agentId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token-123'
        }
      });

      expect(response.status).toBe(200);
      const agent = await response.json();

      expect(agent.id).toBe(agentId);
      expect(agent).toHaveProperty('name');
      expect(agent).toHaveProperty('type');
      expect(agent).toHaveProperty('status');
    });
  });

  describe('POST /agents', () => {
    test('should create a new agent', async () => {
      const newAgent = {
        name: 'New Test Agent',
        type: 'automation',
        description: 'A new test automation agent',
        capabilities: ['file-processing', 'data-validation'],
        configuration: {
          maxConcurrentTasks: 5,
          timeout: 30000
        }
      };

      await provider
        .given('agent creation is allowed')
        .uponReceiving('a request to create a new agent')
        .withRequest({
          method: 'POST',
          path: '/agents',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': like('Bearer token-123')
          },
          body: newAgent
        })
        .willRespondWith({
          status: 201,
          headers: {
            'Content-Type': 'application/json'
          },
          body: {
            id: like('agent-456'),
            ...newAgent,
            status: like('pending'),
            version: like('1.0.0'),
            healthCheck: like({
              status: 'unknown',
              lastCheck: like('2024-01-01T00:00:00.000Z')
            }),
            metrics: like({
              tasksExecuted: 0,
              averageExecutionTime: 0,
              successRate: 0,
              errorCount: 0
            }),
            createdAt: like('2024-01-01T00:00:00.000Z'),
            updatedAt: like('2024-01-01T00:00:00.000Z')
          }
        });

      const response = await fetch(`${provider.mockService.baseUrl}/agents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token-123'
        },
        body: JSON.stringify(newAgent)
      });

      expect(response.status).toBe(201);
      const createdAgent = await response.json();

      expect(createdAgent).toHaveProperty('id');
      expect(createdAgent.name).toBe(newAgent.name);
      expect(createdAgent.type).toBe(newAgent.type);
      expect(createdAgent.status).toBe('pending');
    });
  });

  describe('PUT /agents/:id', () => {
    test('should update an existing agent', async () => {
      const agentId = 'agent-123';
      const updates = {
        name: 'Updated Agent Name',
        description: 'Updated description'
      };

      await provider
        .given(`agent with id ${agentId} exists`)
        .uponReceiving('a request to update an agent')
        .withRequest({
          method: 'PUT',
          path: `/agents/${agentId}`,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': like('Bearer token-123')
          },
          body: updates
        })
        .willRespondWith({
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          },
          body: {
            id: like(agentId),
            name: like(updates.name),
            type: like('automation'),
            status: like('active'),
            version: like('1.0.0'),
            description: like(updates.description),
            capabilities: eachLike('file-processing'),
            configuration: like({
              maxConcurrentTasks: like(5),
              timeout: like(30000)
            }),
            healthCheck: like({
              status: 'healthy',
              lastCheck: like('2024-01-01T00:00:00.000Z'),
              responseTime: like(150)
            }),
            metrics: like({
              tasksExecuted: like(100),
              averageExecutionTime: like(2500),
              successRate: like(0.95),
              errorCount: like(5)
            }),
            createdAt: like('2024-01-01T00:00:00.000Z'),
            updatedAt: like('2024-01-01T00:00:00.000Z')
          }
        });

      const response = await fetch(`${provider.mockService.baseUrl}/agents/${agentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token-123'
        },
        body: JSON.stringify(updates)
      });

      expect(response.status).toBe(200);
      const updatedAgent = await response.json();

      expect(updatedAgent.id).toBe(agentId);
      expect(updatedAgent.name).toBe(updates.name);
      expect(updatedAgent.description).toBe(updates.description);
    });
  });

  describe('DELETE /agents/:id', () => {
    test('should delete an agent', async () => {
      const agentId = 'agent-123';

      await provider
        .given(`agent with id ${agentId} exists`)
        .uponReceiving('a request to delete an agent')
        .withRequest({
          method: 'DELETE',
          path: `/agents/${agentId}`,
          headers: {
            'Authorization': like('Bearer token-123')
          }
        })
        .willRespondWith({
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          },
          body: {
            message: like('Agent deleted successfully')
          }
        });

      const response = await fetch(`${provider.mockService.baseUrl}/agents/${agentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer token-123'
        }
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.message).toBe('Agent deleted successfully');
    });
  });
});