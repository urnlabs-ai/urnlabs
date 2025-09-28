import { QualityGateConfig } from '../services/quality-gates';

export const defaultQualityGateConfig: QualityGateConfig = {
  coverage: {
    statements: 80,
    branches: 75,
    functions: 80,
    lines: 80
  },
  security: {
    allowedVulnerabilities: {
      critical: 0,
      high: 0,
      medium: 5,
      low: 10
    },
    requireSecurityScan: true
  },
  performance: {
    maxApiResponseTime: 200, // 200ms
    maxMemoryUsage: 256, // 256MB
    maxBundleSize: 1024 // 1MB
  },
  compliance: {
    requireDocumentation: true,
    requireTests: true,
    codeStandardsLevel: 'recommended'
  }
};

export const strictQualityGateConfig: QualityGateConfig = {
  coverage: {
    statements: 90,
    branches: 85,
    functions: 90,
    lines: 90
  },
  security: {
    allowedVulnerabilities: {
      critical: 0,
      high: 0,
      medium: 2,
      low: 5
    },
    requireSecurityScan: true
  },
  performance: {
    maxApiResponseTime: 150, // 150ms
    maxMemoryUsage: 128, // 128MB
    maxBundleSize: 512 // 512KB
  },
  compliance: {
    requireDocumentation: true,
    requireTests: true,
    codeStandardsLevel: 'strict'
  }
};

export const basicQualityGateConfig: QualityGateConfig = {
  coverage: {
    statements: 60,
    branches: 50,
    functions: 60,
    lines: 60
  },
  security: {
    allowedVulnerabilities: {
      critical: 0,
      high: 3,
      medium: 10,
      low: 20
    },
    requireSecurityScan: false
  },
  performance: {
    maxApiResponseTime: 500, // 500ms
    maxMemoryUsage: 512, // 512MB
    maxBundleSize: 2048 // 2MB
  },
  compliance: {
    requireDocumentation: false,
    requireTests: true,
    codeStandardsLevel: 'basic'
  }
};

export function getQualityGateConfig(level: 'strict' | 'default' | 'basic' = 'default'): QualityGateConfig {
  switch (level) {
    case 'strict':
      return strictQualityGateConfig;
    case 'basic':
      return basicQualityGateConfig;
    case 'default':
    default:
      return defaultQualityGateConfig;
  }
}