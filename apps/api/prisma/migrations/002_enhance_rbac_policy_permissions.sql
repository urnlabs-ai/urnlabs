-- Migration: Enhance RBAC system with fine-grained policy management permissions
-- Task: 13.5 - Enhanced RBAC system for policy engine
-- Created: 2024-01-01
-- Description: Add comprehensive role-based access control for policy management operations

-- ============================================================================
-- ENHANCED RBAC SYSTEM FOR POLICY MANAGEMENT
-- ============================================================================

-- Drop existing UserPermission table constraints to allow restructuring
ALTER TABLE user_permissions DROP CONSTRAINT IF EXISTS user_permissions_user_id_fkey;

-- Enhanced UserPermission Table
-- Add context-specific permissions for policies
ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS resource_type VARCHAR(50);
ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS resource_id VARCHAR(30);
ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS granted_by VARCHAR(30);
ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS granted_at TIMESTAMP DEFAULT NOW();
ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;
ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS conditions JSONB DEFAULT '{}';

-- Update existing permissions to new format
UPDATE user_permissions
SET resource_type = 'global',
    granted_at = NOW()
WHERE resource_type IS NULL;

-- ============================================================================
-- ROLE MANAGEMENT SYSTEM
-- ============================================================================

-- Roles Table for predefined permission sets
CREATE TABLE IF NOT EXISTS roles (
  id VARCHAR(30) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name VARCHAR(100) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  scope VARCHAR(50) NOT NULL DEFAULT 'organization', -- global, organization, resource
  organization_id VARCHAR(30),

  -- Role metadata
  is_system_role BOOLEAN DEFAULT false, -- System-defined vs custom roles
  is_active BOOLEAN DEFAULT true,
  created_by VARCHAR(30),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT roles_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT roles_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT roles_name_organization_unique
    UNIQUE (name, organization_id),
  CONSTRAINT roles_scope_check
    CHECK (scope IN ('global', 'organization', 'resource'))
);

-- User Role Assignments
CREATE TABLE IF NOT EXISTS user_roles (
  id VARCHAR(30) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id VARCHAR(30) NOT NULL,
  role_id VARCHAR(30) NOT NULL,
  assigned_by VARCHAR(30) NOT NULL,
  assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true,

  -- Assignment context (for resource-scoped roles)
  resource_type VARCHAR(50),
  resource_id VARCHAR(30),

  -- Constraints
  CONSTRAINT user_roles_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT user_roles_role_id_fkey
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT user_roles_assigned_by_fkey
    FOREIGN KEY (assigned_by) REFERENCES users(id),
  CONSTRAINT user_roles_unique_assignment
    UNIQUE (user_id, role_id, resource_type, resource_id)
);

-- Role Permissions mapping
CREATE TABLE IF NOT EXISTS role_permissions (
  id VARCHAR(30) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  role_id VARCHAR(30) NOT NULL,
  permission VARCHAR(255) NOT NULL,
  resource_type VARCHAR(50) DEFAULT 'global',
  conditions JSONB DEFAULT '{}',

  -- Constraints
  CONSTRAINT role_permissions_role_id_fkey
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT role_permissions_unique
    UNIQUE (role_id, permission, resource_type)
);

-- ============================================================================
-- POLICY-SPECIFIC PERMISSIONS FRAMEWORK
-- ============================================================================

-- Policy Permission Categories with granular actions
CREATE TABLE IF NOT EXISTS policy_permission_definitions (
  id VARCHAR(30) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  category VARCHAR(100) NOT NULL, -- policy_management, compliance, audit, administration
  action VARCHAR(100) NOT NULL,   -- create, read, update, delete, approve, assign, evaluate
  resource_type VARCHAR(50) NOT NULL, -- policy, policy_template, policy_assignment, audit_log
  description TEXT NOT NULL,
  requires_approval BOOLEAN DEFAULT false,
  risk_level VARCHAR(20) DEFAULT 'medium',

  -- Constraints
  CONSTRAINT policy_permission_definitions_unique
    UNIQUE (category, action, resource_type),
  CONSTRAINT policy_permission_definitions_risk_level_check
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical'))
);

