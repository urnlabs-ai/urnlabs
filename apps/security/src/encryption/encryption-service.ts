import { createCipher, createDecipher, createHash, randomBytes, pbkdf2, scrypt } from 'crypto';
import { promisify } from 'util';
import type { SecurityConfig } from '../types/auth.js';
import { logger } from '../lib/logger.js';

const pbkdf2Async = promisify(pbkdf2);
const scryptAsync = promisify(scrypt);

export interface EncryptionResult {
  encrypted: string;
  iv: string;
  salt?: string;
  algorithm: string;
}

export interface DecryptionInput {
  encrypted: string;
  iv: string;
  salt?: string;
  algorithm: string;
}

export class EncryptionService {
  private readonly algorithm: string;
  private readonly keyLength: number;
  private readonly ivLength: number;
  private readonly masterKey: Buffer;

  constructor(private config: SecurityConfig) {
    this.algorithm = config.encryption.algorithm || 'aes-256-gcm';
    this.keyLength = config.encryption.keyLength || 32;
    this.ivLength = config.encryption.ivLength || 16;
    
    // Master key should be loaded from secure environment variable
    const masterKeyString = process.env.ENCRYPTION_MASTER_KEY;
    if (!masterKeyString) {
      throw new Error('ENCRYPTION_MASTER_KEY environment variable is required');
    }
    
    this.masterKey = Buffer.from(masterKeyString, 'hex');
    if (this.masterKey.length !== this.keyLength) {
      throw new Error(`Master key must be ${this.keyLength} bytes (${this.keyLength * 2} hex characters)`);
    }
  }

  /**
   * Encrypt sensitive data with AES-256-GCM
   */
  async encryptData(data: string, context?: string): Promise<EncryptionResult> {
    try {
      const iv = randomBytes(this.ivLength);
      const salt = randomBytes(16);
      
      // Derive key using PBKDF2 with context-specific salt
      const derivedKey = await this.deriveKey(this.masterKey, salt, context);
      
      const cipher = createCipher(this.algorithm, derivedKey);
      cipher.setAAD(Buffer.from(context || 'default', 'utf8'));
      
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      return {
        encrypted: encrypted + ':' + authTag.toString('hex'),
        iv: iv.toString('hex'),
        salt: salt.toString('hex'),
        algorithm: this.algorithm
      };
    } catch (error) {
      logger.error('Encryption failed', { error, context });
      throw new Error('Data encryption failed');
    }
  }

  /**
   * Decrypt sensitive data
   */
  async decryptData(input: DecryptionInput, context?: string): Promise<string> {
    try {
      const { encrypted, iv, salt, algorithm } = input;
      
      if (algorithm !== this.algorithm) {
        throw new Error(`Unsupported algorithm: ${algorithm}`);
      }
      
      const [encryptedData, authTagHex] = encrypted.split(':');
      if (!encryptedData || !authTagHex) {
        throw new Error('Invalid encrypted data format');
      }
      
      const ivBuffer = Buffer.from(iv, 'hex');
      const saltBuffer = salt ? Buffer.from(salt, 'hex') : randomBytes(16);
      const authTag = Buffer.from(authTagHex, 'hex');
      
      // Derive the same key used for encryption
      const derivedKey = await this.deriveKey(this.masterKey, saltBuffer, context);
      
      const decipher = createDecipher(algorithm, derivedKey);
      decipher.setAAD(Buffer.from(context || 'default', 'utf8'));
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      logger.error('Decryption failed', { error, context });
      throw new Error('Data decryption failed');
    }
  }

  /**
   * Encrypt file content
   */
  async encryptFile(content: Buffer, context?: string): Promise<EncryptionResult> {
    try {
      const base64Content = content.toString('base64');
      return await this.encryptData(base64Content, context);
    } catch (error) {
      logger.error('File encryption failed', { error, context });
      throw new Error('File encryption failed');
    }
  }

  /**
   * Decrypt file content
   */
  async decryptFile(input: DecryptionInput, context?: string): Promise<Buffer> {
    try {
      const decryptedBase64 = await this.decryptData(input, context);
      return Buffer.from(decryptedBase64, 'base64');
    } catch (error) {
      logger.error('File decryption failed', { error, context });
      throw new Error('File decryption failed');
    }
  }

  /**
   * Hash sensitive data (one-way)
   */
  hashData(data: string, algorithm: string = 'sha256'): string {
    try {
      return createHash(algorithm).update(data).digest('hex');
    } catch (error) {
      logger.error('Hashing failed', { error, algorithm });
      throw new Error('Data hashing failed');
    }
  }

