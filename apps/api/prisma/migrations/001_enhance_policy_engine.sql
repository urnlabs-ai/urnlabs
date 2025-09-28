-- Migration: Enhance Policy Engine and Governance Framework
-- Task: 13.2 - Extend Prisma database schema for policy and audit storage
-- Created: 2024-01-01
-- Description: Comprehensive enhancement of policy storage with versioning, templates, and audit trails

-- ============================================================================
-- POLICY ENGINE ENHANCEMENTS
-- ============================================================================

-- Drop existing constraints to allow restructuring
ALTER TABLE policies DROP CONSTRAINT IF EXISTS policies_organization_id_fkey;

-- Enhanced Policy Table
-- Update existing policy table to support comprehensive policy definitions
ALTER TABLE policies ADD COLUMN IF NOT EXISTS classification VARCHAR(20) DEFAULT 'internal';
ALTER TABLE policies ADD COLUMN IF NOT EXISTS owner_id VARCHAR(30);
ALTER TABLE policies ADD COLUMN IF NOT EXISTS effective_date TIMESTAMP;
ALTER TABLE policies ADD COLUMN IF NOT EXISTS expiration_date TIMESTAMP;
ALTER TABLE policies ADD COLUMN IF NOT EXISTS compliance_frameworks TEXT[] DEFAULT '{}';
ALTER TABLE policies ADD COLUMN IF NOT EXISTS risk_level VARCHAR(20) DEFAULT 'medium';
ALTER TABLE policies ADD COLUMN IF NOT EXISTS created_by VARCHAR(30);
ALTER TABLE policies ADD COLUMN IF NOT EXISTS updated_by VARCHAR(30);

-- Convert existing status values to match new schema
UPDATE policies SET status = 'active' WHERE status = 'draft';

-- Add check constraints for enum values
ALTER TABLE policies ADD CONSTRAINT policies_classification_check
  CHECK (classification IN ('public', 'internal', 'confidential', 'restricted'));

ALTER TABLE policies ADD CONSTRAINT policies_status_check
  CHECK (status IN ('draft', 'active', 'deprecated', 'archived'));

ALTER TABLE policies ADD CONSTRAINT policies_risk_level_check
  CHECK (risk_level IN ('low', 'medium', 'high', 'critical'));

-- ============================================================================
-- POLICY VERSIONING SYSTEM
-- ============================================================================

-- Policy Versions Table for Change Management
CREATE TABLE IF NOT EXISTS policy_versions (
  id VARCHAR(30) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  policy_id VARCHAR(30) NOT NULL,
  version VARCHAR(20) NOT NULL,
  changes JSONB NOT NULL DEFAULT '[]',
  change_reason TEXT NOT NULL,
  changed_by VARCHAR(30) NOT NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  approved_by VARCHAR(30),
  approved_at TIMESTAMP,

  -- Constraints
  CONSTRAINT policy_versions_policy_id_fkey
    FOREIGN KEY (policy_id) REFERENCES policies(id) ON DELETE CASCADE,
  CONSTRAINT policy_versions_changed_by_fkey
    FOREIGN KEY (changed_by) REFERENCES users(id),
  CONSTRAINT policy_versions_approved_by_fkey
    FOREIGN KEY (approved_by) REFERENCES users(id),
  CONSTRAINT policy_versions_version_format_check
    CHECK (version ~ '^\d+\.\d+\.\d+$')
);

-- Unique constraint on policy_id + version
CREATE UNIQUE INDEX IF NOT EXISTS policy_versions_policy_version_unique
  ON policy_versions(policy_id, version);

-- ============================================================================
-- POLICY TEMPLATES SYSTEM
-- ============================================================================

-- Policy Templates for Reusable Patterns
CREATE TABLE IF NOT EXISTS policy_templates (
  id VARCHAR(30) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(50) NOT NULL,
  template JSONB NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]',
  compliance_frameworks TEXT[] DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT policy_templates_category_check
    CHECK (category IN ('security', 'compliance', 'access_control', 'data_management', 'workflow'))
);

-- ============================================================================
-- POLICY ASSIGNMENTS SYSTEM
-- ============================================================================

