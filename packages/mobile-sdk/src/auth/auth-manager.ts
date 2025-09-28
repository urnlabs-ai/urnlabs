/**
 * Authentication manager with JWT token handling and automatic refresh
 */

import { jwtDecode } from 'jose';
import {
  AuthTokens,
  UserCredentials,
  AuthUser,
  AuthState,
  HttpClient,
  StorageAdapter,
  SDKError,
  SDKErrorCode,
  ApiResponse
} from '../core/types';
import { MFAManager, MFAChallengeResponse, MFAVerificationRequest } from './mfa-manager';

export interface AuthManagerConfig {
  apiUrl: string;
  tokenRefreshThreshold: number; // Refresh when token expires within this many seconds
  maxRefreshRetries: number;
  automaticRefresh: boolean;
}

export interface LoginResponse {
  user: AuthUser;
  tokens: AuthTokens;
}

export interface RefreshTokenResponse {
  tokens: AuthTokens;
}

export class AuthManager {
  private config: AuthManagerConfig;
  private httpClient: HttpClient;
  private storage: StorageAdapter;
  private authState: AuthState;
  private refreshPromise: Promise<AuthTokens> | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private mfaManager: MFAManager;

  constructor(
    config: Partial<AuthManagerConfig>,
    httpClient: HttpClient,
    storage: StorageAdapter
  ) {
    this.config = {
      apiUrl: 'https://api.urnlabs.com',
      tokenRefreshThreshold: 300, // 5 minutes
      maxRefreshRetries: 3,
      automaticRefresh: true,
      ...config
    };
    this.httpClient = httpClient;
    this.storage = storage;
    this.authState = {
      isAuthenticated: false,
      user: null,
      tokens: null,
      isLoading: false,
      error: null
    };
    
    // Initialize MFA manager
    this.mfaManager = new MFAManager(
      { apiUrl: this.config.apiUrl },
      httpClient,
      storage
    );
  }

