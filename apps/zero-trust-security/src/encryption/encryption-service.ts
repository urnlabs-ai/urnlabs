import { createHash, createCipheriv, createDecipheriv, randomBytes, scryptSync, createHmac } from 'crypto';
import { promisify } from 'util';
import forge from 'node-forge';
import NodeRSA from 'node-rsa';
import { logger } from '../utils/logger.js';
import type { EncryptionConfig, EncryptionKey } from '../types/security-types.js';

export class EncryptionService {
  private keys: Map<string, EncryptionKey> = new Map();
  private config: EncryptionConfig;
  private keyRotationInterval: NodeJS.Timeout | null = null;

  constructor(config: EncryptionConfig) {
    this.config = config;
    this.initializeEncryption();
    this.startKeyRotation();
  }

  private initializeEncryption(): void {
    logger.info('Initializing end-to-end encryption service', {
      algorithm: this.config.algorithm,
      keySize: this.config.keySize
    });

    // Generate initial encryption keys
    this.generateEncryptionKeys();
  }

  private generateEncryptionKeys(): void {
    try {
      // Generate primary encryption key
      const primaryKey = this.generateKey('ENCRYPTION');
      this.keys.set('primary', primaryKey);

      // Generate signing key
      const signingKey = this.generateKey('SIGNING');
      this.keys.set('signing', signingKey);

      // Generate key exchange key
      const keyExchangeKey = this.generateKey('KEY_EXCHANGE');
      this.keys.set('key-exchange', keyExchangeKey);

      // Generate backup keys
      for (let i = 0; i < this.config.backupKeys; i++) {
        const backupKey = this.generateKey('ENCRYPTION');
        this.keys.set(`backup-${i}`, backupKey);
      }

      logger.info('Encryption keys generated successfully', {
        totalKeys: this.keys.size,
        backupKeys: this.config.backupKeys
      });
    } catch (error) {
      logger.error('Failed to generate encryption keys', { error: error.message });
      throw error;
    }
  }

