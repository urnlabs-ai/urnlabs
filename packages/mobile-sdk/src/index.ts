/**
 * Urnlabs Mobile SDK Core - Main entry point
 * Exports all types, classes, and utilities for mobile SDK implementations
 */

// Core types and interfaces
export * from './core/types';
export * from './core/sdk-base';

// Authentication
export * from './auth/auth-manager';
export * from './auth/mfa-manager';

// HTTP and WebSocket clients
export * from './http/http-client';
export * from './http/websocket-client';

// Utility functions
export { createDefaultSDKConfig, validateSDKConfig } from './utils/config';
export { createMemoryStorage, createLocalStorage, createEncryptedStorage, createAutoStorage } from './utils/storage';
export { retry, exponentialBackoff, retryNetworkErrors, CircuitBreaker } from './utils/retry';
export { validateEmail, validatePassword, validateUsername, validatePhoneNumber } from './utils/validation';
export { createLogger, defaultLogger, Logger } from './utils/logger';
export { createErrorHandler, defaultErrorHandler, ErrorHandler } from './utils/error-handler';

// Version information
export const SDK_VERSION = '1.0.0';
export const SDK_NAME = 'Urnlabs Mobile SDK Core';