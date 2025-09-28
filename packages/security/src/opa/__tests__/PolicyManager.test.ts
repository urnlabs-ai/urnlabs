import { PolicyManager, PolicyTestCase } from '../PolicyManager';
import { promises as fs } from 'fs';
import { join } from 'path';

// Mock dependencies
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    readdir: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    unlink: jest.fn(),
    stat: jest.fn()
  }
}));

jest.mock('../../services/encryption', () => ({
  encryptionService: {
    generateUUID: jest.fn(() => 'test-uuid-123'),
    createHash: jest.fn(() => 'test-hash-456')
  }
}));

jest.mock('../../services/audit-logging', () => ({
  auditLoggingService: {
    logEvent: jest.fn()
  }
}));

jest.mock('node-fetch');

describe('PolicyManager', () => {
  let policyManager: PolicyManager;
  const testConfig = {
    policyDirectory: '/test/policies',
    backupDirectory: '/test/backups',
    opaServerUrl: 'http://localhost:8181'
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock directory creation
    (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fs.readdir as jest.Mock).mockResolvedValue([]);

    policyManager = new PolicyManager(testConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create required directories', async () => {
      await new Promise(resolve => setTimeout(resolve, 0)); // Wait for async initialization

      expect(fs.mkdir).toHaveBeenCalledWith('/test/policies', { recursive: true });
      expect(fs.mkdir).toHaveBeenCalledWith('/test/backups', { recursive: true });
      expect(fs.mkdir).toHaveBeenCalledWith(join('/test/policies', 'compiled'), { recursive: true });
      expect(fs.mkdir).toHaveBeenCalledWith(join('/test/policies', 'tests'), { recursive: true });
    });

    it('should load existing policies on startup', async () => {
      const mockFiles = ['policy1.rego', 'policy2.rego', 'readme.txt'];
      (fs.readdir as jest.Mock).mockResolvedValue(mockFiles);
      (fs.readFile as jest.Mock)
        .mockResolvedValueOnce('package test1\ndefault allow = false')
        .mockRejectedValueOnce(new Error('No metadata'))
        .mockResolvedValueOnce('package test2\ndefault allow = true')
        .mockRejectedValueOnce(new Error('No metadata'));

      const manager = new PolicyManager(testConfig);
      await new Promise(resolve => setTimeout(resolve, 100)); // Wait for initialization

      expect(fs.readFile).toHaveBeenCalledTimes(4); // 2 policies + 2 metadata attempts
    });
  });

  describe('createPolicy', () => {
    it('should create a new policy successfully', async () => {
      const name = 'Test Policy';
      const content = 'package test\ndefault allow = true';
      const metadata = { description: 'Test policy description' };
      const author = 'test-author';

      jest.spyOn(policyManager as any, 'validatePolicy').mockResolvedValue({
        valid: true,
        errors: [],
        warnings: [],
        syntaxValid: true,
        semanticValid: true,
        testsPassed: true,
        testResults: []
      });

      jest.spyOn(policyManager as any, 'savePolicyToFile').mockResolvedValue(undefined);
      jest.spyOn(policyManager as any, 'logPolicyAction').mockResolvedValue(undefined);

      const policyId = await policyManager.createPolicy(name, content, metadata, author);

      expect(policyId).toBe('test-uuid-123');
      expect(policyManager.getPolicy(policyId)).toEqual(expect.objectContaining({
        id: policyId,
        name,
        version: '1.0.0',
        description: metadata.description,
        author,
        status: 'draft'
      }));
    });

    it('should reject invalid policies', async () => {
      const name = 'Invalid Policy';
      const content = 'invalid rego syntax';

      jest.spyOn(policyManager as any, 'validatePolicy').mockResolvedValue({
        valid: false,
        errors: ['Syntax error: invalid rule'],
        warnings: [],
        syntaxValid: false,
        semanticValid: false,
        testsPassed: false,
        testResults: []
      });

      await expect(
        policyManager.createPolicy(name, content)
      ).rejects.toThrow('Policy validation failed: Syntax error: invalid rule');
    });

    it('should emit policyCreated event', async () => {
      const name = 'Test Policy';
      const content = 'package test\ndefault allow = true';

      jest.spyOn(policyManager as any, 'validatePolicy').mockResolvedValue({ valid: true, errors: [] });
      jest.spyOn(policyManager as any, 'savePolicyToFile').mockResolvedValue(undefined);
      jest.spyOn(policyManager as any, 'logPolicyAction').mockResolvedValue(undefined);

      const eventSpy = jest.fn();
      policyManager.on('policyCreated', eventSpy);

      const policyId = await policyManager.createPolicy(name, content);

      expect(eventSpy).toHaveBeenCalledWith({
        policyId,
        metadata: expect.objectContaining({ name, id: policyId })
      });
    });
  });

  describe('updatePolicy', () => {
    beforeEach(async () => {
      // Create a test policy first
      jest.spyOn(policyManager as any, 'validatePolicy').mockResolvedValue({ valid: true, errors: [] });
      jest.spyOn(policyManager as any, 'savePolicyToFile').mockResolvedValue(undefined);
      jest.spyOn(policyManager as any, 'logPolicyAction').mockResolvedValue(undefined);
      jest.spyOn(policyManager as any, 'createBackup').mockResolvedValue(undefined);

      await policyManager.createPolicy(
        'Test Policy',
        'package test\ndefault allow = false',
        {},
        'test-author'
      );
    });

    it('should update existing policy with new version', async () => {
      const policyId = 'test-uuid-123';
      const newContent = 'package test\ndefault allow = true';
      const changelog = 'Updated allow rule';

      const newVersion = await policyManager.updatePolicy(
        policyId,
        newContent,
        changelog,
        'test-author',
        'minor'
      );

      expect(newVersion).toBe('1.1.0');

      const updatedPolicy = policyManager.getPolicy(policyId);
      expect(updatedPolicy?.version).toBe('1.1.0');
    });

    it('should create backup before updating', async () => {
      const policyId = 'test-uuid-123';
      const newContent = 'package test\ndefault allow = true';

      const backupSpy = jest.spyOn(policyManager as any, 'createBackup');

      await policyManager.updatePolicy(policyId, newContent, 'test changelog');

      expect(backupSpy).toHaveBeenCalledWith(policyId, '1.0.0');
    });

    it('should handle different version types', async () => {
      const policyId = 'test-uuid-123';
      const content = 'package test\ndefault allow = true';

      // Test major version bump
      const majorVersion = await policyManager.updatePolicy(
        policyId,
        content,
        'Major update',
        'test-author',
        'major'
      );
      expect(majorVersion).toBe('2.0.0');

      // Test patch version bump
      const patchVersion = await policyManager.updatePolicy(
        policyId,
        content,
        'Patch update',
        'test-author',
        'patch'
      );
      expect(patchVersion).toBe('2.0.1');
    });

    it('should reject update for non-existent policy', async () => {
      await expect(
        policyManager.updatePolicy('non-existent', 'content', 'changelog')
      ).rejects.toThrow('Policy non-existent not found');
    });
  });

  describe('validatePolicy', () => {
    it('should validate syntax correctly', async () => {
      const validContent = 'package test\ndefault allow = true';

      jest.spyOn(policyManager as any, 'validateSyntax').mockResolvedValue(true);
      jest.spyOn(policyManager as any, 'validateSemantics').mockResolvedValue(true);

      const result = await policyManager.validatePolicy(validContent);

      expect(result.valid).toBe(true);
      expect(result.syntaxValid).toBe(true);
      expect(result.semanticValid).toBe(true);
    });

    it('should run test cases when provided', async () => {
      const content = 'package test\ndefault allow = true';
      const testCases: PolicyTestCase[] = [
        {
          name: 'Allow Test',
          description: 'Should allow access',
          input: { user: 'test' },
          expectedResult: true
        }
      ];

      jest.spyOn(policyManager as any, 'validateSyntax').mockResolvedValue(true);
      jest.spyOn(policyManager as any, 'validateSemantics').mockResolvedValue(true);
      jest.spyOn(policyManager as any, 'runTestCases').mockResolvedValue([
        {
          testCase: 'Allow Test',
          passed: true,
          actualResult: true,
          executionTime: 10
        }
      ]);

      const result = await policyManager.validatePolicy(content, testCases);

      expect(result.testsPassed).toBe(true);
      expect(result.testResults).toHaveLength(1);
    });

    it('should handle validation errors', async () => {
      const invalidContent = 'invalid rego';

      jest.spyOn(policyManager as any, 'validateSyntax').mockResolvedValue(false);

      const result = await policyManager.validatePolicy(invalidContent);

      expect(result.valid).toBe(false);
      expect(result.syntaxValid).toBe(false);
      expect(result.errors).toContain('Policy syntax is invalid');
    });
  });

  describe('deployPolicy', () => {
    beforeEach(async () => {
      // Create a test policy first
      jest.spyOn(policyManager as any, 'validatePolicy').mockResolvedValue({ valid: true, errors: [] });
      jest.spyOn(policyManager as any, 'savePolicyToFile').mockResolvedValue(undefined);
      jest.spyOn(policyManager as any, 'logPolicyAction').mockResolvedValue(undefined);

      await policyManager.createPolicy(
        'Test Policy',
        'package test\ndefault allow = true',
        {},
        'test-author'
      );
    });

    it('should deploy policy successfully', async () => {
      const policyId = 'test-uuid-123';

      jest.spyOn(policyManager as any, 'performDeployment').mockResolvedValue(undefined);

      const deploymentId = await policyManager.deployPolicy(
        policyId,
        '1.0.0',
        'staging',
        'deploy-user'
      );

      expect(deploymentId).toBe('test-uuid-123');

      const deployment = policyManager.getDeployment(deploymentId);
      expect(deployment?.status).toBe('active');
      expect(deployment?.environment).toBe('staging');
    });

    it('should validate policy before deployment', async () => {
      const policyId = 'test-uuid-123';

      // Mock validation failure
      jest.spyOn(policyManager as any, 'validatePolicy').mockResolvedValue({
        valid: false,
        errors: ['Invalid policy']
      });

      await expect(
        policyManager.deployPolicy(policyId, '1.0.0', 'production', 'deploy-user')
      ).rejects.toThrow('Cannot deploy invalid policy: Invalid policy');
    });

    it('should handle deployment failures', async () => {
      const policyId = 'test-uuid-123';

      jest.spyOn(policyManager as any, 'performDeployment').mockRejectedValue(
        new Error('Deployment failed')
      );

      await expect(
        policyManager.deployPolicy(policyId, '1.0.0', 'production', 'deploy-user')
      ).rejects.toThrow('Deployment failed');
    });
  });

  describe('rollbackPolicy', () => {
    beforeEach(async () => {
      // Create and update a policy to have multiple versions
      jest.spyOn(policyManager as any, 'validatePolicy').mockResolvedValue({ valid: true, errors: [] });
      jest.spyOn(policyManager as any, 'savePolicyToFile').mockResolvedValue(undefined);
      jest.spyOn(policyManager as any, 'logPolicyAction').mockResolvedValue(undefined);
      jest.spyOn(policyManager as any, 'createBackup').mockResolvedValue(undefined);

      await policyManager.createPolicy(
        'Test Policy',
        'package test\ndefault allow = false',
        {},
        'test-author'
      );

      await policyManager.updatePolicy(
        'test-uuid-123',
        'package test\ndefault allow = true',
        'Updated rule',
        'test-author'
      );
    });

    it('should rollback to previous version', async () => {
      const policyId = 'test-uuid-123';

      await policyManager.rollbackPolicy(
        policyId,
        '1.0.0',
        'rollback-user',
        'Reverting problematic change'
      );

      const policy = policyManager.getPolicy(policyId);
      expect(policy?.version).toBe('1.0.0'); // Should be back to original version metadata
    });

    it('should emit rollback event', async () => {
      const policyId = 'test-uuid-123';

      const eventSpy = jest.fn();
      policyManager.on('policyRolledBack', eventSpy);

      await policyManager.rollbackPolicy(
        policyId,
        '1.0.0',
        'rollback-user',
        'Test rollback'
      );

      expect(eventSpy).toHaveBeenCalledWith({
        policyId,
        fromVersion: '1.1.0',
        toVersion: '1.0.0',
        reason: 'Test rollback'
      });
    });

    it('should reject rollback for non-existent policy', async () => {
      await expect(
        policyManager.rollbackPolicy(
          'non-existent',
          '1.0.0',
          'rollback-user',
          'reason'
        )
      ).rejects.toThrow('Policy non-existent not found');
    });

    it('should reject rollback to non-existent version', async () => {
      const policyId = 'test-uuid-123';

      await expect(
        policyManager.rollbackPolicy(
          policyId,
          '99.0.0',
          'rollback-user',
          'reason'
        )
      ).rejects.toThrow('Target version 99.0.0 not found for policy test-uuid-123');
    });
  });

  describe('policy versioning', () => {
    it('should generate correct version numbers', () => {
      expect((policyManager as any).generateNextVersion('1.0.0', 'major')).toBe('2.0.0');
      expect((policyManager as any).generateNextVersion('1.0.0', 'minor')).toBe('1.1.0');
      expect((policyManager as any).generateNextVersion('1.0.0', 'patch')).toBe('1.0.1');

      expect((policyManager as any).generateNextVersion('2.5.10', 'major')).toBe('3.0.0');
      expect((policyManager as any).generateNextVersion('2.5.10', 'minor')).toBe('2.6.0');
      expect((policyManager as any).generateNextVersion('2.5.10', 'patch')).toBe('2.5.11');
    });
  });

  describe('backup management', () => {
    it('should create backup with correct filename', async () => {
      const policyId = 'test-policy-123';
      const version = '1.0.0';

      // Mock policy version data
      const mockVersionData = {
        metadata: { id: policyId, name: 'Test Policy' },
        content: 'package test\ndefault allow = true',
        version: '1.0.0',
        createdAt: new Date(),
        author: 'test-author',
        changelog: 'Initial version'
      };

      jest.spyOn(policyManager, 'getPolicyVersions').mockReturnValue([mockVersionData]);
      (policyManager as any).policyVersions.set(policyId, new Map([['1.0.0', mockVersionData]]));

      await (policyManager as any).createBackup(policyId, version);

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`${policyId}-${version}-\\d+\\.backup`)),
        expect.stringContaining('Test Policy')
      );
    });
  });

  describe('file operations', () => {
    it('should save policy and metadata to files', async () => {
      // Create a policy first
      jest.spyOn(policyManager as any, 'validatePolicy').mockResolvedValue({ valid: true, errors: [] });
      jest.spyOn(policyManager as any, 'logPolicyAction').mockResolvedValue(undefined);

      const policyId = await policyManager.createPolicy(
        'Test Policy',
        'package test\ndefault allow = true'
      );

      // Clear the mock to check the save operation
      (fs.writeFile as jest.Mock).mockClear();

      await (policyManager as any).savePolicyToFile(policyId);

      expect(fs.writeFile).toHaveBeenCalledTimes(2); // Policy content + metadata
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('Test Policy.rego'),
        'package test\ndefault allow = true'
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('Test Policy.metadata.json'),
        expect.stringContaining('"name":"Test Policy"')
      );
    });
  });

  describe('policy retrieval', () => {
    beforeEach(async () => {
      jest.spyOn(policyManager as any, 'validatePolicy').mockResolvedValue({ valid: true, errors: [] });
      jest.spyOn(policyManager as any, 'savePolicyToFile').mockResolvedValue(undefined);
      jest.spyOn(policyManager as any, 'logPolicyAction').mockResolvedValue(undefined);

      await policyManager.createPolicy(
        'Test Policy 1',
        'package test1\ndefault allow = true'
      );
      await policyManager.createPolicy(
        'Test Policy 2',
        'package test2\ndefault allow = false'
      );
    });

    it('should return all policies', () => {
      const policies = policyManager.getAllPolicies();

      expect(policies).toHaveLength(2);
      expect(policies[0].name).toBe('Test Policy 1');
      expect(policies[1].name).toBe('Test Policy 2');
    });

    it('should return policy by ID', () => {
      const policyId = 'test-uuid-123';
      const policy = policyManager.getPolicy(policyId);

      expect(policy).toBeDefined();
      expect(policy?.name).toBe('Test Policy 1'); // First created policy
    });

    it('should return policy content', () => {
      const policyId = 'test-uuid-123';
      const content = policyManager.getPolicyContent(policyId);

      expect(content).toBe('package test1\ndefault allow = true');
    });

    it('should return policy content for specific version', () => {
      const policyId = 'test-uuid-123';
      const content = policyManager.getPolicyContent(policyId, '1.0.0');

      expect(content).toBe('package test1\ndefault allow = true');
    });

    it('should return undefined for non-existent policy', () => {
      const policy = policyManager.getPolicy('non-existent');
      const content = policyManager.getPolicyContent('non-existent');

      expect(policy).toBeUndefined();
      expect(content).toBeUndefined();
    });
  });
});