import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { SecurityTestFramework } from './SecurityTestFramework';
import { SecurityGates } from './SecurityGates';
import { PenetrationTestRunner } from './PenetrationTestRunner';
import { ComplianceValidator } from './ComplianceValidator';
import { VulnerabilityScanner } from './VulnerabilityScanner';
import { ThreatDetectionTester } from './ThreatDetectionTester';

describe('Security Test Framework - Integration Tests', () => {
  let securityFramework: SecurityTestFramework;
  let securityGates: SecurityGates;

  beforeAll(async () => {
    securityFramework = new SecurityTestFramework();
    securityGates = new SecurityGates();
    await securityFramework.initialize();
  });

  afterAll(async () => {
    // Cleanup resources
    await securityFramework.stopContinuousMonitoring();
  });

  beforeEach(() => {
    // Reset test state
  });

  describe('Complete Security Test Suite', () => {
    it('should execute comprehensive security validation', async () => {
      // Run complete security test suite
      const results = await securityFramework.runSecurityTests();

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);

      // Verify all test types are included
      const testTypes = results.map(r => r.testType);
      expect(testTypes).toContain('static-analysis');
      expect(testTypes).toContain('dynamic-analysis');
      expect(testTypes).toContain('vulnerability-scan');
      expect(testTypes).toContain('compliance-check');

      // Verify result structure
      results.forEach(result => {
        expect(result).toHaveProperty('testType');
        expect(result).toHaveProperty('status');
        expect(result).toHaveProperty('score');
        expect(result).toHaveProperty('details');
        expect(result).toHaveProperty('executionTime');
        expect(result).toHaveProperty('timestamp');

        expect(['PASSED', 'FAILED', 'WARNING', 'SKIPPED']).toContain(result.status);
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
      });
    }, 120000); // 2 minute timeout for comprehensive tests

    it('should validate security controls effectively', async () => {
      const controlValidations = await securityFramework.validateSecurityControls();

      expect(controlValidations).toBeDefined();
      expect(Array.isArray(controlValidations)).toBe(true);

      controlValidations.forEach(validation => {
        expect(validation).toHaveProperty('controlId');
        expect(validation).toHaveProperty('controlName');
        expect(validation).toHaveProperty('isValid');
        expect(validation).toHaveProperty('score');
        expect(validation).toHaveProperty('message');
        expect(validation).toHaveProperty('evidence');
        expect(validation).toHaveProperty('recommendations');

        expect(validation.score).toBeGreaterThanOrEqual(0);
        expect(validation.score).toBeLessThanOrEqual(100);
      });
    });

    it('should generate comprehensive security report', async () => {
      const report = await securityFramework.generateSecurityReport();

      expect(report).toBeDefined();
      expect(report).toHaveProperty('overallScore');
      expect(report).toHaveProperty('overallStatus');
      expect(report).toHaveProperty('executionSummary');
      expect(report).toHaveProperty('testResults');
      expect(report).toHaveProperty('vulnerabilities');
      expect(report).toHaveProperty('complianceStatus');
      expect(report).toHaveProperty('recommendations');
      expect(report).toHaveProperty('trends');
      expect(report).toHaveProperty('metadata');

      // Validate score range
      expect(report.overallScore).toBeGreaterThanOrEqual(0);
      expect(report.overallScore).toBeLessThanOrEqual(100);

      // Validate status
      expect(['PASSED', 'FAILED', 'WARNING']).toContain(report.overallStatus);

      // Validate execution summary
      expect(report.executionSummary).toHaveProperty('totalTests');
      expect(report.executionSummary).toHaveProperty('passedTests');
      expect(report.executionSummary).toHaveProperty('failedTests');
      expect(report.executionSummary).toHaveProperty('totalExecutionTime');
    });
  });

  describe('Security Gates Integration', () => {
    it('should execute pre-commit security gate successfully', async () => {
      const summary = await securityGates.executeGates('development', ['pre-commit']);

      expect(summary).toBeDefined();
      expect(summary.environment).toBe('development');
      expect(summary.totalGates).toBe(1);
      expect(summary.gateResults).toHaveLength(1);

      const gateResult = summary.gateResults[0];
      expect(gateResult.gateId).toBe('pre-commit');
      expect(gateResult).toHaveProperty('status');
      expect(gateResult).toHaveProperty('score');
      expect(gateResult).toHaveProperty('details');
      expect(gateResult).toHaveProperty('executionTime');
    });

    it('should execute multiple gates in parallel', async () => {
      const summary = await securityGates.executeGates('development',
        ['pre-commit', 'pre-merge'],
        { parallel: true }
      );

      expect(summary).toBeDefined();
      expect(summary.totalGates).toBe(2);
      expect(summary.gateResults).toHaveLength(2);

      // Verify both gates were executed
      const gateIds = summary.gateResults.map(r => r.gateId);
      expect(gateIds).toContain('pre-commit');
      expect(gateIds).toContain('pre-merge');
    });

    it('should fail gates when security thresholds are not met', async () => {
      // Create a custom gate with very high thresholds
      const strictGate = {
        id: 'test-strict',
        name: 'Strict Test Gate',
        description: 'Very strict security gate for testing',
        enabled: true,
        thresholds: {
          minSecurityScore: 99,
          maxCriticalVulnerabilities: 0,
          maxHighVulnerabilities: 0,
          maxMediumVulnerabilities: 0,
          minComplianceScore: 99,
          maxResponseTime: 1,
          minTestCoverage: 99
        },
        blocking: true,
        environment: ['development'],
        tags: ['static-analysis']
      };

      securityGates.addGate(strictGate);

      const summary = await securityGates.executeGates('development', ['test-strict']);

      expect(summary.overallStatus).toBe('FAILED');
      expect(summary.failedGates).toBeGreaterThan(0);

      // Cleanup
      securityGates.removeGate('test-strict');
    });
  });

  describe('Component Integration Tests', () => {
    it('should integrate penetration testing with security framework', async () => {
      const pentester = new PenetrationTestRunner();
      const result = await pentester.runTests();

      expect(result).toBeDefined();
      expect(result).toHaveProperty('testType', 'penetration-testing');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('testsExecuted');
      expect(result).toHaveProperty('testsPassed');
      expect(result).toHaveProperty('testsFailed');
    });

    it('should integrate compliance validation with security framework', async () => {
      const validator = new ComplianceValidator();
      const result = await validator.validate();

      expect(result).toBeDefined();
      expect(result).toHaveProperty('testType', 'compliance-validation');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('compliantControls');
      expect(result).toHaveProperty('nonCompliantControls');
    });

    it('should integrate vulnerability scanning with security framework', async () => {
      const scanner = new VulnerabilityScanner();
      const result = await scanner.scan();

      expect(result).toBeDefined();
      expect(result).toHaveProperty('testType', 'vulnerability-scan');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('vulnerabilities');

      // Verify vulnerability structure
      if (result.vulnerabilities.length > 0) {
        const vuln = result.vulnerabilities[0];
        expect(vuln).toHaveProperty('id');
        expect(vuln).toHaveProperty('title');
        expect(vuln).toHaveProperty('severity');
        expect(vuln).toHaveProperty('description');
        expect(vuln).toHaveProperty('impact');
        expect(vuln).toHaveProperty('remediation');
      }
    });

    it('should integrate threat detection testing with security framework', async () => {
      const tester = new ThreatDetectionTester();
      const result = await tester.runTests();

      expect(result).toBeDefined();
      expect(result).toHaveProperty('testType', 'threat-detection');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('accuracy');
      expect(result).toHaveProperty('performanceMetrics');
    });
  });

  describe('Continuous Monitoring Integration', () => {
    it('should start and monitor continuous security monitoring', async () => {
      // Start continuous monitoring
      await securityFramework.startContinuousMonitoring();

      // Wait for initial monitoring cycle
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify monitoring is active
      const status = await securityFramework.getMonitoringStatus();
      expect(status.isActive).toBe(true);
      expect(status.lastScanTime).toBeDefined();

      // Stop monitoring
      await securityFramework.stopContinuousMonitoring();

      const finalStatus = await securityFramework.getMonitoringStatus();
      expect(finalStatus.isActive).toBe(false);
    });

    it('should handle security incidents during monitoring', async () => {
      const incidents = await securityFramework.simulateSecurityIncidents();

      expect(incidents).toBeDefined();
      expect(Array.isArray(incidents)).toBe(true);

      incidents.forEach(incident => {
        expect(incident).toHaveProperty('incidentId');
        expect(incident).toHaveProperty('incidentType');
        expect(incident).toHaveProperty('severity');
        expect(incident).toHaveProperty('detectionTime');
        expect(incident).toHaveProperty('responseTime');
        expect(incident).toHaveProperty('resolved');
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle network failures gracefully', async () => {
      // Mock network failure
      const originalFetch = global.fetch;
      global.fetch = async () => {
        throw new Error('Network error');
      };

      try {
        const results = await securityFramework.runSecurityTests();

        // Should still return results, possibly with degraded capabilities
        expect(results).toBeDefined();
        expect(Array.isArray(results)).toBe(true);

        // At least some tests should still execute locally
        const localTests = results.filter(r => r.status !== 'FAILED');
        expect(localTests.length).toBeGreaterThan(0);

      } finally {
        // Restore original fetch
        global.fetch = originalFetch;
      }
    });

    it('should handle invalid configuration gracefully', async () => {
      const invalidGate = {
        id: 'invalid-gate',
        name: 'Invalid Gate',
        description: 'Gate with invalid configuration',
        enabled: true,
        thresholds: {
          minSecurityScore: -1, // Invalid negative score
          maxCriticalVulnerabilities: -1, // Invalid negative count
          maxHighVulnerabilities: 1000000, // Unrealistic high count
          maxMediumVulnerabilities: 'invalid', // Invalid type
          minComplianceScore: 150, // Invalid score > 100
          maxResponseTime: -1000, // Invalid negative time
          minTestCoverage: 'invalid' // Invalid type
        } as any,
        blocking: true,
        environment: ['invalid-environment'],
        tags: ['invalid-tag']
      };

      // Should handle invalid configuration without crashing
      expect(() => {
        securityGates.addGate(invalidGate);
      }).not.toThrow();

      // Execution should handle invalid gate gracefully
      const summary = await securityGates.executeGates('development', ['invalid-gate']);

      // Gate should either be skipped or handled with error
      expect(summary).toBeDefined();
      expect(summary.totalGates).toBe(1);

      const gateResult = summary.gateResults[0];
      expect(['FAILED', 'SKIPPED']).toContain(gateResult.status);
    });

    it('should handle timeout scenarios appropriately', async () => {
      // Create gate with very short timeout
      const timeoutGate = {
        id: 'timeout-test',
        name: 'Timeout Test Gate',
        description: 'Gate to test timeout handling',
        enabled: true,
        thresholds: {
          minSecurityScore: 80,
          maxCriticalVulnerabilities: 0,
          maxHighVulnerabilities: 5,
          maxMediumVulnerabilities: 10,
          minComplianceScore: 80,
          maxResponseTime: 1, // Very short timeout
          minTestCoverage: 70
        },
        blocking: false,
        environment: ['development'],
        tags: ['static-analysis']
      };

      securityGates.addGate(timeoutGate);

      const startTime = Date.now();
      const summary = await securityGates.executeGates('development', ['timeout-test'], {
        timeout: 5000 // 5 second timeout
      });
      const executionTime = Date.now() - startTime;

      // Should complete within timeout
      expect(executionTime).toBeLessThan(10000);
      expect(summary).toBeDefined();

      // Cleanup
      securityGates.removeGate('timeout-test');
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle multiple concurrent test executions', async () => {
      const concurrentPromises = Array.from({ length: 3 }, (_, i) =>
        securityGates.executeGates('development', ['pre-commit'], {
          parallel: true
        })
      );

      const results = await Promise.all(concurrentPromises);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.totalGates).toBe(1);
        expect(['PASSED', 'FAILED', 'WARNING']).toContain(result.overallStatus);
      });
    });

    it('should maintain performance under load', async () => {
      const startTime = Date.now();

      // Execute comprehensive security tests
      const results = await securityFramework.runSecurityTests();

      const executionTime = Date.now() - startTime;

      expect(results).toBeDefined();
      expect(executionTime).toBeLessThan(60000); // Should complete within 1 minute

      // Verify all tests completed
      expect(results.length).toBeGreaterThan(0);
      results.forEach(result => {
        expect(result.executionTime).toBeLessThan(30000); // Individual tests < 30s
      });
    });
  });
});