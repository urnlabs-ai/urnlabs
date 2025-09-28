-- Migration: Add Remediation System Tables
-- This migration adds all the necessary tables for the automated remediation system
-- Run this migration after backing up your database

-- ============================================================================
-- REMEDIATION EXECUTION TRACKING
-- ============================================================================

CREATE TABLE remediation_executions (
    id VARCHAR(30) PRIMARY KEY,
    violation_id VARCHAR(255) UNIQUE NOT NULL,
    policy_id VARCHAR(255) NOT NULL,
    remediation_policy_id VARCHAR(255) NOT NULL,

    -- Execution state
    status VARCHAR(50) DEFAULT 'initiated' NOT NULL,
    current_step INTEGER DEFAULT 0 NOT NULL,
    total_steps INTEGER DEFAULT 0 NOT NULL,

    -- Timing
    initiated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    completed_at TIMESTAMP NULL,

    -- Actor and context
    initiated_by VARCHAR(255) NOT NULL,
    task_id VARCHAR(255) NULL,
    organization_id VARCHAR(30) NULL,

    -- Results
    actions_executed INTEGER DEFAULT 0 NOT NULL,
    actions_succeeded INTEGER DEFAULT 0 NOT NULL,
    actions_failed INTEGER DEFAULT 0 NOT NULL,
    escalated BOOLEAN DEFAULT FALSE NOT NULL,

    -- Escalation tracking
    escalation_level INTEGER DEFAULT 0 NOT NULL,
    escalated_at TIMESTAMP NULL,
    escalation_reason TEXT NULL,

    -- Audit and compliance
    audit_trail_id VARCHAR(255) NULL,
    compliance_frameworks TEXT[] DEFAULT '{}' NOT NULL,

    -- JSON fields
    violation_context JSONB DEFAULT '{}' NOT NULL,
    execution_metadata JSONB DEFAULT '{}' NOT NULL,

    -- Foreign keys
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL,

    -- Indexes
    CONSTRAINT remediation_executions_status_check CHECK (status IN ('initiated', 'in_progress', 'completed', 'failed', 'escalated', 'cancelled'))
);

CREATE INDEX idx_remediation_executions_violation_id ON remediation_executions(violation_id);
CREATE INDEX idx_remediation_executions_status_initiated ON remediation_executions(status, initiated_at);
CREATE INDEX idx_remediation_executions_org_status ON remediation_executions(organization_id, status);
CREATE INDEX idx_remediation_executions_escalation ON remediation_executions(escalated, escalation_level);
CREATE INDEX idx_remediation_executions_initiated_at ON remediation_executions(initiated_at);

-- ============================================================================
-- REMEDIATION ACTIONS
-- ============================================================================

CREATE TABLE remediation_actions (
    id VARCHAR(30) PRIMARY KEY,
    execution_id VARCHAR(30) NOT NULL,
    action_id VARCHAR(255) NOT NULL,
    action_type VARCHAR(100) NOT NULL,

    -- Status and timing
    status VARCHAR(50) DEFAULT 'pending' NOT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    completed_at TIMESTAMP NULL,
    execution_time_ms INTEGER NULL,

    -- Configuration and results
    action_config JSONB DEFAULT '{}' NOT NULL,
    result JSONB NULL,
    error TEXT NULL,

    -- Retry and reliability
    retry_attempts INTEGER DEFAULT 0 NOT NULL,
    max_retries INTEGER DEFAULT 3 NOT NULL,

    -- Prerequisites and dependencies
    prerequisites TEXT[] DEFAULT '{}' NOT NULL,
    depends_on TEXT[] DEFAULT '{}' NOT NULL,

    -- Audit
    audit_trail_id VARCHAR(255) NULL,

    -- Foreign keys
    FOREIGN KEY (execution_id) REFERENCES remediation_executions(id) ON DELETE CASCADE,

    -- Constraints
    CONSTRAINT remediation_actions_status_check CHECK (status IN ('pending', 'running', 'success', 'failed', 'skipped'))
);

