import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EncryptionService } from '../src/encryption/encryption-service.js';
import type { SecurityConfig } from '../src/types/auth.js';

describe('EncryptionService', () => {
  let encryptionService: EncryptionService;
  let config: SecurityConfig;

  beforeEach(() => {
    // Set up test environment variable
    process.env.ENCRYPTION_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    
    config = {
      jwt: {
        accessTokenSecret: 'test-secret',
        refreshTokenSecret: 'test-secret',
        accessTokenExpiry: '15m',
        refreshTokenExpiry: '7d',
        issuer: 'test',
        audience: 'test'
      },
      encryption: {
        algorithm: 'aes-256-gcm',
        keyLength: 32,
        ivLength: 16
      },
      rateLimit: {
        auth: { windowMs: 900000, maxRequests: 5 },
        api: { windowMs: 900000, maxRequests: 100 },
        upload: { windowMs: 3600000, maxRequests: 10 }
      },
      session: {
        maxActiveSessions: 5,
        inactivityTimeout: 1800000
      },
      password: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        maxAge: 90
      }
    };

    encryptionService = new EncryptionService(config);
  });

  describe('Data Encryption/Decryption', () => {
    it('should encrypt and decrypt data successfully', async () => {
      const originalData = 'sensitive information';
      const context = 'test-context';
      
      const encrypted = await encryptionService.encryptData(originalData, context);
      const decrypted = await encryptionService.decryptData(encrypted, context);
      
      expect(decrypted).toBe(originalData);
      expect(encrypted.encrypted).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.salt).toBeDefined();
      expect(encrypted.algorithm).toBe(config.encryption.algorithm);
    });

    it('should fail to decrypt with wrong context', async () => {
      const originalData = 'sensitive information';
      const context1 = 'context-1';
      const context2 = 'context-2';
      
      const encrypted = await encryptionService.encryptData(originalData, context1);
      
      await expect(encryptionService.decryptData(encrypted, context2))
        .rejects.toThrow('Data decryption failed');
    });

    it('should generate different encrypted values for same data', async () => {
      const originalData = 'sensitive information';
      
      const encrypted1 = await encryptionService.encryptData(originalData);
      const encrypted2 = await encryptionService.encryptData(originalData);
      
      expect(encrypted1.encrypted).not.toBe(encrypted2.encrypted);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      expect(encrypted1.salt).not.toBe(encrypted2.salt);
    });
  });

  describe('File Encryption/Decryption', () => {
    it('should encrypt and decrypt file content', async () => {
      const originalContent = Buffer.from('file content data', 'utf-8');
      const context = 'file-context';
      
      const encrypted = await encryptionService.encryptFile(originalContent, context);
      const decrypted = await encryptionService.decryptFile(encrypted, context);
      
      expect(decrypted).toEqual(originalContent);
    });

    it('should handle binary file content', async () => {
      const originalContent = Buffer.from([0x89, 0x50, 0x4E, 0x47]); // PNG header
      
      const encrypted = await encryptionService.encryptFile(originalContent);
      const decrypted = await encryptionService.decryptFile(encrypted);
      
      expect(decrypted).toEqual(originalContent);
    });
  });

  describe('Hashing Functions', () => {
    it('should hash data consistently', () => {
      const data = 'test data';
      const hash1 = encryptionService.hashData(data);
      const hash2 = encryptionService.hashData(data);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toBeDefined();
      expect(typeof hash1).toBe('string');
    });

    it('should produce different hashes for different data', () => {
      const data1 = 'test data 1';
      const data2 = 'test data 2';
      
      const hash1 = encryptionService.hashData(data1);
      const hash2 = encryptionService.hashData(data2);
      
      expect(hash1).not.toBe(hash2);
    });

    it('should support different hash algorithms', () => {
      const data = 'test data';
      
      const sha256Hash = encryptionService.hashData(data, 'sha256');
      const sha512Hash = encryptionService.hashData(data, 'sha512');
      
      expect(sha256Hash).not.toBe(sha512Hash);
      expect(sha256Hash.length).toBe(64); // SHA256 hex length
      expect(sha512Hash.length).toBe(128); // SHA512 hex length
    });
  });

  describe('Salt-based Hashing', () => {
    it('should hash with salt and verify correctly', async () => {
      const data = 'password123';
      
      const result = await encryptionService.hashWithSalt(data);
      const isValid = await encryptionService.verifyHashWithSalt(data, result.hash, result.salt, result.iterations);
      
      expect(isValid).toBe(true);
      expect(result.hash).toBeDefined();
      expect(result.salt).toBeDefined();
      expect(result.iterations).toBe(100000);
    });

    it('should reject invalid password with salt verification', async () => {
      const correctPassword = 'password123';
      const wrongPassword = 'wrongpassword';
      
      const result = await encryptionService.hashWithSalt(correctPassword);
      const isValid = await encryptionService.verifyHashWithSalt(wrongPassword, result.hash, result.salt, result.iterations);
      
      expect(isValid).toBe(false);
    });

    it('should use provided salt consistently', async () => {
      const data = 'password123';
      const customSalt = Buffer.from('customsaltvalue123456789012345678901234567890');
      
      const result1 = await encryptionService.hashWithSalt(data, customSalt);
      const result2 = await encryptionService.hashWithSalt(data, customSalt);
      
      expect(result1.hash).toBe(result2.hash);
      expect(result1.salt).toBe(result2.salt);
    });
  });

  describe('Token Generation', () => {
    it('should generate secure random tokens', () => {
      const token1 = encryptionService.generateSecureToken();
      const token2 = encryptionService.generateSecureToken();
      
      expect(token1).not.toBe(token2);
      expect(token1.length).toBe(64); // 32 bytes as hex
      expect(token2.length).toBe(64);
      expect(/^[a-f0-9]+$/i.test(token1)).toBe(true);
      expect(/^[a-f0-9]+$/i.test(token2)).toBe(true);
    });

    it('should generate tokens of specified length', () => {
      const token16 = encryptionService.generateSecureToken(16);
      const token64 = encryptionService.generateSecureToken(64);
      
      expect(token16.length).toBe(32); // 16 bytes as hex
      expect(token64.length).toBe(128); // 64 bytes as hex
    });

    it('should generate secure random bytes', () => {
      const bytes1 = encryptionService.generateSecureBytes(16);
      const bytes2 = encryptionService.generateSecureBytes(16);
      
      expect(bytes1).not.toEqual(bytes2);
      expect(bytes1.length).toBe(16);
      expect(bytes2.length).toBe(16);
      expect(Buffer.isBuffer(bytes1)).toBe(true);
      expect(Buffer.isBuffer(bytes2)).toBe(true);
    });
  });

  describe('HMAC Functions', () => {
    it('should create and verify HMAC signatures', () => {
      const data = 'important data';
      const secret = 'hmac-secret-key';
      
      const signature = encryptionService.createHMAC(data, secret);
      const isValid = encryptionService.verifyHMAC(data, signature, secret);
      
      expect(isValid).toBe(true);
      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
    });

    it('should reject invalid HMAC signatures', () => {
      const data = 'important data';
      const wrongData = 'tampered data';
      const secret = 'hmac-secret-key';
      
      const signature = encryptionService.createHMAC(data, secret);
      const isValid = encryptionService.verifyHMAC(wrongData, signature, secret);
      
      expect(isValid).toBe(false);
    });

    it('should reject HMAC with wrong secret', () => {
      const data = 'important data';
      const secret1 = 'secret-1';
      const secret2 = 'secret-2';
      
      const signature = encryptionService.createHMAC(data, secret1);
      const isValid = encryptionService.verifyHMAC(data, signature, secret2);
      
      expect(isValid).toBe(false);
    });
  });

  describe('Database Field Encryption', () => {
    it('should encrypt and decrypt database fields', async () => {
      const originalValue = { sensitive: 'data', number: 123 };
      const fieldName = 'user_data';
      const tableId = 'users';
      
      const encrypted = await encryptionService.encryptDatabaseField(originalValue, fieldName, tableId);
      const decrypted = await encryptionService.decryptDatabaseField(encrypted, fieldName, tableId);
      
      expect(decrypted).toEqual(originalValue);
      expect(typeof encrypted).toBe('string');
    });

    it('should fail to decrypt with wrong field/table context', async () => {
      const originalValue = { sensitive: 'data' };
      const fieldName1 = 'field1';
      const fieldName2 = 'field2';
      const tableId = 'table1';
      
      const encrypted = await encryptionService.encryptDatabaseField(originalValue, fieldName1, tableId);
      
      await expect(encryptionService.decryptDatabaseField(encrypted, fieldName2, tableId))
        .rejects.toThrow('Database field decryption failed');
    });
  });

  describe('Static Utilities', () => {
    it('should generate valid master keys', () => {
      const masterKey = EncryptionService.generateMasterKey();
      
      expect(masterKey).toBeDefined();
      expect(typeof masterKey).toBe('string');
      expect(masterKey.length).toBe(64); // 32 bytes as hex
      expect(/^[a-f0-9]+$/i.test(masterKey)).toBe(true);
    });

    it('should validate master key format', () => {
      const validKey = EncryptionService.generateMasterKey();
      const invalidKey1 = 'too-short';
      const invalidKey2 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdeg'; // invalid char
      
      expect(EncryptionService.validateMasterKey(validKey)).toBe(true);
      expect(EncryptionService.validateMasterKey(invalidKey1)).toBe(false);
      expect(EncryptionService.validateMasterKey(invalidKey2)).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should throw error for missing master key', () => {
      delete process.env.ENCRYPTION_MASTER_KEY;
      
      expect(() => new EncryptionService(config))
        .toThrow('ENCRYPTION_MASTER_KEY environment variable is required');
    });

    it('should throw error for invalid master key length', () => {
      process.env.ENCRYPTION_MASTER_KEY = 'too-short';
      
      expect(() => new EncryptionService(config))
        .toThrow('Master key must be 32 bytes');
    });

    it('should handle encryption errors gracefully', async () => {
      // Mock a failure scenario by using invalid input
      const invalidConfig = { ...config };
      invalidConfig.encryption.algorithm = 'invalid-algorithm' as any;
      
      // This would require more complex mocking to test actual encryption failures
      // For now, we ensure the service handles errors properly by checking error messages
      await expect(encryptionService.encryptData('test'))
        .rejects.toThrow('Data encryption failed');
    });
  });
});