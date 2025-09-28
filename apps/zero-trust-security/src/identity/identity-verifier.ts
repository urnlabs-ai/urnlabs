import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { logger } from '../utils/logger.js';
import type {
  Identity,
  VerificationLevel,
  AuthenticationFactor,
  SessionInfo,
  SecurityContext,
  RiskAssessment,
  RiskFactor
} from '../types/security-types.js';

export class IdentityVerifier {
  private sessions: Map<string, SessionInfo> = new Map();
  private identities: Map<string, Identity> = new Map();
  private verificationSecrets: Map<string, string> = new Map();
  private riskThreshold: number = 70; // 0-100 scale

  constructor() {
    this.initializeVerifier();
  }

  private initializeVerifier(): void {
    logger.info('Initializing identity verification service');

    // Start session cleanup interval
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  public async authenticateUser(credentials: {
    email: string;
    password?: string;
    mfaToken?: string;
    biometricData?: string;
    certificateData?: string;
    deviceId: string;
    ipAddress: string;
    userAgent: string;
  }): Promise<{
    success: boolean;
    identity?: Identity;
    sessionToken?: string;
    requiresAdditionalVerification?: boolean;
    verificationMethods?: string[];
    riskAssessment: RiskAssessment;
  }> {
    logger.info('Starting user authentication', {
      email: credentials.email,
      deviceId: credentials.deviceId,
      hasPassword: !!credentials.password,
      hasMFA: !!credentials.mfaToken,
      hasBiometric: !!credentials.biometricData,
      hasCertificate: !!credentials.certificateData
    });

    try {
      // First, perform risk assessment
      const riskAssessment = await this.assessAuthenticationRisk(credentials);

      // Get or create identity
      let identity = this.identities.get(credentials.email);
      if (!identity) {
        // For demo purposes, create a basic identity
        identity = await this.createBasicIdentity(credentials.email);
      }

      // Verify primary authentication factor (password)
      if (credentials.password) {
        const passwordValid = await this.verifyPassword(credentials.email, credentials.password);
        if (!passwordValid) {
          logger.warn('Password verification failed', { email: credentials.email });
          return {
            success: false,
            riskAssessment: {
              ...riskAssessment,
              overallScore: Math.min(riskAssessment.overallScore + 20, 100)
            }
          };
        }
      }

      // Determine required verification level based on risk
      const requiredLevel = this.determineRequiredVerificationLevel(riskAssessment);

      // Check if current verification meets requirements
      const currentFactors = this.getCurrentAuthenticationFactors(credentials);
      const verificationResult = await this.verifyAuthenticationFactors(
        currentFactors,
        requiredLevel,
        credentials.email
      );

      if (!verificationResult.sufficient) {
        return {
          success: false,
          requiresAdditionalVerification: true,
          verificationMethods: verificationResult.additionalMethodsRequired,
          riskAssessment
        };
      }

      // Update identity verification level
      identity.verificationLevel = {
        level: requiredLevel.level,
        factors: currentFactors,
        requiredFactors: requiredLevel.requiredFactors,
        lastVerified: new Date()
      };

      // Create session
      const sessionInfo = await this.createSession(identity, credentials);
      const sessionToken = await this.generateSessionToken(sessionInfo);

      // Update identity with session info
      identity.sessionInfo = sessionInfo;
      identity.lastAuthenticated = new Date();

      this.identities.set(credentials.email, identity);

      logger.info('User authentication successful', {
        userId: identity.id,
        email: credentials.email,
        verificationLevel: identity.verificationLevel.level,
        sessionId: sessionInfo.sessionId,
        riskScore: riskAssessment.overallScore
      });

      return {
        success: true,
        identity,
        sessionToken,
        riskAssessment
      };

    } catch (error) {
      logger.error('Authentication failed', {
        email: credentials.email,
        error: error.message
      });

      return {
        success: false,
        riskAssessment: {
          overallScore: 100,
          factors: [{ type: 'SYSTEM_ERROR', weight: 1, score: 100, description: 'Authentication system error' }],
          recommendations: ['Contact system administrator'],
          timestamp: new Date()
        }
      };
    }
  }

  private async assessAuthenticationRisk(credentials: {
    email: string;
    deviceId: string;
    ipAddress: string;
    userAgent: string;
  }): Promise<RiskAssessment> {
    const factors: RiskFactor[] = [];
    let totalScore = 0;

    // Check device trust
    const isKnownDevice = await this.isKnownDevice(credentials.deviceId, credentials.email);
    if (!isKnownDevice) {
      factors.push({
        type: 'UNKNOWN_DEVICE',
        weight: 0.3,
        score: 40,
        description: 'Authentication from unknown device'
      });
      totalScore += 40 * 0.3;
    }

    // Check IP reputation
    const ipRisk = await this.assessIPRisk(credentials.ipAddress);
    factors.push({
      type: 'IP_REPUTATION',
      weight: 0.2,
      score: ipRisk,
      description: `IP address risk score: ${ipRisk}`
    });
    totalScore += ipRisk * 0.2;

    // Check time-based patterns
    const timeRisk = await this.assessTimeBasedRisk(credentials.email);
    factors.push({
      type: 'TIME_PATTERN',
      weight: 0.15,
      score: timeRisk,
      description: 'Login time pattern analysis'
    });
    totalScore += timeRisk * 0.15;

    // Check user agent
    const uaRisk = await this.assessUserAgentRisk(credentials.userAgent, credentials.email);
    factors.push({
      type: 'USER_AGENT',
      weight: 0.1,
      score: uaRisk,
      description: 'User agent analysis'
    });
    totalScore += uaRisk * 0.1;

    // Check recent failed attempts
    const failureRisk = await this.assessRecentFailures(credentials.email);
    factors.push({
      type: 'RECENT_FAILURES',
      weight: 0.25,
      score: failureRisk,
      description: 'Recent authentication failures'
    });
    totalScore += failureRisk * 0.25;

    const overallScore = Math.round(totalScore);
    const recommendations = this.generateRiskRecommendations(overallScore, factors);

    return {
      overallScore,
      factors,
      recommendations,
      timestamp: new Date()
    };
  }

  private async isKnownDevice(deviceId: string, email: string): Promise<boolean> {
    // In production, this would check a device registry
    // For demo, consider devices "known" after first use
    return this.verificationSecrets.has(`device:${deviceId}:${email}`);
  }

  private async assessIPRisk(ipAddress: string): Promise<number> {
    // Basic IP risk assessment - in production, integrate with threat intelligence
    const privateIPRanges = [
      /^10\./,
      /^192\.168\./,
      /^172\.(1[6-9]|2\d|3[01])\./,
      /^127\./,
      /^localhost$/
    ];

    const isPrivate = privateIPRanges.some(range => range.test(ipAddress));
    if (isPrivate) {
      return 10; // Low risk for private IPs
    }

    // For demo, assign random risk scores to public IPs
    const hash = crypto.createHash('md5').update(ipAddress).digest('hex');
    const risk = parseInt(hash.substring(0, 2), 16) % 60; // 0-59 risk for public IPs

    return risk;
  }

  private async assessTimeBasedRisk(email: string): Promise<number> {
    const now = new Date();
    const hour = now.getHours();

    // Higher risk for unusual hours (2 AM - 6 AM)
    if (hour >= 2 && hour <= 6) {
      return 30;
    }

    // Lower risk for business hours
    if (hour >= 8 && hour <= 18) {
      return 5;
    }

    return 15; // Moderate risk for evening/early morning
  }

  private async assessUserAgentRisk(userAgent: string, email: string): Promise<number> {
    // Check for suspicious user agent patterns
    const suspiciousPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /automated/i,
      /script/i
    ];

    const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(userAgent));
    if (isSuspicious) {
      return 50;
    }

