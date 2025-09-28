import crypto from 'crypto';
import { promisify } from 'util';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  score: number;
}

export interface PasswordPolicy {
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  forbiddenWords: string[];
  forbiddenPatterns: RegExp[];
  maxAge: number; // in days
  historyCount: number; // number of previous passwords to check
}

export interface IPValidationOptions {
  allowPrivate: boolean;
  allowLoopback: boolean;
  allowMulticast: boolean;
  blockedRanges: string[];
  allowedCountries: string[];
}

export class SecurityUtils {
  private static readonly defaultPasswordPolicy: PasswordPolicy = {
    minLength: 12,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    forbiddenWords: ['password', 'admin', 'user', 'login', 'welcome'],
    forbiddenPatterns: [
      /^(.)\1+$/, // Repeated characters
      /123456/, // Sequential numbers
      /abcdef/, // Sequential letters
      /qwerty/, // Keyboard patterns
    ],
    maxAge: 90,
    historyCount: 12
  };

  /**
   * Validate password against security policy
   */
  static validatePassword(
    password: string,
    policy: Partial<PasswordPolicy> = {}
  ): ValidationResult {
    const fullPolicy = { ...this.defaultPasswordPolicy, ...policy };
    const errors: string[] = [];
    const warnings: string[] = [];
    let score = 0;

    // Length validation
    if (password.length < fullPolicy.minLength) {
      errors.push(`Password must be at least ${fullPolicy.minLength} characters long`);
    } else if (password.length >= fullPolicy.minLength) {
      score += 20;
    }

    if (password.length > fullPolicy.maxLength) {
      errors.push(`Password must not exceed ${fullPolicy.maxLength} characters`);
    }

    // Character requirements
    if (fullPolicy.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    } else if (/[A-Z]/.test(password)) {
      score += 15;
    }

    if (fullPolicy.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    } else if (/[a-z]/.test(password)) {
      score += 15;
    }

    if (fullPolicy.requireNumbers && !/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    } else if (/\d/.test(password)) {
      score += 15;
    }

    if (fullPolicy.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    } else if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      score += 15;
    }

    // Forbidden words check
    const lowerPassword = password.toLowerCase();
    for (const word of fullPolicy.forbiddenWords) {
      if (lowerPassword.includes(word.toLowerCase())) {
        errors.push(`Password must not contain "${word}"`);
      }
    }

    // Forbidden patterns check
    for (const pattern of fullPolicy.forbiddenPatterns) {
      if (pattern.test(password)) {
        errors.push('Password contains a forbidden pattern');
      }
    }

