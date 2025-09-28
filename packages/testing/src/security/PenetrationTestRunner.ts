/**
 * Automated Penetration Testing Runner
 *
 * Provides automated penetration testing capabilities including:
 * - OWASP Top 10 testing
 * - API security testing
 * - Authentication/authorization bypass attempts
 * - Injection attacks simulation
 * - Security misconfigurations detection
 */

import { EventEmitter } from 'events';
import axios, { AxiosRequestConfig } from 'axios';
import { SecurityTestConfig, SecurityTestResult, Vulnerability, Recommendation } from './SecurityTestFramework';

export interface PenetrationTestSuite {
  name: string;
  description: string;
  tests: PenetrationTest[];
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface PenetrationTest {
  id: string;
  name: string;
  description: string;
  category: PenTestCategory;
  payload: TestPayload;
  expectedResult: ExpectedResult;
  validation: ValidationRule[];
}

export interface TestPayload {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  headers?: Record<string, string>;
  body?: any;
  parameters?: Record<string, string>;
  files?: FileUpload[];
}

export interface FileUpload {
  fieldName: string;
  fileName: string;
  content: Buffer;
  contentType: string;
}

export interface ExpectedResult {
  shouldFail: boolean;
  expectedStatusCodes: number[];
  expectedHeaders?: Record<string, string>;
  expectedBodyContains?: string[];
  expectedBodyNotContains?: string[];
}

export interface ValidationRule {
  type: 'response_code' | 'response_header' | 'response_body' | 'response_time' | 'error_message';
  condition: string;
  value: any;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface PenTestResult {
  testId: string;
  status: 'PASS' | 'FAIL' | 'ERROR' | 'SKIP';
  vulnerability?: Vulnerability;
  evidence: TestEvidence;
  responseTime: number;
  timestamp: Date;
}

export interface TestEvidence {
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
  };
  response: {
    statusCode: number;
    headers: Record<string, string>;
    body: string;
    size: number;
  };
  validationResults: ValidationResult[];
}

export interface ValidationResult {
  rule: ValidationRule;
  passed: boolean;
  actual: any;
  expected: any;
  message: string;
}

export type PenTestCategory =
  | 'INJECTION'
  | 'BROKEN_AUTHENTICATION'
  | 'SENSITIVE_DATA_EXPOSURE'
  | 'XML_EXTERNAL_ENTITIES'
  | 'BROKEN_ACCESS_CONTROL'
  | 'SECURITY_MISCONFIGURATION'
  | 'XSS'
  | 'INSECURE_DESERIALIZATION'
  | 'VULNERABLE_COMPONENTS'
  | 'INSUFFICIENT_LOGGING'
  | 'CSRF'
  | 'DIRECTORY_TRAVERSAL'
  | 'FILE_UPLOAD'
  | 'BUSINESS_LOGIC'
  | 'API_SECURITY';

export class PenetrationTestRunner extends EventEmitter {
  private config: SecurityTestConfig;
  private testSuites: PenetrationTestSuite[];
  private results: PenTestResult[] = [];

  constructor(config: SecurityTestConfig) {
    super();
    this.config = config;
    this.initializeTestSuites();
  }

  /**
   * Run all penetration tests
   */
  async runTests(): Promise<SecurityTestResult> {
    const startTime = Date.now();
    this.emit('penetrationTestsStarted', { timestamp: new Date() });

    try {
      this.results = [];

      // Run all test suites
      for (const suite of this.testSuites) {
        await this.runTestSuite(suite);
      }

      const vulnerabilities = this.extractVulnerabilities();
      const recommendations = this.generateRecommendations();
      const score = this.calculateSecurityScore();

      const result: SecurityTestResult = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        testType: 'PENETRATION_TESTING',
        status: vulnerabilities.length > 0 ? 'FAIL' : 'PASS',
        score,
        vulnerabilities,
        compliance: [],
        performance: {
          responseTime: this.calculateAverageResponseTime(),
          throughput: 0,
          errorRate: this.calculateErrorRate(),
          resourceUsage: { cpu: 0, memory: 0, network: 0 }
        },
        recommendations,
        metadata: {
          duration: Date.now() - startTime,
          testVersion: '1.0.0',
          environment: this.config.environment,
          coverage: this.calculateCoverage()
        }
      };

      this.emit('penetrationTestsCompleted', { result, timestamp: new Date() });
      return result;
    } catch (error) {
      this.emit('penetrationTestsError', { error, timestamp: new Date() });
      throw error;
    }
  }

