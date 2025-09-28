/**
 * Validation utilities for user input and data
 */

/**
 * Email validation
 */
export function validateEmail(email: string): { isValid: boolean; error?: string } {
  if (!email || typeof email !== 'string') {
    return { isValid: false, error: 'Email is required' };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { isValid: false, error: 'Invalid email format' };
  }

  if (email.length > 254) {
    return { isValid: false, error: 'Email is too long' };
  }

  return { isValid: true };
}

/**
 * Password validation with customizable rules
 */
export interface PasswordRules {
  minLength?: number;
  maxLength?: number;
  requireUppercase?: boolean;
  requireLowercase?: boolean;
  requireNumbers?: boolean;
  requireSpecialChars?: boolean;
  forbiddenPatterns?: string[];
}

export function validatePassword(
  password: string,
  rules: PasswordRules = {}
): { isValid: boolean; errors: string[] } {
  const {
    minLength = 8,
    maxLength = 128,
    requireUppercase = true,
    requireLowercase = true,
    requireNumbers = true,
    requireSpecialChars = true,
    forbiddenPatterns = []
  } = rules;

  const errors: string[] = [];

  if (!password || typeof password !== 'string') {
    errors.push('Password is required');
    return { isValid: false, errors };
  }

  // Length validation
  if (password.length < minLength) {
    errors.push(`Password must be at least ${minLength} characters long`);
  }

  if (password.length > maxLength) {
    errors.push(`Password must be no more than ${maxLength} characters long`);
  }

  // Character requirements
  if (requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (requireNumbers && !/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  // Forbidden patterns
  forbiddenPatterns.forEach(pattern => {
    const regex = new RegExp(pattern, 'i');
    if (regex.test(password)) {
      errors.push(`Password contains forbidden pattern: ${pattern}`);
    }
  });

  // Common weak password patterns
  const weakPatterns = [
    /^123+/,
    /^abc+/i,
    /^qwerty/i,
    /^password/i,
    /^admin/i,
    /(.)\1{3,}/ // Repeated characters
  ];

  weakPatterns.forEach(pattern => {
    if (pattern.test(password)) {
      errors.push('Password contains a weak pattern');
    }
  });

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Username validation
 */
export function validateUsername(username: string): { isValid: boolean; error?: string } {
  if (!username || typeof username !== 'string') {
    return { isValid: false, error: 'Username is required' };
  }

  if (username.length < 3) {
    return { isValid: false, error: 'Username must be at least 3 characters long' };
  }

  if (username.length > 30) {
    return { isValid: false, error: 'Username must be no more than 30 characters long' };
  }

  // Allow alphanumeric characters, underscores, and hyphens
  const usernameRegex = /^[a-zA-Z0-9_-]+$/;
  if (!usernameRegex.test(username)) {
    return { isValid: false, error: 'Username can only contain letters, numbers, underscores, and hyphens' };
  }

  // Must start with a letter or number
  if (!/^[a-zA-Z0-9]/.test(username)) {
    return { isValid: false, error: 'Username must start with a letter or number' };
  }

  return { isValid: true };
}

/**
 * Phone number validation (basic international format)
 */
export function validatePhoneNumber(phone: string): { isValid: boolean; error?: string } {
  if (!phone || typeof phone !== 'string') {
    return { isValid: false, error: 'Phone number is required' };
  }

  // Remove all non-digit characters except +
  const cleanPhone = phone.replace(/[^\d+]/g, '');

  // Check for valid international format
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  if (!phoneRegex.test(cleanPhone)) {
    return { isValid: false, error: 'Invalid phone number format' };
  }

  return { isValid: true };
}

/**
 * URL validation
 */
export function validateURL(url: string): { isValid: boolean; error?: string } {
  if (!url || typeof url !== 'string') {
    return { isValid: false, error: 'URL is required' };
  }

  try {
    new URL(url);
    return { isValid: true };
  } catch (error) {
    return { isValid: false, error: 'Invalid URL format' };
  }
}

/**
 * API key validation
 */
export function validateApiKey(apiKey: string): { isValid: boolean; error?: string } {
  if (!apiKey || typeof apiKey !== 'string') {
    return { isValid: false, error: 'API key is required' };
  }

  if (apiKey.length < 16) {
    return { isValid: false, error: 'API key is too short' };
  }

  if (apiKey.length > 128) {
    return { isValid: false, error: 'API key is too long' };
  }

  // Check for basic format (alphanumeric with some special characters)
  const apiKeyRegex = /^[a-zA-Z0-9_-]+$/;
  if (!apiKeyRegex.test(apiKey)) {
    return { isValid: false, error: 'API key contains invalid characters' };
  }

  return { isValid: true };
}

/**
 * File validation
 */
export interface FileValidationRules {
  maxSize?: number; // in bytes
  allowedTypes?: string[];
  allowedExtensions?: string[];
}

export function validateFile(
  file: File,
  rules: FileValidationRules = {}
): { isValid: boolean; errors: string[] } {
  const {
    maxSize = 10 * 1024 * 1024, // 10MB default
    allowedTypes = [],
    allowedExtensions = []
  } = rules;

  const errors: string[] = [];

  // Size validation
  if (file.size > maxSize) {
    errors.push(`File size exceeds maximum allowed size of ${maxSize} bytes`);
  }

  // MIME type validation
  if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
    errors.push(`File type ${file.type} is not allowed`);
  }

  // Extension validation
  if (allowedExtensions.length > 0) {
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    if (!fileExtension || !allowedExtensions.includes(fileExtension)) {
      errors.push(`File extension is not allowed`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * JSON validation
 */
export function validateJSON(jsonString: string): { isValid: boolean; error?: string; data?: any } {
  if (!jsonString || typeof jsonString !== 'string') {
    return { isValid: false, error: 'JSON string is required' };
  }

  try {
    const data = JSON.parse(jsonString);
    return { isValid: true, data };
  } catch (error) {
    return { isValid: false, error: 'Invalid JSON format' };
  }
}

/**
 * Generic required field validation
 */
export function validateRequired(value: any, fieldName: string): { isValid: boolean; error?: string } {
  if (value === null || value === undefined || value === '') {
    return { isValid: false, error: `${fieldName} is required` };
  }

  if (typeof value === 'string' && value.trim() === '') {
    return { isValid: false, error: `${fieldName} cannot be empty` };
  }

  return { isValid: true };
}

/**
 * Batch validation
 */
export function validateFields(
  data: Record<string, any>,
  validators: Record<string, (value: any) => { isValid: boolean; error?: string; errors?: string[] }>
): { isValid: boolean; errors: Record<string, string[]> } {
  const errors: Record<string, string[]> = {};

  Object.entries(validators).forEach(([field, validator]) => {
    const result = validator(data[field]);
    if (!result.isValid) {
      errors[field] = result.errors || (result.error ? [result.error] : ['Validation failed']);
    }
  });

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}