CREATE INDEX idx_remediation_actions_execution_status ON remediation_actions(execution_id, status);
CREATE INDEX idx_remediation_actions_type_status ON remediation_actions(action_type, status);
CREATE INDEX idx_remediation_actions_started_at ON remediation_actions(started_at);

-- ============================================================================
-- REMEDIATION POLICIES
-- ============================================================================

CREATE TABLE remediation_policies (
    id VARCHAR(30) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    enabled BOOLEAN DEFAULT TRUE NOT NULL,
    priority INTEGER DEFAULT 50 NOT NULL,

    -- Triggers
    policy_violation_types TEXT[] DEFAULT '{}' NOT NULL,
    severity_thresholds TEXT[] DEFAULT '{"medium","high","critical"}' NOT NULL,

    -- Actions configuration
    immediate_actions JSONB DEFAULT '[]' NOT NULL,
    escalation_actions JSONB DEFAULT '[]' NOT NULL,

    -- Escalation configuration
    escalation_delay_ms INTEGER DEFAULT 600000 NOT NULL, -- 10 minutes
    max_escalation_level INTEGER DEFAULT 3 NOT NULL,

    -- Compliance and audit
    compliance_frameworks TEXT[] DEFAULT '{}' NOT NULL,
    audit_required BOOLEAN DEFAULT TRUE NOT NULL,
    retention_period_days INTEGER DEFAULT 2555 NOT NULL, -- 7 years

    -- Metadata
    version VARCHAR(50) DEFAULT '1.0.0' NOT NULL,
    tags TEXT[] DEFAULT '{}' NOT NULL,

    -- Organization relationship
    organization_id VARCHAR(30) NULL,

    -- Audit fields
    created_by VARCHAR(255) NOT NULL,
    updated_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,

    -- Foreign keys
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL
);

CREATE INDEX idx_remediation_policies_org_enabled ON remediation_policies(organization_id, enabled);
CREATE INDEX idx_remediation_policies_priority_enabled ON remediation_policies(priority, enabled);
CREATE INDEX idx_remediation_policies_name ON remediation_policies(name);

-- ============================================================================
-- REMEDIATION POLICY VERSIONS
-- ============================================================================

CREATE TABLE remediation_policy_versions (
    id VARCHAR(30) PRIMARY KEY,
    policy_id VARCHAR(30) NOT NULL,
    version VARCHAR(50) NOT NULL,
    changes JSONB DEFAULT '[]' NOT NULL,
    change_reason TEXT NOT NULL,
    changed_by VARCHAR(255) NOT NULL,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    approved_by VARCHAR(255) NULL,
    approved_at TIMESTAMP NULL,

    -- Foreign keys
    FOREIGN KEY (policy_id) REFERENCES remediation_policies(id) ON DELETE CASCADE,

    -- Unique constraints
    UNIQUE(policy_id, version)
);

CREATE INDEX idx_remediation_policy_versions_policy_changed ON remediation_policy_versions(policy_id, changed_at);

-- ============================================================================
-- REMEDIATION ESCALATIONS
-- ============================================================================

CREATE TABLE remediation_escalations (
    id VARCHAR(30) PRIMARY KEY,
    execution_id VARCHAR(30) NOT NULL,
    level INTEGER NOT NULL,
    max_level INTEGER NOT NULL,

    -- Status and timing
    status VARCHAR(50) DEFAULT 'scheduled' NOT NULL,
    scheduled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    triggered_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,

    -- Actions and execution
    escalation_actions JSONB DEFAULT '[]' NOT NULL,
    executed_actions JSONB DEFAULT '[]' NOT NULL,

    -- Context
    escalation_reason TEXT NOT NULL,
    escalation_chain TEXT[] DEFAULT '{}' NOT NULL,

    -- Next escalation
    next_escalation_at TIMESTAMP NULL,
    auto_cancel BOOLEAN DEFAULT FALSE NOT NULL,

    -- Metadata
    metadata JSONB DEFAULT '{}' NOT NULL,

    -- Foreign keys
    FOREIGN KEY (execution_id) REFERENCES remediation_executions(id) ON DELETE CASCADE,

    -- Constraints
    CONSTRAINT remediation_escalations_status_check CHECK (status IN ('scheduled', 'in_progress', 'completed', 'failed', 'cancelled'))
);

