/**
 * Comprehensive Access Control Matrix Types
 * Enhanced RBAC with ABAC, temporal controls, and advanced features
 */

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  parentRoles: string[];
  childRoles: string[];
  metadata?: Record<string, any>;
  isActive: boolean;
  validFrom?: Date;
  validTo?: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface Permission {
  id: string;
  resource: string;
  action: string;
  conditions?: AccessCondition[];
  metadata?: Record<string, any>;
  isActive: boolean;
  priority: number;
  effect: 'ALLOW' | 'DENY';
  scope?: PermissionScope;
}

export interface PermissionScope {
  type: 'GLOBAL' | 'ORGANIZATION' | 'PROJECT' | 'RESOURCE';
  value?: string;
  attributes?: Record<string, any>;
}

export interface AccessCondition {
  type: 'temporal' | 'context' | 'attribute' | 'location' | 'device' | 'risk' | 'custom';
  operator: 'equals' | 'contains' | 'in' | 'not_in' | 'gt' | 'lt' | 'between' | 'regex' | 'exists';
  field: string;
  value: any;
  metadata?: Record<string, any>;
}

export interface User {
  id: string;
  email: string;
  roles: UserRole[];
  groups: UserGroup[];
  attributes: UserAttribute[];
  isActive: boolean;
  lastLoginAt?: Date;
  mfaEnabled: boolean;
  riskScore: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserRole {
  roleId: string;
  assignedAt: Date;
  assignedBy: string;
  validFrom?: Date;
  validTo?: Date;
  isActive: boolean;
  source: 'MANUAL' | 'AUTOMATED' | 'INHERITED';
  metadata?: Record<string, any>;
}

export interface UserGroup {
  id: string;
  name: string;
  description: string;
  type: 'SECURITY' | 'FUNCTIONAL' | 'ORGANIZATIONAL';
  members: string[];
  roles: string[];
  permissions: Permission[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserAttribute {
  name: string;
  value: any;
  type: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'ARRAY' | 'OBJECT';
  source: 'USER' | 'SYSTEM' | 'EXTERNAL';
  updatedAt: Date;
}

export interface AccessMatrix {
  userId: string;
  resources: ResourceAccess[];
  computedAt: Date;
  validUntil: Date;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  audit: AccessAudit[];
}

export interface ResourceAccess {
  resource: string;
  permissions: ComputedPermission[];
  conditions: AccessCondition[];
  inheritance: PermissionInheritance[];
  metadata?: Record<string, any>;
}

export interface ComputedPermission {
  action: string;
  effect: 'ALLOW' | 'DENY';
  source: PermissionSource;
  priority: number;
  conditions?: AccessCondition[];
  validFrom?: Date;
  validTo?: Date;
}

export interface PermissionSource {
  type: 'ROLE' | 'GROUP' | 'DIRECT' | 'INHERITED' | 'EMERGENCY';
  id: string;
  name: string;
  path?: string[]; // For inheritance tracking
}

export interface PermissionInheritance {
  fromRole: string;
  throughPath: string[];
  permissions: string[];
  level: number;
}

export interface AccessRequest {
  id: string;
  userId: string;
  resource: string;
  action: string;
  context: RequestContext;
  timestamp: Date;
  sessionId?: string;
}

export interface RequestContext {
  ip: string;
  userAgent: string;
  location?: LocationContext;
  device?: DeviceContext;
  session?: SessionContext;
  environment: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';
  attributes?: Record<string, any>;
}

export interface LocationContext {
  country: string;
  region: string;
  city: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  timezone: string;
  isp?: string;
}

export interface DeviceContext {
  id: string;
  type: 'DESKTOP' | 'MOBILE' | 'TABLET' | 'SERVER' | 'IOT';
  os: string;
  browser?: string;
  isManaged: boolean;
  isTrusted: boolean;
  riskScore: number;
  lastSeen: Date;
}

export interface SessionContext {
  id: string;
  mfaVerified: boolean;
  mfaMethod?: string;
  riskScore: number;
  isElevated: boolean;
  elevatedUntil?: Date;
  loginMethod: 'PASSWORD' | 'SSO' | 'MFA' | 'API_KEY' | 'CERTIFICATE';
  createdAt: Date;
}

export interface AccessDecision {
  id: string;
  decision: 'ALLOW' | 'DENY' | 'CONDITIONAL';
  reason: string;
  appliedPolicies: AppliedPolicy[];
  conditions?: AccessCondition[];
  riskAssessment: RiskAssessment;
  recommendations: string[];
  audit: AccessAudit;
  computedAt: Date;
  validUntil?: Date;
  requiresReview?: boolean;
}

export interface AppliedPolicy {
  id: string;
  type: 'ROLE' | 'PERMISSION' | 'CONDITION' | 'RULE';
  name: string;
  effect: 'ALLOW' | 'DENY';
  weight: number;
  matched: boolean;
  reason: string;
}

export interface RiskAssessment {
  totalScore: number;
  factors: RiskFactor[];
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  mitigations: string[];
  monitoring: boolean;
}

export interface RiskFactor {
  type: 'TEMPORAL' | 'LOCATION' | 'DEVICE' | 'BEHAVIOR' | 'PRIVILEGE' | 'DATA_SENSITIVITY';
  name: string;
  score: number;
  weight: number;
  description: string;
}

export interface AccessAudit {
  id: string;
  requestId: string;
  userId: string;
  action: string;
  resource: string;
  decision: 'ALLOW' | 'DENY';
  reason: string;
  context: RequestContext;
  appliedPolicies: string[];
  riskScore: number;
  metadata?: Record<string, any>;
  timestamp: Date;
  sessionId?: string;
  duration?: number;
}

export interface EmergencyAccess {
  id: string;
  userId: string;
  requestedBy: string;
  approvedBy?: string;
  reason: string;
  permissions: Permission[];
  validFrom: Date;
  validTo: Date;
  isActive: boolean;
  approvalRequired: boolean;
  autoExpire: boolean;
  breakGlassCode?: string;
  audit: EmergencyAudit[];
  createdAt: Date;
  updatedAt: Date;
}

export interface EmergencyAudit {
  id: string;
  action: 'REQUESTED' | 'APPROVED' | 'DENIED' | 'ACTIVATED' | 'REVOKED' | 'EXPIRED';
  performedBy: string;
  reason: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface TemporalAccess {
  id: string;
  name: string;
  description: string;
  schedule: AccessSchedule[];
  timezone: string;
  isActive: boolean;
  metadata?: Record<string, any>;
}

export interface AccessSchedule {
  dayOfWeek?: number[];
  startTime: string; // HH:MM format
  endTime: string;
  validFrom?: Date;
  validTo?: Date;
  exceptions?: Date[];
}

export interface AccessReview {
  id: string;
  type: 'USER' | 'ROLE' | 'PERMISSION' | 'EMERGENCY';
  targetId: string;
  reviewerId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  scheduledDate: Date;
  completedDate?: Date;
  findings: ReviewFinding[];
  recommendations: string[];
  nextReviewDate?: Date;
  metadata?: Record<string, any>;
}

export interface ReviewFinding {
  type: 'COMPLIANCE' | 'SECURITY' | 'EFFICIENCY' | 'RISK';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  evidence: string[];
  recommendation: string;
  status: 'OPEN' | 'RESOLVED' | 'ACCEPTED';
}

export interface ComplianceFramework {
  id: string;
  name: string;
  version: string;
  requirements: ComplianceRequirement[];
  isActive: boolean;
  metadata?: Record<string, any>;
}

export interface ComplianceRequirement {
  id: string;
  section: string;
  title: string;
  description: string;
  controls: ComplianceControl[];
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  category: string;
}

export interface ComplianceControl {
  id: string;
  name: string;
  description: string;
  implementation: 'MANUAL' | 'AUTOMATED' | 'HYBRID';
  frequency: 'CONTINUOUS' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';
  evidence: string[];
  status: 'COMPLIANT' | 'NON_COMPLIANT' | 'PARTIAL' | 'NOT_APPLICABLE';
  lastAssessed?: Date;
  nextAssessment?: Date;
}

export interface AccessMetrics {
  period: string;
  totalRequests: number;
  allowedRequests: number;
  deniedRequests: number;
  averageResponseTime: number;
  uniqueUsers: number;
  topResources: ResourceMetric[];
  riskDistribution: RiskDistribution;
  complianceScore: number;
  violations: ViolationMetric[];
}

export interface ResourceMetric {
  resource: string;
  requests: number;
  deniedRequests: number;
  averageRiskScore: number;
}

export interface RiskDistribution {
  low: number;
  medium: number;
  high: number;
  critical: number;
}

export interface ViolationMetric {
  type: string;
  count: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  trend: 'INCREASING' | 'STABLE' | 'DECREASING';
}

export interface CacheEntry<T> {
  data: T;
  computedAt: Date;
  validUntil: Date;
  hits: number;
  lastAccessed: Date;
}

export interface PolicyConflict {
  id: string;
  type: 'ROLE_OVERLAP' | 'PERMISSION_CONFLICT' | 'CONDITION_CONTRADICTION';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  conflictingPolicies: string[];
  resolution: ConflictResolution;
  detectedAt: Date;
  resolvedAt?: Date;
}

export interface ConflictResolution {
  strategy: 'PRIORITY' | 'MERGE' | 'EXPLICIT' | 'MANUAL';
  action: string;
  rationale: string;
  appliedBy?: string;
}