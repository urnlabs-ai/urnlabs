// ============================================================================
// PASSWORD STRENGTH VALIDATION UTILITY
// ============================================================================

export interface PasswordRequirements {
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  forbidCommonPasswords: boolean;
  forbidUserInfo: boolean;
  forbidRepeatingChars: boolean;
  maxRepeatingChars: number;
  forbidSequentialChars: boolean;
  customPatterns?: RegExp[];
  customForbiddenPatterns?: RegExp[];
}

export interface PasswordValidationResult {
  isValid: boolean;
  score: number; // 0-100
  strength: 'very-weak' | 'weak' | 'fair' | 'good' | 'strong' | 'very-strong';
  errors: string[];
  suggestions: string[];
  timeToCrackEstimate: string;
}

export interface UserInfo {
  email?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  dateOfBirth?: string;
}

export class PasswordValidator {
  private static readonly DEFAULT_REQUIREMENTS: PasswordRequirements = {
    minLength: 12,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    forbidCommonPasswords: true,
    forbidUserInfo: true,
    forbidRepeatingChars: true,
    maxRepeatingChars: 3,
    forbidSequentialChars: true,
  };

  // Common passwords list (top 100 most common passwords)
  private static readonly COMMON_PASSWORDS = new Set([
    'password', '123456', '123456789', 'qwerty', 'abc123', 'password123',
    'admin', 'letmein', 'welcome', 'monkey', '1234567890', 'iloveyou',
    'princess', 'rockyou', '12345678', 'abc123', 'nicole', 'daniel',
    'babygirl', 'monkey', 'lovely', 'jessica', '654321', 'michael',
    'ashley', 'qwerty123', '111111', 'iloveyou', 'master', 'jordan',
    'superman', 'harley', 'batman', 'andrew', 'football', 'liverpool',
    'london', 'password1', 'london', 'charlie', 'maggie', 'michelle',
    'purple', 'power', 'yellow', 'summer', 'tigger', 'rosebud',
    'password', 'password!', 'password1!', 'p@ssw0rd', 'p@ssword',
    'password2023', 'password2024', 'welcome123', 'admin123', 'qwerty!',
    'qwerty123!', 'Password1', 'Password123', 'Password!', 'admin!',
    'welcome!', '12345', '1234', '123', 'password12345', 'abc',
    'qwe123', 'asd123', 'zxc123', '!@#$%^&*', 'qweasd', 'asdfgh',
    'zxcvbn', 'qwer', 'asdf', 'zxcv', 'poiuy', 'lkjhg', 'mnbvc',
  ]);

  private static readonly SEQUENTIAL_PATTERNS = [
    '123456789', '987654321', 'abcdefgh', 'zyxwvuts',
    'qwertyuiop', 'poiuytrewq', 'asdfghjkl', 'lkjhgfdsa',
    'zxcvbnm', 'mnbvcxz',
  ];

