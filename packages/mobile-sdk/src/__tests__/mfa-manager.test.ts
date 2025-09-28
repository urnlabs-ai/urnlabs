/**
 * Tests for MFAManager
 */

import { MFAManager } from '../auth/mfa-manager';
import { UrnlabsHttpClient } from '../http/http-client';
import { MemoryStorageAdapter } from '../utils/storage';

// Mock dependencies
jest.mock('../http/http-client');

describe('MFAManager', () => {
  let mfaManager: MFAManager;
  let mockHttpClient: jest.Mocked<UrnlabsHttpClient>;
  let mockStorage: MemoryStorageAdapter;

  beforeEach(() => {
    mockHttpClient = new UrnlabsHttpClient({
      baseURL: 'https://api.test.com',
      timeout: 5000,
      headers: {},
      retryAttempts: 1,
      retryDelay: 100
    }) as jest.Mocked<UrnlabsHttpClient>;

    mockStorage = new MemoryStorageAdapter();

    mfaManager = new MFAManager(
      {
        apiUrl: 'https://api.test.com',
        supportedMethods: ['totp', 'sms', 'email', 'backup_codes'],
        defaultMethod: 'totp',
        codeLength: 6,
        codeValidityMs: 300000
      },
      mockHttpClient,
      mockStorage
    );

    jest.clearAllMocks();
  });

  describe('getMFAStatus', () => {
    it('should get MFA status successfully', async () => {
      // Arrange
      const mockStatus = {
        isEnabled: true,
        enabledMethods: ['totp', 'backup_codes'],
        primaryMethod: 'totp',
        backupCodesRemaining: 8,
        lastUsed: '2024-01-01T12:00:00Z'
      };

      const mockResponse = {
        data: {
          success: true,
          data: mockStatus
        }
      };

      mockHttpClient.get.mockResolvedValue(mockResponse);

      // Act
      const result = await mfaManager.getMFAStatus();

      // Assert
      expect(mockHttpClient.get).toHaveBeenCalledWith('https://api.test.com/auth/mfa/status');
      expect(result).toEqual(mockStatus);
    });

    it('should handle MFA status error', async () => {
      // Arrange
      const mockResponse = {
        data: {
          success: false,
          message: 'Failed to get MFA status'
        }
      };

      mockHttpClient.get.mockResolvedValue(mockResponse);

      // Act & Assert
      await expect(mfaManager.getMFAStatus()).rejects.toThrow('Failed to get MFA status');
    });
  });

  describe('setupMFA', () => {
    it('should setup TOTP MFA successfully', async () => {
      // Arrange
      const setupRequest = {
        method: 'totp' as const
      };

      const mockSetupResponse = {
        method: 'totp' as const,
        secret: 'JBSWY3DPEHPK3PXP',
        qrCode: 'data:image/png;base64,iVBORw0KGgo...',
        setupToken: 'setup-token-123'
      };

      const mockResponse = {
        data: {
          success: true,
          data: mockSetupResponse
        }
      };

      mockHttpClient.post.mockResolvedValue(mockResponse);

      // Act
      const result = await mfaManager.setupMFA(setupRequest);

      // Assert
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        'https://api.test.com/auth/mfa/setup',
        setupRequest
      );
      expect(result).toEqual(mockSetupResponse);

      // Check that setup token is stored
      const storedSetup = await mockStorage.get('mfa_setup_token');
      expect(storedSetup).toEqual({
        token: 'setup-token-123',
        method: 'totp',
        expiresAt: expect.any(Number)
      });
    });

    it('should setup SMS MFA successfully', async () => {
      // Arrange
      const setupRequest = {
        method: 'sms' as const,
        phoneNumber: '+1234567890'
      };

      const mockSetupResponse = {
        method: 'sms' as const,
        setupToken: 'setup-token-123'
      };

      const mockResponse = {
        data: {
          success: true,
          data: mockSetupResponse
        }
      };

      mockHttpClient.post.mockResolvedValue(mockResponse);

      // Act
      const result = await mfaManager.setupMFA(setupRequest);

      // Assert
      expect(result).toEqual(mockSetupResponse);
    });

    it('should reject unsupported MFA method', async () => {
      // Arrange
      const setupRequest = {
        method: 'push' as any // unsupported method
      };

      // Act & Assert
      await expect(mfaManager.setupMFA(setupRequest)).rejects.toThrow(
        'MFA method push is not supported'
      );
    });

    it('should reject SMS setup without phone number', async () => {
      // Arrange
      const setupRequest = {
        method: 'sms' as const
        // missing phoneNumber
      };

      // Act & Assert
      await expect(mfaManager.setupMFA(setupRequest)).rejects.toThrow(
        'Phone number is required for SMS MFA setup'
      );
    });
  });

  describe('verifyMFASetup', () => {
    beforeEach(async () => {
      // Set up stored setup token
      await mockStorage.set('mfa_setup_token', {
        token: 'setup-token-123',
        method: 'totp',
        expiresAt: Date.now() + 300000
      });
    });

    it('should verify MFA setup successfully', async () => {
      // Arrange
      const verificationRequest = {
        method: 'totp' as const,
        code: '123456'
      };

      const mockVerificationResponse = {
        success: true
      };

      const mockResponse = {
        data: {
          success: true,
          data: mockVerificationResponse
        }
      };

      mockHttpClient.post.mockResolvedValue(mockResponse);

      // Act
      const result = await mfaManager.verifyMFASetup(verificationRequest);

      // Assert
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        'https://api.test.com/auth/mfa/verify-setup',
        {
          ...verificationRequest,
          setupToken: 'setup-token-123'
        }
      );
      expect(result).toEqual(mockVerificationResponse);

      // Check that setup token is cleared
      const storedSetup = await mockStorage.get('mfa_setup_token');
      expect(storedSetup).toBeNull();
    });

    it('should handle expired setup session', async () => {
      // Arrange
      await mockStorage.set('mfa_setup_token', {
        token: 'setup-token-123',
        method: 'totp',
        expiresAt: Date.now() - 1000 // expired
      });

      const verificationRequest = {
        method: 'totp' as const,
        code: '123456'
      };

      // Act & Assert
      await expect(mfaManager.verifyMFASetup(verificationRequest)).rejects.toThrow(
        'MFA setup session expired. Please restart setup.'
      );
    });
  });

  describe('initiateMFAChallenge', () => {
    it('should initiate MFA challenge successfully', async () => {
      // Arrange
      const challengeRequest = {
        username: 'testuser',
        password: 'password123',
        preferredMethod: 'totp' as const
      };

      const mockChallengeResponse = {
        challengeId: 'challenge-123',
        availableMethods: ['totp', 'backup_codes'],
        primaryMethod: 'totp' as const,
        maskedDeliveryTarget: '***-***-1234'
      };

      const mockResponse = {
        data: {
          success: true,
          data: mockChallengeResponse
        }
      };

      mockHttpClient.post.mockResolvedValue(mockResponse);

      // Act
      const result = await mfaManager.initiateMFAChallenge(challengeRequest);

      // Assert
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        'https://api.test.com/auth/mfa/challenge',
        challengeRequest
      );
      expect(result).toEqual(mockChallengeResponse);

      // Check that challenge is stored
      const storedChallenge = await mockStorage.get('mfa_challenge');
      expect(storedChallenge).toEqual({
        challengeId: 'challenge-123',
        availableMethods: ['totp', 'backup_codes'],
        expiresAt: expect.any(Number)
      });
    });
  });

  describe('verifyMFAChallenge', () => {
    beforeEach(async () => {
      // Set up stored challenge
      await mockStorage.set('mfa_challenge', {
        challengeId: 'challenge-123',
        availableMethods: ['totp', 'backup_codes'],
        expiresAt: Date.now() + 300000
      });
    });

    it('should verify MFA challenge successfully', async () => {
      // Arrange
      const verificationRequest = {
        method: 'totp' as const,
        code: '123456'
      };

      const mockVerificationResponse = {
        success: true
      };

      const mockResponse = {
        data: {
          success: true,
          data: mockVerificationResponse
        }
      };

      mockHttpClient.post.mockResolvedValue(mockResponse);

      // Act
      const result = await mfaManager.verifyMFAChallenge(verificationRequest);

      // Assert
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        'https://api.test.com/auth/mfa/verify-challenge',
        {
          ...verificationRequest,
          challengeId: 'challenge-123'
        }
      );
      expect(result).toEqual(mockVerificationResponse);

      // Check that challenge is cleared
      const storedChallenge = await mockStorage.get('mfa_challenge');
      expect(storedChallenge).toBeNull();
    });

    it('should handle failed MFA verification', async () => {
      // Arrange
      const verificationRequest = {
        method: 'totp' as const,
        code: '123456'
      };

      const mockVerificationResponse = {
        success: false,
        remainingAttempts: 2
      };

      const mockResponse = {
        data: {
          success: true,
          data: mockVerificationResponse
        }
      };

      mockHttpClient.post.mockResolvedValue(mockResponse);

      // Act
      const result = await mfaManager.verifyMFAChallenge(verificationRequest);

      // Assert
      expect(result).toEqual(mockVerificationResponse);

      // Check that challenge is NOT cleared on failure
      const storedChallenge = await mockStorage.get('mfa_challenge');
      expect(storedChallenge).toBeTruthy();
    });
  });

  describe('validateMFACode', () => {
    it('should validate TOTP code format', () => {
      const result = mfaManager.validateMFACode('123456', 'totp');
      expect(result.isValid).toBe(true);
    });

    it('should reject TOTP code with wrong length', () => {
      const result = mfaManager.validateMFACode('12345', 'totp');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('MFA code must be 6 digits');
    });

    it('should reject TOTP code with non-numeric characters', () => {
      const result = mfaManager.validateMFACode('12345a', 'totp');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('MFA code must contain only numbers');
    });

    it('should validate backup code format', () => {
      const result = mfaManager.validateMFACode('ABCD1234', 'backup_codes');
      expect(result.isValid).toBe(true);
    });

    it('should reject invalid backup code format', () => {
      const result = mfaManager.validateMFACode('abc', 'backup_codes');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid backup code format');
    });

    it('should reject empty code', () => {
      const result = mfaManager.validateMFACode('', 'totp');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('MFA code is required');
    });
  });

  describe('resendMFACode', () => {
    beforeEach(async () => {
      await mockStorage.set('mfa_challenge', {
        challengeId: 'challenge-123',
        availableMethods: ['sms', 'email'],
        expiresAt: Date.now() + 300000
      });
    });

    it('should resend SMS code successfully', async () => {
      // Arrange
      const mockResponse = {
        data: { success: true }
      };

      mockHttpClient.post.mockResolvedValue(mockResponse);

      // Act
      await mfaManager.resendMFACode('sms');

      // Assert
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        'https://api.test.com/auth/mfa/challenge/resend',
        {
          challengeId: 'challenge-123',
          method: 'sms'
        }
      );
    });

    it('should reject resend for unsupported method', async () => {
      // Act & Assert
      await expect(mfaManager.resendMFACode('totp')).rejects.toThrow(
        'Resend is not supported for method: totp'
      );
    });

    it('should handle no active session', async () => {
      // Arrange
      await mockStorage.clear();

      // Act & Assert
      await expect(mfaManager.resendMFACode('sms')).rejects.toThrow(
        'No active MFA session found'
      );
    });
  });

  describe('utility methods', () => {
    it('should check if method is supported', () => {
      expect(mfaManager.isMethodSupported('totp')).toBe(true);
      expect(mfaManager.isMethodSupported('push' as any)).toBe(false);
    });

    it('should get supported methods', () => {
      const methods = mfaManager.getSupportedMethods();
      expect(methods).toEqual(['totp', 'sms', 'email', 'backup_codes']);
    });
  });
});