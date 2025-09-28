/**
 * Configuration utilities for SDK setup and validation
 */

import { SDKConfig } from '../core/types';

/**
 * Create default SDK configuration
 */
export function createDefaultSDKConfig(overrides: Partial<SDKConfig> = {}): SDKConfig {
  const defaultConfig: SDKConfig = {
    apiUrl: 'https://api.urnlabs.com',
    websocketUrl: 'wss://ws.urnlabs.com',
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000,
    enableLogging: true,
    logLevel: 'info',
    enableOffline: true,
    certificatePinning: {
      enabled: false,
      certificates: []
    }
  };

  return { ...defaultConfig, ...overrides };
}

/**
 * Validate SDK configuration
 */
export function validateSDKConfig(config: Partial<SDKConfig>): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate API URL
  if (config.apiUrl) {
    try {
      new URL(config.apiUrl);
    } catch (error) {
      errors.push('Invalid API URL format');
    }
  }

  // Validate WebSocket URL
  if (config.websocketUrl) {
    try {
      const url = new URL(config.websocketUrl);
      if (!['ws:', 'wss:'].includes(url.protocol)) {
        errors.push('WebSocket URL must use ws:// or wss:// protocol');
      }
    } catch (error) {
      errors.push('Invalid WebSocket URL format');
    }
  }

  // Validate timeout
  if (config.timeout !== undefined) {
    if (typeof config.timeout !== 'number' || config.timeout <= 0) {
      errors.push('Timeout must be a positive number');
    }
  }

  // Validate retry attempts
  if (config.retryAttempts !== undefined) {
    if (typeof config.retryAttempts !== 'number' || config.retryAttempts < 0) {
      errors.push('Retry attempts must be a non-negative number');
    }
  }

  // Validate retry delay
  if (config.retryDelay !== undefined) {
    if (typeof config.retryDelay !== 'number' || config.retryDelay < 0) {
      errors.push('Retry delay must be a non-negative number');
    }
  }

  // Validate log level
  if (config.logLevel) {
    const validLevels = ['debug', 'info', 'warn', 'error'];
    if (!validLevels.includes(config.logLevel)) {
      errors.push(`Log level must be one of: ${validLevels.join(', ')}`);
    }
  }

  // Validate certificate pinning
  if (config.certificatePinning) {
    if (typeof config.certificatePinning.enabled !== 'boolean') {
      errors.push('Certificate pinning enabled must be a boolean');
    }

    if (config.certificatePinning.certificates && !Array.isArray(config.certificatePinning.certificates)) {
      errors.push('Certificate pinning certificates must be an array');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Merge configurations with validation
 */
export function mergeSDKConfig(base: SDKConfig, override: Partial<SDKConfig>): SDKConfig {
  const validation = validateSDKConfig(override);
  if (!validation.isValid) {
    throw new Error(`Invalid SDK configuration: ${validation.errors.join(', ')}`);
  }

  return { ...base, ...override };
}

/**
 * Get environment-specific configuration
 */
export function getEnvironmentConfig(environment: 'development' | 'staging' | 'production'): Partial<SDKConfig> {
  switch (environment) {
    case 'development':
      return {
        apiUrl: 'http://localhost:7001',
        websocketUrl: 'ws://localhost:7001/ws',
        enableLogging: true,
        logLevel: 'debug',
        retryAttempts: 1,
        certificatePinning: {
          enabled: false,
          certificates: []
        }
      };

    case 'staging':
      return {
        apiUrl: 'https://staging-api.urnlabs.com',
        websocketUrl: 'wss://staging-ws.urnlabs.com',
        enableLogging: true,
        logLevel: 'info',
        retryAttempts: 2,
        certificatePinning: {
          enabled: true,
          certificates: ['staging-cert-hash']
        }
      };

    case 'production':
      return {
        apiUrl: 'https://api.urnlabs.com',
        websocketUrl: 'wss://ws.urnlabs.com',
        enableLogging: false,
        logLevel: 'error',
        retryAttempts: 3,
        certificatePinning: {
          enabled: true,
          certificates: ['production-cert-hash']
        }
      };

    default:
      return {};
  }
}