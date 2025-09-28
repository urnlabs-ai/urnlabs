/**
 * IDS Types and Interfaces
 * Comprehensive type definitions for Intrusion Detection System
 */

export interface SecurityEvent {
  id: string;
  timestamp: Date;
  type: SecurityEventType;
  severity: SecuritySeverity;
  source: EventSource;
  target: EventTarget;
  details: SecurityEventDetails;
  riskScore: number;
  confidence: number;
  mitigationActions: MitigationAction[];
  metadata: Record<string, any>;
}

export enum SecurityEventType {
  SUSPICIOUS_LOGIN = 'SUSPICIOUS_LOGIN',
  BRUTE_FORCE_ATTACK = 'BRUTE_FORCE_ATTACK',
  SQL_INJECTION = 'SQL_INJECTION',
  XSS_ATTEMPT = 'XSS_ATTEMPT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  UNUSUAL_API_USAGE = 'UNUSUAL_API_USAGE',
  ANOMALOUS_BEHAVIOR = 'ANOMALOUS_BEHAVIOR',
  MALICIOUS_IP = 'MALICIOUS_IP',
  SUSPICIOUS_USER_AGENT = 'SUSPICIOUS_USER_AGENT',
  PRIVILEGE_ESCALATION = 'PRIVILEGE_ESCALATION',
  DATA_EXFILTRATION = 'DATA_EXFILTRATION',
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
  MALWARE_DETECTED = 'MALWARE_DETECTED',
  NETWORK_INTRUSION = 'NETWORK_INTRUSION',
  DDOS_ATTACK = 'DDOS_ATTACK'
}

export enum SecuritySeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export interface EventSource {
  ip: string;
  userAgent?: string;
  userId?: string;
  sessionId?: string;
  deviceId?: string;
  geolocation?: GeoLocation;
  asn?: AutonomousSystemInfo;
}

export interface EventTarget {
  endpoint?: string;
  resource?: string;
  method?: string;
  userId?: string;
  systemComponent?: string;
}

export interface SecurityEventDetails {
  requestData?: any;
  responseData?: any;
  parameters?: Record<string, any>;
  headers?: Record<string, string>;
  patterns?: DetectionPattern[];
  anomalyScore?: number;
  baselineDeviation?: number;
}

export interface GeoLocation {
  country: string;
  region: string;
  city: string;
  lat: number;
  lon: number;
  timezone: string;
}

export interface AutonomousSystemInfo {
  number: number;
  organization: string;
}

export interface DetectionPattern {
  pattern: string;
  type: PatternType;
  confidence: number;
  references?: string[];
}

export enum PatternType {
  REGEX = 'REGEX',
  SIGNATURE = 'SIGNATURE',
  BEHAVIORAL = 'BEHAVIORAL',
  STATISTICAL = 'STATISTICAL',
  ML_BASED = 'ML_BASED'
}

export interface MitigationAction {
  action: MitigationActionType;
  description: string;
  automated: boolean;
  executedAt?: Date;
  result?: string;
}

export enum MitigationActionType {
  BLOCK_IP = 'BLOCK_IP',
  RATE_LIMIT = 'RATE_LIMIT',
  REQUIRE_MFA = 'REQUIRE_MFA',
  SUSPEND_ACCOUNT = 'SUSPEND_ACCOUNT',
  ALERT_ADMIN = 'ALERT_ADMIN',
  LOG_INCIDENT = 'LOG_INCIDENT',
  QUARANTINE_SESSION = 'QUARANTINE_SESSION',
  ESCALATE_TO_SOC = 'ESCALATE_TO_SOC'
}

export interface UserBehaviorProfile {
  userId: string;
  profileCreated: Date;
  lastUpdated: Date;
  loginPatterns: LoginPattern;
  apiUsagePatterns: ApiUsagePattern;
  locationPatterns: LocationPattern;
  devicePatterns: DevicePattern;
  riskScore: number;
  anomalyThreshold: number;
}

export interface LoginPattern {
  typicalHours: number[];
  typicalDaysOfWeek: number[];
  averageSessionDuration: number;
  loginFrequency: number;
  failureRate: number;
  mfaUsage: number;
}

export interface ApiUsagePattern {
  endpointsUsed: Record<string, number>;
  requestVolume: VolumePattern;
  responseTimePattern: number[];
  errorRates: Record<string, number>;
  dataTransferPattern: DataTransferPattern;
}

export interface LocationPattern {
  frequentLocations: GeoLocation[];
  travelVelocity: number;
  unusualLocationThreshold: number;
}

export interface DevicePattern {
  knownDevices: DeviceFingerprint[];
  browserPatterns: BrowserPattern[];
  osPatterns: string[];
}

export interface VolumePattern {
  hourly: number[];
  daily: number[];
  weekly: number[];
  monthly: number[];
}

export interface DataTransferPattern {
  uploadVolume: VolumePattern;
  downloadVolume: VolumePattern;
  transferRate: number[];
}

