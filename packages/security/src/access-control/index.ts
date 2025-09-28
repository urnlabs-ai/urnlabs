/**
 * Access Control Matrix - Main Export Module
 * Comprehensive RBAC/ABAC system with advanced features
 */

export * from './types';
export * from './AccessControlMatrix';
export * from './RBACManager';
export * from './PermissionEngine';
export * from './UserManager';

// Export configured instances
export { createAccessControlSystem } from './factory';
export { OPAIntegration } from './opa-integration';
export { AdminInterface } from './admin-interface';