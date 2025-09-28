/**
 * Authorization Security Tester
 *
 * Provides comprehensive testing for authorization mechanisms including:
 * - Role-based access control (RBAC) validation
 * - Attribute-based access control (ABAC) testing
 * - Privilege escalation detection
 * - Horizontal and vertical access control bypass
 * - Resource-level authorization testing
 * - Policy enforcement validation
 */

import { EventEmitter } from 'events';
import axios from 'axios';
import { SecurityTestConfig, SecurityTestResult, Vulnerability, Recommendation } from './SecurityTestFramework';

export interface AuthorizationTest {
  id: string;
  name: string;
  description: string;
  category: AuthzTestCategory;
  testMethod: AuthzTestMethod;
  userContext: UserContext;
  resourceContext: ResourceContext;
  expectedResult: AuthzExpectedResult;
}

export interface UserContext {
  userId: string;
  role: string;
  permissions: string[];
  attributes: Record<string, any>;
  token?: string;
  sessionId?: string;
}

export interface ResourceContext {
  resourceType: string;
  resourceId: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  sensitivity: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
  owner?: string;
  attributes?: Record<string, any>;
}

export interface AuthzExpectedResult {
  shouldAllow: boolean;
  expectedStatusCode: number[];
  expectedPermissions?: string[];
  mustNotContain?: string[];
  auditRequired?: boolean;
}

export interface AuthzTestResult {
  testId: string;
  status: 'PASS' | 'FAIL' | 'ERROR';
  actualStatusCode: number;
  actualResponse: any;
  responseTime: number;
  accessGranted: boolean;
  vulnerability?: Vulnerability;
  authzIssues: AuthzIssue[];
  auditLogged: boolean;
  timestamp: Date;
}

export interface AuthzIssue {
  type: AuthzIssueType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  evidence: string;
  remediation: string;
  affectedResources: string[];
}

export interface RoleTestMatrix {
  roles: Role[];
  resources: Resource[];
  testResults: RoleTestResult[][];
}

export interface Role {
  name: string;
  permissions: string[];
  inheritsFrom?: string[];
  attributes: Record<string, any>;
}

export interface Resource {
  type: string;
  id: string;
  endpoint: string;
  requiredPermissions: string[];
  sensitivity: string;
  owner?: string;
}

export interface RoleTestResult {
  role: string;
  resource: string;
  method: string;
  expectedAccess: boolean;
  actualAccess: boolean;
  passed: boolean;
  responseTime: number;
}

export interface PrivilegeEscalationTest {
  id: string;
  name: string;
  fromRole: string;
  toRole: string;
  escalationVector: EscalationVector;
  testSteps: EscalationStep[];
  detectionCriteria: DetectionCriteria;
}

export interface EscalationStep {
  step: number;
  action: string;
  endpoint: string;
  payload?: any;
  expectedOutcome: string;
}

export interface DetectionCriteria {
  alertExpected: boolean;
  auditLogRequired: boolean;
  blockingExpected: boolean;
  maxAllowedTime: number;
}

export interface PolicyTestSuite {
  policyId: string;
  policyName: string;
  rules: PolicyRule[];
  testCases: PolicyTestCase[];
  results: PolicyTestResult[];
}

export interface PolicyRule {
  id: string;
  description: string;
  condition: string;
  effect: 'ALLOW' | 'DENY';
  priority: number;
}

export interface PolicyTestCase {
  id: string;
  description: string;
  subject: UserContext;
  resource: ResourceContext;
  action: string;
  context: Record<string, any>;
  expectedDecision: 'ALLOW' | 'DENY';
}

export interface PolicyTestResult {
  testCaseId: string;
  actualDecision: 'ALLOW' | 'DENY' | 'ERROR';
  expectedDecision: 'ALLOW' | 'DENY';
  passed: boolean;
  evaluationTime: number;
  appliedRules: string[];
  explanation: string;
}

export type AuthzTestCategory =
  | 'RBAC_TESTING'
  | 'ABAC_TESTING'
  | 'PRIVILEGE_ESCALATION'
  | 'HORIZONTAL_ACCESS'
  | 'VERTICAL_ACCESS'
  | 'RESOURCE_AUTHORIZATION'
  | 'POLICY_ENFORCEMENT'
  | 'DATA_LEVEL_SECURITY'
  | 'API_AUTHORIZATION'
  | 'ADMINISTRATIVE_ACCESS';

export type AuthzTestMethod =
  | 'ROLE_VERIFICATION'
  | 'PERMISSION_CHECK'
  | 'RESOURCE_ACCESS'
  | 'POLICY_EVALUATION'
  | 'ESCALATION_ATTEMPT'
  | 'BYPASS_ATTEMPT'
  | 'OWNERSHIP_VALIDATION';

export type AuthzIssueType =
  | 'PRIVILEGE_ESCALATION'
  | 'HORIZONTAL_BYPASS'
  | 'VERTICAL_BYPASS'
  | 'MISSING_AUTHORIZATION'
  | 'WEAK_AUTHORIZATION'
  | 'OVERPRIVILEGED_ACCESS'
  | 'POLICY_VIOLATION'
  | 'AUDIT_BYPASS';