-- ============================================================================
-- PREDEFINED POLICY ROLES AND PERMISSIONS
-- ============================================================================

-- Insert System Roles for Policy Management
INSERT INTO roles (id, name, display_name, description, scope, is_system_role, is_active) VALUES
  ('role_policy_admin', 'policy_administrator', 'Policy Administrator', 'Full access to all policy management functions', 'organization', true, true),
  ('role_policy_manager', 'policy_manager', 'Policy Manager', 'Manage policies within assigned areas', 'organization', true, true),
  ('role_policy_reviewer', 'policy_reviewer', 'Policy Reviewer', 'Review and approve policy changes', 'organization', true, true),
  ('role_policy_viewer', 'policy_viewer', 'Policy Viewer', 'Read-only access to policies and compliance status', 'organization', true, true),
  ('role_compliance_officer', 'compliance_officer', 'Compliance Officer', 'Manage compliance frameworks and audit requirements', 'organization', true, true),
  ('role_security_analyst', 'security_analyst', 'Security Analyst', 'Manage security policies and investigate violations', 'organization', true, true),
  ('role_auditor', 'auditor', 'Auditor', 'Read-only access to audit logs and compliance reports', 'organization', true, true)
ON CONFLICT (id) DO NOTHING;

-- Insert Policy Permission Definitions
INSERT INTO policy_permission_definitions (category, action, resource_type, description, requires_approval, risk_level) VALUES
  -- Policy Management
  ('policy_management', 'create', 'policy', 'Create new policies', true, 'high'),
  ('policy_management', 'read', 'policy', 'View policy details and definitions', false, 'low'),
  ('policy_management', 'update', 'policy', 'Modify existing policy content', true, 'high'),
  ('policy_management', 'delete', 'policy', 'Remove policies from system', true, 'critical'),
  ('policy_management', 'approve', 'policy', 'Approve policy changes and versions', true, 'high'),
  ('policy_management', 'publish', 'policy', 'Activate policies for enforcement', true, 'high'),
  ('policy_management', 'archive', 'policy', 'Archive deprecated policies', false, 'medium'),

  -- Policy Templates
  ('policy_management', 'create', 'policy_template', 'Create reusable policy templates', false, 'medium'),
  ('policy_management', 'read', 'policy_template', 'View policy templates', false, 'low'),
  ('policy_management', 'update', 'policy_template', 'Modify policy templates', false, 'medium'),
  ('policy_management', 'delete', 'policy_template', 'Remove policy templates', false, 'medium'),

  -- Policy Assignments
  ('policy_management', 'create', 'policy_assignment', 'Assign policies to users/roles/groups', true, 'high'),
  ('policy_management', 'read', 'policy_assignment', 'View policy assignments', false, 'low'),
  ('policy_management', 'update', 'policy_assignment', 'Modify policy assignments', true, 'high'),
  ('policy_management', 'delete', 'policy_assignment', 'Remove policy assignments', true, 'high'),

  -- Compliance Management
  ('compliance', 'create', 'compliance_rule', 'Create compliance requirements', true, 'high'),
  ('compliance', 'read', 'compliance_rule', 'View compliance requirements', false, 'low'),
  ('compliance', 'update', 'compliance_rule', 'Modify compliance requirements', true, 'high'),
  ('compliance', 'delete', 'compliance_rule', 'Remove compliance requirements', true, 'critical'),
  ('compliance', 'assess', 'policy', 'Perform compliance assessments', false, 'medium'),
  ('compliance', 'report', 'policy', 'Generate compliance reports', false, 'low'),

  -- Audit and Monitoring
  ('audit', 'read', 'audit_log', 'View audit logs and events', false, 'low'),
  ('audit', 'export', 'audit_log', 'Export audit data for compliance', true, 'medium'),
  ('audit', 'investigate', 'security_event', 'Investigate security violations', false, 'medium'),
  ('audit', 'respond', 'security_event', 'Respond to security incidents', true, 'high'),

  -- Policy Evaluation and Enforcement
  ('enforcement', 'evaluate', 'policy', 'Evaluate policies against requests', false, 'low'),
  ('enforcement', 'override', 'policy', 'Override policy decisions', true, 'critical'),
  ('enforcement', 'configure', 'policy', 'Configure enforcement settings', true, 'high'),

  -- Administration
  ('administration', 'manage', 'role', 'Manage roles and permissions', true, 'critical'),
  ('administration', 'assign', 'role', 'Assign roles to users', true, 'high'),
  ('administration', 'configure', 'system', 'Configure system-wide policy settings', true, 'critical'),
  ('administration', 'backup', 'policy', 'Backup and restore policy data', true, 'high')