export interface DeviceFingerprint {
  deviceId: string;
  userAgent: string;
  screenResolution: string;
  timezone: string;
  language: string;
  plugins: string[];
  lastSeen: Date;
  trustScore: number;
}

export interface BrowserPattern {
  browser: string;
  version: string;
  usage: number;
  lastSeen: Date;
}

export interface ThreatIntelligence {
  id: string;
  type: ThreatType;
  indicator: string;
  confidence: number;
  source: string;
  firstSeen: Date;
  lastSeen: Date;
  tags: string[];
  description: string;
  references: string[];
}

export enum ThreatType {
  IP_ADDRESS = 'IP_ADDRESS',
  DOMAIN = 'DOMAIN',
  URL = 'URL',
  FILE_HASH = 'FILE_HASH',
  EMAIL = 'EMAIL',
  USER_AGENT = 'USER_AGENT',
  CVE = 'CVE',
  YARA_RULE = 'YARA_RULE'
}

export interface IDSRule {
  id: string;
  name: string;
  description: string;
  category: string;
  severity: SecuritySeverity;
  enabled: boolean;
  pattern: string;
  patternType: PatternType;
  conditions: RuleCondition[];
  actions: RuleAction[];
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface RuleCondition {
  field: string;
  operator: ConditionOperator;
  value: any;
  logic?: LogicOperator;
}

export enum ConditionOperator {
  EQUALS = 'EQUALS',
  NOT_EQUALS = 'NOT_EQUALS',
  CONTAINS = 'CONTAINS',
  NOT_CONTAINS = 'NOT_CONTAINS',
  STARTS_WITH = 'STARTS_WITH',
  ENDS_WITH = 'ENDS_WITH',
  REGEX_MATCH = 'REGEX_MATCH',
  GREATER_THAN = 'GREATER_THAN',
  LESS_THAN = 'LESS_THAN',
  IN_LIST = 'IN_LIST',
  NOT_IN_LIST = 'NOT_IN_LIST'
}

export enum LogicOperator {
  AND = 'AND',
  OR = 'OR',
  NOT = 'NOT'
}

export interface RuleAction {
  type: RuleActionType;
  parameters: Record<string, any>;
  priority: number;
}

export enum RuleActionType {
  ALERT = 'ALERT',
  BLOCK = 'BLOCK',
  RATE_LIMIT = 'RATE_LIMIT',
  LOG = 'LOG',
  REDIRECT = 'REDIRECT',
  QUARANTINE = 'QUARANTINE'
}

export interface IDSAlert {
  id: string;
  eventId: string;
  ruleId: string;
  timestamp: Date;
  severity: SecuritySeverity;
  title: string;
  description: string;
  source: EventSource;
  target: EventTarget;
  evidence: AlertEvidence;
  status: AlertStatus;
  assignedTo?: string;
  resolvedAt?: Date;
  resolution?: string;
}

export interface AlertEvidence {
  networkData?: NetworkEvidence;
  logData?: LogEvidence;
  behavioralData?: BehavioralEvidence;
  threatIntelData?: ThreatIntelligence[];
}

export interface NetworkEvidence {
  packets: NetworkPacket[];
  flows: NetworkFlow[];
  protocols: string[];
}

export interface NetworkPacket {
  timestamp: Date;
  sourceIp: string;
  destIp: string;
  sourcePort: number;
  destPort: number;
  protocol: string;
  size: number;
  flags: string[];
}

export interface NetworkFlow {
  startTime: Date;
  endTime: Date;
  sourceIp: string;
  destIp: string;
  protocol: string;
  bytesTransferred: number;
  packetsTransferred: number;
}

export interface LogEvidence {
  logSources: string[];
  relevantLogs: LogEntry[];
  patterns: string[];
}

export interface LogEntry {
  timestamp: Date;
  source: string;
  level: string;
  message: string;
  metadata: Record<string, any>;
}

export interface BehavioralEvidence {
  deviations: BehavioralDeviation[];
  normalBaseline: any;
  currentBehavior: any;
  anomalyScore: number;
}

export interface BehavioralDeviation {
  metric: string;
  expectedValue: number;
  actualValue: number;
  deviationPercent: number;
  significance: number;
}

export enum AlertStatus {
  OPEN = 'OPEN',
  INVESTIGATING = 'INVESTIGATING',
  RESOLVED = 'RESOLVED',
  FALSE_POSITIVE = 'FALSE_POSITIVE',
  ESCALATED = 'ESCALATED'
}

export interface IDSConfiguration {
  enabled: boolean;
  monitoringMode: MonitoringMode;
  sensitivityLevel: SensitivityLevel;
  rules: IDSRuleSet;
  thresholds: DetectionThresholds;
  integrations: IDSIntegrations;
  alerting: AlertingConfiguration;
  storage: StorageConfiguration;
}

export enum MonitoringMode {
  PASSIVE = 'PASSIVE',
  ACTIVE = 'ACTIVE',
  HYBRID = 'HYBRID'
}

export enum SensitivityLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  PARANOID = 'PARANOID'
}