    // Entropy calculation
    const entropy = this.calculatePasswordEntropy(password);
    if (entropy < 40) {
      warnings.push('Password has low entropy and may be easily guessed');
    } else if (entropy >= 60) {
      score += 20;
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      score: Math.min(100, score)
    };
  }

  /**
   * Calculate password entropy
   */
  static calculatePasswordEntropy(password: string): number {
    let charsetSize = 0;

    if (/[a-z]/.test(password)) charsetSize += 26;
    if (/[A-Z]/.test(password)) charsetSize += 26;
    if (/\d/.test(password)) charsetSize += 10;
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) charsetSize += 32;

    return password.length * Math.log2(charsetSize);
  }

  /**
   * Generate secure random password
   */
  static generateSecurePassword(
    length: number = 16,
    options: {
      includeUppercase?: boolean;
      includeLowercase?: boolean;
      includeNumbers?: boolean;
      includeSpecialChars?: boolean;
      excludeSimilar?: boolean;
    } = {}
  ): string {
    const {
      includeUppercase = true,
      includeLowercase = true,
      includeNumbers = true,
      includeSpecialChars = true,
      excludeSimilar = true
    } = options;

    let charset = '';

    if (includeUppercase) {
      charset += excludeSimilar ? 'ABCDEFGHJKLMNPQRSTUVWXYZ' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    }

    if (includeLowercase) {
      charset += excludeSimilar ? 'abcdefghjkmnpqrstuvwxyz' : 'abcdefghijklmnopqrstuvwxyz';
    }

    if (includeNumbers) {
      charset += excludeSimilar ? '23456789' : '0123456789';
    }

    if (includeSpecialChars) {
      charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';
    }

    if (!charset) {
      throw new Error('At least one character type must be included');
    }

    let password = '';
    const bytes = crypto.randomBytes(length * 2);

    for (let i = 0; i < length; i++) {
      const randomIndex = bytes[i] % charset.length;
      password += charset[randomIndex];
    }

    return password;
  }

  /**
   * Validate IP address and check against security policies
   */
  static validateIPAddress(
    ip: string,
    options: Partial<IPValidationOptions> = {}
  ): ValidationResult {
    const {
      allowPrivate = true,
      allowLoopback = true,
      allowMulticast = false,
      blockedRanges = [],
      allowedCountries = []
    } = options;

    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic IP format validation
    if (!this.isValidIPFormat(ip)) {
      errors.push('Invalid IP address format');
      return { isValid: false, errors, warnings, score: 0 };
    }

    // Private IP check
    if (!allowPrivate && this.isPrivateIP(ip)) {
      errors.push('Private IP addresses are not allowed');
    }

    // Loopback check
    if (!allowLoopback && this.isLoopbackIP(ip)) {
      errors.push('Loopback IP addresses are not allowed');
    }

    // Multicast check
    if (!allowMulticast && this.isMulticastIP(ip)) {
      errors.push('Multicast IP addresses are not allowed');
    }

    // Blocked ranges check
    for (const range of blockedRanges) {
      if (this.isIPInRange(ip, range)) {
        errors.push(`IP address is in blocked range: ${range}`);
      }
    }

    // Reputation check (simplified - integrate with threat intelligence in production)
    if (this.isKnownMaliciousIP(ip)) {
      errors.push('IP address is flagged as malicious');
    }

    let score = 100;
    if (warnings.length > 0) score -= warnings.length * 10;

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      score: Math.max(0, score)
    };
  }

  /**
   * Validate email address format and security
   */
  static validateEmail(email: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let score = 0;

    // Basic format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      errors.push('Invalid email format');
      return { isValid: false, errors, warnings, score: 0 };
    }

    score += 30;

    // Length validation
    if (email.length > 254) {
      errors.push('Email address is too long');
    }

    // Domain validation
    const domain = email.split('@')[1];
    if (this.isDisposableEmailDomain(domain)) {
      warnings.push('Email appears to be from a disposable email service');
    } else {
      score += 20;
    }

    // Check for suspicious patterns
    if (/\+.*@/.test(email)) {
      warnings.push('Email contains plus addressing');
    }

    if (/\.{2,}/.test(email)) {
      errors.push('Email contains consecutive dots');
    }

    score += 50; // Base score for valid email

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      score: Math.min(100, score)
    };
  }

  /**
   * Sanitize input to prevent XSS attacks
   */
  static sanitizeInput(input: string): string {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  /**
   * Validate and sanitize SQL input to prevent injection
   */
  static sanitizeSQLInput(input: string): string {
    // Remove or escape dangerous SQL characters
    return input
      .replace(/['";\\]/g, '') // Remove quotes and backslashes
      .replace(/--/g, '') // Remove SQL comments
      .replace(/\/\*/g, '') // Remove multi-line comment start
      .replace(/\*\//g, '') // Remove multi-line comment end
      .replace(/\bUNION\b/gi, '') // Remove UNION keyword
      .replace(/\bSELECT\b/gi, '') // Remove SELECT keyword
      .replace(/\bINSERT\b/gi, '') // Remove INSERT keyword
      .replace(/\bUPDATE\b/gi, '') // Remove UPDATE keyword
      .replace(/\bDELETE\b/gi, '') // Remove DELETE keyword
      .replace(/\bDROP\b/gi, ''); // Remove DROP keyword
  }

  /**
   * Generate secure session token
   */
  static generateSessionToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate CSRF token
   */
  static generateCSRFToken(): string {
    return crypto.randomBytes(24).toString('base64url');
  }

  /**
   * Verify CSRF token
   */
  static verifyCSRFToken(token: string, sessionToken: string): boolean {
    if (!token || !sessionToken) return false;

    // Simple CSRF verification - implement proper CSRF protection in production
    const expectedToken = crypto
      .createHmac('sha256', sessionToken)
      .update('csrf-protection')
      .digest('base64url')
      .slice(0, 32);

    return crypto.timingSafeEqual(
      Buffer.from(token, 'base64url'),
      Buffer.from(expectedToken, 'base64url')
    );
  }

  /**
   * Rate limiting key generation
   */
  static generateRateLimitKey(
    identifier: string,
    endpoint: string,
    timeWindow: number
  ): string {
    const windowStart = Math.floor(Date.now() / timeWindow) * timeWindow;
    return `rate_limit:${identifier}:${endpoint}:${windowStart}`;
  }

  /**
   * Timing-safe string comparison
   */
  static timingSafeEquals(a: string, b: string): boolean {
    if (a.length !== b.length) return false;

    return crypto.timingSafeEqual(
      Buffer.from(a, 'utf8'),
      Buffer.from(b, 'utf8')
    );
  }

  /**
   * Helper methods for IP validation
   */
  private static isValidIPFormat(ip: string): boolean {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  }

  private static isPrivateIP(ip: string): boolean {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4) return false;

    return (
      (parts[0] === 10) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168)
    );
  }

  private static isLoopbackIP(ip: string): boolean {
    return ip.startsWith('127.') || ip === '::1';
  }

  private static isMulticastIP(ip: string): boolean {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4) return false;

    return parts[0] >= 224 && parts[0] <= 239;
  }

  private static isIPInRange(ip: string, range: string): boolean {
    // Simplified CIDR check - implement proper CIDR matching in production
    return ip.startsWith(range.split('/')[0].split('.').slice(0, -1).join('.'));
  }

  private static isKnownMaliciousIP(ip: string): boolean {
    // Simplified threat intelligence check
    // In production, integrate with threat intelligence feeds
    const knownMaliciousIPs = [
      '192.168.100.100', // Example malicious IP
    ];

    return knownMaliciousIPs.includes(ip);
  }

  private static isDisposableEmailDomain(domain: string): boolean {
    const disposableDomains = [
      '10minutemail.com',
      'tempmail.org',
      'guerrillamail.com',
      'mailinator.com',
      'throwaway.email'
    ];

    return disposableDomains.includes(domain.toLowerCase());
  }
}