ON CONFLICT (category, action, resource_type) DO NOTHING;

-- ============================================================================
-- ROLE-PERMISSION MAPPINGS
-- ============================================================================

-- Policy Administrator - Full Access
INSERT INTO role_permissions (role_id, permission, resource_type, conditions) VALUES
  -- Policy Management
  ('role_policy_admin', 'policy_management:create:policy', 'policy', '{}'),
  ('role_policy_admin', 'policy_management:read:policy', 'policy', '{}'),
  ('role_policy_admin', 'policy_management:update:policy', 'policy', '{}'),
  ('role_policy_admin', 'policy_management:delete:policy', 'policy', '{}'),
  ('role_policy_admin', 'policy_management:approve:policy', 'policy', '{}'),
  ('role_policy_admin', 'policy_management:publish:policy', 'policy', '{}'),
  ('role_policy_admin', 'policy_management:archive:policy', 'policy', '{}'),

  -- Templates and Assignments
  ('role_policy_admin', 'policy_management:create:policy_template', 'policy_template', '{}'),
  ('role_policy_admin', 'policy_management:read:policy_template', 'policy_template', '{}'),
  ('role_policy_admin', 'policy_management:update:policy_template', 'policy_template', '{}'),
  ('role_policy_admin', 'policy_management:delete:policy_template', 'policy_template', '{}'),
  ('role_policy_admin', 'policy_management:create:policy_assignment', 'policy_assignment', '{}'),
  ('role_policy_admin', 'policy_management:read:policy_assignment', 'policy_assignment', '{}'),
  ('role_policy_admin', 'policy_management:update:policy_assignment', 'policy_assignment', '{}'),
  ('role_policy_admin', 'policy_management:delete:policy_assignment', 'policy_assignment', '{}'),

  -- Enforcement and Administration
  ('role_policy_admin', 'enforcement:evaluate:policy', 'policy', '{}'),
  ('role_policy_admin', 'enforcement:override:policy', 'policy', '{}'),
  ('role_policy_admin', 'enforcement:configure:policy', 'policy', '{}'),
  ('role_policy_admin', 'administration:manage:role', 'role', '{}'),
  ('role_policy_admin', 'administration:assign:role', 'role', '{}'),
  ('role_policy_admin', 'administration:configure:system', 'system', '{}'),
  ('role_policy_admin', 'administration:backup:policy', 'policy', '{}')
ON CONFLICT (role_id, permission, resource_type) DO NOTHING;

-- Policy Manager - Management without critical operations
INSERT INTO role_permissions (role_id, permission, resource_type, conditions) VALUES
  ('role_policy_manager', 'policy_management:create:policy', 'policy', '{"requires_approval": true}'),
  ('role_policy_manager', 'policy_management:read:policy', 'policy', '{}'),
  ('role_policy_manager', 'policy_management:update:policy', 'policy', '{"requires_approval": true}'),
  ('role_policy_manager', 'policy_management:archive:policy', 'policy', '{}'),
  ('role_policy_manager', 'policy_management:create:policy_template', 'policy_template', '{}'),
  ('role_policy_manager', 'policy_management:read:policy_template', 'policy_template', '{}'),
  ('role_policy_manager', 'policy_management:update:policy_template', 'policy_template', '{}'),
  ('role_policy_manager', 'policy_management:create:policy_assignment', 'policy_assignment', '{"scope": "own_policies"}'),
  ('role_policy_manager', 'policy_management:read:policy_assignment', 'policy_assignment', '{}'),
  ('role_policy_manager', 'policy_management:update:policy_assignment', 'policy_assignment', '{"scope": "own_policies"}'),
  ('role_policy_manager', 'enforcement:evaluate:policy', 'policy', '{}'),
  ('role_policy_manager', 'enforcement:configure:policy', 'policy', '{"scope": "own_policies"}')