export interface IDSRuleSet {
  signatureRules: IDSRule[];
  anomalyRules: IDSRule[];
  behavioralRules: IDSRule[];
  customRules: IDSRule[];
}

export interface DetectionThresholds {
  anomalyScore: number;
  riskScore: number;
  behavioralDeviation: number;
  threatConfidence: number;
  alertFrequency: number;
}

export interface IDSIntegrations {
  threatIntelligence: ThreatIntelConfig[];
  siem: SIEMConfig;
  monitoring: MonitoringConfig;
  notification: NotificationConfig;
}

export interface ThreatIntelConfig {
  provider: string;
  apiKey: string;
  feedUrl: string;
  updateInterval: number;
  enabled: boolean;
}

export interface SIEMConfig {
  enabled: boolean;
  endpoint: string;
  authentication: any;
  format: string;
}

export interface MonitoringConfig {
  prometheusEnabled: boolean;
  grafanaEnabled: boolean;
  customMetrics: string[];
}

export interface NotificationConfig {
  email: EmailConfig;
  slack: SlackConfig;
  webhook: WebhookConfig;
  sms: SMSConfig;
}

export interface EmailConfig {
  enabled: boolean;
  smtpServer: string;
  recipients: string[];
  templates: Record<string, string>;
}

export interface SlackConfig {
  enabled: boolean;
  webhookUrl: string;
  channel: string;
  templates: Record<string, string>;
}

export interface WebhookConfig {
  enabled: boolean;
  endpoints: WebhookEndpoint[];
}

export interface WebhookEndpoint {
  url: string;
  method: string;
  headers: Record<string, string>;
  authentication: any;
}

export interface SMSConfig {
  enabled: boolean;
  provider: string;
  apiKey: string;
  recipients: string[];
}

export interface AlertingConfiguration {
  severityThresholds: Record<SecuritySeverity, number>;
  escalationRules: EscalationRule[];
  suppressionRules: SuppressionRule[];
  notificationChannels: NotificationChannel[];
}

export interface EscalationRule {
  condition: string;
  delay: number;
  action: string;
  target: string;
}

export interface SuppressionRule {
  pattern: string;
  duration: number;
  maxAlerts: number;
}

export interface NotificationChannel {
  name: string;
  type: string;
  configuration: any;
  severityFilter: SecuritySeverity[];
}

export interface StorageConfiguration {
  retention: RetentionPolicy;
  archiving: ArchivingPolicy;
  encryption: EncryptionPolicy;
}

export interface RetentionPolicy {
  alerts: number; // days
  events: number; // days
  logs: number; // days
  profiles: number; // days
}

export interface ArchivingPolicy {
  enabled: boolean;
  destination: string;
  compression: boolean;
  schedule: string;
}

export interface EncryptionPolicy {
  enabled: boolean;
  algorithm: string;
  keyRotation: number; // days
}

export interface IDSMetrics {
  eventsProcessed: number;
  alertsGenerated: number;
  falsePositives: number;
  truePositives: number;
  detectionRate: number;
  responseTime: number;
  systemLoad: SystemLoad;
  threatIntelUpdates: number;
}

export interface SystemLoad {
  cpu: number;
  memory: number;
  disk: number;
  network: number;
}

export interface MLModel {
  id: string;
  name: string;
  type: MLModelType;
  version: string;
  trained: Date;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  features: string[];
  hyperparameters: Record<string, any>;
  trainingData: TrainingDataInfo;
  status: MLModelStatus;
}

export enum MLModelType {
  ANOMALY_DETECTION = 'ANOMALY_DETECTION',
  CLASSIFICATION = 'CLASSIFICATION',
  CLUSTERING = 'CLUSTERING',
  REGRESSION = 'REGRESSION',
  DEEP_LEARNING = 'DEEP_LEARNING'
}

export interface TrainingDataInfo {
  samples: number;
  features: number;
  classes?: string[];
  timeRange: {
    start: Date;
    end: Date;
  };
  quality: DataQuality;
}

export interface DataQuality {
  completeness: number;
  accuracy: number;
  consistency: number;
  timeliness: number;
}

export enum MLModelStatus {
  TRAINING = 'TRAINING',
  TRAINED = 'TRAINED',
  DEPLOYED = 'DEPLOYED',
  DEPRECATED = 'DEPRECATED',
  FAILED = 'FAILED'
}

export interface AnomalyDetectionResult {
  isAnomalous: boolean;
  anomalyScore: number;
  confidence: number;
  features: AnomalyFeature[];
  explanation: string;
  recommendations: string[];
}

export interface AnomalyFeature {
  name: string;
  value: number;
  expectedValue: number;
  deviation: number;
  importance: number;
}