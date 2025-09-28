import crypto from 'crypto';
import { encryptionService } from './encryption';

export interface IdentityProfile {
  userId: string;
  email: string;
  phoneNumber?: string;
  biometricHashes?: {
    fingerprint?: string[];
    face?: string;
    voice?: string;
  };
  verificationLevel: 'BASIC' | 'STANDARD' | 'ENHANCED' | 'MAXIMUM';
  verifiedAt: Date;
  lastVerificationAt?: Date;
  failedAttempts: number;
  lockedUntil?: Date;
  metadata?: Record<string, any>;
}

export interface DeviceProfile {
  deviceId: string;
  userId: string;
  deviceFingerprint: string;
  deviceType: 'mobile' | 'desktop' | 'tablet' | 'iot' | 'unknown';
  platform: string;
  browserInfo?: {
    name: string;
    version: string;
    userAgent: string;
  };
  trustLevel: 'UNKNOWN' | 'LOW' | 'MEDIUM' | 'HIGH' | 'TRUSTED';
  firstSeen: Date;
  lastSeen: Date;
  geolocation?: {
    country: string;
    region: string;
    city: string;
    latitude?: number;
    longitude?: number;
  };
  riskFactors: string[];
  isCompromised: boolean;
  metadata?: Record<string, any>;
}

export interface VerificationChallenge {
  challengeId: string;
  userId: string;
  type: 'SMS' | 'EMAIL' | 'TOTP' | 'BIOMETRIC' | 'PUSH' | 'HARDWARE_TOKEN';
  challenge: string;
  hashedResponse?: string;
  expiresAt: Date;
  attempts: number;
  maxAttempts: number;
  verified: boolean;
  metadata?: Record<string, any>;
}

export interface VerificationResult {
  success: boolean;
  verificationLevel: IdentityProfile['verificationLevel'];
  trustScore: number;
  challenges: VerificationChallenge[];
  riskFactors: string[];
  recommendedActions: string[];
  expiresAt?: Date;
}

export interface ContinuousAuthContext {
  sessionId: string;
  userId: string;
  deviceId: string;
  currentRiskScore: number;
  behaviorBaseline: {
    typingPattern?: number[];
    mouseMovement?: number[];
    navigationPattern?: string[];
    timeOfAccess?: { start: string; end: string };
  };
  anomalies: string[];
  lastVerification: Date;
}

export class IdentityVerificationService {
  private identityProfiles: Map<string, IdentityProfile> = new Map();
  private deviceProfiles: Map<string, DeviceProfile> = new Map();
  private verificationChallenges: Map<string, VerificationChallenge> = new Map();
  private continuousAuthSessions: Map<string, ContinuousAuthContext> = new Map();

  private readonly riskThresholds = {
    LOW: 20,
    MEDIUM: 50,
    HIGH: 80,
    CRITICAL: 95
  };

  /**
   * Register a new identity profile
   */
  async registerIdentity(profile: Omit<IdentityProfile, 'verifiedAt' | 'failedAttempts'>): Promise<string> {
    const fullProfile: IdentityProfile = {
      ...profile,
      verifiedAt: new Date(),
      failedAttempts: 0
    };

    this.identityProfiles.set(profile.userId, fullProfile);
    return profile.userId;
  }

  /**
   * Register a new device
   */
  async registerDevice(device: Omit<DeviceProfile, 'firstSeen' | 'lastSeen' | 'riskFactors' | 'isCompromised'>): Promise<string> {
    const deviceProfile: DeviceProfile = {
      ...device,
      firstSeen: new Date(),
      lastSeen: new Date(),
      riskFactors: [],
      isCompromised: false
    };

    // Calculate initial trust level
    deviceProfile.trustLevel = this.calculateDeviceTrustLevel(deviceProfile);

    this.deviceProfiles.set(device.deviceId, deviceProfile);
    return device.deviceId;
  }

  /**
   * Initiate multi-factor authentication
   */
  async initiateMFA(
    userId: string,
    deviceId: string,
    challengeTypes: VerificationChallenge['type'][]
  ): Promise<VerificationChallenge[]> {
    const challenges: VerificationChallenge[] = [];

    for (const type of challengeTypes) {
      const challenge = await this.createVerificationChallenge(userId, type);
      challenges.push(challenge);
    }

    return challenges;
  }

