import crypto from 'crypto';
import forge from 'node-forge';
import { DeviceDetector } from 'device-detector-js';
import geoip from 'geoip-lite';
import { UAParser } from 'ua-parser-js';
import { logger } from '../utils/logger.js';
import type {
  DeviceTrust,
  DeviceMetadata,
  ComplianceStatus,
  ComplianceViolation,
  GeoLocation,
  CertificateInfo
} from '../types/security-types.js';

export class DeviceTrustManager {
  private trustedDevices: Map<string, DeviceTrust> = new Map();
  private deviceCertificates: Map<string, CertificateInfo> = new Map();
  private complianceRules: Map<string, any> = new Map();
  private deviceDetector: DeviceDetector;
  private complianceCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.deviceDetector = new DeviceDetector();
    this.initializeDeviceTrust();
    this.setupComplianceRules();
    this.startComplianceMonitoring();
  }

  private initializeDeviceTrust(): void {
    logger.info('Initializing device trust management');

    // Setup device fingerprinting algorithms
    this.setupFingerprintingAlgorithms();

    // Initialize default compliance rules
    this.initializeComplianceRules();
  }

  private setupFingerprintingAlgorithms(): void {
    // Device fingerprinting will use multiple data points:
    // - Hardware characteristics
    // - Software characteristics
    // - Network characteristics
    // - Behavioral patterns
    logger.debug('Device fingerprinting algorithms initialized');
  }

  private initializeComplianceRules(): void {
    // Set up basic compliance rules
    this.complianceRules.set('OS_VERSION', {
      type: 'minimum_version',
      rules: {
        'Windows': '10.0.19041', // Windows 10 build 19041
        'macOS': '11.0.0',       // macOS Big Sur
        'iOS': '14.0.0',         // iOS 14
        'Android': '10.0.0',     // Android 10
        'Linux': '5.4.0'         // Linux kernel 5.4
      },
      severity: 'HIGH'
    });

    this.complianceRules.set('BROWSER_SECURITY', {
      type: 'security_features',
      rules: {
        'requireHttps': true,
        'requireSecureCookies': true,
        'requireCSP': true,
        'blockMixedContent': true
      },
      severity: 'MEDIUM'
    });

    this.complianceRules.set('ENCRYPTION', {
      type: 'encryption_requirements',
      rules: {
        'diskEncryption': true,
        'transportEncryption': true,
        'minimumTLSVersion': '1.3'
      },
      severity: 'CRITICAL'
    });

    logger.debug('Compliance rules initialized', {
      ruleCount: this.complianceRules.size
    });
  }

  public async enrollDevice(deviceInfo: {
    userId: string;
    userAgent: string;
    ipAddress: string;
    hardwareInfo?: any;
    osInfo?: any;
    certificateRequest?: string;
  }): Promise<{
    deviceId: string;
    certificate: string;
    trustLevel: DeviceTrust['trustLevel'];
    complianceStatus: ComplianceStatus;
  }> {
    logger.info('Starting device enrollment', {
      userId: deviceInfo.userId,
      ipAddress: deviceInfo.ipAddress
    });

    try {
      // Generate device metadata
      const metadata = await this.generateDeviceMetadata(deviceInfo);

      // Generate device fingerprint
      const fingerprint = await this.generateDeviceFingerprint(metadata, deviceInfo);

      // Create device ID
      const deviceId = this.generateDeviceId(fingerprint, deviceInfo.userId);

      // Check for existing device registration
      const existingDevice = this.trustedDevices.get(deviceId);
      if (existingDevice) {
        logger.info('Device already enrolled', { deviceId });
        return {
          deviceId,
          certificate: existingDevice.certificate,
          trustLevel: existingDevice.trustLevel,
          complianceStatus: existingDevice.complianceStatus
        };
      }

      // Generate device certificate
      const certificate = await this.generateDeviceCertificate(deviceId, deviceInfo.userId);

      // Assess initial trust level
      const initialTrustLevel = await this.assessInitialTrustLevel(metadata, deviceInfo);

      // Perform compliance check
      const complianceStatus = await this.performComplianceCheck(metadata, deviceInfo);

      // Create device trust record
      const deviceTrust: DeviceTrust = {
        deviceId,
        userId: deviceInfo.userId,
        trustLevel: initialTrustLevel,
        certificate: certificate.certificate,
        fingerprint,
        lastVerified: new Date(),
        metadata,
        complianceStatus
      };

      // Store device trust information
      this.trustedDevices.set(deviceId, deviceTrust);
      this.deviceCertificates.set(deviceId, certificate);

      logger.info('Device enrollment completed', {
        deviceId,
        userId: deviceInfo.userId,
        trustLevel: initialTrustLevel,
        complianceScore: complianceStatus.score
      });

      return {
        deviceId,
        certificate: certificate.certificate,
        trustLevel: initialTrustLevel,
        complianceStatus
      };

    } catch (error) {
      logger.error('Device enrollment failed', {
        userId: deviceInfo.userId,
        error: error.message
      });
      throw error;
    }
  }

  private async generateDeviceMetadata(deviceInfo: {
    userAgent: string;
    ipAddress: string;
    hardwareInfo?: any;
    osInfo?: any;
  }): Promise<DeviceMetadata> {
    // Parse user agent
    const uaParser = new UAParser(deviceInfo.userAgent);
    const uaResult = uaParser.getResult();

    // Parse device details from user agent
    const deviceResult = this.deviceDetector.parse(deviceInfo.userAgent);

    // Get geolocation from IP
    const geoInfo = geoip.lookup(deviceInfo.ipAddress);
    const location: GeoLocation | undefined = geoInfo ? {
      country: geoInfo.country,
      region: geoInfo.region,
      city: geoInfo.city,
      latitude: geoInfo.ll[0],
      longitude: geoInfo.ll[1],
      timezone: geoInfo.timezone
    } : undefined;

    // Generate hardware fingerprint
    const hardwareFingerprint = this.generateHardwareFingerprint(deviceInfo);

    // Generate installation ID
    const installationId = crypto.randomUUID();

    const metadata: DeviceMetadata = {
      platform: uaResult.os.name || 'Unknown',
      osVersion: uaResult.os.version || 'Unknown',
      browserInfo: `${uaResult.browser.name || 'Unknown'} ${uaResult.browser.version || ''}`,
      ipAddress: deviceInfo.ipAddress,
      location,
      userAgent: deviceInfo.userAgent,
      hardwareFingerprint,
      installationId
    };

    logger.debug('Device metadata generated', {
      platform: metadata.platform,
      osVersion: metadata.osVersion,
      browserInfo: metadata.browserInfo,
      hasLocation: !!metadata.location
    });

    return metadata;
  }

  private generateHardwareFingerprint(deviceInfo: {
    userAgent: string;
    hardwareInfo?: any;
  }): string {
    // Create a stable hardware fingerprint from available information
    const fpData = {
      userAgent: deviceInfo.userAgent,
      screenResolution: deviceInfo.hardwareInfo?.screenResolution || 'unknown',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: deviceInfo.hardwareInfo?.language || 'unknown',
      platform: deviceInfo.hardwareInfo?.platform || 'unknown'
    };

    const fingerprintString = JSON.stringify(fpData);

    return crypto
      .createHash('sha256')
      .update(fingerprintString)
      .digest('hex')
      .substring(0, 32);
  }

  private async generateDeviceFingerprint(
    metadata: DeviceMetadata,
    deviceInfo: { userId: string }
  ): Promise<string> {
    // Combine multiple data points for device fingerprinting
    const fingerprintData = {
      hardwareFingerprint: metadata.hardwareFingerprint,
      platform: metadata.platform,
      osVersion: metadata.osVersion,
      browserInfo: metadata.browserInfo,
      timezone: metadata.location?.timezone || 'unknown',
      userId: deviceInfo.userId
    };

    const fingerprintString = JSON.stringify(fingerprintData);

    return crypto
      .createHash('sha256')
      .update(fingerprintString)
      .digest('hex');
  }

  private generateDeviceId(fingerprint: string, userId: string): string {
    const deviceIdData = `${userId}:${fingerprint}:${Date.now()}`;

    return crypto
      .createHash('sha256')
      .update(deviceIdData)
      .digest('hex')
      .substring(0, 16);
  }

  private async generateDeviceCertificate(deviceId: string, userId: string): Promise<CertificateInfo> {
    try {
      // Generate key pair
      const keyPair = forge.pki.rsa.generateKeyPair(2048);

      // Create certificate
      const cert = forge.pki.createCertificate();
      cert.publicKey = keyPair.publicKey;
      cert.serialNumber = crypto.randomBytes(16).toString('hex');

      // Set validity period (1 year)
      const now = new Date();
      const oneYearFromNow = new Date();
      oneYearFromNow.setFullYear(now.getFullYear() + 1);

      cert.validity.notBefore = now;
      cert.validity.notAfter = oneYearFromNow;

      // Set subject and issuer
      const attrs = [
        { name: 'commonName', value: deviceId },
        { name: 'organizationName', value: 'Urnlabs Zero Trust' },
        { name: 'organizationalUnitName', value: 'Device Trust' },
        { shortName: 'OU', value: 'Device' },
        { name: 'emailAddress', value: `device-${deviceId}@urnlabs.ai` }
      ];

      cert.setSubject(attrs);
      cert.setIssuer(attrs); // Self-signed for demo

      // Add extensions
      cert.setExtensions([
        {
          name: 'basicConstraints',
          cA: false
        },
        {
          name: 'keyUsage',
          digitalSignature: true,
          keyEncipherment: true
        },
        {
          name: 'subjectAltName',
          altNames: [
            {
              type: 2, // DNS
              value: `device-${deviceId}.urnlabs.ai`
            },
            {
              type: 6, // URI
              value: `urn:device:${deviceId}`
            }
          ]
        }
      ]);

      // Sign the certificate
      cert.sign(keyPair.privateKey, forge.md.sha256.create());

      // Convert to PEM format
      const certificatePem = forge.pki.certificateToPem(cert);

      // Create certificate info
      const certificateInfo: CertificateInfo = {
        serialNumber: cert.serialNumber,
        issuer: 'CN=Urnlabs Zero Trust, O=Urnlabs Zero Trust, OU=Device Trust',
        subject: `CN=${deviceId}, O=Urnlabs Zero Trust, OU=Device`,
        validFrom: cert.validity.notBefore,
        validTo: cert.validity.notAfter,
        fingerprint: forge.md.sha1.create().update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()).digest().toHex(),
        algorithm: 'SHA256withRSA',
        keySize: 2048
      };

      // Store the full certificate
      (certificateInfo as any).certificate = certificatePem;

      logger.info('Device certificate generated', {
        deviceId,
        serialNumber: certificateInfo.serialNumber,
        validFrom: certificateInfo.validFrom,
        validTo: certificateInfo.validTo
      });

      return certificateInfo;

    } catch (error) {
      logger.error('Certificate generation failed', {
        deviceId,
        error: error.message
      });
      throw error;
    }
  }

  private async assessInitialTrustLevel(
    metadata: DeviceMetadata,
    deviceInfo: { ipAddress: string }
  ): Promise<DeviceTrust['trustLevel']> {
    let trustScore = 0;

    // Assess platform trust
    const platformTrust = this.assessPlatformTrust(metadata.platform, metadata.osVersion);
    trustScore += platformTrust;

    // Assess network trust
    const networkTrust = this.assessNetworkTrust(deviceInfo.ipAddress);
    trustScore += networkTrust;

    // Assess location trust
    const locationTrust = this.assessLocationTrust(metadata.location);
    trustScore += locationTrust;

    // Convert score to trust level
    if (trustScore >= 80) {
      return 'HIGH';
    } else if (trustScore >= 60) {
      return 'MEDIUM';
    } else if (trustScore >= 40) {
      return 'LOW';
    } else {
      return 'UNKNOWN';
    }
  }

  private assessPlatformTrust(platform: string, osVersion: string): number {
    const trustedPlatforms: Record<string, number> = {
      'Windows': 70,
      'macOS': 80,
      'iOS': 85,
      'Android': 65,
      'Linux': 75
    };

    const baseTrust = trustedPlatforms[platform] || 30;

    // Adjust based on OS version (newer versions get higher trust)
    const versionBonus = this.assessOSVersionTrust(platform, osVersion);

    return Math.min(baseTrust + versionBonus, 100);
  }

  private assessOSVersionTrust(platform: string, version: string): number {
    // Simplified version assessment - in production, maintain version databases
    const versionParts = version.split('.').map(Number);
    const majorVersion = versionParts[0] || 0;

    switch (platform) {
      case 'Windows':
        return majorVersion >= 10 ? 10 : 0;
      case 'macOS':
        return majorVersion >= 11 ? 10 : 0;
      case 'iOS':
        return majorVersion >= 14 ? 15 : 0;
      case 'Android':
        return majorVersion >= 10 ? 10 : 0;
      case 'Linux':
        return majorVersion >= 5 ? 10 : 0;
      default:
        return 0;
    }
  }

  private assessNetworkTrust(ipAddress: string): number {
    // Check if IP is private/internal
    const privateRanges = [
      /^10\./,
      /^192\.168\./,
      /^172\.(1[6-9]|2\d|3[01])\./,
      /^127\./
    ];

    const isPrivate = privateRanges.some(range => range.test(ipAddress));
    if (isPrivate) {
      return 20; // Higher trust for internal networks
    }

    // For public IPs, assess based on reputation (simplified)
    // In production, integrate with threat intelligence feeds
    const ipHash = crypto.createHash('md5').update(ipAddress).digest('hex');
    const reputation = parseInt(ipHash.substring(0, 2), 16) % 60; // 0-59

    return Math.max(reputation, 10); // Minimum trust of 10
  }

  private assessLocationTrust(location?: GeoLocation): number {
    if (!location) {
      return 5; // Low trust for unknown locations
    }

    // Assess country trust (simplified)
    const trustedCountries = ['US', 'CA', 'GB', 'DE', 'FR', 'JP', 'AU', 'NL', 'SE', 'NO', 'FI', 'DK'];
    const countryTrust = trustedCountries.includes(location.country) ? 15 : 5;

    return countryTrust;
  }

  private async performComplianceCheck(
    metadata: DeviceMetadata,
    deviceInfo: any
  ): Promise<ComplianceStatus> {
    const violations: ComplianceViolation[] = [];
    let score = 100;

    // Check OS version compliance
    const osViolation = this.checkOSCompliance(metadata.platform, metadata.osVersion);
    if (osViolation) {
      violations.push(osViolation);
      score -= 20;
    }

    // Check browser security compliance
    const browserViolation = this.checkBrowserCompliance(metadata.browserInfo);
    if (browserViolation) {
      violations.push(browserViolation);
      score -= 15;
    }

    // Check encryption compliance (simulated)
    const encryptionViolation = this.checkEncryptionCompliance();
    if (encryptionViolation) {
      violations.push(encryptionViolation);
      score -= 30;
    }

    const isCompliant = violations.length === 0;
    const finalScore = Math.max(score, 0);

    return {
      isCompliant,
      violations,
      lastChecked: new Date(),
      score: finalScore
    };
  }

  private checkOSCompliance(platform: string, osVersion: string): ComplianceViolation | null {
    const rule = this.complianceRules.get('OS_VERSION');
    if (!rule) return null;

    const minimumVersion = rule.rules[platform];
    if (!minimumVersion) return null;

    // Simple version comparison (production would use proper semver)
    const currentVersion = osVersion.split('.').map(Number);
    const requiredVersion = minimumVersion.split('.').map(Number);

    for (let i = 0; i < Math.max(currentVersion.length, requiredVersion.length); i++) {
      const current = currentVersion[i] || 0;
      const required = requiredVersion[i] || 0;

      if (current < required) {
        return {
          type: 'OS_VERSION_OUTDATED',
          severity: rule.severity,
          description: `OS version ${osVersion} is below minimum required version ${minimumVersion}`,
          remediation: `Update ${platform} to version ${minimumVersion} or later`,
          detectedAt: new Date()
        };
      } else if (current > required) {
        break;
      }
    }

    return null;
  }

  private checkBrowserCompliance(browserInfo: string): ComplianceViolation | null {
    // Simplified browser compliance check
    const outdatedBrowsers = [
      /Internet Explorer/i,
      /Chrome\/[1-7]\d\./,  // Chrome versions below 80
      /Firefox\/[1-6]\d\./  // Firefox versions below 70
    ];

    const isOutdated = outdatedBrowsers.some(pattern => pattern.test(browserInfo));

    if (isOutdated) {
      return {
        type: 'BROWSER_OUTDATED',
        severity: 'MEDIUM',
        description: `Browser ${browserInfo} is outdated and may have security vulnerabilities`,
        remediation: 'Update to the latest version of your browser',
        detectedAt: new Date()
      };
    }

    return null;
  }

  private checkEncryptionCompliance(): ComplianceViolation | null {
    // Simulate encryption compliance check
    // In production, this would check actual device encryption status
    const hasEncryption = Math.random() > 0.3; // 70% chance of having encryption

    if (!hasEncryption) {
      return {
        type: 'DISK_ENCRYPTION_MISSING',
        severity: 'CRITICAL',
        description: 'Device disk encryption is not enabled',
        remediation: 'Enable full disk encryption (BitLocker, FileVault, or equivalent)',
        detectedAt: new Date()
      };
    }

    return null;
  }

  public async verifyDeviceTrust(deviceId: string): Promise<{
    isValid: boolean;
    trustLevel: DeviceTrust['trustLevel'];
    complianceStatus: ComplianceStatus;
    certificate?: CertificateInfo;
  }> {
    const device = this.trustedDevices.get(deviceId);
    if (!device) {
      return {
        isValid: false,
        trustLevel: 'UNKNOWN',
        complianceStatus: {
          isCompliant: false,
          violations: [{
            type: 'DEVICE_NOT_ENROLLED',
            severity: 'CRITICAL',
            description: 'Device is not enrolled in the trust system',
            remediation: 'Enroll device through the device registration process',
            detectedAt: new Date()
          }],
          lastChecked: new Date(),
          score: 0
        }
      };
    }

    // Check certificate validity
    const certificate = this.deviceCertificates.get(deviceId);
    const isCertificateValid = certificate && certificate.validTo > new Date();

    if (!isCertificateValid) {
      return {
        isValid: false,
        trustLevel: 'UNKNOWN',
        complianceStatus: {
          isCompliant: false,
          violations: [{
            type: 'CERTIFICATE_EXPIRED',
            severity: 'HIGH',
            description: 'Device certificate has expired',
            remediation: 'Renew device certificate',
            detectedAt: new Date()
          }],
          lastChecked: new Date(),
          score: 0
        },
        certificate
      };
    }

    // Update last verified timestamp
    device.lastVerified = new Date();
    this.trustedDevices.set(deviceId, device);

    return {
      isValid: true,
      trustLevel: device.trustLevel,
      complianceStatus: device.complianceStatus,
      certificate
    };
  }

  private startComplianceMonitoring(): void {
    // Run compliance checks every hour
    this.complianceCheckInterval = setInterval(async () => {
      await this.runScheduledComplianceChecks();
    }, 60 * 60 * 1000);

    logger.info('Compliance monitoring started');
  }

  private async runScheduledComplianceChecks(): Promise<void> {
    logger.debug('Running scheduled compliance checks');

    let checkedDevices = 0;
    let violationsFound = 0;

    for (const [deviceId, device] of this.trustedDevices.entries()) {
      try {
        // Re-run compliance check
        const complianceStatus = await this.performComplianceCheck(device.metadata, {});

        // Update device compliance status
        device.complianceStatus = complianceStatus;
        device.lastVerified = new Date();

        // Adjust trust level based on compliance
        if (!complianceStatus.isCompliant && complianceStatus.score < 50) {
          device.trustLevel = 'LOW';
        }

        this.trustedDevices.set(deviceId, device);

        checkedDevices++;
        violationsFound += complianceStatus.violations.length;

      } catch (error) {
        logger.error('Compliance check failed for device', {
          deviceId,
          error: error.message
        });
      }
    }

    logger.info('Scheduled compliance checks completed', {
      checkedDevices,
      violationsFound
    });
  }

  public getDeviceTrustMetrics(): {
    totalDevices: number;
    trustLevels: Record<string, number>;
    complianceRate: number;
    certificateExpirations: {
      expiredCount: number;
      expiringIn30Days: number;
    };
  } {
    const trustLevels: Record<string, number> = {
      UNKNOWN: 0,
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      VERIFIED: 0
    };

    let compliantDevices = 0;
    let expiredCertificates = 0;
    let expiringIn30Days = 0;

    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    for (const device of this.trustedDevices.values()) {
      trustLevels[device.trustLevel]++;

      if (device.complianceStatus.isCompliant) {
        compliantDevices++;
      }

      const certificate = this.deviceCertificates.get(device.deviceId);
      if (certificate) {
        if (certificate.validTo < now) {
          expiredCertificates++;
        } else if (certificate.validTo < thirtyDaysFromNow) {
          expiringIn30Days++;
        }
      }
    }

    const totalDevices = this.trustedDevices.size;
    const complianceRate = totalDevices > 0 ? (compliantDevices / totalDevices) * 100 : 0;

    return {
      totalDevices,
      trustLevels,
      complianceRate,
      certificateExpirations: {
        expiredCount: expiredCertificates,
        expiringIn30Days
      }
    };
  }

  public shutdown(): void {
    if (this.complianceCheckInterval) {
      clearInterval(this.complianceCheckInterval);
      this.complianceCheckInterval = null;
    }

    this.trustedDevices.clear();
    this.deviceCertificates.clear();
    this.complianceRules.clear();

    logger.info('Device trust manager shut down');
  }
}