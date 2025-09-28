import crypto from 'crypto';
import { promisify } from 'util';
import bcrypt from 'bcrypt';

export interface EncryptionConfig {
  algorithm: string;
  keyLength: number;
  ivLength: number;
  saltLength: number;
  tagLength: number;
  iterations: number;
}

export interface EncryptedData {
  encrypted: string;
  iv: string;
  salt: string;
  tag: string;
  algorithm: string;
}

export interface KeyPair {
  publicKey: string;
  privateKey: string;
}

export class EncryptionService {
  private readonly config: EncryptionConfig;
  private readonly scrypt = promisify(crypto.scrypt);

  constructor(config?: Partial<EncryptionConfig>) {
    this.config = {
      algorithm: 'aes-256-gcm',
      keyLength: 32,
      ivLength: 16,
      saltLength: 32,
      tagLength: 16,
      iterations: 100000,
      ...config
    };
  }

  /**
   * Generate a secure random key
   */
  generateKey(): Buffer {
    return crypto.randomBytes(this.config.keyLength);
  }

  /**
   * Generate a secure random salt
   */
  generateSalt(): Buffer {
    return crypto.randomBytes(this.config.saltLength);
  }

  /**
   * Generate a secure random IV
   */
  generateIV(): Buffer {
    return crypto.randomBytes(this.config.ivLength);
  }

  /**
   * Derive a key from a password using PBKDF2
   */
  async deriveKey(password: string, salt: Buffer): Promise<Buffer> {
    return await this.scrypt(password, salt, this.config.keyLength) as Buffer;
  }

  /**
   * Encrypt data with AES-256-GCM using a derived key
   */
  async encryptWithPassword(data: string, password: string): Promise<EncryptedData> {
    const salt = this.generateSalt();
    const iv = this.generateIV();
    const key = await this.deriveKey(password, salt);

    const cipher = crypto.createCipherGCM(this.config.algorithm, key, iv);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      salt: salt.toString('hex'),
      tag: tag.toString('hex'),
      algorithm: this.config.algorithm
    };
  }

  /**
   * Decrypt data with AES-256-GCM using a derived key
   */
  async decryptWithPassword(encryptedData: EncryptedData, password: string): Promise<string> {
    const salt = Buffer.from(encryptedData.salt, 'hex');
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const tag = Buffer.from(encryptedData.tag, 'hex');

    const key = await this.deriveKey(password, salt);

    const decipher = crypto.createDecipherGCM(encryptedData.algorithm, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Encrypt data with a direct key
   */
  encryptWithKey(data: string, key: Buffer): EncryptedData {
    const iv = this.generateIV();
    const cipher = crypto.createCipherGCM(this.config.algorithm, key, iv);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      salt: '',
      tag: tag.toString('hex'),
      algorithm: this.config.algorithm
    };
  }

  /**
   * Decrypt data with a direct key
   */
  decryptWithKey(encryptedData: EncryptedData, key: Buffer): string {
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const tag = Buffer.from(encryptedData.tag, 'hex');

    const decipher = crypto.createDecipherGCM(encryptedData.algorithm, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Generate RSA key pair for asymmetric encryption
   */
  generateKeyPair(): KeyPair {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 4096,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });

    return { publicKey, privateKey };
  }

  /**
   * Encrypt data using RSA public key
   */
  encryptAsymmetric(data: string, publicKey: string): string {
    const encrypted = crypto.publicEncrypt(
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256'
      },
      Buffer.from(data, 'utf8')
    );

    return encrypted.toString('base64');
  }

  /**
   * Decrypt data using RSA private key
   */
  decryptAsymmetric(encryptedData: string, privateKey: string): string {
    const decrypted = crypto.privateDecrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256'
      },
      Buffer.from(encryptedData, 'base64')
    );

    return decrypted.toString('utf8');
  }

  /**
   * Create HMAC signature
   */
  createHMAC(data: string, key: string): string {
    return crypto.createHmac('sha256', key).update(data).digest('hex');
  }

  /**
   * Verify HMAC signature
   */
  verifyHMAC(data: string, signature: string, key: string): boolean {
    const computedSignature = this.createHMAC(data, key);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(computedSignature, 'hex')
    );
  }

  /**
   * Hash password using bcrypt
   */
  async hashPassword(password: string, rounds: number = 12): Promise<string> {
    return await bcrypt.hash(password, rounds);
  }

  /**
   * Verify password against bcrypt hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(password, hash);
  }

  /**
   * Generate secure random token
   */
  generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate UUID v4
   */
  generateUUID(): string {
    return crypto.randomUUID();
  }

  /**
   * Create digital signature using private key
   */
  sign(data: string, privateKey: string): string {
    const signer = crypto.createSign('SHA256');
    signer.update(data);
    return signer.sign(privateKey, 'base64');
  }

  /**
   * Verify digital signature using public key
   */
  verify(data: string, signature: string, publicKey: string): boolean {
    const verifier = crypto.createVerify('SHA256');
    verifier.update(data);
    return verifier.verify(publicKey, signature, 'base64');
  }

  /**
   * Encrypt data for transport (hybrid encryption)
   */
  encryptForTransport(data: string, recipientPublicKey: string): {
    encryptedData: EncryptedData;
    encryptedKey: string;
  } {
    // Generate symmetric key for data encryption
    const symmetricKey = this.generateKey();

    // Encrypt data with symmetric key
    const encryptedData = this.encryptWithKey(data, symmetricKey);

    // Encrypt symmetric key with recipient's public key
    const encryptedKey = this.encryptAsymmetric(symmetricKey.toString('hex'), recipientPublicKey);

    return {
      encryptedData,
      encryptedKey
    };
  }

  /**
   * Decrypt data from transport (hybrid decryption)
   */
  decryptFromTransport(
    encryptedData: EncryptedData,
    encryptedKey: string,
    recipientPrivateKey: string
  ): string {
    // Decrypt symmetric key with private key
    const symmetricKeyHex = this.decryptAsymmetric(encryptedKey, recipientPrivateKey);
    const symmetricKey = Buffer.from(symmetricKeyHex, 'hex');

    // Decrypt data with symmetric key
    return this.decryptWithKey(encryptedData, symmetricKey);
  }
}

export const encryptionService = new EncryptionService();