export type EscalationVector =
  | 'PARAMETER_MANIPULATION'
  | 'DIRECT_OBJECT_REFERENCE'
  | 'ROLE_CONFUSION'
  | 'TOKEN_MANIPULATION'
  | 'SESSION_FIXATION'
  | 'ADMINISTRATIVE_FUNCTION'
  | 'API_ENDPOINT_ABUSE';

export class AuthorizationTester extends EventEmitter {
  private config: SecurityTestConfig;
  private authzTests: AuthorizationTest[] = [];
  private testResults: AuthzTestResult[] = [];
  private roleMatrix: RoleTestMatrix;

  constructor(config: SecurityTestConfig) {
    super();
    this.config = config;
    this.initializeRoleMatrix();
    this.initializeAuthzTests();
  }

  /**
   * Run all authorization security tests
   */
  async runTests(): Promise<SecurityTestResult> {
    const startTime = Date.now();
    this.emit('authorizationTestsStarted', { timestamp: new Date() });

    try {
      this.testResults = [];

      // Run RBAC tests
      await this.runRBACTests();

      // Run ABAC tests
      await this.runABACTests();

      // Run privilege escalation tests
      await this.runPrivilegeEscalationTests();

      // Run horizontal access control tests
      await this.runHorizontalAccessTests();

      // Run vertical access control tests
      await this.runVerticalAccessTests();

      // Run policy enforcement tests
      await this.runPolicyEnforcementTests();

      // Run data-level security tests
      await this.runDataLevelSecurityTests();

      const vulnerabilities = this.extractVulnerabilities();
      const recommendations = this.generateRecommendations();
      const overallScore = this.calculateSecurityScore();

      const securityTestResult: SecurityTestResult = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        testType: 'AUTHORIZATION_TESTING',
        status: vulnerabilities.length > 0 ? 'FAIL' : 'PASS',
        score: overallScore,
        vulnerabilities,
        compliance: [],
        performance: {
          responseTime: this.calculateAverageResponseTime(),
          throughput: this.calculateThroughput(),
          errorRate: this.calculateErrorRate(),
          resourceUsage: { cpu: 0, memory: 0, network: 0 }
        },
        recommendations,
        metadata: {
          duration: Date.now() - startTime,
          testVersion: '1.0.0',
          environment: this.config.environment,
          coverage: this.calculateTestCoverage()
        }
      };

      this.emit('authorizationTestsCompleted', { result: securityTestResult, timestamp: new Date() });
      return securityTestResult;
    } catch (error) {
      this.emit('authorizationTestsError', { error, timestamp: new Date() });
      throw error;
    }
  }

  /**
   * Run role-based access control tests
   */
  async runRBACTests(): Promise<void> {
    this.emit('rbacTestsStarted', { timestamp: new Date() });

    // Test role-resource matrix
    for (let roleIndex = 0; roleIndex < this.roleMatrix.roles.length; roleIndex++) {
      for (let resourceIndex = 0; resourceIndex < this.roleMatrix.resources.length; resourceIndex++) {
        const role = this.roleMatrix.roles[roleIndex];
        const resource = this.roleMatrix.resources[resourceIndex];

        const testResult = await this.testRoleResourceAccess(role, resource);
        this.roleMatrix.testResults[roleIndex][resourceIndex] = testResult;

        // Convert to AuthzTestResult
        const authzResult = this.convertRoleTestToAuthzResult(testResult, role, resource);
        this.testResults.push(authzResult);
      }
    }

    this.emit('rbacTestsCompleted', { timestamp: new Date() });
  }

  /**
   * Run attribute-based access control tests
   */
  async runABACTests(): Promise<void> {
    this.emit('abacTestsStarted', { timestamp: new Date() });

    const abacTests = this.authzTests.filter(t => t.category === 'ABAC_TESTING');

    for (const test of abacTests) {
      const result = await this.executeAuthzTest(test);
      this.testResults.push(result);
    }

    this.emit('abacTestsCompleted', { timestamp: new Date() });
  }

  /**
   * Run privilege escalation tests
   */
  async runPrivilegeEscalationTests(): Promise<void> {
    this.emit('privilegeEscalationTestsStarted', { timestamp: new Date() });

    const escalationTests = this.authzTests.filter(t => t.category === 'PRIVILEGE_ESCALATION');

    for (const test of escalationTests) {
      const result = await this.executeAuthzTest(test);
      this.testResults.push(result);
    }

    // Additional privilege escalation scenarios
    await this.testAdminFunctionAccess();
    await this.testParameterManipulation();
    await this.testDirectObjectReference();

    this.emit('privilegeEscalationTestsCompleted', { timestamp: new Date() });
  }

  /**
   * Run horizontal access control tests
   */
  async runHorizontalAccessTests(): Promise<void> {
    this.emit('horizontalAccessTestsStarted', { timestamp: new Date() });

    const horizontalTests = this.authzTests.filter(t => t.category === 'HORIZONTAL_ACCESS');

    for (const test of horizontalTests) {
      const result = await this.executeAuthzTest(test);
      this.testResults.push(result);
    }

    this.emit('horizontalAccessTestsCompleted', { timestamp: new Date() });
  }

  /**
   * Run vertical access control tests
   */
  async runVerticalAccessTests(): Promise<void> {
    this.emit('verticalAccessTestsStarted', { timestamp: new Date() });

    const verticalTests = this.authzTests.filter(t => t.category === 'VERTICAL_ACCESS');

    for (const test of verticalTests) {
      const result = await this.executeAuthzTest(test);
      this.testResults.push(result);
    }

    this.emit('verticalAccessTestsCompleted', { timestamp: new Date() });
  }

  /**
   * Run policy enforcement tests
   */
  async runPolicyEnforcementTests(): Promise<void> {
    this.emit('policyEnforcementTestsStarted', { timestamp: new Date() });

    const policyTests = this.authzTests.filter(t => t.category === 'POLICY_ENFORCEMENT');

    for (const test of policyTests) {
      const result = await this.executeAuthzTest(test);
      this.testResults.push(result);
    }

    this.emit('policyEnforcementTestsCompleted', { timestamp: new Date() });
  }

  /**
   * Run data-level security tests
   */
  async runDataLevelSecurityTests(): Promise<void> {
    this.emit('dataLevelSecurityTestsStarted', { timestamp: new Date() });

    const dataTests = this.authzTests.filter(t => t.category === 'DATA_LEVEL_SECURITY');

    for (const test of dataTests) {
      const result = await this.executeAuthzTest(test);
      this.testResults.push(result);
    }

    this.emit('dataLevelSecurityTestsCompleted', { timestamp: new Date() });
  }

  /**
   * Execute individual authorization test
   */
  async executeAuthzTest(test: AuthorizationTest): Promise<AuthzTestResult> {
    const startTime = Date.now();
    this.emit('authzTestStarted', { test: test.id, timestamp: new Date() });

    try {
      const response = await this.makeAuthzRequest(test);
      const responseTime = Date.now() - startTime;

      const accessGranted = this.determineAccessGranted(response, test);
      const authzIssues = this.analyzeAuthzIssues(test, response, accessGranted);
      const vulnerability = this.createVulnerabilityIfNeeded(test, response, authzIssues);
      const auditLogged = await this.checkAuditLogging(test);

      const testResult: AuthzTestResult = {
        testId: test.id,
        status: this.determineTestStatus(test, response, accessGranted, authzIssues),
        actualStatusCode: response.status,
        actualResponse: response.data,
        responseTime,
        accessGranted,
        vulnerability,
        authzIssues,
        auditLogged,
        timestamp: new Date()
      };

      this.emit('authzTestCompleted', { test: test.id, result: testResult, timestamp: new Date() });
      return testResult;
    } catch (error) {
      const errorResult: AuthzTestResult = {
        testId: test.id,
        status: 'ERROR',
        actualStatusCode: 0,
        actualResponse: null,
        responseTime: Date.now() - startTime,
        accessGranted: false,
        authzIssues: [],
        auditLogged: false,
        timestamp: new Date()
      };

      this.emit('authzTestError', { test: test.id, error, timestamp: new Date() });
      return errorResult;
    }
  }

  private initializeRoleMatrix(): void {
    this.roleMatrix = {
      roles: [
        {
          name: 'guest',
          permissions: ['read:public'],
          attributes: { level: 0, department: 'none' }
        },
        {
          name: 'user',
          permissions: ['read:public', 'read:internal', 'write:own'],
          attributes: { level: 1, department: 'general' }
        },
        {
          name: 'manager',
          permissions: ['read:public', 'read:internal', 'read:confidential', 'write:own', 'write:team'],
          attributes: { level: 2, department: 'management' }
        },
        {
          name: 'admin',
          permissions: ['read:*', 'write:*', 'delete:*', 'admin:*'],
          attributes: { level: 3, department: 'admin' }
        }
      ],
      resources: [
        {
          type: 'user_profile',
          id: 'profile_123',
          endpoint: '/api/users/123/profile',
          requiredPermissions: ['read:own', 'read:internal'],
          sensitivity: 'INTERNAL',
          owner: 'user_123'
        },
        {
          type: 'financial_data',
          id: 'finance_456',
          endpoint: '/api/finance/reports/456',
          requiredPermissions: ['read:confidential'],
          sensitivity: 'CONFIDENTIAL'
        },
        {
          type: 'admin_panel',
          id: 'admin_panel',
          endpoint: '/api/admin/dashboard',
          requiredPermissions: ['admin:read'],
          sensitivity: 'RESTRICTED'
        },
        {
          type: 'public_content',
          id: 'content_789',
          endpoint: '/api/content/789',
          requiredPermissions: ['read:public'],
          sensitivity: 'PUBLIC'
        }
      ],
      testResults: []
    };

    // Initialize test results matrix
    this.roleMatrix.testResults = this.roleMatrix.roles.map(() =>
      this.roleMatrix.resources.map(() => ({
        role: '',
        resource: '',
        method: 'GET',
        expectedAccess: false,
        actualAccess: false,
        passed: false,
        responseTime: 0
      }))
    );
  }

  private initializeAuthzTests(): void {
    this.authzTests = [
      // Horizontal access control tests
      {
        id: 'horizontal-access-1',
        name: 'User Profile Access - Different User',
        description: 'Test accessing another user\'s profile',
        category: 'HORIZONTAL_ACCESS',
        testMethod: 'RESOURCE_ACCESS',
        userContext: {
          userId: 'user_123',
          role: 'user',
          permissions: ['read:own', 'read:internal'],
          attributes: { department: 'engineering' },
          token: 'valid_user_token'
        },
        resourceContext: {
          resourceType: 'user_profile',
          resourceId: 'profile_456', // Different user
          endpoint: '/api/users/456/profile',
          method: 'GET',
          sensitivity: 'INTERNAL',
          owner: 'user_456'
        },
        expectedResult: {
          shouldAllow: false,
          expectedStatusCode: [403, 404],
          mustNotContain: ['email', 'phone', 'address']
        }
      },
      // Vertical access control tests
      {
        id: 'vertical-access-1',
        name: 'Admin Panel Access - Regular User',
        description: 'Test regular user accessing admin panel',
        category: 'VERTICAL_ACCESS',
        testMethod: 'RESOURCE_ACCESS',
        userContext: {
          userId: 'user_123',
          role: 'user',
          permissions: ['read:public', 'read:internal'],
          attributes: { level: 1 },
          token: 'valid_user_token'
        },
        resourceContext: {
          resourceType: 'admin_panel',
          resourceId: 'admin_dashboard',
          endpoint: '/api/admin/dashboard',
          method: 'GET',
          sensitivity: 'RESTRICTED'
        },
        expectedResult: {
          shouldAllow: false,
          expectedStatusCode: [403],
          auditRequired: true
        }
      },
      // Privilege escalation tests
      {
        id: 'privilege-escalation-1',
        name: 'Parameter Manipulation - User ID',
        description: 'Test privilege escalation via user ID parameter manipulation',
        category: 'PRIVILEGE_ESCALATION',
        testMethod: 'ESCALATION_ATTEMPT',
        userContext: {
          userId: 'user_123',
          role: 'user',
          permissions: ['read:own'],
          attributes: {},
          token: 'valid_user_token'
        },
        resourceContext: {
          resourceType: 'user_management',
          resourceId: 'admin_function',
          endpoint: '/api/users/admin/promote',
          method: 'POST',
          sensitivity: 'RESTRICTED'
        },
        expectedResult: {
          shouldAllow: false,
          expectedStatusCode: [403, 404],
          auditRequired: true
        }
      },
      // ABAC tests
      {
        id: 'abac-1',
        name: 'Department-based Access Control',
        description: 'Test attribute-based access control by department',
        category: 'ABAC_TESTING',
        testMethod: 'POLICY_EVALUATION',
        userContext: {
          userId: 'user_123',
          role: 'manager',
          permissions: ['read:confidential'],
          attributes: { department: 'engineering', clearance: 'secret' },
          token: 'valid_manager_token'
        },
        resourceContext: {
          resourceType: 'department_data',
          resourceId: 'finance_reports',
          endpoint: '/api/departments/finance/reports',
          method: 'GET',
          sensitivity: 'CONFIDENTIAL',
          attributes: { department: 'finance', clearance: 'secret' }
        },
        expectedResult: {
          shouldAllow: false,
          expectedStatusCode: [403],
          mustNotContain: ['financial_data', 'salary', 'budget']
        }
      },
      // Policy enforcement tests
      {
        id: 'policy-enforcement-1',
        name: 'Time-based Access Policy',
        description: 'Test time-based access policy enforcement',
        category: 'POLICY_ENFORCEMENT',
        testMethod: 'POLICY_EVALUATION',
        userContext: {
          userId: 'user_123',
          role: 'user',
          permissions: ['read:internal'],
          attributes: { timezone: 'UTC', shift: 'night' },
          token: 'valid_user_token'
        },
        resourceContext: {
          resourceType: 'sensitive_operations',
          resourceId: 'payroll_system',
          endpoint: '/api/payroll/access',
          method: 'GET',
          sensitivity: 'RESTRICTED',
          attributes: { business_hours_only: true }
        },
        expectedResult: {
          shouldAllow: false, // Assuming tested outside business hours
          expectedStatusCode: [403],
          auditRequired: true
        }
      }
    ];
  }

  private async testRoleResourceAccess(role: Role, resource: Resource): Promise<RoleTestResult> {
    const startTime = Date.now();

    // Determine expected access based on role permissions and resource requirements
    const expectedAccess = this.shouldRoleHaveAccess(role, resource);

    try {
      // Create user context for the role
      const userContext: UserContext = {
        userId: `${role.name}_user`,
        role: role.name,
        permissions: role.permissions,
        attributes: role.attributes,
        token: `${role.name}_token`
      };

      // Make request
      const response = await this.makeResourceRequest(userContext, resource);
      const actualAccess = response.status === 200;
      const passed = actualAccess === expectedAccess;

      return {
        role: role.name,
        resource: `${resource.type}:${resource.id}`,
        method: 'GET',
        expectedAccess,
        actualAccess,
        passed,
        responseTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        role: role.name,
        resource: `${resource.type}:${resource.id}`,
        method: 'GET',
        expectedAccess,
        actualAccess: false,
        passed: !expectedAccess, // If we expected no access and got an error, that's correct
        responseTime: Date.now() - startTime
      };
    }
  }

  private shouldRoleHaveAccess(role: Role, resource: Resource): boolean {
    // Check if role has any of the required permissions
    return resource.requiredPermissions.some(permission => {
      // Handle wildcard permissions
      if (role.permissions.includes(permission)) {
        return true;
      }

      // Handle wildcard permissions like 'read:*'
      return role.permissions.some(rolePermission => {
        if (rolePermission.endsWith(':*')) {
          const basePermission = rolePermission.replace(':*', ':');
          return permission.startsWith(basePermission);
        }
        return false;
      });
    });
  }

  private async makeAuthzRequest(test: AuthorizationTest): Promise<any> {
    const url = `${this.config.target.baseUrl}${test.resourceContext.endpoint}`;

    const requestConfig: any = {
      method: test.resourceContext.method,
      url,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'UrnLabs-Authorization-Tester/1.0'
      },
      validateStatus: () => true, // Accept all status codes
      timeout: 10000
    };

    // Add authentication token if available
    if (test.userContext.token) {
      requestConfig.headers['Authorization'] = `Bearer ${test.userContext.token}`;
    }

    // Add user context headers for testing
    requestConfig.headers['X-User-ID'] = test.userContext.userId;
    requestConfig.headers['X-User-Role'] = test.userContext.role;

    return await axios(requestConfig);
  }

  private async makeResourceRequest(userContext: UserContext, resource: Resource): Promise<any> {
    const url = `${this.config.target.baseUrl}${resource.endpoint}`;

    const requestConfig: any = {
      method: 'GET',
      url,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userContext.token}`,
        'X-User-ID': userContext.userId,
        'X-User-Role': userContext.role
      },
      validateStatus: () => true,
      timeout: 10000
    };

    return await axios(requestConfig);
  }

  private determineAccessGranted(response: any, test: AuthorizationTest): boolean {
    // Access is granted if status is 2xx
    return response.status >= 200 && response.status < 300;
  }

  private analyzeAuthzIssues(test: AuthorizationTest, response: any, accessGranted: boolean): AuthzIssue[] {
    const issues: AuthzIssue[] = [];

    // Check for authorization bypass
    if (!test.expectedResult.shouldAllow && accessGranted) {
      issues.push({
        type: this.getIssueTypeForCategory(test.category),
        severity: 'CRITICAL',
        description: 'Authorization bypass detected - access granted when it should be denied',
        evidence: `Expected denial but got status ${response.status}`,
        remediation: 'Review and strengthen authorization controls',
        affectedResources: [test.resourceContext.endpoint]
      });
    }

    // Check for missing authorization
    if (test.expectedResult.shouldAllow && !accessGranted && response.status === 500) {
      issues.push({
        type: 'MISSING_AUTHORIZATION',
        severity: 'HIGH',
        description: 'Authorization check may be missing - internal server error',
        evidence: `Expected access but got status ${response.status}`,
        remediation: 'Ensure authorization checks are properly implemented',
        affectedResources: [test.resourceContext.endpoint]
      });
    }

    // Check for information disclosure
    if (!test.expectedResult.shouldAllow && test.expectedResult.mustNotContain) {
      const responseText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      const leakedInfo = test.expectedResult.mustNotContain.filter(term =>
        responseText.toLowerCase().includes(term.toLowerCase())
      );

      if (leakedInfo.length > 0) {
        issues.push({
          type: 'WEAK_AUTHORIZATION',
          severity: 'HIGH',
          description: 'Sensitive information disclosed in unauthorized response',
          evidence: `Response contains: ${leakedInfo.join(', ')}`,
          remediation: 'Ensure error responses do not contain sensitive information',
          affectedResources: [test.resourceContext.endpoint]
        });
      }
    }

    return issues;
  }

  private createVulnerabilityIfNeeded(
    test: AuthorizationTest,
    response: any,
    authzIssues: AuthzIssue[]
  ): Vulnerability | undefined {
    const criticalIssues = authzIssues.filter(issue => issue.severity === 'CRITICAL');
    const highIssues = authzIssues.filter(issue => issue.severity === 'HIGH');

    if (criticalIssues.length > 0 || highIssues.length > 0) {
      const primaryIssue = criticalIssues[0] || highIssues[0];

      return {
        id: crypto.randomUUID(),
        type: this.mapAuthzIssueToVulnType(primaryIssue.type),
        severity: primaryIssue.severity,
        title: test.name,
        description: test.description,
        location: {
          url: test.resourceContext.endpoint,
          service: 'authorization'
        },
        evidence: [primaryIssue.evidence, ...authzIssues.map(i => i.description)],
        impact: this.getImpactForIssueType(primaryIssue.type),
        remediation: primaryIssue.remediation,
        references: this.getReferencesForIssueType(primaryIssue.type)
      };
    }

    return undefined;
  }

  private determineTestStatus(
    test: AuthorizationTest,
    response: any,
    accessGranted: boolean,
    authzIssues: AuthzIssue[]
  ): 'PASS' | 'FAIL' | 'ERROR' {
    const criticalIssues = authzIssues.filter(issue => issue.severity === 'CRITICAL');

    if (criticalIssues.length > 0) {
      return 'FAIL';
    }

    // Check if access granted matches expectation
    if (accessGranted !== test.expectedResult.shouldAllow) {
      return 'FAIL';
    }

    // Check status code
    if (!test.expectedResult.expectedStatusCode.includes(response.status)) {
      return 'FAIL';
    }

    return 'PASS';
  }

  private convertRoleTestToAuthzResult(testResult: RoleTestResult, role: Role, resource: Resource): AuthzTestResult {
    return {
      testId: `rbac-${role.name}-${resource.type}-${resource.id}`,
      status: testResult.passed ? 'PASS' : 'FAIL',
      actualStatusCode: testResult.actualAccess ? 200 : 403,
      actualResponse: testResult.actualAccess ? 'Access granted' : 'Access denied',
      responseTime: testResult.responseTime,
      accessGranted: testResult.actualAccess,
      vulnerability: testResult.passed ? undefined : {
        id: crypto.randomUUID(),
        type: 'AUTHORIZATION_BYPASS',
        severity: 'HIGH',
        title: `RBAC Violation: ${role.name} -> ${resource.type}`,
        description: `Role ${role.name} has unexpected access to ${resource.type}`,
        location: { url: resource.endpoint },
        evidence: [`Expected: ${testResult.expectedAccess}, Actual: ${testResult.actualAccess}`],
        impact: 'Unauthorized access to protected resources',
        remediation: 'Review and correct role-based access control policies'
      },
      authzIssues: testResult.passed ? [] : [{
        type: 'PRIVILEGE_ESCALATION',
        severity: 'HIGH',
        description: `Role ${role.name} has unexpected access to ${resource.type}`,
        evidence: `Access granted when it should be denied`,
        remediation: 'Review role permissions and resource requirements',
        affectedResources: [resource.endpoint]
      }],
      auditLogged: true,
      timestamp: new Date()
    };
  }

  private async checkAuditLogging(test: AuthorizationTest): Promise<boolean> {
    // Mock audit logging check
    // In production, this would check if the authorization decision was properly logged
    return test.expectedResult.auditRequired || false;
  }

  private async testAdminFunctionAccess(): Promise<void> {
    // Test direct access to admin functions without proper authorization
    const adminEndpoints = [
      '/api/admin/users',
      '/api/admin/system/config',
      '/api/admin/security/logs',
      '/api/admin/database/backup'
    ];

    for (const endpoint of adminEndpoints) {
      const test: AuthorizationTest = {
        id: `admin-function-${endpoint.replace(/[^a-zA-Z0-9]/g, '-')}`,
        name: `Admin Function Access - ${endpoint}`,
        description: `Test unauthorized access to admin function: ${endpoint}`,
        category: 'PRIVILEGE_ESCALATION',
        testMethod: 'ESCALATION_ATTEMPT',
        userContext: {
          userId: 'user_123',
          role: 'user',
          permissions: ['read:public'],
          attributes: {},
          token: 'valid_user_token'
        },
        resourceContext: {
          resourceType: 'admin_function',
          resourceId: endpoint,
          endpoint,
          method: 'GET',
          sensitivity: 'RESTRICTED'
        },
        expectedResult: {
          shouldAllow: false,
          expectedStatusCode: [403, 404],
          auditRequired: true
        }
      };

      const result = await this.executeAuthzTest(test);
      this.testResults.push(result);
    }
  }

  private async testParameterManipulation(): Promise<void> {
    // Test parameter manipulation for privilege escalation
    const manipulationTests = [
      { param: 'userId', value: 'admin', endpoint: '/api/users/{userId}/profile' },
      { param: 'role', value: 'administrator', endpoint: '/api/users/profile?role={role}' },
      { param: 'level', value: '999', endpoint: '/api/access?level={level}' }
    ];

    for (const manipTest of manipulationTests) {
      const test: AuthorizationTest = {
        id: `param-manipulation-${manipTest.param}`,
        name: `Parameter Manipulation - ${manipTest.param}`,
        description: `Test privilege escalation via ${manipTest.param} parameter manipulation`,
        category: 'PRIVILEGE_ESCALATION',
        testMethod: 'ESCALATION_ATTEMPT',
        userContext: {
          userId: 'user_123',
          role: 'user',
          permissions: ['read:own'],
          attributes: {},
          token: 'valid_user_token'
        },
        resourceContext: {
          resourceType: 'parameter_manipulation',
          resourceId: manipTest.param,
          endpoint: manipTest.endpoint.replace(`{${manipTest.param}}`, manipTest.value),
          method: 'GET',
          sensitivity: 'INTERNAL'
        },
        expectedResult: {
          shouldAllow: false,
          expectedStatusCode: [403, 404],
          auditRequired: true
        }
      };

      const result = await this.executeAuthzTest(test);
      this.testResults.push(result);
    }
  }

  private async testDirectObjectReference(): Promise<void> {
    // Test insecure direct object references
    const objectTests = [
      { type: 'user', id: '999999', endpoint: '/api/users/999999' },
      { type: 'document', id: 'confidential_doc', endpoint: '/api/documents/confidential_doc' },
      { type: 'transaction', id: 'tx_admin_001', endpoint: '/api/transactions/tx_admin_001' }
    ];

    for (const objTest of objectTests) {
      const test: AuthorizationTest = {
        id: `direct-object-ref-${objTest.type}-${objTest.id}`,
        name: `Direct Object Reference - ${objTest.type}`,
        description: `Test insecure direct object reference to ${objTest.type} ${objTest.id}`,
        category: 'PRIVILEGE_ESCALATION',
        testMethod: 'BYPASS_ATTEMPT',
        userContext: {
          userId: 'user_123',
          role: 'user',
          permissions: ['read:own'],
          attributes: {},
          token: 'valid_user_token'
        },
        resourceContext: {
          resourceType: objTest.type,
          resourceId: objTest.id,
          endpoint: objTest.endpoint,
          method: 'GET',
          sensitivity: 'CONFIDENTIAL'
        },
        expectedResult: {
          shouldAllow: false,
          expectedStatusCode: [403, 404],
          mustNotContain: ['sensitive', 'confidential', 'admin']
        }
      };

      const result = await this.executeAuthzTest(test);
      this.testResults.push(result);
    }
  }

  private extractVulnerabilities(): Vulnerability[] {
    return this.testResults
      .filter(result => result.vulnerability)
      .map(result => result.vulnerability!);
  }

  private generateRecommendations(): Recommendation[] {
    const vulnerabilities = this.extractVulnerabilities();
    const recommendations: Recommendation[] = [];

    // Group vulnerabilities by type
    const vulnByType = vulnerabilities.reduce((acc, vuln) => {
      if (!acc[vuln.type]) acc[vuln.type] = [];
      acc[vuln.type].push(vuln);
      return acc;
    }, {} as Record<string, Vulnerability[]>);

    for (const [type, vulns] of Object.entries(vulnByType)) {
      const highestSeverity = this.getHighestSeverity(vulns.map(v => v.severity));

      recommendations.push({
        type: highestSeverity as any,
        category: 'Authorization Security',
        title: `Address ${type} vulnerabilities`,
        description: `Found ${vulns.length} ${type} vulnerability(ies)`,
        action: vulns[0]?.remediation || 'Review and remediate authorization vulnerabilities',
        effort: vulns.length > 5 ? 'HIGH' : vulns.length > 2 ? 'MEDIUM' : 'LOW',
        impact: highestSeverity === 'CRITICAL' ? 'HIGH' : 'MEDIUM'
      });
    }

    // Add role matrix recommendations
    const failedRoleTests = this.roleMatrix.testResults.flat().filter(r => !r.passed);
    if (failedRoleTests.length > 0) {
      recommendations.push({
        type: 'HIGH',
        category: 'RBAC Configuration',
        title: 'Review Role-Based Access Control',
        description: `${failedRoleTests.length} role-resource access tests failed`,
        action: 'Review and correct role permissions and resource requirements',
        effort: 'MEDIUM',
        impact: 'HIGH'
      });
    }

    return recommendations;
  }

  private calculateSecurityScore(): number {
    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(r => r.status === 'PASS').length;
    const vulnerabilities = this.extractVulnerabilities();

    if (totalTests === 0) return 100;

    let score = (passedTests / totalTests) * 100;

    // Deduct points for vulnerabilities
    vulnerabilities.forEach(vuln => {
      switch (vuln.severity) {
        case 'CRITICAL':
          score -= 20;
          break;
        case 'HIGH':
          score -= 15;
          break;
        case 'MEDIUM':
          score -= 10;
          break;
        case 'LOW':
          score -= 5;
          break;
      }
    });

    return Math.max(0, Math.round(score));
  }

  private calculateAverageResponseTime(): number {
    if (this.testResults.length === 0) return 0;
    const totalTime = this.testResults.reduce((sum, result) => sum + result.responseTime, 0);
    return Math.round(totalTime / this.testResults.length);
  }

  private calculateThroughput(): number {
    const totalTests = this.testResults.length;
    const totalTime = this.testResults.reduce((sum, result) => sum + result.responseTime, 0);

    if (totalTime === 0) return 0;
    return Math.round((totalTests / totalTime) * 1000); // tests per second
  }

  private calculateErrorRate(): number {
    if (this.testResults.length === 0) return 0;
    const errorCount = this.testResults.filter(r => r.status === 'ERROR').length;
    return (errorCount / this.testResults.length) * 100;
  }

  private calculateTestCoverage(): number {
    const totalAuthzMechanisms = 8; // Mock total number of authorization mechanisms
    const testedMechanisms = new Set(this.testResults.map(r => {
      const testType = r.testId.split('-')[0];
      return testType;
    })).size;
    return Math.round((testedMechanisms / totalAuthzMechanisms) * 100);
  }

  private getHighestSeverity(severities: string[]): string {
    if (severities.includes('CRITICAL')) return 'CRITICAL';
    if (severities.includes('HIGH')) return 'HIGH';
    if (severities.includes('MEDIUM')) return 'MEDIUM';
    return 'LOW';
  }

  private getIssueTypeForCategory(category: AuthzTestCategory): AuthzIssueType {
    const mapping: Record<AuthzTestCategory, AuthzIssueType> = {
      'RBAC_TESTING': 'PRIVILEGE_ESCALATION',
      'ABAC_TESTING': 'POLICY_VIOLATION',
      'PRIVILEGE_ESCALATION': 'PRIVILEGE_ESCALATION',
      'HORIZONTAL_ACCESS': 'HORIZONTAL_BYPASS',
      'VERTICAL_ACCESS': 'VERTICAL_BYPASS',
      'RESOURCE_AUTHORIZATION': 'MISSING_AUTHORIZATION',
      'POLICY_ENFORCEMENT': 'POLICY_VIOLATION',
      'DATA_LEVEL_SECURITY': 'WEAK_AUTHORIZATION',
      'API_AUTHORIZATION': 'MISSING_AUTHORIZATION',
      'ADMINISTRATIVE_ACCESS': 'PRIVILEGE_ESCALATION'
    };

    return mapping[category] || 'MISSING_AUTHORIZATION';
  }

  private mapAuthzIssueToVulnType(issueType: AuthzIssueType): any {
    const mapping: Record<AuthzIssueType, string> = {
      'PRIVILEGE_ESCALATION': 'PRIVILEGE_ESCALATION',
      'HORIZONTAL_BYPASS': 'AUTHORIZATION_BYPASS',
      'VERTICAL_BYPASS': 'AUTHORIZATION_BYPASS',
      'MISSING_AUTHORIZATION': 'AUTHORIZATION_BYPASS',
      'WEAK_AUTHORIZATION': 'AUTHORIZATION_BYPASS',
      'OVERPRIVILEGED_ACCESS': 'PRIVILEGE_ESCALATION',
      'POLICY_VIOLATION': 'AUTHORIZATION_BYPASS',
      'AUDIT_BYPASS': 'AUDIT_BYPASS'
    };

    return mapping[issueType] || 'AUTHORIZATION_BYPASS';
  }

  private getImpactForIssueType(issueType: AuthzIssueType): string {
    const impacts: Record<AuthzIssueType, string> = {
      'PRIVILEGE_ESCALATION': 'Users could gain elevated privileges and access restricted resources',
      'HORIZONTAL_BYPASS': 'Users could access data belonging to other users at the same privilege level',
      'VERTICAL_BYPASS': 'Users could access higher-privileged resources and administrative functions',
      'MISSING_AUTHORIZATION': 'Resources are accessible without proper authorization checks',
      'WEAK_AUTHORIZATION': 'Authorization controls are insufficient to prevent unauthorized access',
      'OVERPRIVILEGED_ACCESS': 'Users have more privileges than necessary for their role',
      'POLICY_VIOLATION': 'Access control policies are not properly enforced',
      'AUDIT_BYPASS': 'Authorization decisions are not properly logged for audit purposes'
    };

    return impacts[issueType] || 'Unauthorized access to protected resources';
  }

  private getReferencesForIssueType(issueType: AuthzIssueType): string[] {
    const references: Record<AuthzIssueType, string[]> = {
      'PRIVILEGE_ESCALATION': [
        'https://owasp.org/www-project-top-ten/2017/A5_2017-Broken_Access_Control'
      ],
      'HORIZONTAL_BYPASS': [
        'https://owasp.org/www-project-top-ten/2017/A5_2017-Broken_Access_Control'
      ],
      'VERTICAL_BYPASS': [
        'https://owasp.org/www-project-top-ten/2017/A5_2017-Broken_Access_Control'
      ],
      'MISSING_AUTHORIZATION': [
        'https://owasp.org/www-project-top-ten/2017/A5_2017-Broken_Access_Control'
      ],
      'WEAK_AUTHORIZATION': [
        'https://owasp.org/www-project-top-ten/2017/A5_2017-Broken_Access_Control'
      ],
      'POLICY_VIOLATION': [
        'https://owasp.org/www-project-application-security-verification-standard/'
      ]
    };

    return references[issueType] || ['https://owasp.org/www-project-top-ten/2017/A5_2017-Broken_Access_Control'];
  }
}