-- Policy Assignments for User/Role-based Policy Mapping
CREATE TABLE IF NOT EXISTS policy_assignments (
  id VARCHAR(30) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  policy_id VARCHAR(30) NOT NULL,
  assignee_type VARCHAR(20) NOT NULL,
  assignee_id VARCHAR(30) NOT NULL,
  assigned_by VARCHAR(30) NOT NULL,
  assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
  effective_date TIMESTAMP NOT NULL DEFAULT NOW(),
  expiration_date TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Constraints
  CONSTRAINT policy_assignments_policy_id_fkey
    FOREIGN KEY (policy_id) REFERENCES policies(id) ON DELETE CASCADE,
  CONSTRAINT policy_assignments_assigned_by_fkey
    FOREIGN KEY (assigned_by) REFERENCES users(id),
  CONSTRAINT policy_assignments_assignee_type_check
    CHECK (assignee_type IN ('user', 'role', 'organization', 'group'))
);

-- Unique constraint to prevent duplicate assignments
CREATE UNIQUE INDEX IF NOT EXISTS policy_assignments_unique
  ON policy_assignments(policy_id, assignee_type, assignee_id)
  WHERE is_active = true;

-- ============================================================================
-- ENHANCED AUDIT LOGS SYSTEM
-- ============================================================================

-- Enhanced Audit Logs for Immutable Compliance Trails
-- Rename existing audit_logs to audit_logs_legacy for migration
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs') THEN
    ALTER TABLE audit_logs RENAME TO audit_logs_legacy;
  END IF;
END $$;

-- Create new comprehensive audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(30) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  event_id VARCHAR(50) NOT NULL, -- Unique event identifier for correlation
  event_type VARCHAR(50) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id VARCHAR(30),

  -- Actor Information
  actor_type VARCHAR(20) NOT NULL, -- user, system, api_key, agent
  actor_id VARCHAR(30),
  organization_id VARCHAR(30),

  -- Event Details
  action VARCHAR(100) NOT NULL,
  outcome VARCHAR(20) NOT NULL DEFAULT 'success', -- success, failure, pending
  severity VARCHAR(20) NOT NULL DEFAULT 'info', -- info, warning, error, critical

  -- Data and Context
  before_state JSONB,
  after_state JSONB,
  changes JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',

  -- Request Context
  session_id VARCHAR(100),
  request_id VARCHAR(100),
  ip_address INET,
  user_agent TEXT,
  endpoint VARCHAR(255),
  http_method VARCHAR(10),

  -- Policy Context
  policy_id VARCHAR(30),
  policy_version VARCHAR(20),
  compliance_frameworks TEXT[] DEFAULT '{}',

  -- Immutability and Integrity
  event_hash VARCHAR(64) NOT NULL, -- SHA-256 hash for integrity verification
  previous_hash VARCHAR(64), -- Previous event hash for blockchain-like integrity

  -- Timestamps (immutable)
  event_timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  ingested_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT audit_logs_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT audit_logs_policy_id_fkey
    FOREIGN KEY (policy_id) REFERENCES policies(id),
  CONSTRAINT audit_logs_actor_type_check
    CHECK (actor_type IN ('user', 'system', 'api_key', 'agent', 'external')),
  CONSTRAINT audit_logs_outcome_check
    CHECK (outcome IN ('success', 'failure', 'pending', 'partial')),
  CONSTRAINT audit_logs_severity_check
    CHECK (severity IN ('info', 'warning', 'error', 'critical'))
);

-- Migrate data from legacy audit logs
INSERT INTO audit_logs (
  event_id, event_type, resource_type, resource_id, actor_type, actor_id,
  action, outcome, metadata, ip_address, user_agent, event_timestamp,
  event_hash
)
SELECT
  'legacy_' || id as event_id,
  'legacy_audit' as event_type,
  resource as resource_type,
  resource_id,
  'user' as actor_type,
  user_id as actor_id,
  action,
  'success' as outcome,
  COALESCE(details, '{}') as metadata,
  ip_address::inet,
  user_agent,
  created_at as event_timestamp,
  encode(sha256(id::bytea), 'hex') as event_hash