ON CONFLICT (role_id, permission, resource_type) DO NOTHING;

-- Policy Reviewer - Review and approval focused
INSERT INTO role_permissions (role_id, permission, resource_type, conditions) VALUES
  ('role_policy_reviewer', 'policy_management:read:policy', 'policy', '{}'),
  ('role_policy_reviewer', 'policy_management:approve:policy', 'policy', '{}'),
  ('role_policy_reviewer', 'policy_management:publish:policy', 'policy', '{}'),
  ('role_policy_reviewer', 'policy_management:read:policy_template', 'policy_template', '{}'),
  ('role_policy_reviewer', 'policy_management:read:policy_assignment', 'policy_assignment', '{}'),
  ('role_policy_reviewer', 'compliance:assess:policy', 'policy', '{}'),
  ('role_policy_reviewer', 'compliance:report:policy', 'policy', '{}'),
  ('role_policy_reviewer', 'audit:read:audit_log', 'audit_log', '{}')
ON CONFLICT (role_id, permission, resource_type) DO NOTHING;

-- Policy Viewer - Read-only access
INSERT INTO role_permissions (role_id, permission, resource_type, conditions) VALUES
  ('role_policy_viewer', 'policy_management:read:policy', 'policy', '{}'),
  ('role_policy_viewer', 'policy_management:read:policy_template', 'policy_template', '{}'),
  ('role_policy_viewer', 'policy_management:read:policy_assignment', 'policy_assignment', '{}'),
  ('role_policy_viewer', 'compliance:read:compliance_rule', 'compliance_rule', '{}'),
  ('role_policy_viewer', 'compliance:report:policy', 'policy', '{}')
ON CONFLICT (role_id, permission, resource_type) DO NOTHING;

-- Compliance Officer - Compliance focused permissions
INSERT INTO role_permissions (role_id, permission, resource_type, conditions) VALUES
  ('role_compliance_officer', 'policy_management:read:policy', 'policy', '{}'),
  ('role_compliance_officer', 'policy_management:approve:policy', 'policy', '{"framework_scope": true}'),
  ('role_compliance_officer', 'compliance:create:compliance_rule', 'compliance_rule', '{}'),
  ('role_compliance_officer', 'compliance:read:compliance_rule', 'compliance_rule', '{}'),
  ('role_compliance_officer', 'compliance:update:compliance_rule', 'compliance_rule', '{}'),
  ('role_compliance_officer', 'compliance:delete:compliance_rule', 'compliance_rule', '{}'),
  ('role_compliance_officer', 'compliance:assess:policy', 'policy', '{}'),
  ('role_compliance_officer', 'compliance:report:policy', 'policy', '{}'),
  ('role_compliance_officer', 'audit:read:audit_log', 'audit_log', '{}'),
  ('role_compliance_officer', 'audit:export:audit_log', 'audit_log', '{}')
ON CONFLICT (role_id, permission, resource_type) DO NOTHING;

-- Security Analyst - Security focused permissions
INSERT INTO role_permissions (role_id, permission, resource_type, conditions) VALUES
  ('role_security_analyst', 'policy_management:read:policy', 'policy', '{}'),
  ('role_security_analyst', 'policy_management:create:policy', 'policy', '{"category": "security"}'),
  ('role_security_analyst', 'policy_management:update:policy', 'policy', '{"category": "security"}'),
  ('role_security_analyst', 'enforcement:evaluate:policy', 'policy', '{}'),
  ('role_security_analyst', 'enforcement:configure:policy', 'policy', '{"category": "security"}'),
  ('role_security_analyst', 'audit:read:audit_log', 'audit_log', '{}'),
  ('role_security_analyst', 'audit:investigate:security_event', 'security_event', '{}'),
  ('role_security_analyst', 'audit:respond:security_event', 'security_event', '{}')
ON CONFLICT (role_id, permission, resource_type) DO NOTHING;