CREATE INDEX idx_remediation_escalations_execution_level ON remediation_escalations(execution_id, level);
CREATE INDEX idx_remediation_escalations_status_scheduled ON remediation_escalations(status, scheduled_at);
CREATE INDEX idx_remediation_escalations_triggered_at ON remediation_escalations(triggered_at);

-- ============================================================================
-- REMEDIATION APPROVALS
-- ============================================================================

CREATE TABLE remediation_approvals (
    id VARCHAR(30) PRIMARY KEY,
    execution_id VARCHAR(30) NOT NULL,
    action_id VARCHAR(255) NULL,

    -- Approval request details
    requester_id VARCHAR(255) NOT NULL,
    requester_type VARCHAR(50) DEFAULT 'system' NOT NULL,
    approver_emails TEXT[] DEFAULT '{}' NOT NULL,

    -- Approval configuration
    reason TEXT NOT NULL,
    require_all_approvers BOOLEAN DEFAULT FALSE NOT NULL,

    -- Status and timing
    status VARCHAR(50) DEFAULT 'pending' NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at TIMESTAMP NOT NULL,

    -- Approval result
    approved_by VARCHAR(255) NULL,
    approved_at TIMESTAMP NULL,
    rejected_by VARCHAR(255) NULL,
    rejected_at TIMESTAMP NULL,
    rejection_reason TEXT NULL,

    -- Metadata
    metadata JSONB DEFAULT '{}' NOT NULL,

    -- Foreign keys
    FOREIGN KEY (execution_id) REFERENCES remediation_executions(id) ON DELETE CASCADE,

    -- Constraints
    CONSTRAINT remediation_approvals_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    CONSTRAINT remediation_approvals_requester_type_check CHECK (requester_type IN ('system', 'user', 'agent'))
);

CREATE INDEX idx_remediation_approvals_execution_status ON remediation_approvals(execution_id, status);
CREATE INDEX idx_remediation_approvals_status_expires ON remediation_approvals(status, expires_at);
CREATE INDEX idx_remediation_approvals_approver_emails ON remediation_approvals USING GIN(approver_emails);

-- ============================================================================
-- REMEDIATION AUDIT ENTRIES
-- ============================================================================

CREATE TABLE remediation_audit_entries (
    id VARCHAR(30) PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,

    -- Remediation context
    remediation_execution_id VARCHAR(30) NOT NULL,
    violation_id VARCHAR(255) NOT NULL,
    policy_id VARCHAR(255) NOT NULL,
    remediation_policy_id VARCHAR(255) NOT NULL,

    -- Action details
    action_type VARCHAR(100) NOT NULL,
    action_id VARCHAR(255) NOT NULL,
    action_status VARCHAR(50) NOT NULL,

    -- Actor information
    actor VARCHAR(255) NOT NULL,
    actor_type VARCHAR(50) DEFAULT 'system' NOT NULL,

    -- Resource context
    resource_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(255) NOT NULL,
    resource_state JSONB NULL,

    -- Execution details
    execution_time_ms INTEGER NULL,
    result JSONB NULL,
    error TEXT NULL,

    -- Decision context
    decision_rationale TEXT NULL,
    alternatives_considered TEXT[] DEFAULT '{}' NOT NULL,
    approval_required BOOLEAN DEFAULT FALSE NOT NULL,
    approval_status VARCHAR(50) NULL,

    -- Compliance metadata
    compliance_frameworks TEXT[] DEFAULT '{}' NOT NULL,
    risk_level VARCHAR(20) DEFAULT 'medium' NOT NULL,
    data_classification VARCHAR(20) DEFAULT 'internal' NOT NULL,
    retention_period_days INTEGER DEFAULT 2555 NOT NULL,

    -- Chain integrity
    previous_entry_hash VARCHAR(64) NULL,
    entry_hash VARCHAR(64) NOT NULL,

    -- Additional metadata
    metadata JSONB DEFAULT '{}' NOT NULL,

    -- Foreign keys
    FOREIGN KEY (remediation_execution_id) REFERENCES remediation_executions(id) ON DELETE SET NULL,

    -- Constraints
    CONSTRAINT remediation_audit_entries_action_status_check CHECK (action_status IN ('initiated', 'in_progress', 'completed', 'failed', 'cancelled')),
    CONSTRAINT remediation_audit_entries_actor_type_check CHECK (actor_type IN ('system', 'user', 'service')),
    CONSTRAINT remediation_audit_entries_risk_level_check CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT remediation_audit_entries_data_classification_check CHECK (data_classification IN ('public', 'internal', 'confidential', 'restricted'))
);

