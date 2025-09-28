/**
 * ML-Based Threat Detection Module
 *
 * Main entry point for the ML threat detection system.
 * Exports all components and provides initialization utilities.
 */

export { ThreatDetectionEngine } from './ThreatDetectionEngine';
export { BehavioralAnalyzer } from './BehavioralAnalyzer';
export { AnomalyDetectionModels } from './AnomalyDetectionModels';
export { ThreatDetectionService } from '../services/ThreatDetectionService';

export type {
  ThreatEvent,
  DetectionMetrics,
  ThreatDetectionConfig
} from './ThreatDetectionEngine';

export type {
  BehavioralBaseline,
  BehavioralAnomaly,
  SessionContext
} from './BehavioralAnalyzer';

export type {
  AnomalyResult,
  ModelMetrics,
  FeatureVector
} from './AnomalyDetectionModels';

export type {
  IncidentResponse,
  ThreatAlert,
  ThreatDetectionMetrics
} from '../services/ThreatDetectionService';

/**
 * Default configuration for threat detection
 */
export const DEFAULT_THREAT_DETECTION_CONFIG = {
  // Processing settings
  realTimeProcessing: true,
  batchSize: 100,
  maxProcessingLatency: 1000, // 1 second

  // ML model settings
  enableStatisticalModels: true,
  enableBehavioralAnalysis: true,
  enableAnomalyDetection: true,

  // Thresholds
  anomalyThreshold: 0.6,
  behavioralThreshold: 0.7,
  riskScoreThreshold: 50,

  // Model retraining
  retrainingInterval: 24, // hours
  minDataPointsForRetraining: 1000,

  // Performance monitoring
  enableMetrics: true,
  metricsRetentionDays: 30
};

/**
 * Initialize threat detection system with audit logging
 */
export async function initializeThreatDetection(
  auditService: any,
  config: {
    threatDetection?: Partial<typeof DEFAULT_THREAT_DETECTION_CONFIG>;
    pythonMLServiceUrl?: string;
    redisUrl?: string;
    incidentResponse?: {
      autoContainment: boolean;
      escalationThresholds: Record<string, number>;
      responseTeamEmails: string[];
      slackWebhook?: string;
    };
    alerting?: {
      emailService?: any;
      slackService?: any;
      webhookUrls: string[];
    };
  } = {}
) {
  const { ThreatDetectionService } = await import('../services/ThreatDetectionService');

  const threatDetectionConfig = {
    ...DEFAULT_THREAT_DETECTION_CONFIG,
    ...config.threatDetection
  };

  const serviceConfig = {
    threatDetection: threatDetectionConfig,
    incidentResponse: config.incidentResponse || {
      autoContainment: true,
      escalationThresholds: { HIGH: 5, CRITICAL: 1 },
      responseTeamEmails: ['security@urnlabs.ai'],
    },
    alerting: config.alerting || {
      webhookUrls: []
    },
    redisUrl: config.redisUrl
  };

  const threatDetectionService = new ThreatDetectionService(auditService, serviceConfig);
  await threatDetectionService.initialize();

  return threatDetectionService;
}

/**
 * Create threat detection engine standalone
 */
export async function createThreatDetectionEngine(
  config: Partial<typeof DEFAULT_THREAT_DETECTION_CONFIG> = {},
  options: {
    redisUrl?: string;
    pythonMLServiceUrl?: string;
  } = {}
) {
  const { ThreatDetectionEngine } = await import('./ThreatDetectionEngine');

  const engineConfig = {
    ...DEFAULT_THREAT_DETECTION_CONFIG,
    ...config
  };

  const engine = new ThreatDetectionEngine(engineConfig, options);
  await engine.initialize();

  return engine;
}