  /**
   * Create a verification challenge
   */
  private async createVerificationChallenge(
    userId: string,
    type: VerificationChallenge['type']
  ): Promise<VerificationChallenge> {
    const challengeId = encryptionService.generateUUID();
    const challenge = this.generateChallenge(type);

    const verificationChallenge: VerificationChallenge = {
      challengeId,
      userId,
      type,
      challenge,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      attempts: 0,
      maxAttempts: 3,
      verified: false
    };

    this.verificationChallenges.set(challengeId, verificationChallenge);

    // Send challenge via appropriate channel
    await this.sendChallenge(verificationChallenge);

    return verificationChallenge;
  }

  /**
   * Generate challenge based on type
   */
  private generateChallenge(type: VerificationChallenge['type']): string {
    switch (type) {
      case 'SMS':
      case 'EMAIL':
        return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code

      case 'TOTP':
        return ''; // TOTP doesn't need a challenge string

      case 'BIOMETRIC':
        return encryptionService.generateToken(32);

      case 'PUSH':
        return encryptionService.generateUUID();

      case 'HARDWARE_TOKEN':
        return encryptionService.generateToken(16);

      default:
        throw new Error(`Unsupported challenge type: ${type}`);
    }
  }

  /**
   * Send challenge via appropriate channel
   */
  private async sendChallenge(challenge: VerificationChallenge): Promise<void> {
    const identity = this.identityProfiles.get(challenge.userId);
    if (!identity) {
      throw new Error('Identity profile not found');
    }

    switch (challenge.type) {
      case 'SMS':
        // Integrate with SMS service (Twilio, AWS SNS, etc.)
        console.log(`SMS code ${challenge.challenge} sent to ${identity.phoneNumber}`);
        break;

      case 'EMAIL':
        // Integrate with email service (SendGrid, AWS SES, etc.)
        console.log(`Email code ${challenge.challenge} sent to ${identity.email}`);
        break;

      case 'PUSH':
        // Send push notification to registered devices
        console.log(`Push notification sent for challenge ${challenge.challengeId}`);
        break;

      case 'TOTP':
      case 'BIOMETRIC':
      case 'HARDWARE_TOKEN':
        // These don't require sending anything
        break;
    }
  }

  /**
   * Verify challenge response
   */
  async verifyChallenge(challengeId: string, response: string): Promise<boolean> {
    const challenge = this.verificationChallenges.get(challengeId);
    if (!challenge) {
      throw new Error('Challenge not found');
    }

    if (challenge.expiresAt < new Date()) {
      throw new Error('Challenge expired');
    }

    if (challenge.attempts >= challenge.maxAttempts) {
      throw new Error('Maximum attempts exceeded');
    }

    challenge.attempts++;

    let isValid = false;

    switch (challenge.type) {
      case 'SMS':
      case 'EMAIL':
        isValid = response === challenge.challenge;
        break;

      case 'TOTP':
        isValid = this.verifyTOTP(challenge.userId, response);
        break;

      case 'BIOMETRIC':
        isValid = await this.verifyBiometric(challenge.userId, response);
        break;

      case 'PUSH':
      case 'HARDWARE_TOKEN':
        isValid = this.verifyTokenResponse(challenge.challenge, response);
        break;
    }

    if (isValid) {
      challenge.verified = true;
      challenge.hashedResponse = encryptionService.createHMAC(response, challenge.challengeId);
    }

    return isValid;
  }

  /**
   * Verify TOTP code
   */
  private verifyTOTP(userId: string, code: string): boolean {
    // In production, integrate with TOTP library (speakeasy, etc.)
    // This is a simplified implementation
    const expectedCode = this.generateTOTP(userId);
    return code === expectedCode;
  }

  /**
   * Generate TOTP code for user
   */
  private generateTOTP(userId: string): string {
    // Simplified TOTP generation - use proper TOTP library in production
    const secret = encryptionService.createHMAC(userId, 'totp-secret');
    const timeStep = Math.floor(Date.now() / 30000);
    const code = encryptionService.createHMAC(timeStep.toString(), secret).slice(0, 6);
    return code;
  }

  /**
   * Verify biometric data
   */
  private async verifyBiometric(userId: string, biometricData: string): Promise<boolean> {
    const identity = this.identityProfiles.get(userId);
    if (!identity?.biometricHashes) {
      return false;
    }

    // Hash the provided biometric data
    const hashedBiometric = encryptionService.createHMAC(biometricData, userId);

    // Check against stored biometric hashes
    // In production, use proper biometric matching algorithms
    return Object.values(identity.biometricHashes).some(hashes => {
      if (Array.isArray(hashes)) {
        return hashes.includes(hashedBiometric);
      }
      return hashes === hashedBiometric;
    });
  }