/**
 * Security constants
 */
export const SecurityConstants = {
  // Password requirements
  MIN_PASSWORD_LENGTH: 12,
  MAX_PASSWORD_LENGTH: 128,
  PASSWORD_HISTORY_COUNT: 12,
  PASSWORD_MAX_AGE_DAYS: 90,

  // Session management
  SESSION_TIMEOUT_MINUTES: 30,
  ABSOLUTE_SESSION_TIMEOUT_HOURS: 8,
  SESSION_RENEWAL_THRESHOLD_MINUTES: 5,

  // Rate limiting
  DEFAULT_RATE_LIMIT_REQUESTS: 100,
  DEFAULT_RATE_LIMIT_WINDOW_MS: 60000,
  BURST_RATE_LIMIT_REQUESTS: 20,
  BURST_RATE_LIMIT_WINDOW_MS: 1000,

  // Token expiration
  ACCESS_TOKEN_EXPIRY_MINUTES: 15,
  REFRESH_TOKEN_EXPIRY_DAYS: 30,
  CSRF_TOKEN_EXPIRY_MINUTES: 60,

  // Encryption
  AES_KEY_LENGTH: 32,
  IV_LENGTH: 16,
  SALT_LENGTH: 32,
  RSA_KEY_LENGTH: 4096,

  // Security headers
  HSTS_MAX_AGE_SECONDS: 31536000, // 1 year
  CSP_DEFAULT_POLICY: "default-src 'self'",

  // Risk thresholds
  LOW_RISK_THRESHOLD: 20,
  MEDIUM_RISK_THRESHOLD: 50,
  HIGH_RISK_THRESHOLD: 80,
  CRITICAL_RISK_THRESHOLD: 95
} as const;

/**
 * Security error codes
 */
export enum SecurityErrorCodes {
  // Authentication errors
  INVALID_CREDENTIALS = 'SEC_001',
  ACCOUNT_LOCKED = 'SEC_002',
  SESSION_EXPIRED = 'SEC_003',
  MFA_REQUIRED = 'SEC_004',
  INVALID_TOKEN = 'SEC_005',

  // Authorization errors
  INSUFFICIENT_PRIVILEGES = 'SEC_010',
  RESOURCE_ACCESS_DENIED = 'SEC_011',
  POLICY_VIOLATION = 'SEC_012',

  // Validation errors
  INVALID_INPUT = 'SEC_020',
  WEAK_PASSWORD = 'SEC_021',
  SUSPICIOUS_ACTIVITY = 'SEC_022',

  // Rate limiting
  RATE_LIMIT_EXCEEDED = 'SEC_030',
  TOO_MANY_REQUESTS = 'SEC_031',

  // System errors
  SECURITY_SERVICE_ERROR = 'SEC_040',
  ENCRYPTION_ERROR = 'SEC_041',
  AUDIT_LOG_ERROR = 'SEC_042'
}

export default SecurityUtils;