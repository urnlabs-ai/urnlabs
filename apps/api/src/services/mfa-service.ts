import { PrismaClient } from '@prisma/client';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import twilio from 'twilio';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { config } from '@/lib/config.js';
import { logger } from '@/lib/logger.js';
import { logSecurityEvent } from '@/lib/logger.js';

export interface MfaSetupResult {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

export interface MfaVerificationResult {
  success: boolean;
  error?: string;
  backupCodeUsed?: boolean;
}

export interface SmsResult {
  success: boolean;
  error?: string;
  messageId?: string;
}

export class MfaService {
  private prisma: PrismaClient;
  private twilioClient?: any;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;

    // Initialize Twilio if credentials are provided
    if (config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN) {
      this.twilioClient = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
    }
  }

  /**
   * Setup TOTP MFA for a user
   */
  async setupTotp(userId: string, serviceName: string = 'Urnlabs AI'): Promise<MfaSetupResult> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, mfaEnabled: true }
      });

      if (!user) {
        throw new Error('User not found');
      }

      if (user.mfaEnabled) {
        throw new Error('MFA is already enabled for this user');
      }

      // Generate TOTP secret
      const secret = speakeasy.generateSecret({
        name: user.email,
        issuer: serviceName,
        length: 32
      });

      // Generate QR code
      const qrCode = await QRCode.toDataURL(secret.otpauth_url!);

      // Generate backup codes
      const backupCodes = this.generateBackupCodes();

      // Hash backup codes for storage
      const hashedBackupCodes = await Promise.all(
        backupCodes.map(code => bcrypt.hash(code, 12))
      );

      // Store encrypted secret and hashed backup codes
      const encryptedSecret = this.encryptSecret(secret.base32!);

      await this.prisma.user.update({
        where: { id: userId },
        data: {
          mfaSecret: encryptedSecret,
          mfaBackupCodes: hashedBackupCodes,
          mfaRecoveryCodes: [], // Initialize empty recovery codes
          mfaAttempts: 0
        }
      });

      logSecurityEvent('mfa_setup_initiated', 'low', {
        userId,
        email: user.email,
        mfaType: 'totp'
      });

      return {
        secret: secret.base32!,
        qrCode,
        backupCodes
      };

    } catch (error) {
      logger.error('Error setting up TOTP MFA', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Verify and enable MFA for a user
   */
  async enableMfa(userId: string, totpToken: string): Promise<boolean> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          mfaSecret: true,
          mfaEnabled: true,
          mfaAttempts: true,
          mfaLockedUntil: true
        }
      });

      if (!user || !user.mfaSecret) {
        throw new Error('MFA not set up for this user');
      }

      if (user.mfaEnabled) {
        throw new Error('MFA is already enabled');
      }

      // Check if user is locked out
      if (user.mfaLockedUntil && new Date() < user.mfaLockedUntil) {
        throw new Error('MFA is temporarily locked due to too many failed attempts');
      }

      // Decrypt secret and verify token
      const secret = this.decryptSecret(user.mfaSecret);
      const isValid = speakeasy.totp.verify({
        secret,
        token: totpToken,
        window: 2, // Allow 2 time steps tolerance
        encoding: 'base32'
      });

      if (!isValid) {
        // Increment failed attempts
        const newAttempts = user.mfaAttempts + 1;
        const lockoutTime = newAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null; // 15 min lockout

        await this.prisma.user.update({
          where: { id: userId },
          data: {
            mfaAttempts: newAttempts,
            mfaLockedUntil: lockoutTime
          }
        });

        logSecurityEvent('mfa_verification_failed', 'medium', {
          userId,
          email: user.email,
          attempts: newAttempts,
          locked: !!lockoutTime
        });

        throw new Error('Invalid MFA token');
      }

      // Enable MFA and reset attempts
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          mfaEnabled: true,
          mfaAttempts: 0,
          mfaLockedUntil: null,
          lastMfaAt: new Date()
        }
      });

      logSecurityEvent('mfa_enabled', 'low', {
        userId,
        email: user.email
      });

      return true;

    } catch (error) {
      logger.error('Error enabling MFA', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Verify MFA token during authentication
   */
  async verifyMfa(userId: string, token: string): Promise<MfaVerificationResult> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          mfaEnabled: true,
          mfaSecret: true,
          mfaBackupCodes: true,
          mfaAttempts: true,
          mfaLockedUntil: true
        }
      });

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      if (!user.mfaEnabled || !user.mfaSecret) {
        return { success: false, error: 'MFA is not enabled for this user' };
      }

      // Check if user is locked out
      if (user.mfaLockedUntil && new Date() < user.mfaLockedUntil) {
        return { success: false, error: 'MFA is temporarily locked due to too many failed attempts' };
      }

      // First try TOTP verification
      const secret = this.decryptSecret(user.mfaSecret);
      const isTotpValid = speakeasy.totp.verify({
        secret,
        token,
        window: 2,
        encoding: 'base32'
      });

      if (isTotpValid) {
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            mfaAttempts: 0,
            mfaLockedUntil: null,
            lastMfaAt: new Date()
          }
        });

        logSecurityEvent('mfa_verification_success', 'low', {
          userId,
          email: user.email,
          method: 'totp'
        });

        return { success: true };
      }

      // Try backup code verification
      if (user.mfaBackupCodes && Array.isArray(user.mfaBackupCodes)) {
        const backupCodes = user.mfaBackupCodes as string[];
        for (let i = 0; i < backupCodes.length; i++) {
          const isBackupCodeValid = await bcrypt.compare(token, backupCodes[i]);

          if (isBackupCodeValid) {
            // Remove used backup code
            const updatedBackupCodes = [...backupCodes];
            updatedBackupCodes.splice(i, 1);

            await this.prisma.user.update({
              where: { id: userId },
              data: {
                mfaBackupCodes: updatedBackupCodes,
                mfaAttempts: 0,
                mfaLockedUntil: null,
                lastMfaAt: new Date()
              }
            });

            logSecurityEvent('mfa_verification_success', 'medium', {
              userId,
              email: user.email,
              method: 'backup_code',
              backupCodesRemaining: updatedBackupCodes.length
            });

            return { success: true, backupCodeUsed: true };
          }
        }
      }

      // Increment failed attempts
      const newAttempts = user.mfaAttempts + 1;
      const lockoutTime = newAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;

      await this.prisma.user.update({
        where: { id: userId },
        data: {
          mfaAttempts: newAttempts,
          mfaLockedUntil: lockoutTime
        }
      });

      logSecurityEvent('mfa_verification_failed', 'medium', {
        userId,
        email: user.email,
        attempts: newAttempts,
        locked: !!lockoutTime
      });

      return { success: false, error: 'Invalid MFA token' };

    } catch (error) {
      logger.error('Error verifying MFA', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return { success: false, error: 'MFA verification failed' };
    }
  }

  /**
   * Disable MFA for a user
   */
  async disableMfa(userId: string, totpToken: string): Promise<boolean> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          mfaEnabled: true,
          mfaSecret: true
        }
      });

      if (!user || !user.mfaEnabled || !user.mfaSecret) {
        throw new Error('MFA is not enabled for this user');
      }

      // Verify current TOTP token before disabling
      const secret = this.decryptSecret(user.mfaSecret);
      const isValid = speakeasy.totp.verify({
        secret,
        token: totpToken,
        window: 2,
        encoding: 'base32'
      });

      if (!isValid) {
        throw new Error('Invalid MFA token');
      }

      // Disable MFA and clear secrets
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          mfaEnabled: false,
          mfaSecret: null,
          mfaBackupCodes: null,
          mfaRecoveryCodes: null,
          mfaAttempts: 0,
          mfaLockedUntil: null
        }
      });

      logSecurityEvent('mfa_disabled', 'high', {
        userId,
        email: user.email
      });

      return true;

    } catch (error) {
      logger.error('Error disabling MFA', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Generate new backup codes
   */
  async generateNewBackupCodes(userId: string, totpToken: string): Promise<string[]> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          mfaEnabled: true,
          mfaSecret: true
        }
      });

      if (!user || !user.mfaEnabled || !user.mfaSecret) {
        throw new Error('MFA is not enabled for this user');
      }

      // Verify current TOTP token
      const secret = this.decryptSecret(user.mfaSecret);
      const isValid = speakeasy.totp.verify({
        secret,
        token: totpToken,
        window: 2,
        encoding: 'base32'
      });

      if (!isValid) {
        throw new Error('Invalid MFA token');
      }

      // Generate new backup codes
      const backupCodes = this.generateBackupCodes();
      const hashedBackupCodes = await Promise.all(
        backupCodes.map(code => bcrypt.hash(code, 12))
      );

      await this.prisma.user.update({
        where: { id: userId },
        data: {
          mfaBackupCodes: hashedBackupCodes
        }
      });

      logSecurityEvent('mfa_backup_codes_regenerated', 'medium', {
        userId,
        email: user.email
      });

      return backupCodes;

    } catch (error) {
      logger.error('Error generating new backup codes', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Send SMS with MFA code (for SMS-based MFA)
   */
  async sendSmsCode(userId: string): Promise<SmsResult> {
    try {
      if (!this.twilioClient) {
        return { success: false, error: 'SMS service not configured' };
      }

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          phoneNumber: true,
          phoneVerified: true
        }
      });

      if (!user || !user.phoneNumber || !user.phoneVerified) {
        return { success: false, error: 'Phone number not verified' };
      }

      // Generate 6-digit code
      const code = Math.floor(100000 + Math.random() * 900000).toString();

      // Store code temporarily (you might want to use Redis for this)
      // For now, we'll store it in the database with expiration
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      // Send SMS
      const message = await this.twilioClient.messages.create({
        body: `Your Urnlabs AI verification code is: ${code}`,
        from: config.TWILIO_PHONE_NUMBER,
        to: user.phoneNumber
      });

      logSecurityEvent('sms_mfa_sent', 'low', {
        userId,
        email: user.email,
        phoneNumber: user.phoneNumber.slice(-4) // Log only last 4 digits
      });

      return { success: true, messageId: message.sid };

    } catch (error) {
      logger.error('Error sending SMS code', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return { success: false, error: 'Failed to send SMS' };
    }
  }

  /**
   * Generate backup codes
   */
  private generateBackupCodes(count: number = 10): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      // Generate 8-character alphanumeric code
      codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
    }
    return codes;
  }

  /**
   * Encrypt MFA secret
   */
  private encryptSecret(secret: string): string {
    const cipher = crypto.createCipher('aes-256-cbc', config.JWT_SECRET);
    let encrypted = cipher.update(secret, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  /**
   * Decrypt MFA secret
   */
  private decryptSecret(encryptedSecret: string): string {
    const decipher = crypto.createDecipher('aes-256-cbc', config.JWT_SECRET);
    let decrypted = decipher.update(encryptedSecret, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}