  private generateKey(purpose: EncryptionKey['purpose']): EncryptionKey {
    const id = this.generateKeyId();
    const keyData = this.generateKeyData();

    return {
      id,
      algorithm: this.config.algorithm,
      keyData: keyData.toString('base64'),
      purpose,
      status: 'ACTIVE',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.config.rotationInterval * 60 * 60 * 1000),
      usage: {
        encryptOperations: 0,
        decryptOperations: 0,
        lastUsed: new Date()
      }
    };
  }

  private generateKeyId(): string {
    return createHash('sha256')
      .update(randomBytes(32))
      .update(Date.now().toString())
      .digest('hex')
      .substring(0, 16);
  }

  private generateKeyData(): Buffer {
    switch (this.config.algorithm) {
      case 'AES-256-GCM':
        return randomBytes(32); // 256 bits
      case 'ChaCha20-Poly1305':
        return randomBytes(32); // 256 bits
      case 'RSA-OAEP':
        return this.generateRSAKeyPair();
      default:
        throw new Error(`Unsupported algorithm: ${this.config.algorithm}`);
    }
  }

  private generateRSAKeyPair(): Buffer {
    const rsa = new NodeRSA({ b: this.config.keySize });
    return Buffer.from(rsa.exportKey('private'), 'utf8');
  }

  public async encryptData(data: string | Buffer, keyId: string = 'primary'): Promise<{
    encrypted: string;
    nonce: string;
    tag: string;
    keyId: string;
    algorithm: string;
  }> {
    const key = this.keys.get(keyId);
    if (!key) {
      throw new Error(`Encryption key not found: ${keyId}`);
    }

    const inputData = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;

    try {
      let result;

      switch (this.config.algorithm) {
        case 'AES-256-GCM':
          result = await this.encryptAESGCM(inputData, key);
          break;
        case 'ChaCha20-Poly1305':
          result = await this.encryptChaCha20(inputData, key);
          break;
        case 'RSA-OAEP':
          result = await this.encryptRSA(inputData, key);
          break;
        default:
          throw new Error(`Unsupported algorithm: ${this.config.algorithm}`);
      }

      // Update key usage
      key.usage.encryptOperations++;
      key.usage.lastUsed = new Date();

      logger.debug('Data encrypted successfully', {
        keyId,
        algorithm: this.config.algorithm,
        dataSize: inputData.length
      });

      return {
        ...result,
        keyId,
        algorithm: this.config.algorithm
      };
    } catch (error) {
      logger.error('Encryption failed', {
        keyId,
        algorithm: this.config.algorithm,
        error: error.message
      });
      throw error;
    }
  }

  private async encryptAESGCM(data: Buffer, key: EncryptionKey): Promise<{
    encrypted: string;
    nonce: string;
    tag: string;
  }> {
    const nonce = randomBytes(12); // 96-bit nonce for GCM
    const keyBuffer = Buffer.from(key.keyData, 'base64');

    const cipher = createCipheriv('aes-256-gcm', keyBuffer, nonce);

    let encrypted = cipher.update(data);
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    const tag = cipher.getAuthTag();

    return {
      encrypted: encrypted.toString('base64'),
      nonce: nonce.toString('base64'),
      tag: tag.toString('base64')
    };
  }

  private async encryptChaCha20(data: Buffer, key: EncryptionKey): Promise<{
    encrypted: string;
    nonce: string;
    tag: string;
  }> {
    const nonce = randomBytes(12); // 96-bit nonce
    const keyBuffer = Buffer.from(key.keyData, 'base64');

    const cipher = createCipheriv('chacha20-poly1305', keyBuffer, nonce);

    let encrypted = cipher.update(data);
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    const tag = cipher.getAuthTag();

    return {
      encrypted: encrypted.toString('base64'),
      nonce: nonce.toString('base64'),
      tag: tag.toString('base64')
    };
  }

  private async encryptRSA(data: Buffer, key: EncryptionKey): Promise<{
    encrypted: string;
    nonce: string;
    tag: string;
  }> {
    const keyBuffer = Buffer.from(key.keyData, 'base64');
    const rsa = new NodeRSA();
    rsa.importKey(keyBuffer.toString('utf8'), 'private');

    const encrypted = rsa.encrypt(data, 'base64', 'utf8');

    // For RSA, we generate a nonce for consistency but don't use it
    const nonce = randomBytes(12);

    // Generate HMAC tag for integrity
    const tag = createHmac('sha256', keyBuffer)
      .update(Buffer.from(encrypted, 'base64'))
      .digest();

    return {
      encrypted,
      nonce: nonce.toString('base64'),
      tag: tag.toString('base64')
    };
  }

  public async decryptData(encryptedData: {
    encrypted: string;
    nonce: string;
    tag: string;
    keyId: string;
    algorithm: string;
  }): Promise<Buffer> {
    const key = this.keys.get(encryptedData.keyId);
    if (!key) {
      throw new Error(`Decryption key not found: ${encryptedData.keyId}`);
    }

    try {
      let result: Buffer;

      switch (encryptedData.algorithm) {
        case 'AES-256-GCM':
          result = await this.decryptAESGCM(encryptedData, key);
          break;
        case 'ChaCha20-Poly1305':
          result = await this.decryptChaCha20(encryptedData, key);
          break;
        case 'RSA-OAEP':
          result = await this.decryptRSA(encryptedData, key);
          break;
        default:
          throw new Error(`Unsupported algorithm: ${encryptedData.algorithm}`);
      }

      // Update key usage
      key.usage.decryptOperations++;
      key.usage.lastUsed = new Date();

      logger.debug('Data decrypted successfully', {
        keyId: encryptedData.keyId,
        algorithm: encryptedData.algorithm,
        dataSize: result.length
      });

      return result;
    } catch (error) {
      logger.error('Decryption failed', {
        keyId: encryptedData.keyId,
        algorithm: encryptedData.algorithm,
        error: error.message
      });
      throw error;
    }
  }

  private async decryptAESGCM(encryptedData: {
    encrypted: string;
    nonce: string;
    tag: string;
  }, key: EncryptionKey): Promise<Buffer> {
    const keyBuffer = Buffer.from(key.keyData, 'base64');
    const nonce = Buffer.from(encryptedData.nonce, 'base64');
    const tag = Buffer.from(encryptedData.tag, 'base64');
    const encrypted = Buffer.from(encryptedData.encrypted, 'base64');

    const decipher = createDecipheriv('aes-256-gcm', keyBuffer, nonce);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted;
  }

  private async decryptChaCha20(encryptedData: {
    encrypted: string;
    nonce: string;
    tag: string;
  }, key: EncryptionKey): Promise<Buffer> {
    const keyBuffer = Buffer.from(key.keyData, 'base64');
    const nonce = Buffer.from(encryptedData.nonce, 'base64');
    const tag = Buffer.from(encryptedData.tag, 'base64');
    const encrypted = Buffer.from(encryptedData.encrypted, 'base64');

    const decipher = createDecipheriv('chacha20-poly1305', keyBuffer, nonce);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted;
  }

  private async decryptRSA(encryptedData: {
    encrypted: string;
    nonce: string;
    tag: string;
  }, key: EncryptionKey): Promise<Buffer> {
    const keyBuffer = Buffer.from(key.keyData, 'base64');
    const rsa = new NodeRSA();
    rsa.importKey(keyBuffer.toString('utf8'), 'private');

    // Verify HMAC tag for integrity
    const expectedTag = createHmac('sha256', keyBuffer)
      .update(Buffer.from(encryptedData.encrypted, 'base64'))
      .digest();

    const actualTag = Buffer.from(encryptedData.tag, 'base64');

    if (!expectedTag.equals(actualTag)) {
      throw new Error('Data integrity check failed');
    }

    const decrypted = rsa.decrypt(encryptedData.encrypted, 'utf8');
    return Buffer.from(decrypted, 'utf8');
  }

  public async rotateKeys(): Promise<void> {
    logger.info('Starting key rotation');

    try {
      // Mark current primary key as rotating
      const currentPrimary = this.keys.get('primary');
      if (currentPrimary) {
        currentPrimary.status = 'ROTATING';
        currentPrimary.rotatedAt = new Date();
      }

      // Generate new primary key
      const newPrimary = this.generateKey('ENCRYPTION');
      this.keys.set('primary', newPrimary);

      // Move old primary to backup
      if (currentPrimary) {
        currentPrimary.status = 'RETIRED';
        this.keys.set(`retired-${Date.now()}`, currentPrimary);
      }

      // Clean up old retired keys (keep only recent ones)
      this.cleanupRetiredKeys();

      logger.info('Key rotation completed successfully', {
        newKeyId: newPrimary.id,
        totalKeys: this.keys.size
      });
    } catch (error) {
      logger.error('Key rotation failed', { error: error.message });
      throw error;
    }
  }

  private cleanupRetiredKeys(): void {
    const retiredKeys = Array.from(this.keys.entries())
      .filter(([_, key]) => key.status === 'RETIRED')
      .sort(([_, a], [__, b]) => (b.rotatedAt?.getTime() || 0) - (a.rotatedAt?.getTime() || 0));

    // Keep only the most recent retired keys (up to backupKeys count)
    const keysToRemove = retiredKeys.slice(this.config.backupKeys);

    for (const [keyId] of keysToRemove) {
      this.keys.delete(keyId);
    }

    logger.debug('Cleaned up retired keys', {
      removedKeys: keysToRemove.length,
      retainedKeys: retiredKeys.length - keysToRemove.length
    });
  }

  private startKeyRotation(): void {
    const rotationMs = this.config.rotationInterval * 60 * 60 * 1000;

    this.keyRotationInterval = setInterval(async () => {
      try {
        await this.rotateKeys();
      } catch (error) {
        logger.error('Scheduled key rotation failed', { error: error.message });
      }
    }, rotationMs);

    logger.info('Key rotation scheduled', {
      intervalHours: this.config.rotationInterval,
      nextRotation: new Date(Date.now() + rotationMs)
    });
  }

  public getKeyInfo(keyId: string): EncryptionKey | undefined {
    return this.keys.get(keyId);
  }

  public getAllKeys(): EncryptionKey[] {
    return Array.from(this.keys.values());
  }

  public async generateDigitalSignature(data: string | Buffer, keyId: string = 'signing'): Promise<string> {
    const key = this.keys.get(keyId);
    if (!key || key.purpose !== 'SIGNING') {
      throw new Error(`Signing key not found: ${keyId}`);
    }

    const inputData = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
    const keyBuffer = Buffer.from(key.keyData, 'base64');

    // Create digital signature using HMAC-SHA256
    const signature = createHmac('sha256', keyBuffer)
      .update(inputData)
      .digest('base64');

    key.usage.encryptOperations++; // Count as encryption operation
    key.usage.lastUsed = new Date();

    logger.debug('Digital signature created', {
      keyId,
      dataSize: inputData.length
    });

    return signature;
  }

  public async verifyDigitalSignature(data: string | Buffer, signature: string, keyId: string = 'signing'): Promise<boolean> {
    const key = this.keys.get(keyId);
    if (!key || key.purpose !== 'SIGNING') {
      throw new Error(`Signing key not found: ${keyId}`);
    }

    const inputData = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
    const keyBuffer = Buffer.from(key.keyData, 'base64');

    // Generate expected signature
    const expectedSignature = createHmac('sha256', keyBuffer)
      .update(inputData)
      .digest('base64');

    const isValid = signature === expectedSignature;

    key.usage.decryptOperations++; // Count as decryption operation
    key.usage.lastUsed = new Date();

    logger.debug('Digital signature verified', {
      keyId,
      isValid,
      dataSize: inputData.length
    });

    return isValid;
  }

  public shutdown(): void {
    if (this.keyRotationInterval) {
      clearInterval(this.keyRotationInterval);
      this.keyRotationInterval = null;
    }

    // Clear sensitive key data
    this.keys.clear();

    logger.info('Encryption service shut down');
  }
}