  /**
   * Run specific test suite
   */
  async runTestSuite(suite: PenetrationTestSuite): Promise<PenTestResult[]> {
    this.emit('testSuiteStarted', { suite: suite.name, timestamp: new Date() });

    const suiteResults: PenTestResult[] = [];

    for (const test of suite.tests) {
      try {
        const result = await this.runTest(test);
        suiteResults.push(result);
        this.results.push(result);

        this.emit('testCompleted', { test: test.id, result, timestamp: new Date() });
      } catch (error) {
        const errorResult: PenTestResult = {
          testId: test.id,
          status: 'ERROR',
          evidence: this.createErrorEvidence(test, error),
          responseTime: 0,
          timestamp: new Date()
        };
        suiteResults.push(errorResult);
        this.results.push(errorResult);

        this.emit('testError', { test: test.id, error, timestamp: new Date() });
      }
    }

    this.emit('testSuiteCompleted', { suite: suite.name, results: suiteResults, timestamp: new Date() });
    return suiteResults;
  }

  /**
   * Run individual penetration test
   */
  async runTest(test: PenetrationTest): Promise<PenTestResult> {
    const startTime = Date.now();

    // Prepare request configuration
    const requestConfig: AxiosRequestConfig = {
      method: test.payload.method,
      url: this.buildFullUrl(test.payload.url),
      headers: {
        'User-Agent': 'UrnLabs-Security-Scanner/1.0',
        ...test.payload.headers
      },
      validateStatus: () => true, // Accept all status codes
      timeout: 30000,
      maxRedirects: 5
    };

    // Add body for POST/PUT requests
    if (test.payload.body) {
      requestConfig.data = test.payload.body;
    }

    // Add query parameters
    if (test.payload.parameters) {
      requestConfig.params = test.payload.parameters;
    }

    try {
      // Execute the request
      const response = await axios(requestConfig);
      const responseTime = Date.now() - startTime;

      // Create evidence
      const evidence: TestEvidence = {
        request: {
          method: test.payload.method,
          url: requestConfig.url!,
          headers: requestConfig.headers as Record<string, string>,
          body: typeof requestConfig.data === 'string' ? requestConfig.data : JSON.stringify(requestConfig.data)
        },
        response: {
          statusCode: response.status,
          headers: response.headers as Record<string, string>,
          body: typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
          size: JSON.stringify(response.data).length
        },
        validationResults: []
      };

      // Validate the response
      const validationResults = this.validateResponse(test, response);
      evidence.validationResults = validationResults;

      // Determine if test passed or found vulnerability
      const failed = validationResults.some(v => !v.passed && v.rule.severity !== 'LOW');
      const status = failed ? 'FAIL' : 'PASS';

      const result: PenTestResult = {
        testId: test.id,
        status,
        evidence,
        responseTime,
        timestamp: new Date()
      };

      // Create vulnerability if test failed
      if (status === 'FAIL') {
        result.vulnerability = this.createVulnerability(test, validationResults, evidence);
      }

      return result;
    } catch (error) {
      throw new Error(`Test execution failed: ${error.message}`);
    }
  }

  private initializeTestSuites(): void {
    this.testSuites = [
      this.createInjectionTestSuite(),
      this.createAuthenticationTestSuite(),
      this.createAuthorizationTestSuite(),
      this.createXSSTestSuite(),
      this.createCSRFTestSuite(),
      this.createFileUploadTestSuite(),
      this.createAPISecurityTestSuite(),
      this.createBusinessLogicTestSuite()
    ];
  }