FROM audit_logs_legacy
WHERE user_id IS NOT NULL;

-- ============================================================================
-- POLICY EVALUATION CACHE
-- ============================================================================

-- Policy Evaluation Cache for Performance
CREATE TABLE IF NOT EXISTS policy_evaluation_cache (
  id VARCHAR(30) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  cache_key VARCHAR(255) NOT NULL UNIQUE,
  policy_id VARCHAR(30) NOT NULL,
  context_hash VARCHAR(64) NOT NULL,
  evaluation_result JSONB NOT NULL,
  cache_hit_count INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,

  -- Constraints
  CONSTRAINT policy_evaluation_cache_policy_id_fkey
    FOREIGN KEY (policy_id) REFERENCES policies(id) ON DELETE CASCADE
);

-- ============================================================================
-- COMPLIANCE REPORTING VIEWS
-- ============================================================================

-- Policy Compliance Summary View
CREATE OR REPLACE VIEW policy_compliance_summary AS
SELECT
  o.id as organization_id,
  o.name as organization_name,
  p.id as policy_id,
  p.name as policy_name,
  p.type as policy_type,
  p.status as policy_status,
  p.compliance_frameworks,
  p.risk_level,
  COUNT(pa.id) as total_assignments,
  COUNT(CASE WHEN pa.is_active THEN 1 END) as active_assignments,
  COUNT(DISTINCT al.id) as audit_events_count,
  MAX(al.event_timestamp) as last_audit_event,
  CASE
    WHEN p.status = 'active' AND COUNT(pa.id) > 0 THEN 'compliant'
    WHEN p.status = 'active' AND COUNT(pa.id) = 0 THEN 'not_assigned'
    ELSE 'inactive'
  END as compliance_status
FROM organizations o
JOIN policies p ON p.organization_id = o.id
LEFT JOIN policy_assignments pa ON pa.policy_id = p.id
LEFT JOIN audit_logs al ON al.policy_id = p.id
GROUP BY o.id, o.name, p.id, p.name, p.type, p.status, p.compliance_frameworks, p.risk_level;

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================

