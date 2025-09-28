export interface ResourceAction {
  resource: string;
  action: string;
  conditions?: Record<string, any>;
}

export interface PermissionCheck {
  userId: string;
  resource: string;
  action: string;
  context?: Record<string, any>;
}

export interface PolicyRule {
  id: string;
  name: string;
  description: string;
  effect: 'ALLOW' | 'DENY';
  subjects: string[]; // user IDs, role names, or groups
  actions: string[];
  resources: string[];
  conditions?: PolicyCondition[];
  priority: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PolicyCondition {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'contains' | 'startsWith' | 'endsWith';
  value: any;
  type: 'string' | 'number' | 'boolean' | 'date' | 'array';
}

export interface AuthorizationContext {
  user: {
    id: string;
    roles: string[];
    attributes: Record<string, any>;
  };
  resource: {
    id?: string;
    type: string;
    attributes: Record<string, any>;
  };
  action: string;
  environment: {
    ipAddress: string;
    userAgent: string;
    timestamp: Date;
    location?: string;
  };
}

export interface AuthorizationResult {
  allowed: boolean;
  reason: string;
  appliedPolicies: string[];
  context: AuthorizationContext;
  evaluatedAt: Date;
}

export interface RoleHierarchy {
  id: string;
  parentRoleId: string;
  childRoleId: string;
  createdAt: Date;
}

export interface ResourceHierarchy {
  id: string;
  parentResourceId: string;
  childResourceId: string;
  inheritPermissions: boolean;
  createdAt: Date;
}

export interface AccessPattern {
  userId: string;
  resource: string;
  action: string;
  frequency: number;
  lastAccess: Date;
  avgAccessTime: number;
  isAnomaly: boolean;
}