  private createInjectionTestSuite(): PenetrationTestSuite {
    return {
      name: 'SQL Injection Tests',
      description: 'Tests for SQL injection vulnerabilities',
      severity: 'CRITICAL',
      tests: [
        {
          id: 'sql-injection-1',
          name: 'Basic SQL Injection - Single Quote',
          description: 'Test for basic SQL injection using single quote',
          category: 'INJECTION',
          payload: {
            method: 'GET',
            url: '/api/users',
            parameters: { id: "1' OR '1'='1" }
          },
          expectedResult: {
            shouldFail: true,
            expectedStatusCodes: [400, 403, 500],
            expectedBodyNotContains: ['SELECT', 'FROM', 'WHERE']
          },
          validation: [
            {
              type: 'response_code',
              condition: 'not_in',
              value: [200],
              severity: 'CRITICAL'
            },
            {
              type: 'response_body',
              condition: 'not_contains',
              value: ['SQL', 'syntax error', 'mysql', 'postgresql'],
              severity: 'CRITICAL'
            }
          ]
        },
        {
          id: 'sql-injection-2',
          name: 'Union-based SQL Injection',
          description: 'Test for union-based SQL injection',
          category: 'INJECTION',
          payload: {
            method: 'GET',
            url: '/api/users',
            parameters: { id: "1 UNION SELECT username, password FROM users--" }
          },
          expectedResult: {
            shouldFail: true,
            expectedStatusCodes: [400, 403, 500]
          },
          validation: [
            {
              type: 'response_code',
              condition: 'not_in',
              value: [200],
              severity: 'CRITICAL'
            }
          ]
        }
      ]
    };
  }

  private createAuthenticationTestSuite(): PenetrationTestSuite {
    return {
      name: 'Authentication Bypass Tests',
      description: 'Tests for authentication bypass vulnerabilities',
      severity: 'CRITICAL',
      tests: [
        {
          id: 'auth-bypass-1',
          name: 'Missing Authentication Header',
          description: 'Test access to protected endpoint without authentication',
          category: 'BROKEN_AUTHENTICATION',
          payload: {
            method: 'GET',
            url: '/api/admin/users'
          },
          expectedResult: {
            shouldFail: true,
            expectedStatusCodes: [401, 403]
          },
          validation: [
            {
              type: 'response_code',
              condition: 'in',
              value: [401, 403],
              severity: 'CRITICAL'
            }
          ]
        },
        {
          id: 'auth-bypass-2',
          name: 'Invalid JWT Token',
          description: 'Test with invalid JWT token',
          category: 'BROKEN_AUTHENTICATION',
          payload: {
            method: 'GET',
            url: '/api/admin/users',
            headers: {
              'Authorization': 'Bearer invalid_token_here'
            }
          },
          expectedResult: {
            shouldFail: true,
            expectedStatusCodes: [401, 403]
          },
          validation: [
            {
              type: 'response_code',
              condition: 'in',
              value: [401, 403],
              severity: 'CRITICAL'
            }
          ]
        }
      ]
    };
  }

  private createAuthorizationTestSuite(): PenetrationTestSuite {
    return {
      name: 'Authorization Tests',
      description: 'Tests for authorization bypass vulnerabilities',
      severity: 'HIGH',
      tests: [
        {
          id: 'authz-bypass-1',
          name: 'Horizontal Privilege Escalation',
          description: 'Test access to other user\'s data',
          category: 'BROKEN_ACCESS_CONTROL',
          payload: {
            method: 'GET',
            url: '/api/users/999/profile',
            headers: {
              'Authorization': 'Bearer valid_user_token'
            }
          },
          expectedResult: {
            shouldFail: true,
            expectedStatusCodes: [403, 404]
          },
          validation: [
            {
              type: 'response_code',
              condition: 'in',
              value: [403, 404],
              severity: 'HIGH'
            }
          ]
        },
        {
          id: 'authz-bypass-2',
          name: 'Vertical Privilege Escalation',
          description: 'Test access to admin endpoints with user token',
          category: 'BROKEN_ACCESS_CONTROL',
          payload: {
            method: 'GET',
            url: '/api/admin/system/config',
            headers: {
              'Authorization': 'Bearer valid_user_token'
            }
          },
          expectedResult: {
            shouldFail: true,
            expectedStatusCodes: [403]
          },
          validation: [
            {
              type: 'response_code',
              condition: 'equals',
              value: 403,
              severity: 'HIGH'
            }
          ]
        }
      ]
    };
  }