    // Check if user agent is consistent with previous logins
    const lastUserAgent = this.verificationSecrets.get(`ua:${email}`);
    if (lastUserAgent && lastUserAgent !== userAgent) {
      return 25; // Different user agent
    }

    return 5; // Low risk
  }

  private async assessRecentFailures(email: string): Promise<number> {
    // In production, this would check failure logs
    // For demo, simulate some failure history
    const failureCount = Math.floor(Math.random() * 3);
    return failureCount * 20; // 20 points per recent failure
  }

  private generateRiskRecommendations(score: number, factors: RiskFactor[]): string[] {
    const recommendations: string[] = [];

    if (score >= 80) {
      recommendations.push('Require multi-factor authentication');
      recommendations.push('Additional identity verification required');
      recommendations.push('Consider blocking this authentication attempt');
    } else if (score >= 60) {
      recommendations.push('Require additional verification factor');
      recommendations.push('Monitor session closely');
    } else if (score >= 40) {
      recommendations.push('Consider requesting additional verification');
      recommendations.push('Log for security monitoring');
    } else {
      recommendations.push('Standard authentication flow acceptable');
    }

    // Add specific recommendations based on risk factors
    factors.forEach(factor => {
      if (factor.score >= 40) {
        switch (factor.type) {
          case 'UNKNOWN_DEVICE':
            recommendations.push('Device enrollment and verification required');
            break;
          case 'IP_REPUTATION':
            recommendations.push('IP address verification required');
            break;
          case 'RECENT_FAILURES':
            recommendations.push('Account security review recommended');
            break;
        }
      }
    });

    return Array.from(new Set(recommendations)); // Remove duplicates
  }

  private determineRequiredVerificationLevel(riskAssessment: RiskAssessment): VerificationLevel {
    const score = riskAssessment.overallScore;

    if (score >= 80) {
      return {
        level: 'CERTIFICATE',
        factors: [],
        requiredFactors: 3,
        lastVerified: new Date()
      };
    } else if (score >= 60) {
      return {
        level: 'BIOMETRIC',
        factors: [],
        requiredFactors: 2,
        lastVerified: new Date()
      };
    } else if (score >= 40) {
      return {
        level: 'MFA',
        factors: [],
        requiredFactors: 2,
        lastVerified: new Date()
      };
    } else {
      return {
        level: 'BASIC',
        factors: [],
        requiredFactors: 1,
        lastVerified: new Date()
      };
    }
  }

  private getCurrentAuthenticationFactors(credentials: {
    password?: string;
    mfaToken?: string;
    biometricData?: string;
    certificateData?: string;
  }): AuthenticationFactor[] {
    const factors: AuthenticationFactor[] = [];

    if (credentials.password) {
      factors.push({
        type: 'PASSWORD',
        status: 'ACTIVE',
        metadata: { verified: true }
      });
    }

    if (credentials.mfaToken) {
      factors.push({
        type: 'TOTP',
        status: 'ACTIVE',
        metadata: { token: credentials.mfaToken }
      });
    }

    if (credentials.biometricData) {
      factors.push({
        type: 'BIOMETRIC',
        status: 'ACTIVE',
        metadata: { verified: true }
      });
    }

    if (credentials.certificateData) {
      factors.push({
        type: 'CERTIFICATE',
        status: 'ACTIVE',
        metadata: { certificate: credentials.certificateData }
      });
    }

    return factors;
  }

  private async verifyAuthenticationFactors(
    factors: AuthenticationFactor[],
    required: VerificationLevel,
    email: string
  ): Promise<{
    sufficient: boolean;
    additionalMethodsRequired: string[];
  }> {
    const factorTypes = factors.map(f => f.type);
    const additionalMethodsRequired: string[] = [];

    // Check if we have enough factors
    if (factors.length < required.requiredFactors) {
      const needed = required.requiredFactors - factors.length;

      // Suggest additional methods based on required level
      switch (required.level) {
        case 'CERTIFICATE':
          if (!factorTypes.includes('CERTIFICATE')) {
            additionalMethodsRequired.push('CERTIFICATE');
          }
          if (!factorTypes.includes('BIOMETRIC') && additionalMethodsRequired.length < needed) {
            additionalMethodsRequired.push('BIOMETRIC');
          }
          if (!factorTypes.includes('TOTP') && additionalMethodsRequired.length < needed) {
            additionalMethodsRequired.push('TOTP');
          }
          break;
        case 'BIOMETRIC':
          if (!factorTypes.includes('BIOMETRIC')) {
            additionalMethodsRequired.push('BIOMETRIC');
          }
          if (!factorTypes.includes('TOTP') && additionalMethodsRequired.length < needed) {
            additionalMethodsRequired.push('TOTP');
          }
          break;
        case 'MFA':
          if (!factorTypes.includes('TOTP') && !factorTypes.includes('SMS')) {
            additionalMethodsRequired.push('TOTP');
          }
          break;
      }

      return {
        sufficient: false,
        additionalMethodsRequired: additionalMethodsRequired.slice(0, needed)
      };
    }

    // Verify each factor
    for (const factor of factors) {
      const isValid = await this.verifyFactor(factor, email);
      if (!isValid) {
        return {
          sufficient: false,
          additionalMethodsRequired: [factor.type]
        };
      }
    }

    return {
      sufficient: true,
      additionalMethodsRequired: []
    };
  }

  private async verifyFactor(factor: AuthenticationFactor, email: string): Promise<boolean> {
    switch (factor.type) {
      case 'PASSWORD':
        return true; // Already verified in main authentication
      case 'TOTP':
        return this.verifyTOTP(factor.metadata?.token, email);
      case 'BIOMETRIC':
        return this.verifyBiometric(factor.metadata, email);
      case 'CERTIFICATE':
        return this.verifyCertificate(factor.metadata?.certificate, email);
      case 'SMS':
      case 'EMAIL':
        return this.verifyOTP(factor.metadata?.code, email, factor.type);
      default:
        return false;
    }
  }

  private async verifyPassword(email: string, password: string): Promise<boolean> {
    // In production, this would query the user database
    // For demo, accept any password for users with stored hash
    const storedHash = this.verificationSecrets.get(`password:${email}`);

    if (!storedHash) {
      // Create hash for new user (demo only)
      const hash = await bcrypt.hash(password, 12);
      this.verificationSecrets.set(`password:${email}`, hash);
      return true;
    }

    return bcrypt.compare(password, storedHash);
  }

  private async verifyTOTP(token: string, email: string): Promise<boolean> {
    // Simplified TOTP verification - in production, use proper TOTP library
    if (!token || token.length !== 6) {
      return false;
    }

    // For demo, accept tokens that are numeric and 6 digits
    return /^\d{6}$/.test(token);
  }

  private async verifyBiometric(metadata: any, email: string): Promise<boolean> {
    // Simplified biometric verification - in production, use proper biometric matching
    return !!metadata && metadata.verified === true;
  }

  private async verifyCertificate(certificateData: string, email: string): Promise<boolean> {
    // Simplified certificate verification
    if (!certificateData) {
      return false;
    }

    try {
      // Basic certificate format validation
      return certificateData.includes('BEGIN CERTIFICATE') &&
             certificateData.includes('END CERTIFICATE');
    } catch {
      return false;
    }
  }

  private async verifyOTP(code: string, email: string, type: 'SMS' | 'EMAIL'): Promise<boolean> {
    // Simplified OTP verification
    if (!code || code.length < 4) {
      return false;
    }

    // For demo, accept any numeric code
    return /^\d+$/.test(code);
  }

  private async createBasicIdentity(email: string): Promise<Identity> {
    const identity: Identity = {
      id: crypto.randomUUID(),
      userId: crypto.randomUUID(),
      email,
      roles: ['user'],
      permissions: [
        {
          resource: 'profile',
          actions: ['read', 'update']
        },
        {
          resource: 'dashboard',
          actions: ['read']
        }
      ],
      attributes: {
        createdAt: new Date(),
        source: 'zero-trust-auth'
      },
      verificationLevel: {
        level: 'NONE',
        factors: [],
        requiredFactors: 1,
        lastVerified: new Date()
      },
      lastAuthenticated: new Date(),
      sessionInfo: {
        sessionId: '',
        createdAt: new Date(),
        expiresAt: new Date(),
        ipAddress: '',
        userAgent: '',
        deviceId: '',
        riskScore: 0
      }
    };

    this.identities.set(email, identity);
    logger.info('Created basic identity', { email, userId: identity.id });

    return identity;
  }

  private async createSession(identity: Identity, credentials: {
    deviceId: string;
    ipAddress: string;
    userAgent: string;
  }): Promise<SessionInfo> {
    const sessionId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    const sessionInfo: SessionInfo = {
      sessionId,
      createdAt: now,
      expiresAt,
      ipAddress: credentials.ipAddress,
      userAgent: credentials.userAgent,
      deviceId: credentials.deviceId,
      riskScore: 0 // Will be updated with risk assessment
    };

    this.sessions.set(sessionId, sessionInfo);

    // Mark device as known for future authentications
    this.verificationSecrets.set(`device:${credentials.deviceId}:${identity.email}`, 'known');
    this.verificationSecrets.set(`ua:${identity.email}`, credentials.userAgent);

    logger.info('Session created', {
      sessionId,
      userId: identity.id,
      expiresAt
    });

    return sessionInfo;
  }

  private async generateSessionToken(sessionInfo: SessionInfo): Promise<string> {
    const payload = {
      sessionId: sessionInfo.sessionId,
      iat: Math.floor(sessionInfo.createdAt.getTime() / 1000),
      exp: Math.floor(sessionInfo.expiresAt.getTime() / 1000)
    };

    // In production, use a proper JWT secret from environment
    const secret = process.env.JWT_SECRET || 'zero-trust-demo-secret';

    return jwt.sign(payload, secret);
  }

  public async validateSession(sessionToken: string): Promise<{
    valid: boolean;
    session?: SessionInfo;
    identity?: Identity;
  }> {
    try {
      const secret = process.env.JWT_SECRET || 'zero-trust-demo-secret';
      const decoded = jwt.verify(sessionToken, secret) as any;

      const session = this.sessions.get(decoded.sessionId);
      if (!session) {
        return { valid: false };
      }

      // Check if session is expired
      if (session.expiresAt < new Date()) {
        this.sessions.delete(decoded.sessionId);
        return { valid: false };
      }

      // Find associated identity
      const identity = Array.from(this.identities.values())
        .find(id => id.sessionInfo.sessionId === decoded.sessionId);

      return {
        valid: true,
        session,
        identity
      };
    } catch (error) {
      logger.warn('Session validation failed', { error: error.message });
      return { valid: false };
    }
  }

  private cleanupExpiredSessions(): void {
    const now = new Date();
    let cleanedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt < now) {
        this.sessions.delete(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug('Cleaned up expired sessions', { count: cleanedCount });
    }
  }

  public getSessionMetrics(): {
    totalSessions: number;
    activeSessions: number;
    expiredSessions: number;
  } {
    const now = new Date();
    let activeSessions = 0;
    let expiredSessions = 0;

    for (const session of this.sessions.values()) {
      if (session.expiresAt > now) {
        activeSessions++;
      } else {
        expiredSessions++;
      }
    }

    return {
      totalSessions: this.sessions.size,
      activeSessions,
      expiredSessions
    };
  }

  public shutdown(): void {
    this.sessions.clear();
    this.identities.clear();
    this.verificationSecrets.clear();
    logger.info('Identity verifier shut down');
  }
}