CREATE INDEX idx_remediation_audit_entries_execution_timestamp ON remediation_audit_entries(remediation_execution_id, timestamp);
CREATE INDEX idx_remediation_audit_entries_violation_timestamp ON remediation_audit_entries(violation_id, timestamp);
CREATE INDEX idx_remediation_audit_entries_action_type_timestamp ON remediation_audit_entries(action_type, timestamp);
CREATE INDEX idx_remediation_audit_entries_actor_timestamp ON remediation_audit_entries(actor, timestamp);
CREATE INDEX idx_remediation_audit_entries_risk_level_timestamp ON remediation_audit_entries(risk_level, timestamp);
CREATE INDEX idx_remediation_audit_entries_compliance_timestamp ON remediation_audit_entries USING GIN(compliance_frameworks);
CREATE INDEX idx_remediation_audit_entries_entry_hash ON remediation_audit_entries(entry_hash);

-- ============================================================================
-- REMEDIATION WORKFLOW STATES
-- ============================================================================

CREATE TABLE remediation_workflow_states (
    id VARCHAR(30) PRIMARY KEY,
    violation_id VARCHAR(255) UNIQUE NOT NULL,

    -- Workflow state
    status VARCHAR(50) DEFAULT 'pending' NOT NULL,
    current_step INTEGER DEFAULT 0 NOT NULL,
    total_steps INTEGER DEFAULT 0 NOT NULL,

    -- Node assignment and coordination
    assigned_node VARCHAR(255) NOT NULL,

    -- Timing
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    heartbeat_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,

    -- Metadata and context
    metadata JSONB DEFAULT '{}' NOT NULL,

    -- Constraints
    CONSTRAINT remediation_workflow_states_status_check CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled'))
);

CREATE INDEX idx_remediation_workflow_states_status_node ON remediation_workflow_states(status, assigned_node);
CREATE INDEX idx_remediation_workflow_states_violation_id ON remediation_workflow_states(violation_id);
CREATE INDEX idx_remediation_workflow_states_heartbeat_at ON remediation_workflow_states(heartbeat_at);

-- ============================================================================
-- REMEDIATION METRICS
-- ============================================================================

CREATE TABLE remediation_metrics (
    id VARCHAR(30) PRIMARY KEY,

    -- Metric details
    metric_type VARCHAR(100) NOT NULL,
    metric_value DOUBLE PRECISION NOT NULL,
    unit VARCHAR(50) NOT NULL,

    -- Context
    organization_id VARCHAR(30) NULL,
    execution_id VARCHAR(30) NULL,
    action_type VARCHAR(100) NULL,
    policy_id VARCHAR(255) NULL,

    -- Time dimensions
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,

    -- Aggregation level
    aggregation_level VARCHAR(50) DEFAULT 'execution' NOT NULL,

    -- Compliance tracking
    compliance_framework VARCHAR(50) NULL,

    -- Metadata
    tags JSONB DEFAULT '{}' NOT NULL,

    -- Foreign keys
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL,

    -- Constraints
    CONSTRAINT remediation_metrics_aggregation_level_check CHECK (aggregation_level IN ('execution', 'hourly', 'daily', 'weekly', 'monthly'))
);