  /**
   * Authenticate user with credentials
   */
  public async login(credentials: UserCredentials): Promise<LoginResponse | MFAChallengeResponse> {
    try {
      this.setLoading(true);
      this.clearError();

      const response = await this.httpClient.post<ApiResponse<LoginResponse | MFAChallengeResponse>>(
        `${this.config.apiUrl}/auth/login`,
        credentials
      );

      if (!response.data.success) {
        throw this.createAuthError(
          'AUTH_ERROR',
          response.data.message || 'Login failed',
          401
        );
      }

      const responseData = response.data.data;

      // Check if MFA challenge is required
      if ('challengeId' in responseData) {
        // This is an MFA challenge response
        return responseData as MFAChallengeResponse;
      }

      // This is a successful login response
      const { user, tokens } = responseData as LoginResponse;

      // Validate tokens
      this.validateTokens(tokens);

      // Update auth state
      await this.updateAuthState(user, tokens);

      // Set up automatic refresh if enabled
      if (this.config.automaticRefresh) {
        this.scheduleTokenRefresh(tokens);
      }

      return { user, tokens };
    } catch (error) {
      const authError = this.handleAuthError(error);
      this.setError(authError.message);
      throw authError;
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * Logout user and clear session
   */
  public async logout(): Promise<void> {
    try {
      this.setLoading(true);

      // Call logout endpoint if authenticated
      if (this.authState.isAuthenticated && this.authState.tokens) {
        try {
          await this.httpClient.post(`${this.config.apiUrl}/auth/logout`, {
            refreshToken: this.authState.tokens.refreshToken
          });
        } catch (error) {
          // Log error but don't throw - we still want to clear local state
          console.warn('Failed to logout on server:', error);
        }
      }

      // Clear local auth state
      await this.clearAuthState();

      // Clear refresh timer
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
        this.refreshTimer = null;
      }

    } finally {
      this.setLoading(false);
    }
  }

  /**
   * Refresh authentication tokens
   */
  public async refreshTokens(): Promise<AuthTokens> {
    // Prevent multiple simultaneous refresh requests
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    if (!this.authState.tokens?.refreshToken) {
      throw this.createAuthError('AUTH_ERROR', 'No refresh token available');
    }

    this.refreshPromise = this.performTokenRefresh();

    try {
      const tokens = await this.refreshPromise;
      this.scheduleTokenRefresh(tokens);
      return tokens;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async performTokenRefresh(): Promise<AuthTokens> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRefreshRetries; attempt++) {
      try {
        const response = await this.httpClient.post<ApiResponse<RefreshTokenResponse>>(
          `${this.config.apiUrl}/auth/refresh`,
          {
            refreshToken: this.authState.tokens!.refreshToken
          }
        );

        if (!response.data.success) {
          throw this.createAuthError(
            'AUTH_ERROR',
            response.data.message || 'Token refresh failed',
            401
          );
        }

        const { tokens } = response.data.data;
        this.validateTokens(tokens);

        // Update stored tokens
        const updatedAuthState = {
          ...this.authState,
          tokens,
          error: null
        };
        this.authState = updatedAuthState;
        await this.storage.set('auth_tokens', tokens);

        return tokens;

      } catch (error) {
        lastError = error as Error;

        if (attempt < this.config.maxRefreshRetries) {
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    // All refresh attempts failed
    await this.clearAuthState();
    throw this.handleAuthError(lastError!);
  }

  /**
   * Get current authentication state
   */
  public getAuthState(): AuthState {
    return { ...this.authState };
  }

  /**
   * Check if user is authenticated
   */
  public isAuthenticated(): boolean {
    return this.authState.isAuthenticated &&
           this.authState.tokens !== null &&
           this.authState.tokens.expiresAt > Date.now();
  }

  /**
   * Get valid access token (refreshes if needed)
   */
  public async getValidAccessToken(): Promise<string> {
    if (!this.authState.tokens) {
      throw this.createAuthError('AUTH_ERROR', 'No authentication tokens available');
    }

    // Check if token needs refresh
    const timeUntilExpiry = this.authState.tokens.expiresAt - Date.now();
    const shouldRefresh = timeUntilExpiry <= (this.config.tokenRefreshThreshold * 1000);

    if (shouldRefresh) {
      const refreshedTokens = await this.refreshTokens();
      return refreshedTokens.accessToken;
    }

    return this.authState.tokens.accessToken;
  }

  /**
   * Complete MFA verification and finish login
   */
  public async completeMFALogin(verificationRequest: MFAVerificationRequest): Promise<LoginResponse> {
    try {
      this.setLoading(true);
      this.clearError();

      const verificationResponse = await this.mfaManager.verifyMFAChallenge(verificationRequest);

      if (!verificationResponse.success) {
        throw this.createAuthError(
          'AUTH_ERROR',
          'MFA verification failed'
        );
      }

      // Get tokens after successful MFA verification
      const response = await this.httpClient.post<ApiResponse<LoginResponse>>(
        `${this.config.apiUrl}/auth/mfa/complete`,
        { challengeId: verificationRequest.challengeId }
      );

      if (!response.data.success) {
        throw this.createAuthError(
          'AUTH_ERROR',
          response.data.message || 'Failed to complete MFA login'
        );
      }

      const { user, tokens } = response.data.data;

      // Validate tokens
      this.validateTokens(tokens);

      // Update auth state
      await this.updateAuthState(user, tokens);

      // Set up automatic refresh if enabled
      if (this.config.automaticRefresh) {
        this.scheduleTokenRefresh(tokens);
      }

      return { user, tokens };
    } catch (error) {
      const authError = this.handleAuthError(error);
      this.setError(authError.message);
      throw authError;
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * Get MFA manager instance
   */
  public getMFAManager(): MFAManager {
    return this.mfaManager;
  }

  /**
   * Restore authentication state from storage
   */
  public async restoreAuthState(): Promise<void> {
    try {
      const storedTokens = await this.storage.get<AuthTokens>('auth_tokens');
      const storedUser = await this.storage.get<AuthUser>('auth_user');

      if (storedTokens && storedUser) {
        // Check if tokens are still valid
        if (storedTokens.expiresAt > Date.now()) {
          this.authState = {
            isAuthenticated: true,
            user: storedUser,
            tokens: storedTokens,
            isLoading: false,
            error: null
          };

          // Set up automatic refresh
          if (this.config.automaticRefresh) {
            this.scheduleTokenRefresh(storedTokens);
          }
        } else {
          // Tokens expired, try to refresh
          this.authState.tokens = storedTokens;
          try {
            await this.refreshTokens();
          } catch (error) {
            await this.clearAuthState();
          }
        }
      }
    } catch (error) {
      console.error('Failed to restore auth state:', error);
      await this.clearAuthState();
    }
  }

  private async updateAuthState(user: AuthUser, tokens: AuthTokens): Promise<void> {
    this.authState = {
      isAuthenticated: true,
      user,
      tokens,
      isLoading: false,
      error: null
    };

    // Save to storage
    await this.storage.set('auth_tokens', tokens);
    await this.storage.set('auth_user', user);
  }

  private async clearAuthState(): Promise<void> {
    this.authState = {
      isAuthenticated: false,
      user: null,
      tokens: null,
      isLoading: false,
      error: null
    };

    // Clear storage
    await this.storage.remove('auth_tokens');
    await this.storage.remove('auth_user');
  }

  private setLoading(loading: boolean): void {
    this.authState = { ...this.authState, isLoading: loading };
  }

  private setError(error: string | null): void {
    this.authState = { ...this.authState, error };
  }

  private clearError(): void {
    this.setError(null);
  }

  private validateTokens(tokens: AuthTokens): void {
    if (!tokens.accessToken || !tokens.refreshToken) {
      throw this.createAuthError('AUTH_ERROR', 'Invalid tokens received');
    }

    if (tokens.expiresAt <= Date.now()) {
      throw this.createAuthError('AUTH_ERROR', 'Received expired tokens');
    }
  }

  private scheduleTokenRefresh(tokens: AuthTokens): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    const timeUntilRefresh = tokens.expiresAt - Date.now() - (this.config.tokenRefreshThreshold * 1000);

    if (timeUntilRefresh > 0) {
      this.refreshTimer = setTimeout(async () => {
        try {
          await this.refreshTokens();
        } catch (error) {
          console.error('Automatic token refresh failed:', error);
        }
      }, timeUntilRefresh);
    }
  }

  private createAuthError(
    code: SDKErrorCode,
    message: string,
    statusCode?: number,
    details?: Record<string, any>
  ): SDKError {
    const error = new Error(message) as SDKError;
    error.name = 'AuthError';
    error.code = code;
    error.statusCode = statusCode;
    error.details = details;
    error.timestamp = new Date().toISOString();
    return error;
  }

  private handleAuthError(error: any): SDKError {
    if (error.code && error.name === 'AuthError') {
      return error;
    }

    if (error.response?.status === 401) {
      return this.createAuthError(
        'AUTH_ERROR',
        'Authentication failed',
        401,
        { originalError: error.message }
      );
    }

    if (error.response?.status === 403) {
      return this.createAuthError(
        'PERMISSION_ERROR',
        'Access denied',
        403,
        { originalError: error.message }
      );
    }

    return this.createAuthError(
      'UNKNOWN_ERROR',
      error.message || 'Unknown authentication error',
      error.response?.status,
      { originalError: error }
    );
  }
}