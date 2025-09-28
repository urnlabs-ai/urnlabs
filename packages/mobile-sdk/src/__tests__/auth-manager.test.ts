/**
 * Tests for AuthManager
 */

import { AuthManager } from '../auth/auth-manager';
import { UrnlabsHttpClient } from '../http/http-client';
import { MemoryStorageAdapter } from '../utils/storage';
import { AuthTokens, AuthUser, UserCredentials } from '../core/types';

// Mock dependencies
jest.mock('../http/http-client');
jest.mock('../auth/mfa-manager');

describe('AuthManager', () => {
  let authManager: AuthManager;
  let mockHttpClient: jest.Mocked<UrnlabsHttpClient>;
  let mockStorage: MemoryStorageAdapter;

  const mockTokens: AuthTokens = {
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    expiresAt: Date.now() + 3600000, // 1 hour from now
    tokenType: 'Bearer'
  };

  const mockUser: AuthUser = {
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    roles: ['user'],
    permissions: ['read']
  };

  const mockCredentials: UserCredentials = {
    username: 'testuser',
    password: 'password123'
  };

  beforeEach(() => {
    mockHttpClient = new UrnlabsHttpClient({
      baseURL: 'https://api.test.com',
      timeout: 5000,
      headers: {},
      retryAttempts: 1,
      retryDelay: 100
    }) as jest.Mocked<UrnlabsHttpClient>;

    mockStorage = new MemoryStorageAdapter();

    authManager = new AuthManager(
      {
        apiUrl: 'https://api.test.com',
        tokenRefreshThreshold: 300,
        maxRefreshRetries: 3,
        automaticRefresh: true
      },
      mockHttpClient,
      mockStorage
    );

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should successfully authenticate user with valid credentials', async () => {
      // Arrange
      const mockResponse = {
        data: {
          success: true,
          data: {
            user: mockUser,
            tokens: mockTokens
          }
        }
      };

      mockHttpClient.post.mockResolvedValue(mockResponse);

      // Act
      const result = await authManager.login(mockCredentials);

      // Assert
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        'https://api.test.com/auth/login',
        mockCredentials
      );
      expect(result).toEqual({
        user: mockUser,
        tokens: mockTokens
      });
      expect(authManager.isAuthenticated()).toBe(true);
    });

    it('should return MFA challenge when MFA is required', async () => {
      // Arrange
      const mockMFAChallenge = {
        challengeId: 'challenge-123',
        availableMethods: ['totp', 'sms'],
        primaryMethod: 'totp',
        maskedDeliveryTarget: '***-***-1234'
      };

      const mockResponse = {
        data: {
          success: true,
          data: mockMFAChallenge
        }
      };

      mockHttpClient.post.mockResolvedValue(mockResponse);

      // Act
      const result = await authManager.login(mockCredentials);

      // Assert
      expect(result).toEqual(mockMFAChallenge);
      expect(authManager.isAuthenticated()).toBe(false);
    });

    it('should throw error for invalid credentials', async () => {
      // Arrange
      const mockResponse = {
        data: {
          success: false,
          message: 'Invalid credentials'
        }
      };

      mockHttpClient.post.mockResolvedValue(mockResponse);

      // Act & Assert
      await expect(authManager.login(mockCredentials)).rejects.toThrow('Invalid credentials');
      expect(authManager.isAuthenticated()).toBe(false);
    });

    it('should handle network errors', async () => {
      // Arrange
      const networkError = new Error('Network error');
      mockHttpClient.post.mockRejectedValue(networkError);

      // Act & Assert
      await expect(authManager.login(mockCredentials)).rejects.toThrow();
      expect(authManager.isAuthenticated()).toBe(false);
    });
  });

  describe('logout', () => {
    beforeEach(async () => {
      // Set up authenticated state
      const mockResponse = {
        data: {
          success: true,
          data: {
            user: mockUser,
            tokens: mockTokens
          }
        }
      };
      mockHttpClient.post.mockResolvedValue(mockResponse);
      await authManager.login(mockCredentials);
      jest.clearAllMocks();
    });

    it('should successfully logout authenticated user', async () => {
      // Arrange
      const mockLogoutResponse = {
        data: { success: true }
      };
      mockHttpClient.post.mockResolvedValue(mockLogoutResponse);

      // Act
      await authManager.logout();

      // Assert
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        'https://api.test.com/auth/logout',
        { refreshToken: mockTokens.refreshToken }
      );
      expect(authManager.isAuthenticated()).toBe(false);
      expect(authManager.getAuthState().tokens).toBeNull();
      expect(authManager.getAuthState().user).toBeNull();
    });

    it('should clear local state even if server logout fails', async () => {
      // Arrange
      mockHttpClient.post.mockRejectedValue(new Error('Server error'));

      // Act
      await authManager.logout();

      // Assert
      expect(authManager.isAuthenticated()).toBe(false);
      expect(authManager.getAuthState().tokens).toBeNull();
      expect(authManager.getAuthState().user).toBeNull();
    });
  });

  describe('refreshTokens', () => {
    beforeEach(async () => {
      // Set up authenticated state
      const mockResponse = {
        data: {
          success: true,
          data: {
            user: mockUser,
            tokens: mockTokens
          }
        }
      };
      mockHttpClient.post.mockResolvedValue(mockResponse);
      await authManager.login(mockCredentials);
      jest.clearAllMocks();
    });

    it('should successfully refresh tokens', async () => {
      // Arrange
      const newTokens: AuthTokens = {
        ...mockTokens,
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresAt: Date.now() + 3600000
      };

      const mockRefreshResponse = {
        data: {
          success: true,
          data: { tokens: newTokens }
        }
      };

      mockHttpClient.post.mockResolvedValue(mockRefreshResponse);

      // Act
      const result = await authManager.refreshTokens();

      // Assert
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        'https://api.test.com/auth/refresh',
        { refreshToken: mockTokens.refreshToken }
      );
      expect(result).toEqual(newTokens);
      expect(authManager.getAuthState().tokens).toEqual(newTokens);
    });

    it('should handle refresh failure and clear auth state', async () => {
      // Arrange
      const mockRefreshResponse = {
        data: {
          success: false,
          message: 'Invalid refresh token'
        }
      };

      mockHttpClient.post.mockResolvedValue(mockRefreshResponse);

      // Act & Assert
      await expect(authManager.refreshTokens()).rejects.toThrow('Invalid refresh token');
      expect(authManager.isAuthenticated()).toBe(false);
    });

    it('should retry refresh on network failure', async () => {
      // Arrange
      const networkError = new Error('Network error');
      const successResponse = {
        data: {
          success: true,
          data: {
            tokens: {
              ...mockTokens,
              accessToken: 'new-access-token'
            }
          }
        }
      };

      mockHttpClient.post
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(successResponse);

      // Act
      const result = await authManager.refreshTokens();

      // Assert
      expect(mockHttpClient.post).toHaveBeenCalledTimes(3);
      expect(result.accessToken).toBe('new-access-token');
    });
  });

  describe('getValidAccessToken', () => {
    beforeEach(async () => {
      // Set up authenticated state
      const mockResponse = {
        data: {
          success: true,
          data: {
            user: mockUser,
            tokens: mockTokens
          }
        }
      };
      mockHttpClient.post.mockResolvedValue(mockResponse);
      await authManager.login(mockCredentials);
      jest.clearAllMocks();
    });

    it('should return current token if not near expiry', async () => {
      // Act
      const token = await authManager.getValidAccessToken();

      // Assert
      expect(token).toBe(mockTokens.accessToken);
      expect(mockHttpClient.post).not.toHaveBeenCalled();
    });

    it('should refresh token if near expiry', async () => {
      // Arrange - Set up tokens that expire soon
      const expiringTokens: AuthTokens = {
        ...mockTokens,
        expiresAt: Date.now() + 200000 // 200 seconds from now (less than 300 second threshold)
      };

      // Update auth state with expiring tokens
      const authState = authManager.getAuthState();
      authState.tokens = expiringTokens;
      await mockStorage.set('auth_tokens', expiringTokens);

      const newTokens: AuthTokens = {
        ...mockTokens,
        accessToken: 'refreshed-access-token',
        expiresAt: Date.now() + 3600000
      };

      const mockRefreshResponse = {
        data: {
          success: true,
          data: { tokens: newTokens }
        }
      };

      mockHttpClient.post.mockResolvedValue(mockRefreshResponse);

      // Act
      const token = await authManager.getValidAccessToken();

      // Assert
      expect(token).toBe('refreshed-access-token');
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        'https://api.test.com/auth/refresh',
        { refreshToken: expiringTokens.refreshToken }
      );
    });

    it('should throw error if no tokens available', async () => {
      // Arrange - Clear tokens
      await authManager.logout();

      // Act & Assert
      await expect(authManager.getValidAccessToken()).rejects.toThrow(
        'No authentication tokens available'
      );
    });
  });

  describe('restoreAuthState', () => {
    it('should restore valid tokens from storage', async () => {
      // Arrange
      await mockStorage.set('auth_tokens', mockTokens);
      await mockStorage.set('auth_user', mockUser);

      // Act
      await authManager.restoreAuthState();

      // Assert
      expect(authManager.isAuthenticated()).toBe(true);
      expect(authManager.getAuthState().user).toEqual(mockUser);
      expect(authManager.getAuthState().tokens).toEqual(mockTokens);
    });

    it('should clear expired tokens from storage', async () => {
      // Arrange
      const expiredTokens: AuthTokens = {
        ...mockTokens,
        expiresAt: Date.now() - 3600000 // 1 hour ago
      };

      await mockStorage.set('auth_tokens', expiredTokens);
      await mockStorage.set('auth_user', mockUser);

      // Act
      await authManager.restoreAuthState();

      // Assert
      expect(authManager.isAuthenticated()).toBe(false);
      expect(await mockStorage.get('auth_tokens')).toBeNull();
      expect(await mockStorage.get('auth_user')).toBeNull();
    });

    it('should handle corrupted storage data', async () => {
      // Arrange
      await mockStorage.set('auth_tokens', 'invalid-data');
      await mockStorage.set('auth_user', 'invalid-data');

      // Act
      await authManager.restoreAuthState();

      // Assert
      expect(authManager.isAuthenticated()).toBe(false);
    });
  });

  describe('completeMFALogin', () => {
    it('should complete MFA login successfully', async () => {
      // Arrange
      const mfaRequest = {
        method: 'totp' as const,
        code: '123456',
        challengeId: 'challenge-123'
      };

      // Mock MFA verification success
      const mockMFAManager = authManager.getMFAManager();
      jest.spyOn(mockMFAManager, 'verifyMFAChallenge').mockResolvedValue({
        success: true
      });

      // Mock complete login response
      const mockCompleteResponse = {
        data: {
          success: true,
          data: {
            user: mockUser,
            tokens: mockTokens
          }
        }
      };

      mockHttpClient.post.mockResolvedValue(mockCompleteResponse);

      // Act
      const result = await authManager.completeMFALogin(mfaRequest);

      // Assert
      expect(mockMFAManager.verifyMFAChallenge).toHaveBeenCalledWith(mfaRequest);
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        'https://api.test.com/auth/mfa/complete',
        { challengeId: 'challenge-123' }
      );
      expect(result).toEqual({
        user: mockUser,
        tokens: mockTokens
      });
      expect(authManager.isAuthenticated()).toBe(true);
    });

    it('should throw error if MFA verification fails', async () => {
      // Arrange
      const mfaRequest = {
        method: 'totp' as const,
        code: '123456',
        challengeId: 'challenge-123'
      };

      const mockMFAManager = authManager.getMFAManager();
      jest.spyOn(mockMFAManager, 'verifyMFAChallenge').mockResolvedValue({
        success: false,
        remainingAttempts: 2
      });

      // Act & Assert
      await expect(authManager.completeMFALogin(mfaRequest)).rejects.toThrow(
        'MFA verification failed'
      );
      expect(authManager.isAuthenticated()).toBe(false);
    });
  });
});