  private createXSSTestSuite(): PenetrationTestSuite {
    return {
      name: 'Cross-Site Scripting (XSS) Tests',
      description: 'Tests for XSS vulnerabilities',
      severity: 'HIGH',
      tests: [
        {
          id: 'xss-reflected-1',
          name: 'Reflected XSS - Basic',
          description: 'Test for reflected XSS vulnerability',
          category: 'XSS',
          payload: {
            method: 'GET',
            url: '/search',
            parameters: { q: '<script>alert("XSS")</script>' }
          },
          expectedResult: {
            shouldFail: true,
            expectedBodyNotContains: ['<script>alert("XSS")</script>']
          },
          validation: [
            {
              type: 'response_body',
              condition: 'not_contains',
              value: '<script>alert("XSS")</script>',
              severity: 'HIGH'
            }
          ]
        },
        {
          id: 'xss-stored-1',
          name: 'Stored XSS - Comment Field',
          description: 'Test for stored XSS in comment field',
          category: 'XSS',
          payload: {
            method: 'POST',
            url: '/api/comments',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer valid_user_token'
            },
            body: {
              content: '<img src=x onerror=alert("Stored XSS")>',
              postId: 1
            }
          },
          expectedResult: {
            shouldFail: true,
            expectedStatusCodes: [400, 403]
          },
          validation: [
            {
              type: 'response_code',
              condition: 'not_equals',
              value: 201,
              severity: 'HIGH'
            }
          ]
        }
      ]
    };
  }

  private createCSRFTestSuite(): PenetrationTestSuite {
    return {
      name: 'Cross-Site Request Forgery (CSRF) Tests',
      description: 'Tests for CSRF vulnerabilities',
      severity: 'MEDIUM',
      tests: [
        {
          id: 'csrf-1',
          name: 'Missing CSRF Token',
          description: 'Test state-changing request without CSRF token',
          category: 'CSRF',
          payload: {
            method: 'POST',
            url: '/api/users/profile',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer valid_user_token'
            },
            body: {
              email: 'attacker@example.com'
            }
          },
          expectedResult: {
            shouldFail: true,
            expectedStatusCodes: [403]
          },
          validation: [
            {
              type: 'response_code',
              condition: 'equals',
              value: 403,
              severity: 'MEDIUM'
            }
          ]
        }
      ]
    };
  }

  private createFileUploadTestSuite(): PenetrationTestSuite {
    return {
      name: 'File Upload Security Tests',
      description: 'Tests for file upload vulnerabilities',
      severity: 'HIGH',
      tests: [
        {
          id: 'file-upload-1',
          name: 'Malicious File Extension',
          description: 'Test upload of executable file',
          category: 'FILE_UPLOAD',
          payload: {
            method: 'POST',
            url: '/api/upload',
            headers: {
              'Authorization': 'Bearer valid_user_token'
            },
            files: [
              {
                fieldName: 'file',
                fileName: 'malicious.php',
                content: Buffer.from('<?php system($_GET["cmd"]); ?>'),
                contentType: 'text/php'
              }
            ]
          },
          expectedResult: {
            shouldFail: true,
            expectedStatusCodes: [400, 403]
          },
          validation: [
            {
              type: 'response_code',
              condition: 'in',
              value: [400, 403],
              severity: 'HIGH'
            }
          ]
        }
      ]
    };
  }

  private createAPISecurityTestSuite(): PenetrationTestSuite {
    return {
      name: 'API Security Tests',
      description: 'Tests for API-specific vulnerabilities',
      severity: 'HIGH',
      tests: [
        {
          id: 'api-rate-limit-1',
          name: 'Rate Limiting Test',
          description: 'Test API rate limiting implementation',
          category: 'API_SECURITY',
          payload: {
            method: 'GET',
            url: '/api/users'
          },
          expectedResult: {
            shouldFail: false,
            expectedStatusCodes: [200, 429]
          },
          validation: [
            {
              type: 'response_header',
              condition: 'exists',
              value: 'X-RateLimit-Limit',
              severity: 'MEDIUM'
            }
          ]
        },
        {
          id: 'api-versioning-1',
          name: 'API Version Bypass',
          description: 'Test access to deprecated API versions',
          category: 'API_SECURITY',
          payload: {
            method: 'GET',
            url: '/api/v1/users',
            headers: {
              'Authorization': 'Bearer valid_user_token'
            }
          },
          expectedResult: {
            shouldFail: true,
            expectedStatusCodes: [404, 410]
          },
          validation: [
            {
              type: 'response_code',
              condition: 'in',
              value: [404, 410],
              severity: 'MEDIUM'
            }
          ]
        }
      ]
    };
  }

  private createBusinessLogicTestSuite(): PenetrationTestSuite {
    return {
      name: 'Business Logic Tests',
      description: 'Tests for business logic vulnerabilities',
      severity: 'MEDIUM',
      tests: [
        {
          id: 'business-logic-1',
          name: 'Price Manipulation',
          description: 'Test manipulation of price parameters',
          category: 'BUSINESS_LOGIC',
          payload: {
            method: 'POST',
            url: '/api/orders',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer valid_user_token'
            },
            body: {
              items: [{ id: 1, quantity: 1, price: 0.01 }]
            }
          },
          expectedResult: {
            shouldFail: true,
            expectedStatusCodes: [400]
          },
          validation: [
            {
              type: 'response_code',
              condition: 'equals',
              value: 400,
              severity: 'MEDIUM'
            }
          ]
        }
      ]
    };
  }

  private buildFullUrl(path: string): string {
    const baseUrl = this.config.target.baseUrl.replace(/\/$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${baseUrl}${cleanPath}`;
  }

  private validateResponse(test: PenetrationTest, response: any): ValidationResult[] {
    const results: ValidationResult[] = [];

    for (const rule of test.validation) {
      const result = this.executeValidationRule(rule, response);
      results.push(result);
    }

    return results;
  }

  private executeValidationRule(rule: ValidationRule, response: any): ValidationResult {
    let passed = false;
    let actual: any;
    let message = '';

    switch (rule.type) {
      case 'response_code':
        actual = response.status;
        switch (rule.condition) {
          case 'equals':
            passed = actual === rule.value;
            break;
          case 'not_equals':
            passed = actual !== rule.value;
            break;
          case 'in':
            passed = Array.isArray(rule.value) && rule.value.includes(actual);
            break;
          case 'not_in':
            passed = Array.isArray(rule.value) && !rule.value.includes(actual);
            break;
        }
        message = `Response code ${actual} ${rule.condition} ${rule.value}`;
        break;

      case 'response_body':
        actual = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        switch (rule.condition) {
          case 'contains':
            passed = actual.includes(rule.value);
            break;
          case 'not_contains':
            if (Array.isArray(rule.value)) {
              passed = !rule.value.some(val => actual.includes(val));
            } else {
              passed = !actual.includes(rule.value);
            }
            break;
        }
        message = `Response body ${rule.condition} "${rule.value}"`;
        break;

      case 'response_header':
        actual = response.headers[rule.value.toLowerCase()];
        switch (rule.condition) {
          case 'exists':
            passed = actual !== undefined;
            break;
          case 'not_exists':
            passed = actual === undefined;
            break;
        }
        message = `Response header "${rule.value}" ${rule.condition}`;
        break;

      case 'response_time':
        // Response time validation would need to be implemented
        passed = true;
        message = 'Response time validation not implemented';
        break;
    }

    return {
      rule,
      passed,
      actual,
      expected: rule.value,
      message
    };
  }

  private createVulnerability(
    test: PenetrationTest,
    validationResults: ValidationResult[],
    evidence: TestEvidence
  ): Vulnerability {
    const failedValidations = validationResults.filter(v => !v.passed);
    const highestSeverity = this.getHighestSeverity(failedValidations.map(v => v.rule.severity));

    return {
      id: crypto.randomUUID(),
      type: this.mapCategoryToVulnerabilityType(test.category),
      severity: highestSeverity,
      title: `${test.name} - Vulnerability Detected`,
      description: test.description,
      location: {
        url: evidence.request.url,
        endpoint: test.payload.url
      },
      evidence: [
        `Request: ${evidence.request.method} ${evidence.request.url}`,
        `Response: ${evidence.response.statusCode}`,
        ...failedValidations.map(v => v.message)
      ],
      impact: this.generateImpactDescription(test.category),
      remediation: this.generateRemediationAdvice(test.category),
      references: this.getSecurityReferences(test.category)
    };
  }

  private createErrorEvidence(test: PenetrationTest, error: any): TestEvidence {
    return {
      request: {
        method: test.payload.method,
        url: this.buildFullUrl(test.payload.url),
        headers: test.payload.headers || {},
        body: test.payload.body ? JSON.stringify(test.payload.body) : undefined
      },
      response: {
        statusCode: 0,
        headers: {},
        body: `Error: ${error.message}`,
        size: 0
      },
      validationResults: []
    };
  }

  private extractVulnerabilities(): Vulnerability[] {
    return this.results
      .filter(result => result.vulnerability)
      .map(result => result.vulnerability!);
  }

  private generateRecommendations(): Recommendation[] {
    const vulnerabilities = this.extractVulnerabilities();
    const recommendations: Recommendation[] = [];

    // Group vulnerabilities by type and generate recommendations
    const vulnByType = vulnerabilities.reduce((acc, vuln) => {
      if (!acc[vuln.type]) acc[vuln.type] = [];
      acc[vuln.type].push(vuln);
      return acc;
    }, {} as Record<string, Vulnerability[]>);

    for (const [type, vulns] of Object.entries(vulnByType)) {
      recommendations.push({
        type: this.getHighestSeverity(vulns.map(v => v.severity)) as any,
        category: 'Security',
        title: `Address ${type} vulnerabilities`,
        description: `Found ${vulns.length} ${type} vulnerability(ies)`,
        action: this.generateRemediationAdvice(type as any),
        effort: vulns.length > 3 ? 'HIGH' : vulns.length > 1 ? 'MEDIUM' : 'LOW',
        impact: 'HIGH'
      });
    }

    return recommendations;
  }

  private calculateSecurityScore(): number {
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.status === 'PASS').length;
    const vulnerabilities = this.extractVulnerabilities();

    if (totalTests === 0) return 0;

    let score = (passedTests / totalTests) * 100;

    // Deduct points for vulnerabilities
    vulnerabilities.forEach(vuln => {
      switch (vuln.severity) {
        case 'CRITICAL':
          score -= 20;
          break;
        case 'HIGH':
          score -= 10;
          break;
        case 'MEDIUM':
          score -= 5;
          break;
        case 'LOW':
          score -= 2;
          break;
      }
    });

    return Math.max(0, Math.round(score));
  }

  private calculateAverageResponseTime(): number {
    if (this.results.length === 0) return 0;
    const totalTime = this.results.reduce((sum, result) => sum + result.responseTime, 0);
    return Math.round(totalTime / this.results.length);
  }

  private calculateErrorRate(): number {
    if (this.results.length === 0) return 0;
    const errorCount = this.results.filter(r => r.status === 'ERROR').length;
    return (errorCount / this.results.length) * 100;
  }

  private calculateCoverage(): number {
    // Calculate coverage based on endpoints tested vs available endpoints
    const testedEndpoints = new Set(this.results.map(r => r.evidence?.request.url));
    const totalEndpoints = this.config.target.apiEndpoints.length;

    if (totalEndpoints === 0) return 100;
    return Math.round((testedEndpoints.size / totalEndpoints) * 100);
  }

  private getHighestSeverity(severities: string[]): string {
    if (severities.includes('CRITICAL')) return 'CRITICAL';
    if (severities.includes('HIGH')) return 'HIGH';
    if (severities.includes('MEDIUM')) return 'MEDIUM';
    return 'LOW';
  }

  private mapCategoryToVulnerabilityType(category: PenTestCategory): any {
    const mapping: Record<PenTestCategory, string> = {
      'INJECTION': 'SQL_INJECTION',
      'BROKEN_AUTHENTICATION': 'AUTHENTICATION_BYPASS',
      'SENSITIVE_DATA_EXPOSURE': 'INFORMATION_DISCLOSURE',
      'XML_EXTERNAL_ENTITIES': 'XML_EXTERNAL_ENTITIES',
      'BROKEN_ACCESS_CONTROL': 'AUTHORIZATION_BYPASS',
      'SECURITY_MISCONFIGURATION': 'INSECURE_CONFIGURATION',
      'XSS': 'XSS',
      'INSECURE_DESERIALIZATION': 'INSECURE_DESERIALIZATION',
      'VULNERABLE_COMPONENTS': 'OUTDATED_DEPENDENCIES',
      'INSUFFICIENT_LOGGING': 'INSUFFICIENT_LOGGING',
      'CSRF': 'CSRF',
      'DIRECTORY_TRAVERSAL': 'DIRECTORY_TRAVERSAL',
      'FILE_UPLOAD': 'FILE_UPLOAD',
      'BUSINESS_LOGIC': 'BUSINESS_LOGIC',
      'API_SECURITY': 'API_SECURITY'
    };

    return mapping[category] || 'UNKNOWN';
  }

  private generateImpactDescription(category: PenTestCategory): string {
    const impacts: Record<PenTestCategory, string> = {
      'INJECTION': 'Attackers could access, modify, or delete database data',
      'BROKEN_AUTHENTICATION': 'Attackers could bypass authentication and access unauthorized resources',
      'SENSITIVE_DATA_EXPOSURE': 'Sensitive data could be exposed to unauthorized users',
      'XML_EXTERNAL_ENTITIES': 'Attackers could read local files or perform SSRF attacks',
      'BROKEN_ACCESS_CONTROL': 'Users could access data or functions they should not have access to',
      'SECURITY_MISCONFIGURATION': 'System could be compromised due to insecure configuration',
      'XSS': 'Attackers could execute malicious scripts in user browsers',
      'INSECURE_DESERIALIZATION': 'Remote code execution or privilege escalation possible',
      'VULNERABLE_COMPONENTS': 'Known vulnerabilities in dependencies could be exploited',
      'INSUFFICIENT_LOGGING': 'Security incidents may go undetected',
      'CSRF': 'Attackers could perform actions on behalf of authenticated users',
      'DIRECTORY_TRAVERSAL': 'Attackers could access files outside the intended directory',
      'FILE_UPLOAD': 'Malicious files could be uploaded and executed',
      'BUSINESS_LOGIC': 'Business rules could be bypassed leading to financial loss',
      'API_SECURITY': 'API vulnerabilities could lead to data exposure or system compromise'
    };

    return impacts[category] || 'Unknown security impact';
  }

  private generateRemediationAdvice(category: PenTestCategory): string {
    const remediations: Record<PenTestCategory, string> = {
      'INJECTION': 'Use parameterized queries and input validation',
      'BROKEN_AUTHENTICATION': 'Implement proper authentication mechanisms and session management',
      'SENSITIVE_DATA_EXPOSURE': 'Encrypt sensitive data and implement proper access controls',
      'XML_EXTERNAL_ENTITIES': 'Disable XML external entity processing',
      'BROKEN_ACCESS_CONTROL': 'Implement proper authorization checks',
      'SECURITY_MISCONFIGURATION': 'Review and harden security configurations',
      'XSS': 'Implement proper input validation and output encoding',
      'INSECURE_DESERIALIZATION': 'Avoid deserializing untrusted data',
      'VULNERABLE_COMPONENTS': 'Update dependencies to latest secure versions',
      'INSUFFICIENT_LOGGING': 'Implement comprehensive logging and monitoring',
      'CSRF': 'Implement CSRF tokens for state-changing operations',
      'DIRECTORY_TRAVERSAL': 'Validate and sanitize file paths',
      'FILE_UPLOAD': 'Implement file type validation and sandboxing',
      'BUSINESS_LOGIC': 'Review and strengthen business logic validation',
      'API_SECURITY': 'Implement proper API security controls and rate limiting'
    };

    return remediations[category] || 'Consult security documentation for remediation advice';
  }

  private getSecurityReferences(category: PenTestCategory): string[] {
    const references: Record<PenTestCategory, string[]> = {
      'INJECTION': [
        'https://owasp.org/www-project-top-ten/2017/A1_2017-Injection',
        'https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html'
      ],
      'BROKEN_AUTHENTICATION': [
        'https://owasp.org/www-project-top-ten/2017/A2_2017-Broken_Authentication',
        'https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html'
      ],
      'XSS': [
        'https://owasp.org/www-project-top-ten/2017/A7_2017-Cross-Site_Scripting_(XSS)',
        'https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html'
      ]
      // Add more references for other categories...
    };

    return references[category] || ['https://owasp.org/www-project-top-ten/'];
  }
}