  private static readonly SPECIAL_CHARS = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  /**
   * Validate password against requirements
   */
  static validatePassword(
    password: string,
    requirements: Partial<PasswordRequirements> = {},
    userInfo?: UserInfo
  ): PasswordValidationResult {
    const reqs = { ...this.DEFAULT_REQUIREMENTS, ...requirements };
    const errors: string[] = [];
    const suggestions: string[] = [];
    let score = 0;

    // Basic length validation
    if (password.length < reqs.minLength) {
      errors.push(`Password must be at least ${reqs.minLength} characters long`);
      suggestions.push(`Add ${reqs.minLength - password.length} more characters`);
    } else {
      score += Math.min(25, (password.length / reqs.minLength) * 20);
    }

    if (password.length > reqs.maxLength) {
      errors.push(`Password must not exceed ${reqs.maxLength} characters`);
    }

    // Character type requirements
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChars = new RegExp(`[${this.escapeRegex(this.SPECIAL_CHARS)}]`).test(password);

    if (reqs.requireUppercase && !hasUppercase) {
      errors.push('Password must contain at least one uppercase letter');
      suggestions.push('Add an uppercase letter (A-Z)');
    } else if (hasUppercase) {
      score += 10;
    }

    if (reqs.requireLowercase && !hasLowercase) {
      errors.push('Password must contain at least one lowercase letter');
      suggestions.push('Add a lowercase letter (a-z)');
    } else if (hasLowercase) {
      score += 10;
    }

    if (reqs.requireNumbers && !hasNumbers) {
      errors.push('Password must contain at least one number');
      suggestions.push('Add a number (0-9)');
    } else if (hasNumbers) {
      score += 10;
    }

    if (reqs.requireSpecialChars && !hasSpecialChars) {
      errors.push('Password must contain at least one special character');
      suggestions.push(`Add a special character (${this.SPECIAL_CHARS})`);
    } else if (hasSpecialChars) {
      score += 15;
    }

    // Character diversity scoring
    const uniqueChars = new Set(password.toLowerCase()).size;
    const diversityScore = Math.min(20, (uniqueChars / password.length) * 40);
    score += diversityScore;

    // Common password check
    if (reqs.forbidCommonPasswords) {
      const lowerPassword = password.toLowerCase();
      if (this.COMMON_PASSWORDS.has(lowerPassword)) {
        errors.push('Password is too common and easily guessable');
        suggestions.push('Choose a more unique password');
        score -= 30;
      }

      // Check for common password variations
      const withoutNumbers = password.replace(/\d+$/, ''); // Remove trailing numbers
      if (this.COMMON_PASSWORDS.has(withoutNumbers.toLowerCase())) {
        errors.push('Password is based on a common password');
        suggestions.push('Avoid using common passwords as a base');
        score -= 20;
      }
    }

    // User information check
    if (reqs.forbidUserInfo && userInfo) {
      const userInfoValues = [
        userInfo.email?.split('@')[0],
        userInfo.firstName,
        userInfo.lastName,
        userInfo.username,
        userInfo.dateOfBirth?.replace(/\D/g, ''), // Remove non-digits from DOB
      ].filter(Boolean).map(val => val!.toLowerCase());

      for (const info of userInfoValues) {
        if (info.length >= 3 && password.toLowerCase().includes(info)) {
          errors.push('Password should not contain personal information');
          suggestions.push('Avoid using your name, email, or date of birth');
          score -= 15;
          break;
        }
      }
    }

    // Repeating characters check
    if (reqs.forbidRepeatingChars) {
      const repeatingPattern = new RegExp(`(.)\\1{${reqs.maxRepeatingChars},}`, 'i');
      if (repeatingPattern.test(password)) {
        errors.push(`Password should not contain more than ${reqs.maxRepeatingChars} repeating characters`);
        suggestions.push('Avoid repeating the same character multiple times');
        score -= 10;
      }
    }

    // Sequential characters check
    if (reqs.forbidSequentialChars) {
      const passwordLower = password.toLowerCase();
      for (const pattern of this.SEQUENTIAL_PATTERNS) {
        if (passwordLower.includes(pattern.substring(0, 4))) {
          errors.push('Password should not contain sequential characters');
          suggestions.push('Avoid keyboard patterns and sequences');
          score -= 15;
          break;
        }
      }

      // Check for numeric sequences
      if (/(?:0123|1234|2345|3456|4567|5678|6789|9876|8765|7654|6543|5432|4321|3210)/.test(password)) {
        errors.push('Password should not contain numeric sequences');
        suggestions.push('Avoid sequential numbers');
        score -= 15;
      }
    }

    // Custom patterns check
    if (reqs.customForbiddenPatterns) {
      for (const pattern of reqs.customForbiddenPatterns) {
        if (pattern.test(password)) {
          errors.push('Password contains forbidden pattern');
          suggestions.push('Choose a different password pattern');
          score -= 10;
        }
      }
    }

    if (reqs.customPatterns) {
      for (const pattern of reqs.customPatterns) {
        if (pattern.test(password)) {
          score += 5;
        }
      }
    }

    // Ensure score is within bounds
    score = Math.max(0, Math.min(100, score));

    // Determine strength level
    let strength: PasswordValidationResult['strength'];
    if (score < 20) strength = 'very-weak';
    else if (score < 40) strength = 'weak';
    else if (score < 60) strength = 'fair';
    else if (score < 80) strength = 'good';
    else if (score < 95) strength = 'strong';
    else strength = 'very-strong';

    // Time to crack estimate
    const timeToCrackEstimate = this.estimateTimeToCrack(password, score);

    return {
      isValid: errors.length === 0,
      score,
      strength,
      errors,
      suggestions,
      timeToCrackEstimate,
    };
  }