CREATE INDEX idx_remediation_metrics_type_timestamp ON remediation_metrics(metric_type, timestamp);
CREATE INDEX idx_remediation_metrics_org_type_timestamp ON remediation_metrics(organization_id, metric_type, timestamp);
CREATE INDEX idx_remediation_metrics_aggregation_period ON remediation_metrics(aggregation_level, period_start, period_end);
CREATE INDEX idx_remediation_metrics_compliance_timestamp ON remediation_metrics(compliance_framework, timestamp);

-- ============================================================================
-- REMEDIATION CONFIGURATION
-- ============================================================================

CREATE TABLE remediation_configurations (
    id VARCHAR(30) PRIMARY KEY,

    -- Configuration details
    config_key VARCHAR(255) UNIQUE NOT NULL,
    config_value JSONB NOT NULL,
    config_type VARCHAR(50) DEFAULT 'system' NOT NULL,

    -- Scope
    organization_id VARCHAR(30) NULL,
    user_id VARCHAR(30) NULL,

    -- Metadata
    description TEXT NULL,
    version VARCHAR(50) DEFAULT '1.0.0' NOT NULL,

    -- Audit
    created_by VARCHAR(255) NOT NULL,
    updated_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,

    -- Foreign keys
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,

    -- Constraints
    CONSTRAINT remediation_configurations_config_type_check CHECK (config_type IN ('system', 'organization', 'user'))
);

CREATE INDEX idx_remediation_configurations_config_key ON remediation_configurations(config_key);
CREATE INDEX idx_remediation_configurations_org_type ON remediation_configurations(organization_id, config_type);

-- ============================================================================
-- NOTIFICATIONS (if not already exists)
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(30) PRIMARY KEY,
    type VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    urgency VARCHAR(20) DEFAULT 'medium' NOT NULL,

    -- Recipient
    recipient_email VARCHAR(255) NOT NULL,
    recipient_user_id VARCHAR(30) NULL,

    -- Status and timing
    status VARCHAR(50) DEFAULT 'pending' NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    sent_at TIMESTAMP NULL,
    read_at TIMESTAMP NULL,
    expires_at TIMESTAMP NULL,

    -- Context
    related_resource_type VARCHAR(100) NULL,
    related_resource_id VARCHAR(255) NULL,

    -- Metadata
    metadata JSONB DEFAULT '{}' NOT NULL,

    -- Retry tracking
    attempts INTEGER DEFAULT 0 NOT NULL,
    max_attempts INTEGER DEFAULT 3 NOT NULL,
    last_attempt_at TIMESTAMP NULL,

    -- Foreign keys
    FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE SET NULL,

    -- Constraints
    CONSTRAINT notifications_urgency_check CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT notifications_status_check CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_status ON notifications(recipient_email, status);