  /**
   * Verify token response
   */
  private verifyTokenResponse(challenge: string, response: string): boolean {
    // Simplified token verification
    const expectedResponse = encryptionService.createHMAC(challenge, 'token-secret');
    return response === expectedResponse;
  }

  /**
   * Perform comprehensive identity verification
   */
  async verifyIdentity(
    userId: string,
    deviceId: string,
    context: {
      ip: string;
      userAgent: string;
      location?: { country: string; region: string };
      behaviorData?: any;
    }
  ): Promise<VerificationResult> {
    const identity = this.identityProfiles.get(userId);
    const device = this.deviceProfiles.get(deviceId);

    if (!identity) {
      throw new Error('Identity profile not found');
    }

    // Calculate trust score
    const trustScore = this.calculateTrustScore(identity, device, context);

    // Determine required verification level
    const requiredLevel = this.determineRequiredVerificationLevel(trustScore);

    // Generate risk factors
    const riskFactors = this.identifyRiskFactors(identity, device, context);

    // Determine required challenges
    const challengeTypes = this.determineChallengeTypes(requiredLevel, riskFactors);

    // Create challenges if needed
    const challenges = challengeTypes.length > 0
      ? await this.initiateMFA(userId, deviceId, challengeTypes)
      : [];

    // Generate recommendations
    const recommendedActions = this.generateRecommendations(riskFactors, trustScore);

    return {
      success: trustScore >= this.riskThresholds.MEDIUM,
      verificationLevel: requiredLevel,
      trustScore,
      challenges,
      riskFactors,
      recommendedActions,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    };
  }

