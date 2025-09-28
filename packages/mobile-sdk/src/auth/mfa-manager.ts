/**
 * Multi-Factor Authentication (MFA) manager
 */

import {
  HttpClient,
  StorageAdapter,
  SDKError,
  SDKErrorCode,
  ApiResponse
} from '../core/types';

export interface MFAConfig {
  apiUrl: string;
  supportedMethods: MFAMethod[];
  defaultMethod?: MFAMethod;
  codeLength: number;
  codeValidityMs: number;
}

export type MFAMethod = 'totp' | 'sms' | 'email' | 'push' | 'backup_codes';

export interface MFASetupRequest {
  method: MFAMethod;
  phoneNumber?: string; // for SMS
  email?: string; // for email
}

export interface MFASetupResponse {
  method: MFAMethod;
  secret?: string; // for TOTP
  qrCode?: string; // for TOTP
  backupCodes?: string[]; // backup codes
  setupToken: string; // temporary token for verification
}

export interface MFAVerificationRequest {
  method: MFAMethod;
  code: string;
  setupToken?: string; // for setup verification
  challengeId?: string; // for login verification
}

export interface MFAVerificationResponse {
  success: boolean;
  remainingAttempts?: number;
  nextMethod?: MFAMethod;
}

export interface MFAChallengeRequest {
  username: string;
  password: string;
  preferredMethod?: MFAMethod;
}

export interface MFAChallengeResponse {
  challengeId: string;
  availableMethods: MFAMethod[];
  primaryMethod: MFAMethod;
  maskedDeliveryTarget?: string; // e.g., "***-***-1234" for SMS
}

export interface MFAStatus {
  isEnabled: boolean;
  enabledMethods: MFAMethod[];
  primaryMethod?: MFAMethod;
  backupCodesRemaining?: number;
  lastUsed?: string;
}

export class MFAManager {
  private config: MFAConfig;
  private httpClient: HttpClient;
  private storage: StorageAdapter;

  constructor(
    config: Partial<MFAConfig>,
    httpClient: HttpClient,
    storage: StorageAdapter
  ) {
    this.config = {
      apiUrl: 'https://api.urnlabs.com',
      supportedMethods: ['totp', 'sms', 'email', 'backup_codes'],
      defaultMethod: 'totp',
      codeLength: 6,
      codeValidityMs: 300000, // 5 minutes
      ...config
    };
    this.httpClient = httpClient;
    this.storage = storage;
  }

  /**
   * Get current MFA status for the authenticated user
   */
  public async getMFAStatus(): Promise<MFAStatus> {
    try {
      const response = await this.httpClient.get<ApiResponse<MFAStatus>>(
        `${this.config.apiUrl}/auth/mfa/status`
      );

      if (!response.data.success) {
        throw this.createMFAError(
          'AUTH_ERROR',
          response.data.message || 'Failed to get MFA status'
        );
      }

      return response.data.data;
    } catch (error) {
      throw this.handleMFAError(error);
    }
  }

  /**
   * Initiate MFA setup for a specific method
   */
  public async setupMFA(request: MFASetupRequest): Promise<MFASetupResponse> {
    try {
      // Validate method is supported
      if (!this.config.supportedMethods.includes(request.method)) {
        throw this.createMFAError(
          'VALIDATION_ERROR',
          `MFA method ${request.method} is not supported`
        );
      }

      // Validate required fields based on method
      this.validateSetupRequest(request);

      const response = await this.httpClient.post<ApiResponse<MFASetupResponse>>(
        `${this.config.apiUrl}/auth/mfa/setup`,
        request
      );

      if (!response.data.success) {
        throw this.createMFAError(
          'AUTH_ERROR',
          response.data.message || 'Failed to setup MFA'
        );
      }

      const setupResponse = response.data.data;

      // Store setup token temporarily for verification
      if (setupResponse.setupToken) {
        await this.storage.set('mfa_setup_token', {
          token: setupResponse.setupToken,
          method: request.method,
          expiresAt: Date.now() + this.config.codeValidityMs
        });
      }

      return setupResponse;
    } catch (error) {
      throw this.handleMFAError(error);
    }
  }

