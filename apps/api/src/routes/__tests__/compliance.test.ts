import { buildServer } from '../../server';
import { FastifyInstance } from 'fastify';
import { jest } from '@jest/globals';

// Mock all external dependencies
jest.mock('@prisma/client');
jest.mock('../../lib/database');
jest.mock('../../services/violation-detection-service');
jest.mock('../../services/websocket-service');
jest.mock('../../services/policy-loader');
jest.mock('../../services/compliance-report-generator');

describe('Compliance Routes', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    // Mock the database connection
    const mockDatabase = {
      getPrisma: jest.fn().mockReturnValue({
        complianceRule: {
          findMany: jest.fn(),
          groupBy: jest.fn(),
          count: jest.fn(),
        },
        policy: {
          findMany: jest.fn(),
          count: jest.fn(),
        },
        auditLog: {
          findMany: jest.fn(),
        },
      }),
      connectWithRetry: jest.fn().mockResolvedValue(undefined),
      disconnectPrisma: jest.fn().mockResolvedValue(undefined),
    };

    jest.doMock('../../lib/database', () => mockDatabase);

    server = await buildServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /compliance/dashboard', () => {
    it('should return dashboard data successfully', async () => {
      // Mock successful database responses
      const mockPrisma = server.prisma;
      mockPrisma.complianceRule.findMany.mockResolvedValue([
        {
          id: 'violation-1',
          severity: 'HIGH',
          status: 'OPEN',
          createdAt: new Date(),
          metadata: { framework: 'SOC2' },
        },
      ]);

      mockPrisma.complianceRule.count.mockResolvedValue(5);
      mockPrisma.policy.count.mockResolvedValue(10);

      const response = await server.inject({
        method: 'GET',
        url: '/compliance/dashboard',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('overview');
      expect(data.data).toHaveProperty('recentViolations');
      expect(data.data).toHaveProperty('frameworkStatus');
    });

    it('should filter by framework when specified', async () => {
      const mockPrisma = server.prisma;
      mockPrisma.complianceRule.findMany.mockResolvedValue([]);
      mockPrisma.complianceRule.count.mockResolvedValue(0);
      mockPrisma.policy.count.mockResolvedValue(0);

      const response = await server.inject({
        method: 'GET',
        url: '/compliance/dashboard?framework=SOC2',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockPrisma.complianceRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            metadata: expect.objectContaining({
              path: ['framework'],
              equals: 'SOC2',
            }),
          }),
        })
      );
    });

    it('should apply date range filters', async () => {
      const mockPrisma = server.prisma;
      mockPrisma.complianceRule.findMany.mockResolvedValue([]);
      mockPrisma.complianceRule.count.mockResolvedValue(0);
      mockPrisma.policy.count.mockResolvedValue(0);

      const startDate = '2024-01-01T00:00:00.000Z';
      const endDate = '2024-01-31T23:59:59.999Z';

      const response = await server.inject({
        method: 'GET',
        url: `/compliance/dashboard?startDate=${startDate}&endDate=${endDate}`,
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockPrisma.complianceRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: {
              gte: new Date(startDate),
              lte: new Date(endDate),
            },
          }),
        })
      );
    });

    it('should return 401 without valid authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/compliance/dashboard',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /compliance/violations', () => {
    it('should return filtered violations', async () => {
      const mockPrisma = server.prisma;
      mockPrisma.complianceRule.findMany.mockResolvedValue([
        {
          id: 'violation-1',
          severity: 'HIGH',
          status: 'OPEN',
          title: 'Test Violation',
          description: 'Test description',
          createdAt: new Date(),
          metadata: {},
        },
      ]);

      mockPrisma.complianceRule.count.mockResolvedValue(1);

      const response = await server.inject({
        method: 'GET',
        url: '/compliance/violations?severity=high&status=open',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.data.violations).toHaveLength(1);
      expect(data.data.total).toBe(1);
    });

    it('should support pagination', async () => {
      const mockPrisma = server.prisma;
      mockPrisma.complianceRule.findMany.mockResolvedValue([]);
      mockPrisma.complianceRule.count.mockResolvedValue(0);

      const response = await server.inject({
        method: 'GET',
        url: '/compliance/violations?page=2&limit=5',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockPrisma.complianceRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 5, // (page - 1) * limit
          take: 5,
        })
      );
    });
  });

  describe('GET /compliance/frameworks', () => {
    it('should return framework compliance status', async () => {
      const mockPrisma = server.prisma;
      mockPrisma.complianceRule.groupBy.mockResolvedValue([
        { metadata: { framework: 'SOC2' }, _count: 5 },
        { metadata: { framework: 'GDPR' }, _count: 3 },
      ]);

      mockPrisma.policy.findMany.mockResolvedValue([
        { complianceFrameworks: ['SOC2'] },
        { complianceFrameworks: ['GDPR'] },
        { complianceFrameworks: ['SOC2', 'GDPR'] },
      ]);

      const response = await server.inject({
        method: 'GET',
        url: '/compliance/frameworks',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.data.frameworks).toBeDefined();
    });
  });

  describe('POST /compliance/reports/generate', () => {
    it('should generate PDF report successfully', async () => {
      // Mock the report generator service
      const mockReportGenerator = {
        generateReport: jest.fn().mockResolvedValue(Buffer.from('fake-pdf-content')),
      };

      // Replace the service in the server
      server.decorate('reportGenerator', mockReportGenerator);

      const response = await server.inject({
        method: 'POST',
        url: '/compliance/reports/generate',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/json',
        },
        payload: {
          format: 'pdf',
          framework: 'SOC2',
          dateRange: {
            start: '2024-01-01T00:00:00.000Z',
            end: '2024-01-31T23:59:59.999Z',
          },
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(mockReportGenerator.generateReport).toHaveBeenCalled();
    });

    it('should generate CSV report successfully', async () => {
      const mockReportGenerator = {
        generateReport: jest.fn().mockResolvedValue('csv,content,here'),
      };

      server.decorate('reportGenerator', mockReportGenerator);

      const response = await server.inject({
        method: 'POST',
        url: '/compliance/reports/generate',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/json',
        },
        payload: {
          format: 'csv',
          framework: 'GDPR',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/csv');
    });

    it('should validate request body', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/compliance/reports/generate',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/json',
        },
        payload: {
          format: 'invalid-format', // Invalid format
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /compliance/metrics', () => {
    it('should return compliance metrics', async () => {
      const mockPrisma = server.prisma;
      mockPrisma.complianceRule.count
        .mockResolvedValueOnce(10) // total violations
        .mockResolvedValueOnce(3)  // critical violations
        .mockResolvedValueOnce(4)  // high violations
        .mockResolvedValueOnce(2)  // medium violations
        .mockResolvedValueOnce(1); // low violations

      mockPrisma.policy.count.mockResolvedValue(15);

      const response = await server.inject({
        method: 'GET',
        url: '/compliance/metrics',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.data.totalViolations).toBe(10);
      expect(data.data.totalPolicies).toBe(15);
      expect(data.data.severityDistribution).toBeDefined();
    });
  });

  describe('POST /compliance/alerts/configure', () => {
    it('should configure alert settings', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/compliance/alerts/configure',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/json',
        },
        payload: {
          riskThreshold: 8.0,
          severityFilters: ['high', 'critical'],
          notificationChannels: ['email', 'slack'],
          escalationRules: [
            {
              condition: 'riskScore > 9',
              action: 'immediate',
              targets: ['admin@example.com'],
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
    });

    it('should validate alert configuration', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/compliance/alerts/configure',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/json',
        },
        payload: {
          riskThreshold: -1, // Invalid threshold
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /compliance/audit-trail', () => {
    it('should return audit trail entries', async () => {
      const mockPrisma = server.prisma;
      mockPrisma.auditLog.findMany.mockResolvedValue([
        {
          id: 'audit-1',
          action: 'POLICY_CREATED',
          userId: 'user-123',
          metadata: { policyId: 'policy-456' },
          timestamp: new Date(),
        },
      ]);

      const response = await server.inject({
        method: 'GET',
        url: '/compliance/audit-trail',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.data.entries).toHaveLength(1);
    });

    it('should filter audit trail by action type', async () => {
      const mockPrisma = server.prisma;
      mockPrisma.auditLog.findMany.mockResolvedValue([]);

      const response = await server.inject({
        method: 'GET',
        url: '/compliance/audit-trail?action=POLICY_VIOLATION',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            action: 'POLICY_VIOLATION',
          }),
        })
      );
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      const mockPrisma = server.prisma;
      mockPrisma.complianceRule.findMany.mockRejectedValue(new Error('Database error'));

      const response = await server.inject({
        method: 'GET',
        url: '/compliance/dashboard',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(500);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });

    it('should validate query parameters', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/compliance/violations?severity=invalid-severity',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});