  /**
   * Hash data with salt using PBKDF2
   */
  async hashWithSalt(data: string, salt?: Buffer, iterations: number = 100000): Promise<{
    hash: string;
    salt: string;
    iterations: number;
  }> {
    try {
      const saltBuffer = salt || randomBytes(32);
      const hash = await pbkdf2Async(data, saltBuffer, iterations, 64, 'sha512');
      
      return {
        hash: hash.toString('hex'),
        salt: saltBuffer.toString('hex'),
        iterations
      };
    } catch (error) {
      logger.error('Salt hashing failed', { error });
      throw new Error('Salt hashing failed');
    }
  }

  /**
   * Verify hashed data with salt
   */
  async verifyHashWithSalt(data: string, hash: string, salt: string, iterations: number = 100000): Promise<boolean> {
    try {
      const saltBuffer = Buffer.from(salt, 'hex');
      const computedHash = await pbkdf2Async(data, saltBuffer, iterations, 64, 'sha512');
      
      return computedHash.toString('hex') === hash;
    } catch (error) {
      logger.error('Hash verification failed', { error });
      return false;
    }
  }

  /**
   * Generate secure random token
   */
  generateSecureToken(length: number = 32): string {
    return randomBytes(length).toString('hex');
  }

  /**
   * Generate secure random bytes
   */
  generateSecureBytes(length: number = 32): Buffer {
    return randomBytes(length);
  }

  /**
   * Create HMAC signature
   */
  createHMAC(data: string, secret?: string, algorithm: string = 'sha256'): string {
    try {
      const hmacSecret = secret || process.env.HMAC_SECRET || this.masterKey.toString('hex');
      return createHash(algorithm).update(data + hmacSecret).digest('hex');
    } catch (error) {
      logger.error('HMAC creation failed', { error, algorithm });
      throw new Error('HMAC creation failed');
    }
  }

  /**
   * Verify HMAC signature
   */
  verifyHMAC(data: string, signature: string, secret?: string, algorithm: string = 'sha256'): boolean {
    try {
      const expectedSignature = this.createHMAC(data, secret, algorithm);
      return this.constantTimeEquals(signature, expectedSignature);
    } catch (error) {
      logger.error('HMAC verification failed', { error });
      return false;
    }
  }

  /**
   * Encrypt database field values
   */
  async encryptDatabaseField(value: any, fieldName: string, tableId: string): Promise<string> {
    const context = `db:${tableId}:${fieldName}`;
    const jsonValue = JSON.stringify(value);
    const result = await this.encryptData(jsonValue, context);
    
    // Return a compact format for database storage
    return JSON.stringify({
      e: result.encrypted,
      i: result.iv,
      s: result.salt,
      a: result.algorithm
    });
  }

  /**
   * Decrypt database field values
   */
  async decryptDatabaseField(encryptedValue: string, fieldName: string, tableId: string): Promise<any> {
    try {
      const context = `db:${tableId}:${fieldName}`;
      const data = JSON.parse(encryptedValue);
      
      const decryptionInput: DecryptionInput = {
        encrypted: data.e,
        iv: data.i,
        salt: data.s,
        algorithm: data.a
      };
      
      const decryptedJson = await this.decryptData(decryptionInput, context);
      return JSON.parse(decryptedJson);
    } catch (error) {
      logger.error('Database field decryption failed', { error, fieldName, tableId });
      throw new Error('Database field decryption failed');
    }
  }

  /**
   * Rotate encryption keys (for key rotation strategy)
   */
  async rotateKeys(newMasterKey: Buffer): Promise<void> {
    // This would involve re-encrypting all existing encrypted data
    // Implementation depends on your key management strategy
    logger.info('Key rotation initiated', { timestamp: new Date().toISOString() });
    // TODO: Implement key rotation logic
    throw new Error('Key rotation not implemented yet');
  }

  /**
   * Derive key using PBKDF2 or scrypt
   */
  private async deriveKey(masterKey: Buffer, salt: Buffer, context?: string): Promise<Buffer> {
    const contextBuffer = Buffer.from(context || 'default', 'utf8');
    const combinedSalt = Buffer.concat([salt, contextBuffer]);
    
    // Use scrypt for key derivation (more secure than PBKDF2)
    return await scryptAsync(masterKey, combinedSalt, this.keyLength) as Buffer;
  }

  /**
   * Constant-time string comparison to prevent timing attacks
   */
  private constantTimeEquals(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    
    return result === 0;
  }

  /**
   * Generate master key (for initial setup)
   */
  static generateMasterKey(length: number = 32): string {
    return randomBytes(length).toString('hex');
  }

  /**
   * Validate master key format
   */
  static validateMasterKey(key: string, expectedLength: number = 32): boolean {
    try {
      const buffer = Buffer.from(key, 'hex');
      return buffer.length === expectedLength && /^[a-f0-9]+$/i.test(key);
    } catch {
      return false;
    }
  }
}