CREATE INDEX IF NOT EXISTS idx_notifications_type_status_created ON notifications(type, status, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_urgency_status ON notifications(urgency, status);
CREATE INDEX IF NOT EXISTS idx_notifications_related_resource ON notifications(related_resource_type, related_resource_id);

-- ============================================================================
-- APPROVAL REQUESTS (if not already exists)
-- ============================================================================

CREATE TABLE IF NOT EXISTS approval_requests (
    id VARCHAR(30) PRIMARY KEY,

    -- Request details
    task_id VARCHAR(255) NULL,
    violation_id VARCHAR(255) NULL,
    requester_id VARCHAR(255) NOT NULL,
    reason TEXT NOT NULL,

    -- Approvers
    approver_emails TEXT[] DEFAULT '{}' NOT NULL,
    require_all_approvers BOOLEAN DEFAULT FALSE NOT NULL,

    -- Status and timing
    status VARCHAR(50) DEFAULT 'pending' NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at TIMESTAMP NOT NULL,

    -- Resolution
    approved_by VARCHAR(255) NULL,
    approved_at TIMESTAMP NULL,
    rejected_by VARCHAR(255) NULL,
    rejected_at TIMESTAMP NULL,
    rejection_reason TEXT NULL,

    -- Metadata
    metadata JSONB DEFAULT '{}' NOT NULL,

    -- Constraints
    CONSTRAINT approval_requests_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_status_expires ON approval_requests(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_approval_requests_approver_emails ON approval_requests USING GIN(approver_emails);
CREATE INDEX IF NOT EXISTS idx_approval_requests_violation_id ON approval_requests(violation_id);

-- ============================================================================
-- ADD TRIGGERS FOR UPDATED_AT COLUMNS
-- ============================================================================

-- Function to update the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to tables with updated_at columns
CREATE TRIGGER update_remediation_policies_updated_at
    BEFORE UPDATE ON remediation_policies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_remediation_configurations_updated_at
    BEFORE UPDATE ON remediation_configurations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_remediation_workflow_states_updated_at
    BEFORE UPDATE ON remediation_workflow_states
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE remediation_executions IS 'Tracks automated remediation executions for policy violations';
COMMENT ON TABLE remediation_actions IS 'Individual actions executed as part of a remediation workflow';
COMMENT ON TABLE remediation_policies IS 'Defines remediation policies and their configuration';
COMMENT ON TABLE remediation_escalations IS 'Tracks escalation workflows for failed or insufficient remediations';
COMMENT ON TABLE remediation_approvals IS 'Manages approval requests for sensitive remediation actions';
COMMENT ON TABLE remediation_audit_entries IS 'Comprehensive audit trail for all remediation activities';
COMMENT ON TABLE remediation_workflow_states IS 'Distributed workflow state management for remediation processes';
COMMENT ON TABLE remediation_metrics IS 'Performance and compliance metrics for remediation system';
COMMENT ON TABLE remediation_configurations IS 'System and organization-level configuration for remediation engine';

-- ============================================================================
-- COMPLETION
-- ============================================================================

-- Insert default remediation policies
INSERT INTO remediation_policies (
    id, name, description, enabled, priority,
    policy_violation_types, severity_thresholds,
    immediate_actions, escalation_actions,
    escalation_delay_ms, max_escalation_level,
    compliance_frameworks, audit_required,
    created_by, updated_by
) VALUES
(
    'default-critical-security',
    'Critical Security Violations',
    'Immediate response for critical security policy violations',
    TRUE, 100,
    ARRAY['security-policy', 'data-protection-policy'],
    ARRAY['critical'],
    '[
        {
            "id": "block-task-immediate",
            "type": "block_task",
            "severity": "critical",
            "description": "Immediately block the violating task",
            "config": {"immediate": true, "reason": "Critical security violation detected"}
        },
        {
            "id": "notify-security-team",
            "type": "notify_admin",
            "severity": "high",
            "description": "Notify security team of critical violation",
            "config": {
                "recipients": ["security-team@urnlabs.ai"],
                "urgency": "critical",
                "escalationTimeoutMs": 300000
            }
        }
    ]'::jsonb,
    '[
        {
            "id": "suspend-agent-access",
            "type": "suspend_agent",
            "severity": "critical",
            "description": "Suspend agent access pending investigation",
            "config": {"duration": "24h", "reason": "Critical security violation"}
        }
    ]'::jsonb,
    600000, 2,
    ARRAY['SOX', 'PCI', 'ISO27001'], TRUE,
    'system', 'system'
);

-- Insert default configuration
INSERT INTO remediation_configurations (
    id, config_key, config_value, config_type, description,
    created_by, updated_by
) VALUES
(
    'default-config',
    'remediation.default.config',
    '{
        "enableAutomaticRemediation": true,
        "enableRealTimeProcessing": true,
        "enableAuditIntegration": true,
        "remediationTimeout": 300000,
        "maxConcurrentRemediations": 10
    }'::jsonb,
    'system',
    'Default configuration for the automated remediation system',
    'system',
    'system'
);

COMMIT;