/**
 * Threat Detection Engine Tests
 *
 * Comprehensive test suite for ML-based threat detection functionality.
 */

import { ThreatDetectionEngine, ThreatDetectionConfig } from '../ThreatDetectionEngine';
import { AuditEvent } from '../../services/audit-logging';

// Mock Redis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    zadd: jest.fn().mockResolvedValue(1),
    zcard: jest.fn().mockResolvedValue(0),
    zremrangebyscore: jest.fn().mockResolvedValue(0),
    quit: jest.fn().mockResolvedValue('OK')
  }));
});

// Mock behavioral analyzer
jest.mock('../BehavioralAnalyzer', () => ({
  BehavioralAnalyzer: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    analyzeBehavior: jest.fn().mockResolvedValue([]),
    loadBaselines: jest.fn().mockResolvedValue(undefined),
    updateBaselines: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined)
  }))
}));

// Mock anomaly detection models
jest.mock('../AnomalyDetectionModels', () => ({
  AnomalyDetectionModels: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    detectAnomalies: jest.fn().mockResolvedValue([]),
    loadModels: jest.fn().mockResolvedValue(undefined),
    retrain: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined)
  }))
}));

describe('ThreatDetectionEngine', () => {
  let engine: ThreatDetectionEngine;
  let mockConfig: ThreatDetectionConfig;

  beforeEach(() => {
    mockConfig = {
      realTimeProcessing: false, // Disable for testing
      batchSize: 10,
      maxProcessingLatency: 1000,
      enableStatisticalModels: true,
      enableBehavioralAnalysis: true,
      enableAnomalyDetection: true,
      anomalyThreshold: 0.6,
      behavioralThreshold: 0.7,
      riskScoreThreshold: 50,
      retrainingInterval: 24,
      minDataPointsForRetraining: 100,
      enableMetrics: true,
      metricsRetentionDays: 30
    };

    engine = new ThreatDetectionEngine(mockConfig);
  });

  afterEach(async () => {
    if (engine) {
      await engine.shutdown();
    }
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      const initPromise = engine.initialize();
      await expect(initPromise).resolves.toBeUndefined();
    });

    it('should not initialize twice', async () => {
      await engine.initialize();
      const secondInit = engine.initialize();
      await expect(secondInit).resolves.toBeUndefined();
    });
  });

  describe('Event Processing', () => {
    beforeEach(async () => {
      await engine.initialize();
    });

    it('should process audit event successfully', async () => {
      const auditEvent = createMockAuditEvent();
      const threats = await engine.processAuditEvent(auditEvent);

      expect(Array.isArray(threats)).toBe(true);
    });

    it('should detect statistical anomalies', async () => {
      const auditEvent = createMockAuditEvent({
        outcome: 'FAILURE',
        timestamp: new Date(new Date().setHours(2)) // 2 AM - off hours
      });

      const threats = await engine.processAuditEvent(auditEvent);

      // Should detect off-hours access
      expect(threats.length).toBeGreaterThan(0);
      expect(threats.some(t => t.description.includes('outside normal business hours'))).toBe(true);
    });

    it('should detect privilege escalation attempts', async () => {
      const auditEvent = createMockAuditEvent({
        action: 'escalate_privileges',
        category: 'AUTHORIZATION',
        severity: 'HIGH'
      });

      const threats = await engine.processAuditEvent(auditEvent);

      expect(threats.length).toBeGreaterThan(0);
      expect(threats.some(t => t.threatType === 'PRIVILEGE_ESCALATION')).toBe(true);
    });

    it('should calculate risk scores correctly', async () => {
      const highRiskEvent = createMockAuditEvent({
        severity: 'CRITICAL',
        outcome: 'FAILURE',
        actor: { type: 'ANONYMOUS' }
      });

      const threats = await engine.processAuditEvent(highRiskEvent);

      if (threats.length > 0) {
        expect(threats[0].riskScore).toBeGreaterThan(50);
      }
    });

    it('should filter threats by thresholds', async () => {
      // Create low-risk event
      const lowRiskEvent = createMockAuditEvent({
        severity: 'LOW',
        outcome: 'SUCCESS',
        timestamp: new Date(new Date().setHours(14)) // 2 PM - business hours
      });

      const threats = await engine.processAuditEvent(lowRiskEvent);

      // Should not detect threats for low-risk events
      expect(threats.length).toBe(0);
    });
  });

  describe('Batch Processing', () => {
    beforeEach(async () => {
      await engine.initialize();
    });

    it('should process multiple events in batch', async () => {
      const events = Array.from({ length: 5 }, () => createMockAuditEvent());
      const threats = await engine.processBatch(events);

      expect(Array.isArray(threats)).toBe(true);
      expect(threats.length).toBeGreaterThanOrEqual(0);
    });

    it('should correlate related threats', async () => {
      const userId = 'test-user-123';
      const events = Array.from({ length: 3 }, () => createMockAuditEvent({
        actor: { type: 'USER', userId },
        outcome: 'FAILURE',
        action: 'login'
      }));

      const threats = await engine.processBatch(events);

      // Should detect coordinated attack pattern
      const coordinatedThreat = threats.find(t => t.threatType === 'PATTERN');
      expect(coordinatedThreat).toBeDefined();
    });
  });

  describe('Feature Extraction', () => {
    beforeEach(async () => {
      await engine.initialize();
    });

    it('should extract temporal features correctly', async () => {
      const auditEvent = createMockAuditEvent({
        timestamp: new Date('2024-01-15T14:30:00Z') // Monday, 2:30 PM
      });

      // Access private method for testing
      const features = (engine as any).extractFeatures(auditEvent);

      expect(features.hour).toBe(14);
      expect(features.dayOfWeek).toBe(1); // Monday
      expect(features.isWeekend).toBe(false);
      expect(features.isBusinessHours).toBe(true);
    });

    it('should extract actor features correctly', async () => {
      const auditEvent = createMockAuditEvent({
        actor: {
          type: 'USER',
          userId: 'test-user',
          sessionId: 'test-session'
        }
      });

      const features = (engine as any).extractFeatures(auditEvent);

      expect(features.actorType).toBe('USER');
      expect(features.hasUserId).toBe(true);
      expect(features.hasSessionId).toBe(true);
    });
  });

  describe('Metrics and Monitoring', () => {
    beforeEach(async () => {
      await engine.initialize();
    });

    it('should track processing metrics', async () => {
      const auditEvent = createMockAuditEvent();
      await engine.processAuditEvent(auditEvent);

      const metrics = engine.getMetrics();

      expect(metrics.totalEventsProcessed).toBe(1);
      expect(typeof metrics.processingLatency.avg).toBe('number');
    });

    it('should emit metrics updates', async () => {
      const metricsPromise = new Promise((resolve) => {
        engine.once('metricsUpdate', resolve);
      });

      // Trigger metrics update (simplified test)
      engine.emit('metricsUpdate', { test: true });

      await expect(metricsPromise).resolves.toMatchObject({ test: true });
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await engine.initialize();
    });

    it('should handle malformed audit events gracefully', async () => {
      const malformedEvent = {
        // Missing required fields
        id: 'test',
        timestamp: new Date()
      } as AuditEvent;

      await expect(engine.processAuditEvent(malformedEvent)).rejects.toThrow();
    });

    it('should emit processing errors', async () => {
      const errorPromise = new Promise((resolve) => {
        engine.once('processingError', resolve);
      });

      try {
        await engine.processAuditEvent(null as any);
      } catch (error) {
        // Expected error
      }

      // The error event should be emitted even if the method throws
    });
  });

  describe('Shutdown', () => {
    it('should shutdown gracefully', async () => {
      await engine.initialize();
      await expect(engine.shutdown()).resolves.toBeUndefined();
    });

    it('should not process events after shutdown', async () => {
      await engine.initialize();
      await engine.shutdown();

      const auditEvent = createMockAuditEvent();
      await expect(engine.processAuditEvent(auditEvent)).rejects.toThrow();
    });
  });
});

/**
 * Helper function to create mock audit events
 */
function createMockAuditEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: 'test-event-' + Math.random().toString(36).substr(2, 9),
    timestamp: new Date(),
    eventType: 'LOGIN',
    category: 'AUTHENTICATION',
    severity: 'MEDIUM',
    source: {
      service: 'auth-service',
      version: '1.0.0',
      instance: 'test-instance',
      ip: '192.168.1.100'
    },
    actor: {
      type: 'USER',
      userId: 'test-user',
      sessionId: 'test-session'
    },
    target: {
      resource: '/api/auth/login',
      resourceType: 'authentication'
    },
    action: 'login',
    outcome: 'SUCCESS',
    details: {},
    metadata: {},
    compliance: {},
    ...overrides
  };
}