  /**
   * Generate a strong password suggestion
   */
  static generateStrongPassword(
    length: number = 16,
    requirements: Partial<PasswordRequirements> = {}
  ): string {
    const reqs = { ...this.DEFAULT_REQUIREMENTS, ...requirements };
    const chars = {
      lowercase: 'abcdefghijklmnopqrstuvwxyz',
      uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      numbers: '0123456789',
      special: this.SPECIAL_CHARS,
    };

    let allChars = '';
    let password = '';

    // Ensure required character types are included
    if (reqs.requireLowercase) {
      allChars += chars.lowercase;
      password += chars.lowercase[Math.floor(Math.random() * chars.lowercase.length)];
    }

    if (reqs.requireUppercase) {
      allChars += chars.uppercase;
      password += chars.uppercase[Math.floor(Math.random() * chars.uppercase.length)];
    }

    if (reqs.requireNumbers) {
      allChars += chars.numbers;
      password += chars.numbers[Math.floor(Math.random() * chars.numbers.length)];
    }

    if (reqs.requireSpecialChars) {
      allChars += chars.special;
      password += chars.special[Math.floor(Math.random() * chars.special.length)];
    }

    // Fill the rest randomly
    for (let i = password.length; i < length; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // Shuffle the password to avoid predictable patterns
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  /**
   * Check if password has been compromised in data breaches
   */
  static async checkBreachedPassword(password: string): Promise<boolean> {
    try {
      // Use k-anonymity with HaveIBeenPwned API
      const crypto = await import('crypto');
      const hash = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
      const prefix = hash.substring(0, 5);
      const suffix = hash.substring(5);

      const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: {
          'User-Agent': 'Urnlabs-PasswordValidator',
        },
      });

      if (!response.ok) {
        // If API is unavailable, don't block the user
        return false;
      }

      const text = await response.text();
      const lines = text.split('\n');

      for (const line of lines) {
        const [hashSuffix] = line.split(':');
        if (hashSuffix === suffix) {
          return true; // Password found in breach
        }
      }

      return false;
    } catch (error) {
      // If there's an error checking, don't block the user
      console.warn('Failed to check breached passwords:', error);
      return false;
    }
  }

  // Private helper methods

  private static escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private static estimateTimeToCrack(password: string, score: number): string {
    // Simplified time-to-crack estimation based on character set and length
    let charsetSize = 0;

    if (/[a-z]/.test(password)) charsetSize += 26;
    if (/[A-Z]/.test(password)) charsetSize += 26;
    if (/\d/.test(password)) charsetSize += 10;
    if (new RegExp(`[${this.escapeRegex(this.SPECIAL_CHARS)}]`).test(password)) charsetSize += this.SPECIAL_CHARS.length;

    const entropy = password.length * Math.log2(charsetSize);
    const combinations = Math.pow(2, entropy);

    // Assume 1 billion guesses per second (modern hardware)
    const secondsToBreak = combinations / (2 * 1e9);

    if (secondsToBreak < 1) return 'Instantly';
    if (secondsToBreak < 60) return `${Math.round(secondsToBreak)} seconds`;
    if (secondsToBreak < 3600) return `${Math.round(secondsToBreak / 60)} minutes`;
    if (secondsToBreak < 86400) return `${Math.round(secondsToBreak / 3600)} hours`;
    if (secondsToBreak < 31536000) return `${Math.round(secondsToBreak / 86400)} days`;
    if (secondsToBreak < 31536000000) return `${Math.round(secondsToBreak / 31536000)} years`;

    return 'Centuries';
  }
}

/**
 * Fastify-specific password validation function
 */
export function validatePasswordStrength(
  password: string,
  requirements?: Partial<PasswordRequirements>,
  userInfo?: UserInfo
): PasswordValidationResult {
  return PasswordValidator.validatePassword(password, requirements, userInfo);
}

/**
 * Generate a strong password
 */
export function generateStrongPassword(
  length?: number,
  requirements?: Partial<PasswordRequirements>
): string {
  return PasswordValidator.generateStrongPassword(length, requirements);
}

/**
 * Check if password has been breached
 */
export async function isPasswordBreached(password: string): Promise<boolean> {
  return PasswordValidator.checkBreachedPassword(password);
}

export default PasswordValidator;