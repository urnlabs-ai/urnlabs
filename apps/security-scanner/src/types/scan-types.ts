export type ScanType = 'dependency' | 'secrets' | 'sast' | 'dast' | 'multi';

export type ScanStatus = 'pending' | 'running' | 'completed' | 'failed' | 'partial' | 'cancelled' | 'not_found';

export type VulnerabilitySeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface ScanConfig {
  scanId?: string;
  repository?: string;
  branch?: string;
  targetUrl?: string;
  includeDevDependencies?: boolean;
  includeHistory?: boolean;
  severity?: VulnerabilitySeverity[];
  excludePatterns?: string[];
  generateReport?: boolean;
  notifyOnCritical?: boolean;
  generateTrends?: boolean;
}

export interface Vulnerability {
  id: string;
  title: string;
  description: string;
  severity: VulnerabilitySeverity;
  cvss: number;
  cwe?: string;
  file?: string;
  line?: number;
  column?: number;
  package?: string;
  version?: string;
  fixedVersion?: string;
  evidence?: string;
  remediation?: string;
  references?: string[];
  exploitMaturity?: string;
  discoveredAt?: Date;
}

export interface VulnerabilitySummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface ScanResult {
  scanId: string;
  scanType: ScanType;
  status: ScanStatus;
  startTime: Date;
  endTime: Date;
  vulnerabilities: Vulnerability[];
  summary: VulnerabilitySummary;
  metadata?: {
    repository?: string;
    branch?: string;
    targetUrl?: string;
    tool?: string;
    version?: string;
    rulesUsed?: string[];
    filesScanned?: number;
    scanTypes?: ScanType[];
    failedScans?: string[];
    error?: string;
  };
  config: ScanConfig;
}

export interface DependencyInfo {
  name: string;
  version: string;
  type: 'direct' | 'transitive';
  scope: 'production' | 'development';
  ecosystem: 'npm' | 'maven' | 'pip' | 'gem' | 'go' | 'rust' | 'dotnet';
  file?: string;
  line?: number;
}

export interface ScannerCapabilities {
  supportedEcosystems: string[];
  supportedFileTypes: string[];
  requiresNetwork: boolean;
  requiresDocker: boolean;
  estimatedDuration: 'fast' | 'medium' | 'slow';
}

export interface ScannerConfig {
  name: string;
  enabled: boolean;
  capabilities: ScannerCapabilities;
  settings: Record<string, any>;
}

export interface ScanMetrics {
  scanDuration: number;
  filesScanned: number;
  vulnerabilitiesFound: number;
  falsePositives: number;
  toolVersion: string;
  rulesetVersion: string;
}

export interface ReportConfig {
  format: 'json' | 'xml' | 'sarif' | 'html' | 'pdf';
  includeSummary: boolean;
  includeDetails: boolean;
  includeRemediation: boolean;
  includeEvidence: boolean;
  filterBySeverity?: VulnerabilitySeverity[];
  groupBy?: 'severity' | 'file' | 'package' | 'type';
}

export interface ScanRule {
  id: string;
  name: string;
  description: string;
  severity: VulnerabilitySeverity;
  category: string;
  enabled: boolean;
  pattern?: RegExp;
  cwe?: string;
  tags: string[];
}

export interface ScanPolicy {
  id: string;
  name: string;
  description: string;
  rules: ScanRule[];
  failureCriteria: {
    maxCritical: number;
    maxHigh: number;
    maxMedium: number;
    maxTotal: number;
  };
  exemptions: string[];
  createdAt: Date;
  updatedAt: Date;
}