  /**
   * Verify MFA setup with the provided code
   */
  public async verifyMFASetup(request: MFAVerificationRequest): Promise<MFAVerificationResponse> {
    try {
      // Get stored setup token if not provided
      if (!request.setupToken) {
        const storedSetup = await this.storage.get('mfa_setup_token');
        if (!storedSetup || storedSetup.expiresAt < Date.now()) {
          throw this.createMFAError(
            'AUTH_ERROR',
            'MFA setup session expired. Please restart setup.'
          );
        }
        request.setupToken = storedSetup.token;
      }

      const response = await this.httpClient.post<ApiResponse<MFAVerificationResponse>>(
        `${this.config.apiUrl}/auth/mfa/verify-setup`,
        request
      );

      if (!response.data.success) {
        throw this.createMFAError(
          'AUTH_ERROR',
          response.data.message || 'MFA setup verification failed'
        );
      }

      const verificationResponse = response.data.data;

      // Clear setup token on successful verification
      if (verificationResponse.success) {
        await this.storage.remove('mfa_setup_token');
      }

      return verificationResponse;
    } catch (error) {
      throw this.handleMFAError(error);
    }
  }

  /**
   * Initiate MFA challenge during login
   */
  public async initiateMFAChallenge(request: MFAChallengeRequest): Promise<MFAChallengeResponse> {
    try {
      const response = await this.httpClient.post<ApiResponse<MFAChallengeResponse>>(
        `${this.config.apiUrl}/auth/mfa/challenge`,
        request
      );

      if (!response.data.success) {
        throw this.createMFAError(
          'AUTH_ERROR',
          response.data.message || 'Failed to initiate MFA challenge'
        );
      }

      const challengeResponse = response.data.data;

      // Store challenge ID temporarily
      await this.storage.set('mfa_challenge', {
        challengeId: challengeResponse.challengeId,
        availableMethods: challengeResponse.availableMethods,
        expiresAt: Date.now() + this.config.codeValidityMs
      });

      return challengeResponse;
    } catch (error) {
      throw this.handleMFAError(error);
    }
  }

  /**
   * Verify MFA challenge code during login
   */
  public async verifyMFAChallenge(request: MFAVerificationRequest): Promise<MFAVerificationResponse> {
    try {
      // Get stored challenge ID if not provided
      if (!request.challengeId) {
        const storedChallenge = await this.storage.get('mfa_challenge');
        if (!storedChallenge || storedChallenge.expiresAt < Date.now()) {
          throw this.createMFAError(
            'AUTH_ERROR',
            'MFA challenge session expired. Please restart login.'
          );
        }
        request.challengeId = storedChallenge.challengeId;
      }

      const response = await this.httpClient.post<ApiResponse<MFAVerificationResponse>>(
        `${this.config.apiUrl}/auth/mfa/verify-challenge`,
        request
      );

      if (!response.data.success) {
        throw this.createMFAError(
          'AUTH_ERROR',
          response.data.message || 'MFA verification failed'
        );
      }

      const verificationResponse = response.data.data;

      // Clear challenge on successful verification
      if (verificationResponse.success) {
        await this.storage.remove('mfa_challenge');
      }

      return verificationResponse;
    } catch (error) {
      throw this.handleMFAError(error);
    }
  }

  /**
   * Disable MFA for a specific method
   */
  public async disableMFA(method: MFAMethod, verificationCode: string): Promise<void> {
    try {
      const response = await this.httpClient.post<ApiResponse<void>>(
        `${this.config.apiUrl}/auth/mfa/disable`,
        { method, verificationCode }
      );

      if (!response.data.success) {
        throw this.createMFAError(
          'AUTH_ERROR',
          response.data.message || 'Failed to disable MFA'
        );
      }
    } catch (error) {
      throw this.handleMFAError(error);
    }
  }

  /**
   * Generate new backup codes
   */
  public async generateBackupCodes(verificationCode: string): Promise<string[]> {
    try {
      const response = await this.httpClient.post<ApiResponse<{ backupCodes: string[] }>>(
        `${this.config.apiUrl}/auth/mfa/backup-codes/generate`,
        { verificationCode }
      );

      if (!response.data.success) {
        throw this.createMFAError(
          'AUTH_ERROR',
          response.data.message || 'Failed to generate backup codes'
        );
      }

      return response.data.data.backupCodes;
    } catch (error) {
      throw this.handleMFAError(error);
    }
  }