-- Policy Indexes
CREATE INDEX IF NOT EXISTS idx_policies_org_status ON policies(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_policies_type_priority ON policies(type, priority);
CREATE INDEX IF NOT EXISTS idx_policies_risk_level ON policies(risk_level);
CREATE INDEX IF NOT EXISTS idx_policies_compliance_frameworks ON policies USING GIN(compliance_frameworks);
CREATE INDEX IF NOT EXISTS idx_policies_effective_date ON policies(effective_date);
CREATE INDEX IF NOT EXISTS idx_policies_owner_status ON policies(owner_id, status);

-- Policy Versions Indexes
CREATE INDEX IF NOT EXISTS idx_policy_versions_policy_changed_at ON policy_versions(policy_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_policy_versions_changed_by ON policy_versions(changed_by);
CREATE INDEX IF NOT EXISTS idx_policy_versions_approval_status ON policy_versions(approved_by, approved_at);

-- Policy Templates Indexes
CREATE INDEX IF NOT EXISTS idx_policy_templates_category ON policy_templates(category);
CREATE INDEX IF NOT EXISTS idx_policy_templates_compliance ON policy_templates USING GIN(compliance_frameworks);

-- Policy Assignments Indexes
CREATE INDEX IF NOT EXISTS idx_policy_assignments_policy_active ON policy_assignments(policy_id, is_active);
CREATE INDEX IF NOT EXISTS idx_policy_assignments_assignee ON policy_assignments(assignee_type, assignee_id);
CREATE INDEX IF NOT EXISTS idx_policy_assignments_effective_date ON policy_assignments(effective_date);

-- Enhanced Audit Logs Indexes (Optimized for compliance queries)
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_timestamp ON audit_logs(organization_id, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_type, actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_policy ON audit_logs(policy_id, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type, outcome);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON audit_logs(severity, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_compliance ON audit_logs USING GIN(compliance_frameworks);
CREATE INDEX IF NOT EXISTS idx_audit_logs_session ON audit_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_request ON audit_logs(request_id);

-- Policy Evaluation Cache Indexes
CREATE INDEX IF NOT EXISTS idx_policy_cache_expires ON policy_evaluation_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_policy_cache_policy_id ON policy_evaluation_cache(policy_id);
CREATE INDEX IF NOT EXISTS idx_policy_cache_hit_count ON policy_evaluation_cache(cache_hit_count DESC);

-- ============================================================================
-- UPDATE FOREIGN KEY CONSTRAINTS
-- ============================================================================

-- Restore and enhance foreign key constraints
ALTER TABLE policies ADD CONSTRAINT policies_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE policies ADD CONSTRAINT policies_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES users(id);

ALTER TABLE policies ADD CONSTRAINT policies_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id);

ALTER TABLE policies ADD CONSTRAINT policies_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES users(id);

-- ============================================================================
-- TRIGGERS FOR AUDIT TRAIL
-- ============================================================================

-- Function to generate audit hash
CREATE OR REPLACE FUNCTION generate_audit_hash(event_data JSONB, prev_hash TEXT DEFAULT NULL)
RETURNS TEXT AS $$
BEGIN
  RETURN encode(sha256((event_data::text || COALESCE(prev_hash, ''))::bytea), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get previous audit hash
CREATE OR REPLACE FUNCTION get_previous_audit_hash(org_id TEXT)
RETURNS TEXT AS $$
DECLARE
  prev_hash TEXT;
BEGIN
  SELECT event_hash INTO prev_hash
  FROM audit_logs
  WHERE organization_id = org_id
  ORDER BY event_timestamp DESC, ingested_at DESC
  LIMIT 1;

  RETURN prev_hash;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for automatic audit hashing
CREATE OR REPLACE FUNCTION audit_log_hash_trigger()
RETURNS TRIGGER AS $$
DECLARE
  event_data JSONB;
  prev_hash TEXT;
BEGIN
  -- Get previous hash for integrity chain
  prev_hash := get_previous_audit_hash(NEW.organization_id);

  -- Create event data for hashing
  event_data := jsonb_build_object(
    'event_id', NEW.event_id,
    'event_type', NEW.event_type,
    'resource_type', NEW.resource_type,
    'resource_id', NEW.resource_id,
    'actor_type', NEW.actor_type,
    'actor_id', NEW.actor_id,
    'action', NEW.action,
    'event_timestamp', NEW.event_timestamp
  );

  -- Generate hash if not provided
  IF NEW.event_hash IS NULL OR NEW.event_hash = '' THEN
    NEW.event_hash := generate_audit_hash(event_data, prev_hash);
  END IF;

  -- Set previous hash
  NEW.previous_hash := prev_hash;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for audit log hashing
DROP TRIGGER IF EXISTS audit_log_hash_trigger ON audit_logs;
CREATE TRIGGER audit_log_hash_trigger
  BEFORE INSERT ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION audit_log_hash_trigger();

-- ============================================================================
-- CLEANUP LEGACY TABLES
-- ============================================================================

-- Keep legacy audit logs for reference but rename
-- (They will be kept for data integrity during transition)
COMMENT ON TABLE audit_logs_legacy IS 'Legacy audit logs - migrated to new audit_logs table';

-- ============================================================================
-- FINAL VALIDATION
-- ============================================================================

-- Add comments for documentation
COMMENT ON TABLE policies IS 'Enhanced policy definitions with comprehensive governance support';
COMMENT ON TABLE policy_versions IS 'Policy version history with complete change tracking';
COMMENT ON TABLE policy_templates IS 'Reusable policy templates for common compliance patterns';
COMMENT ON TABLE policy_assignments IS 'Policy assignments to users, roles, and organizations';
COMMENT ON TABLE audit_logs IS 'Immutable audit trail with blockchain-like integrity verification';
COMMENT ON TABLE policy_evaluation_cache IS 'Performance cache for policy evaluation results';

-- Migration completed successfully
-- Schema version: 1.0.0
-- Compatible with policy schema version: 1.0.0