import { ViolationDetectionService } from '../violation-detection-service';
import { PrismaPolicyLoader } from '../policy-loader';
import { PrismaClient } from '@prisma/client';
import { jest } from '@jest/globals';

// Mock dependencies
jest.mock('@prisma/client');
jest.mock('../policy-loader');
jest.mock('../lib/logger');

describe('ViolationDetectionService', () => {
  let violationService: ViolationDetectionService;
  let mockPrisma: jest.Mocked<PrismaClient>;
  let mockPolicyLoader: jest.Mocked<PrismaPolicyLoader>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Prisma client
    mockPrisma = {
      complianceRule: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
    } as any;

    // Mock policy loader
    mockPolicyLoader = {
      loadPolicy: jest.fn(),
      findPoliciesForResource: jest.fn(),
      findPoliciesByType: jest.fn(),
      findPoliciesByComplianceFramework: jest.fn(),
    } as any;

    violationService = new ViolationDetectionService(mockPrisma, mockPolicyLoader);
  });

  describe('processEvaluationResult', () => {
    const mockContext = {
      userId: 'user-123',
      resourceId: 'resource-456',
      resourceType: 'user',
      action: 'read',
      timestamp: new Date(),
      metadata: {},
    };

    const mockEvaluationResult = {
      decision: 'deny' as const,
      violations: [
        {
          policyId: 'policy-123',
          ruleId: 'rule-456',
          severity: 'high' as const,
          message: 'Access denied',
          context: {},
        },
      ],
      metadata: {},
    };

    it('should process deny decisions and create violation alerts', async () => {
      mockPrisma.complianceRule.create.mockResolvedValue({
        id: 'violation-123',
        organizationId: 'org-123',
        type: 'VIOLATION',
        severity: 'HIGH',
        status: 'OPEN',
        title: 'Policy Violation',
        description: 'Access denied',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const alerts = await violationService.processEvaluationResult(
        'org-123',
        'policy-123',
        mockContext,
        mockEvaluationResult
      );

      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe('high');
      expect(alerts[0].title).toBe('Policy Violation');
      expect(mockPrisma.complianceRule.create).toHaveBeenCalled();
    });

    it('should not create alerts for allow decisions with no violations', async () => {
      const allowResult = {
        decision: 'allow' as const,
        violations: [],
        metadata: {},
      };

      const alerts = await violationService.processEvaluationResult(
        'org-123',
        'policy-123',
        mockContext,
        allowResult
      );

      expect(alerts).toHaveLength(0);
      expect(mockPrisma.complianceRule.create).not.toHaveBeenCalled();
    });

    it('should calculate risk scores correctly', async () => {
      mockPrisma.complianceRule.create.mockResolvedValue({
        id: 'violation-123',
        organizationId: 'org-123',
        type: 'VIOLATION',
        severity: 'CRITICAL',
        status: 'OPEN',
        title: 'Critical Policy Violation',
        description: 'Critical access violation',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const criticalViolation = {
        decision: 'deny' as const,
        violations: [
          {
            policyId: 'policy-123',
            ruleId: 'rule-456',
            severity: 'critical' as const,
            message: 'Critical violation',
            context: {},
          },
        ],
        metadata: {},
      };

      const alerts = await violationService.processEvaluationResult(
        'org-123',
        'policy-123',
        mockContext,
        criticalViolation
      );

      expect(alerts[0].riskScore).toBeGreaterThan(8);
    });

    it('should emit violation-detected event', async () => {
      const emitSpy = jest.spyOn(violationService, 'emit');

      mockPrisma.complianceRule.create.mockResolvedValue({
        id: 'violation-123',
        organizationId: 'org-123',
        type: 'VIOLATION',
        severity: 'HIGH',
        status: 'OPEN',
        title: 'Policy Violation',
        description: 'Access denied',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      await violationService.processEvaluationResult(
        'org-123',
        'policy-123',
        mockContext,
        mockEvaluationResult
      );

      expect(emitSpy).toHaveBeenCalledWith('violation-detected', expect.any(Object));
    });
  });

  describe('configureAlerts', () => {
    const mockAlertConfig = {
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
    };

    it('should store alert configuration', async () => {
      await violationService.configureAlerts('org-123', mockAlertConfig as any);

      // Should not throw
      expect(true).toBe(true);
    });

    it('should validate alert configuration', async () => {
      const invalidConfig = {
        riskThreshold: -1, // Invalid threshold
        severityFilters: [],
        notificationChannels: [],
        escalationRules: [],
      };

      await expect(
        violationService.configureAlerts('org-123', invalidConfig as any)
      ).rejects.toThrow();
    });
  });

  describe('getRecentViolations', () => {
    it('should retrieve recent violations with filters', async () => {
      const mockViolations = [
        {
          id: 'violation-1',
          type: 'VIOLATION',
          severity: 'HIGH',
          status: 'OPEN',
          title: 'Test Violation',
          description: 'Test description',
          metadata: {},
          createdAt: new Date(),
        },
      ];

      mockPrisma.complianceRule.findMany.mockResolvedValue(mockViolations as any);

      const violations = await violationService.getRecentViolations('org-123', {
        severity: 'high',
        limit: 10,
        offset: 0,
      });

      expect(violations).toHaveLength(1);
      expect(violations[0].severity).toBe('high');
      expect(mockPrisma.complianceRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-123',
            severity: 'HIGH',
          }),
        })
      );
    });

    it('should apply date range filters', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      mockPrisma.complianceRule.findMany.mockResolvedValue([]);

      await violationService.getRecentViolations('org-123', {
        dateRange: { start: startDate, end: endDate },
        limit: 10,
        offset: 0,
      });

      expect(mockPrisma.complianceRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          }),
        })
      );
    });
  });

  describe('getRiskMetrics', () => {
    it('should calculate organization risk metrics', async () => {
      const mockViolations = [
        { severity: 'HIGH', createdAt: new Date() },
        { severity: 'MEDIUM', createdAt: new Date() },
        { severity: 'CRITICAL', createdAt: new Date() },
      ];

      mockPrisma.complianceRule.findMany.mockResolvedValue(mockViolations as any);

      const metrics = await violationService.getRiskMetrics('org-123', {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31'),
      });

      expect(metrics.totalViolations).toBe(3);
      expect(metrics.riskScore).toBeGreaterThan(0);
      expect(metrics.severityDistribution).toHaveProperty('high');
      expect(metrics.severityDistribution).toHaveProperty('medium');
      expect(metrics.severityDistribution).toHaveProperty('critical');
    });

    it('should include trend analysis', async () => {
      mockPrisma.complianceRule.findMany
        .mockResolvedValueOnce([{ severity: 'HIGH' }, { severity: 'MEDIUM' }] as any) // Current period
        .mockResolvedValueOnce([{ severity: 'LOW' }] as any); // Previous period

      const metrics = await violationService.getRiskMetrics('org-123', {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31'),
      });

      expect(metrics.trends).toBeDefined();
      expect(metrics.trends.changeFromPrevious).toBeGreaterThan(0); // Increased violations
    });
  });

  describe('escalation handling', () => {
    it('should trigger escalation for high-risk violations', async () => {
      const emitSpy = jest.spyOn(violationService, 'emit');

      // Configure escalation
      await violationService.configureAlerts('org-123', {
        riskThreshold: 7.0,
        severityFilters: ['critical'],
        notificationChannels: ['email'],
        escalationRules: [
          {
            condition: 'riskScore > 8',
            action: 'immediate',
            targets: ['admin@example.com'],
          },
        ],
      } as any);

      mockPrisma.complianceRule.create.mockResolvedValue({
        id: 'violation-123',
        organizationId: 'org-123',
        type: 'VIOLATION',
        severity: 'CRITICAL',
        status: 'OPEN',
        title: 'Critical Violation',
        description: 'Critical violation',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const criticalViolation = {
        decision: 'deny' as const,
        violations: [
          {
            policyId: 'policy-123',
            ruleId: 'rule-456',
            severity: 'critical' as const,
            message: 'Critical violation',
            context: {},
          },
        ],
        metadata: {},
      };

      await violationService.processEvaluationResult(
        'org-123',
        'policy-123',
        {
          userId: 'user-123',
          resourceId: 'resource-456',
          resourceType: 'user',
          action: 'read',
          timestamp: new Date(),
          metadata: {},
        },
        criticalViolation
      );

      expect(emitSpy).toHaveBeenCalledWith('violation-detected', expect.any(Object));
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      mockPrisma.complianceRule.create.mockRejectedValue(new Error('Database error'));

      await expect(
        violationService.processEvaluationResult(
          'org-123',
          'policy-123',
          {
            userId: 'user-123',
            resourceId: 'resource-456',
            resourceType: 'user',
            action: 'read',
            timestamp: new Date(),
            metadata: {},
          },
          {
            decision: 'deny',
            violations: [
              {
                policyId: 'policy-123',
                ruleId: 'rule-456',
                severity: 'high',
                message: 'Test violation',
                context: {},
              },
            ],
            metadata: {},
          }
        )
      ).rejects.toThrow('Database error');
    });

    it('should validate input parameters', async () => {
      await expect(
        violationService.processEvaluationResult(
          '', // Empty organization ID
          'policy-123',
          {
            userId: 'user-123',
            resourceId: 'resource-456',
            resourceType: 'user',
            action: 'read',
            timestamp: new Date(),
            metadata: {},
          },
          {
            decision: 'deny',
            violations: [],
            metadata: {},
          }
        )
      ).rejects.toThrow();
    });
  });
});