  /**
   * Calculate overall trust score
   */
  private calculateTrustScore(
    identity: IdentityProfile,
    device?: DeviceProfile,
    context?: any
  ): number {
    let score = 50; // Base score

    // Identity factors
    switch (identity.verificationLevel) {
      case 'MAXIMUM':
        score += 30;
        break;
      case 'ENHANCED':
        score += 20;
        break;
      case 'STANDARD':
        score += 10;
        break;
      case 'BASIC':
        score += 5;
        break;
    }

    // Device factors
    if (device) {
      switch (device.trustLevel) {
        case 'TRUSTED':
          score += 20;
          break;
        case 'HIGH':
          score += 15;
          break;
        case 'MEDIUM':
          score += 5;
          break;
        case 'LOW':
          score -= 10;
          break;
        case 'UNKNOWN':
          score -= 20;
          break;
      }

      // Device age factor
      const deviceAge = Date.now() - device.firstSeen.getTime();
      const ageInDays = deviceAge / (1000 * 60 * 60 * 24);
      if (ageInDays > 30) score += 10;
      else if (ageInDays > 7) score += 5;
    }

    // Failed attempts penalty
    score -= identity.failedAttempts * 5;

    // Lock status
    if (identity.lockedUntil && identity.lockedUntil > new Date()) {
      score -= 50;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Determine required verification level based on trust score
   */
  private determineRequiredVerificationLevel(trustScore: number): IdentityProfile['verificationLevel'] {
    if (trustScore >= 80) return 'BASIC';
    if (trustScore >= 60) return 'STANDARD';
    if (trustScore >= 40) return 'ENHANCED';
    return 'MAXIMUM';
  }

  /**
   * Identify risk factors
   */
  private identifyRiskFactors(
    identity: IdentityProfile,
    device?: DeviceProfile,
    context?: any
  ): string[] {
    const riskFactors: string[] = [];

    if (identity.failedAttempts > 0) {
      riskFactors.push('Recent failed authentication attempts');
    }

    if (device?.isCompromised) {
      riskFactors.push('Device previously compromised');
    }

    if (device && device.trustLevel === 'UNKNOWN') {
      riskFactors.push('Unknown device');
    }

    if (context?.location && device?.geolocation) {
      // Simplified location mismatch detection
      if (context.location.country !== device.geolocation.country) {
        riskFactors.push('Location anomaly detected');
      }
    }

    return riskFactors;
  }

  /**
   * Determine required challenge types
   */
  private determineChallengeTypes(
    verificationLevel: IdentityProfile['verificationLevel'],
    riskFactors: string[]
  ): VerificationChallenge['type'][] {
    const challenges: VerificationChallenge['type'][] = [];

    switch (verificationLevel) {
      case 'MAXIMUM':
        challenges.push('BIOMETRIC', 'TOTP', 'SMS');
        break;
      case 'ENHANCED':
        challenges.push('TOTP', 'SMS');
        break;
      case 'STANDARD':
        challenges.push('TOTP');
        break;
      case 'BASIC':
        // No additional challenges needed
        break;
    }

    // Add extra challenges based on risk factors
    if (riskFactors.includes('Location anomaly detected')) {
      challenges.push('PUSH');
    }

    return [...new Set(challenges)]; // Remove duplicates
  }

  /**
   * Generate security recommendations
   */
  private generateRecommendations(riskFactors: string[], trustScore: number): string[] {
    const recommendations: string[] = [];

    if (trustScore < 50) {
      recommendations.push('Enable additional security measures');
    }

    if (riskFactors.includes('Unknown device')) {
      recommendations.push('Register and verify this device');
    }

    if (riskFactors.includes('Location anomaly detected')) {
      recommendations.push('Verify your current location');
    }

    if (riskFactors.includes('Recent failed authentication attempts')) {
      recommendations.push('Review recent account activity');
    }

    return recommendations;
  }

  /**
   * Calculate device trust level
   */
  private calculateDeviceTrustLevel(device: DeviceProfile): DeviceProfile['trustLevel'] {
    let score = 50;

    // Platform trust
    if (device.platform.includes('Windows') || device.platform.includes('macOS')) {
      score += 10;
    } else if (device.platform.includes('iOS') || device.platform.includes('Android')) {
      score += 5;
    }

    // Browser trust (if available)
    if (device.browserInfo) {
      const trustedBrowsers = ['Chrome', 'Firefox', 'Safari', 'Edge'];
      if (trustedBrowsers.some(browser => device.browserInfo!.name.includes(browser))) {
        score += 5;
      }
    }

    if (score >= 80) return 'TRUSTED';
    if (score >= 60) return 'HIGH';
    if (score >= 40) return 'MEDIUM';
    if (score >= 20) return 'LOW';
    return 'UNKNOWN';
  }

  /**
   * Start continuous authentication session
   */
  startContinuousAuth(
    sessionId: string,
    userId: string,
    deviceId: string,
    initialContext: any
  ): void {
    const context: ContinuousAuthContext = {
      sessionId,
      userId,
      deviceId,
      currentRiskScore: 0,
      behaviorBaseline: {},
      anomalies: [],
      lastVerification: new Date()
    };

    this.continuousAuthSessions.set(sessionId, context);
  }

  /**
   * Update continuous authentication context
   */
  updateContinuousAuth(sessionId: string, behaviorData: any): number {
    const context = this.continuousAuthSessions.get(sessionId);
    if (!context) {
      throw new Error('Continuous auth session not found');
    }

    // Analyze behavior and update risk score
    const newRiskScore = this.analyzeBehavior(context, behaviorData);
    context.currentRiskScore = newRiskScore;

    // Check if re-authentication is needed
    if (newRiskScore > this.riskThresholds.HIGH) {
      context.anomalies.push('High risk behavior detected');
    }

    return newRiskScore;
  }

  /**
   * Analyze user behavior for anomalies
   */
  private analyzeBehavior(context: ContinuousAuthContext, behaviorData: any): number {
    // Simplified behavior analysis
    // In production, implement sophisticated ML-based behavior analysis
    let riskScore = context.currentRiskScore;

    // Time of access analysis
    const hour = new Date().getHours();
    if (hour < 6 || hour > 22) {
      riskScore += 10;
    }

    // Add other behavior analysis logic here

    return Math.min(100, riskScore);
  }

  /**
   * Get identity profile
   */
  getIdentityProfile(userId: string): IdentityProfile | undefined {
    return this.identityProfiles.get(userId);
  }

  /**
   * Get device profile
   */
  getDeviceProfile(deviceId: string): DeviceProfile | undefined {
    return this.deviceProfiles.get(deviceId);
  }

  /**
   * Update device trust level
   */
  updateDeviceTrust(deviceId: string, trustLevel: DeviceProfile['trustLevel']): void {
    const device = this.deviceProfiles.get(deviceId);
    if (device) {
      device.trustLevel = trustLevel;
      device.lastSeen = new Date();
    }
  }

  /**
   * Mark device as compromised
   */
  markDeviceCompromised(deviceId: string, reason: string): void {
    const device = this.deviceProfiles.get(deviceId);
    if (device) {
      device.isCompromised = true;
      device.trustLevel = 'UNKNOWN';
      device.riskFactors.push(`Compromised: ${reason}`);
    }
  }
}

export const identityVerificationService = new IdentityVerificationService();