-- Auditor - Audit and investigation focused
INSERT INTO role_permissions (role_id, permission, resource_type, conditions) VALUES
  ('role_auditor', 'policy_management:read:policy', 'policy', '{}'),
  ('role_auditor', 'policy_management:read:policy_assignment', 'policy_assignment', '{}'),
  ('role_auditor', 'compliance:read:compliance_rule', 'compliance_rule', '{}'),
  ('role_auditor', 'compliance:assess:policy', 'policy', '{}'),
  ('role_auditor', 'compliance:report:policy', 'policy', '{}'),
  ('role_auditor', 'audit:read:audit_log', 'audit_log', '{}'),
  ('role_auditor', 'audit:export:audit_log', 'audit_log', '{}'),
  ('role_auditor', 'audit:investigate:security_event', 'security_event', '{}')
ON CONFLICT (role_id, permission, resource_type) DO NOTHING;

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================

-- Enhanced UserPermission indexes
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_resource ON user_permissions(user_id, resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_resource ON user_permissions(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_expires ON user_permissions(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_permissions_active ON user_permissions(is_active, user_id);

-- Role indexes
CREATE INDEX IF NOT EXISTS idx_roles_organization ON roles(organization_id, is_active);
CREATE INDEX IF NOT EXISTS idx_roles_scope ON roles(scope, is_active);
CREATE INDEX IF NOT EXISTS idx_roles_system ON roles(is_system_role, is_active);

-- User Roles indexes
CREATE INDEX IF NOT EXISTS idx_user_roles_user_active ON user_roles(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_active ON user_roles(role_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_roles_expires ON user_roles(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_roles_resource ON user_roles(resource_type, resource_id);

-- Role Permissions indexes
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_resource_type ON role_permissions(resource_type);

-- Policy Permission Definitions indexes
CREATE INDEX IF NOT EXISTS idx_policy_permission_category ON policy_permission_definitions(category);
CREATE INDEX IF NOT EXISTS idx_policy_permission_risk ON policy_permission_definitions(risk_level);
CREATE INDEX IF NOT EXISTS idx_policy_permission_approval ON policy_permission_definitions(requires_approval);

-- ============================================================================
-- UPDATE FOREIGN KEY CONSTRAINTS
-- ============================================================================

-- Restore and enhance user_permissions foreign key
ALTER TABLE user_permissions ADD CONSTRAINT user_permissions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE user_permissions ADD CONSTRAINT user_permissions_granted_by_fkey
  FOREIGN KEY (granted_by) REFERENCES users(id);

-- Add check constraints for enhanced fields
ALTER TABLE user_permissions ADD CONSTRAINT user_permissions_resource_type_check
  CHECK (resource_type IN ('global', 'policy', 'policy_template', 'policy_assignment', 'compliance_rule', 'audit_log', 'role', 'system'));

-- ============================================================================
-- RBAC UTILITY FUNCTIONS
-- ============================================================================

-- Function to check if user has specific permission
CREATE OR REPLACE FUNCTION user_has_permission(
  p_user_id TEXT,
  p_permission TEXT,
  p_resource_type TEXT DEFAULT 'global',
  p_resource_id TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  has_permission BOOLEAN := FALSE;
BEGIN
  -- Check direct permissions
  SELECT EXISTS(
    SELECT 1 FROM user_permissions up
    WHERE up.user_id = p_user_id
      AND up.permission = p_permission
      AND up.resource_type = p_resource_type
      AND (p_resource_id IS NULL OR up.resource_id = p_resource_id OR up.resource_id IS NULL)
      AND up.is_active = true
      AND (up.expires_at IS NULL OR up.expires_at > NOW())
  ) INTO has_permission;

  -- If not found, check role-based permissions
  IF NOT has_permission THEN
    SELECT EXISTS(
      SELECT 1 FROM user_roles ur
      JOIN role_permissions rp ON ur.role_id = rp.role_id
      WHERE ur.user_id = p_user_id
        AND rp.permission = p_permission
        AND rp.resource_type = p_resource_type
        AND ur.is_active = true
        AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
        AND (p_resource_id IS NULL OR ur.resource_id = p_resource_id OR ur.resource_id IS NULL)
    ) INTO has_permission;
  END IF;

  RETURN has_permission;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's effective permissions
CREATE OR REPLACE FUNCTION get_user_permissions(p_user_id TEXT, p_resource_type TEXT DEFAULT NULL)
RETURNS TABLE(permission TEXT, resource_type TEXT, resource_id TEXT, source TEXT) AS $$
BEGIN
  RETURN QUERY
  -- Direct permissions
  SELECT
    up.permission,
    up.resource_type,
    up.resource_id,
    'direct'::TEXT as source
  FROM user_permissions up
  WHERE up.user_id = p_user_id
    AND up.is_active = true
    AND (up.expires_at IS NULL OR up.expires_at > NOW())
    AND (p_resource_type IS NULL OR up.resource_type = p_resource_type)

  UNION ALL

  -- Role-based permissions
  SELECT
    rp.permission,
    rp.resource_type,
    COALESCE(ur.resource_id, rp.resource_type) as resource_id,
    'role'::TEXT as source
  FROM user_roles ur
  JOIN role_permissions rp ON ur.role_id = rp.role_id
  WHERE ur.user_id = p_user_id
    AND ur.is_active = true
    AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    AND (p_resource_type IS NULL OR rp.resource_type = p_resource_type);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- AUDIT TRIGGER FOR PERMISSION CHANGES
-- ============================================================================

-- Function to audit permission changes
CREATE OR REPLACE FUNCTION audit_permission_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert audit log for permission changes
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (
      event_id, event_type, resource_type, resource_id,
      actor_type, actor_id, action, outcome,
      after_state, event_hash, event_timestamp
    ) VALUES (
      'perm_' || NEW.id,
      'permission_management',
      'user_permission',
      NEW.id,
      'system',
      NEW.granted_by,
      'grant_permission',
      'success',
      to_jsonb(NEW),
      encode(sha256(NEW.id::bytea), 'hex'),
      NOW()
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (
      event_id, event_type, resource_type, resource_id,
      actor_type, actor_id, action, outcome,
      before_state, after_state, event_hash, event_timestamp
    ) VALUES (
      'perm_' || NEW.id || '_update',
      'permission_management',
      'user_permission',
      NEW.id,
      'system',
      NEW.granted_by,
      'modify_permission',
      'success',
      to_jsonb(OLD),
      to_jsonb(NEW),
      encode(sha256((NEW.id || NEW.updated_at::text)::bytea), 'hex'),
      NOW()
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (
      event_id, event_type, resource_type, resource_id,
      actor_type, actor_id, action, outcome,
      before_state, event_hash, event_timestamp
    ) VALUES (
      'perm_' || OLD.id || '_delete',
      'permission_management',
      'user_permission',
      OLD.id,
      'system',
      OLD.granted_by,
      'revoke_permission',
      'success',
      to_jsonb(OLD),
      encode(sha256(OLD.id::bytea), 'hex'),
      NOW()
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for permission audit
DROP TRIGGER IF EXISTS audit_user_permission_changes ON user_permissions;
CREATE TRIGGER audit_user_permission_changes
  AFTER INSERT OR UPDATE OR DELETE ON user_permissions
  FOR EACH ROW
  EXECUTE FUNCTION audit_permission_change();

DROP TRIGGER IF EXISTS audit_user_role_changes ON user_roles;
CREATE TRIGGER audit_user_role_changes
  AFTER INSERT OR UPDATE OR DELETE ON user_roles
  FOR EACH ROW
  EXECUTE FUNCTION audit_permission_change();

-- ============================================================================
-- COMMENTS AND DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE roles IS 'Role definitions for RBAC system with organizational and resource scoping';
COMMENT ON TABLE user_roles IS 'User role assignments with expiration and resource context';
COMMENT ON TABLE role_permissions IS 'Permission sets associated with roles';
COMMENT ON TABLE policy_permission_definitions IS 'Catalog of available policy management permissions';
COMMENT ON TABLE user_permissions IS 'Enhanced direct user permissions with resource context and conditions';

COMMENT ON FUNCTION user_has_permission IS 'Check if user has specific permission through direct grant or role inheritance';
COMMENT ON FUNCTION get_user_permissions IS 'Get all effective permissions for a user including source (direct vs role)';

-- Migration completed successfully
-- Enhanced RBAC version: 1.0.0
-- Compatible with policy engine version: 1.0.0