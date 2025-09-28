export interface EncryptionConfig {
  algorithm: 'AES-256-GCM' | 'ChaCha20-Poly1305' | 'RSA-OAEP';
  keySize: number;
  rotationInterval: number; // in hours
  backupKeys: number;
}

export interface ZeroTrustPolicy {
  id: string;
  name: string;
  description: string;
  rules: PolicyRule[];
  enabled: boolean;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PolicyRule {
  id: string;
  type: 'ALLOW' | 'DENY' | 'REQUIRE_MFA' | 'REQUIRE_DEVICE_CERT';
  conditions: PolicyCondition[];
  actions: PolicyAction[];
  metadata?: Record<string, any>;
}

export interface PolicyCondition {
  field: string;
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'regex' | 'in' | 'notIn';
  value: string | string[] | number | boolean;
}

export interface PolicyAction {
  type: 'LOG' | 'ALERT' | 'BLOCK' | 'ENCRYPT' | 'REQUIRE_VERIFICATION';
  parameters?: Record<string, any>;
}

export interface DeviceTrust {
  deviceId: string;
  userId: string;
  trustLevel: 'UNKNOWN' | 'LOW' | 'MEDIUM' | 'HIGH' | 'VERIFIED';
  certificate: string;
  fingerprint: string;
  lastVerified: Date;
  metadata: DeviceMetadata;
  complianceStatus: ComplianceStatus;
}

export interface DeviceMetadata {
  platform: string;
  osVersion: string;
  browserInfo?: string;
  ipAddress: string;
  location?: GeoLocation;
  userAgent: string;
  hardwareFingerprint: string;
  installationId: string;
}

export interface GeoLocation {
  country: string;
  region: string;
  city: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface ComplianceStatus {
  isCompliant: boolean;
  violations: ComplianceViolation[];
  lastChecked: Date;
  score: number; // 0-100
}

export interface ComplianceViolation {
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  remediation: string;
  detectedAt: Date;
}

export interface Identity {
  id: string;
  userId: string;
  email: string;
  roles: string[];
  permissions: Permission[];
  attributes: Record<string, any>;
  verificationLevel: VerificationLevel;
  lastAuthenticated: Date;
  sessionInfo: SessionInfo;
}

export interface Permission {
  resource: string;
  actions: string[];
  conditions?: PolicyCondition[];
  expiresAt?: Date;
}

export interface VerificationLevel {
  level: 'NONE' | 'BASIC' | 'MFA' | 'BIOMETRIC' | 'CERTIFICATE';
  factors: AuthenticationFactor[];
  requiredFactors: number;
  lastVerified: Date;
}

export interface AuthenticationFactor {
  type: 'PASSWORD' | 'SMS' | 'EMAIL' | 'TOTP' | 'BIOMETRIC' | 'CERTIFICATE' | 'HARDWARE_KEY';
  status: 'ACTIVE' | 'INACTIVE' | 'PENDING' | 'EXPIRED';
  metadata?: Record<string, any>;
}

export interface SessionInfo {
  sessionId: string;
  createdAt: Date;
  expiresAt: Date;
  ipAddress: string;
  userAgent: string;
  deviceId: string;
  riskScore: number; // 0-100
}

export interface NetworkSegment {
  id: string;
  name: string;
  description: string;
  ipRanges: string[];
  allowedPorts: number[];
  allowedProtocols: string[];
  accessPolicies: ZeroTrustPolicy[];
  isolationLevel: 'NONE' | 'BASIC' | 'STRICT' | 'COMPLETE';
  monitoring: boolean;
}

export interface CommunicationChannel {
  id: string;
  sourceService: string;
  targetService: string;
  protocol: 'HTTPS' | 'WSS' | 'GRPC' | 'TCP' | 'UDP';
  encryption: EncryptionConfig;
  certificateInfo: CertificateInfo;
  lastUsed: Date;
  isActive: boolean;
}

export interface CertificateInfo {
  serialNumber: string;
  issuer: string;
  subject: string;
  validFrom: Date;
  validTo: Date;
  fingerprint: string;
  algorithm: string;
  keySize: number;
}

export interface AuditEvent {
  id: string;
  timestamp: Date;
  eventType: AuditEventType;
  userId?: string;
  deviceId?: string;
  sessionId?: string;
  resource: string;
  action: string;
  result: 'SUCCESS' | 'FAILURE' | 'BLOCKED' | 'WARNING';
  details: Record<string, any>;
  riskScore: number;
  location?: GeoLocation;
  userAgent?: string;
  ipAddress: string;
}

export type AuditEventType =
  | 'AUTHENTICATION'
  | 'AUTHORIZATION'
  | 'DATA_ACCESS'
  | 'POLICY_VIOLATION'
  | 'DEVICE_ENROLLMENT'
  | 'CERTIFICATE_ISSUED'
  | 'ENCRYPTION_KEY_ROTATION'
  | 'NETWORK_ACCESS'
  | 'COMPLIANCE_CHECK'
  | 'SECURITY_INCIDENT';

export interface SecurityMetrics {
  timestamp: Date;
  totalSessions: number;
  activeSessions: number;
  failedAuthentications: number;
  blockedRequests: number;
  policyViolations: number;
  averageRiskScore: number;
  encryptionCoverage: number; // percentage
  deviceTrustLevels: Record<string, number>;
  complianceScore: number;
}

export interface ThreatIntelligence {
  id: string;
  type: 'IP' | 'DOMAIN' | 'EMAIL' | 'HASH' | 'URL';
  value: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence: number; // 0-100
  description: string;
  source: string;
  firstSeen: Date;
  lastSeen: Date;
  isActive: boolean;
}

export interface ZeroTrustConfig {
  encryption: EncryptionConfig;
  networkSegmentation: {
    enabled: boolean;
    defaultIsolationLevel: NetworkSegment['isolationLevel'];
    autoCreateSegments: boolean;
  };
  deviceTrust: {
    enabled: boolean;
    requiredTrustLevel: DeviceTrust['trustLevel'];
    certificateValidityDays: number;
    complianceCheckInterval: number; // in hours
  };
  identity: {
    sessionTimeout: number; // in minutes
    maxConcurrentSessions: number;
    requireMfaForHighRisk: boolean;
    riskThreshold: number; // 0-100
  };
  audit: {
    retentionDays: number;
    realTimeAlerting: boolean;
    alertThresholds: Record<string, number>;
  };
  monitoring: {
    enabled: boolean;
    metricsInterval: number; // in seconds
    threatIntelligence: boolean;
  };
}

export interface SecurityContext {
  identity: Identity;
  device: DeviceTrust;
  session: SessionInfo;
  networkSegment: NetworkSegment;
  policies: ZeroTrustPolicy[];
  riskAssessment: RiskAssessment;
}

export interface RiskAssessment {
  overallScore: number; // 0-100
  factors: RiskFactor[];
  recommendations: string[];
  timestamp: Date;
}

export interface RiskFactor {
  type: string;
  weight: number;
  score: number;
  description: string;
}

export interface EncryptionKey {
  id: string;
  algorithm: string;
  keyData: string; // base64 encoded
  purpose: 'ENCRYPTION' | 'SIGNING' | 'KEY_EXCHANGE';
  status: 'ACTIVE' | 'ROTATING' | 'RETIRED' | 'COMPROMISED';
  createdAt: Date;
  expiresAt: Date;
  rotatedAt?: Date;
  usage: {
    encryptOperations: number;
    decryptOperations: number;
    lastUsed: Date;
  };
}

export interface AccessRequest {
  id: string;
  userId: string;
  deviceId: string;
  resource: string;
  action: string;
  timestamp: Date;
  context: SecurityContext;
  decision: AccessDecision;
  policyEvaluations: PolicyEvaluation[];
}

export interface AccessDecision {
  result: 'ALLOW' | 'DENY' | 'CONDITIONAL';
  reason: string;
  conditions?: PolicyCondition[];
  expiresAt?: Date;
  requiresApproval?: boolean;
}

export interface PolicyEvaluation {
  policyId: string;
  policyName: string;
  result: 'MATCH' | 'NO_MATCH' | 'ERROR';
  matchedRules: string[];
  executionTime: number; // in milliseconds
}