  /**
   * Resend MFA code (for SMS/Email methods)
   */
  public async resendMFACode(method: MFAMethod): Promise<void> {
    try {
      // Check if method supports resending
      if (!['sms', 'email'].includes(method)) {
        throw this.createMFAError(
          'VALIDATION_ERROR',
          `Resend is not supported for method: ${method}`
        );
      }

      // Get current challenge or setup session
      const challenge = await this.storage.get('mfa_challenge');
      const setup = await this.storage.get('mfa_setup_token');

      if (!challenge && !setup) {
        throw this.createMFAError(
          'AUTH_ERROR',
          'No active MFA session found'
        );
      }

      const endpoint = challenge 
        ? `${this.config.apiUrl}/auth/mfa/challenge/resend`
        : `${this.config.apiUrl}/auth/mfa/setup/resend`;

      const payload = challenge
        ? { challengeId: challenge.challengeId, method }
        : { setupToken: setup.token, method };

      const response = await this.httpClient.post<ApiResponse<void>>(endpoint, payload);

      if (!response.data.success) {
        throw this.createMFAError(
          'AUTH_ERROR',
          response.data.message || 'Failed to resend MFA code'
        );
      }
    } catch (error) {
      throw this.handleMFAError(error);
    }
  }

  /**
   * Validate MFA code format
   */
  public validateMFACode(code: string, method: MFAMethod): { isValid: boolean; error?: string } {
    if (!code || typeof code !== 'string') {
      return { isValid: false, error: 'MFA code is required' };
    }

    // Remove spaces and convert to uppercase for backup codes
    const cleanCode = code.replace(/\s/g, '').toUpperCase();

    switch (method) {
      case 'totp':
      case 'sms':
      case 'email':
        // Numeric codes
        if (!/^\d+$/.test(cleanCode)) {
          return { isValid: false, error: 'MFA code must contain only numbers' };
        }
        if (cleanCode.length !== this.config.codeLength) {
          return { isValid: false, error: `MFA code must be ${this.config.codeLength} digits` };
        }
        break;

      case 'backup_codes':
        // Alphanumeric backup codes
        if (!/^[A-Z0-9]+$/.test(cleanCode)) {
          return { isValid: false, error: 'Backup code contains invalid characters' };
        }
        if (cleanCode.length < 8 || cleanCode.length > 16) {
          return { isValid: false, error: 'Invalid backup code format' };
        }
        break;

      default:
        return { isValid: false, error: 'Unsupported MFA method' };
    }

    return { isValid: true };
  }

  /**
   * Check if MFA method is supported
   */
  public isMethodSupported(method: MFAMethod): boolean {
    return this.config.supportedMethods.includes(method);
  }

  /**
   * Get supported MFA methods
   */
  public getSupportedMethods(): MFAMethod[] {
    return [...this.config.supportedMethods];
  }

  private validateSetupRequest(request: MFASetupRequest): void {
    switch (request.method) {
      case 'sms':
        if (!request.phoneNumber) {
          throw this.createMFAError(
            'VALIDATION_ERROR',
            'Phone number is required for SMS MFA setup'
          );
        }
        break;

      case 'email':
        if (!request.email) {
          throw this.createMFAError(
            'VALIDATION_ERROR',
            'Email address is required for email MFA setup'
          );
        }
        break;

      // TOTP and backup codes don't need additional validation
      case 'totp':
      case 'backup_codes':
        break;

      default:
        throw this.createMFAError(
          'VALIDATION_ERROR',
          `Unsupported MFA method: ${request.method}`
        );
    }
  }

  private createMFAError(
    code: SDKErrorCode,
    message: string,
    statusCode?: number,
    details?: Record<string, any>
  ): SDKError {
    const error = new Error(message) as SDKError;
    error.name = 'MFAError';
    error.code = code;
    error.statusCode = statusCode;
    error.details = details;
    error.timestamp = new Date().toISOString();
    return error;
  }

  private handleMFAError(error: any): SDKError {
    if (error.code && error.name === 'MFAError') {
      return error;
    }

    if (error.response?.status === 400) {
      return this.createMFAError(
        'VALIDATION_ERROR',
        'Invalid MFA request',
        400,
        { originalError: error.message }
      );
    }

    if (error.response?.status === 401) {
      return this.createMFAError(
        'AUTH_ERROR',
        'MFA authentication failed',
        401,
        { originalError: error.message }
      );
    }

    if (error.response?.status === 429) {
      return this.createMFAError(
        'NETWORK_ERROR',
        'Too many MFA attempts. Please try again later.',
        429,
        { originalError: error.message }
      );
    }

    return this.createMFAError(
      'UNKNOWN_ERROR',
      error.message || 'Unknown MFA error',
      error.response?.status,
      { originalError: error }
    );
  }
}