-- Insert default security data
-- This migration inserts default roles, permissions, and system configuration

-- Insert default permissions
INSERT INTO permissions (name, resource, action, description) VALUES
    -- User management permissions
    ('View Users', 'users', 'read', 'Permission to view user information'),
    ('Create Users', 'users', 'create', 'Permission to create new users'),
    ('Update Users', 'users', 'update', 'Permission to update user information'),
    ('Delete Users', 'users', 'delete', 'Permission to delete users'),
    ('Manage User Roles', 'users', 'manage_roles', 'Permission to assign/remove user roles'),
    ('Manage User Permissions', 'users', 'manage_permissions', 'Permission to grant/revoke user permissions'),
    
    -- Role management permissions
    ('View Roles', 'roles', 'read', 'Permission to view role information'),
    ('Create Roles', 'roles', 'create', 'Permission to create new roles'),
    ('Update Roles', 'roles', 'update', 'Permission to update role information'),
    ('Delete Roles', 'roles', 'delete', 'Permission to delete roles'),
    ('Manage Role Permissions', 'roles', 'manage_permissions', 'Permission to assign/remove role permissions'),
    
    -- Permission management permissions
    ('View Permissions', 'permissions', 'read', 'Permission to view permission information'),
    ('Create Permissions', 'permissions', 'create', 'Permission to create new permissions'),
    ('Update Permissions', 'permissions', 'update', 'Permission to update permission information'),
    ('Delete Permissions', 'permissions', 'delete', 'Permission to delete permissions'),
    
    -- Security audit permissions
    ('View Security Events', 'security_events', 'read', 'Permission to view security audit logs'),
    ('Export Security Events', 'security_events', 'export', 'Permission to export security audit logs'),
    ('Manage Security Events', 'security_events', 'manage', 'Permission to manage security event settings'),
    
    -- Session management permissions
    ('View Sessions', 'sessions', 'read', 'Permission to view user sessions'),
    ('Terminate Sessions', 'sessions', 'terminate', 'Permission to terminate user sessions'),
    ('Manage Sessions', 'sessions', 'manage', 'Permission to manage session settings'),
    
    -- Policy management permissions
    ('View Policies', 'policies', 'read', 'Permission to view security policies'),
    ('Create Policies', 'policies', 'create', 'Permission to create security policies'),
    ('Update Policies', 'policies', 'update', 'Permission to update security policies'),
    ('Delete Policies', 'policies', 'delete', 'Permission to delete security policies'),
    
    -- API key management permissions
    ('View API Keys', 'api_keys', 'read', 'Permission to view API keys'),
    ('Create API Keys', 'api_keys', 'create', 'Permission to create API keys'),
    ('Update API Keys', 'api_keys', 'update', 'Permission to update API keys'),
    ('Delete API Keys', 'api_keys', 'delete', 'Permission to delete API keys'),
    ('Rotate API Keys', 'api_keys', 'rotate', 'Permission to rotate API keys'),
    
    -- System administration permissions
    ('System Administration', 'system', 'admin', 'Full system administration access'),
    ('View System Metrics', 'system', 'metrics', 'Permission to view system metrics'),
    ('Manage System Configuration', 'system', 'config', 'Permission to manage system configuration'),
    ('Backup System', 'system', 'backup', 'Permission to create system backups'),
    ('Restore System', 'system', 'restore', 'Permission to restore system from backups'),
    
    -- Compliance and reporting permissions
    ('View Compliance Reports', 'compliance', 'read', 'Permission to view compliance reports'),
    ('Generate Compliance Reports', 'compliance', 'generate', 'Permission to generate compliance reports'),
    ('Export Compliance Reports', 'compliance', 'export', 'Permission to export compliance reports'),
    
    -- Data management permissions
    ('View Encrypted Data', 'encrypted_data', 'read', 'Permission to view encrypted data'),
    ('Manage Encrypted Data', 'encrypted_data', 'manage', 'Permission to manage encrypted data'),
    ('Decrypt Sensitive Data', 'encrypted_data', 'decrypt', 'Permission to decrypt sensitive data'),
    
    -- General application permissions
    ('Dashboard Access', 'dashboard', 'read', 'Permission to access main dashboard'),
    ('Profile Management', 'profile', 'manage', 'Permission to manage own profile'),
    ('Change Password', 'profile', 'change_password', 'Permission to change own password'),
    ('Enable MFA', 'profile', 'enable_mfa', 'Permission to enable multi-factor authentication'),
    ('Disable MFA', 'profile', 'disable_mfa', 'Permission to disable multi-factor authentication');

-- Insert default roles
INSERT INTO roles (name, description, is_system) VALUES
    ('Super Admin', 'Full system administration access with all permissions', true),
    ('Security Admin', 'Security administration with access to security settings and audit logs', true),
    ('User Admin', 'User management with ability to create, update, and manage users', true),
    ('Compliance Officer', 'Compliance and audit access with reporting capabilities', true),
    ('API Manager', 'API key and integration management', true),
    ('System Operator', 'System operations and monitoring access', true),
    ('Read Only Admin', 'Read-only access to administrative functions', true),
    ('Standard User', 'Standard user access with basic permissions', true),
    ('Guest', 'Minimal guest access for external users', true);

-- Get permission IDs for role assignments
DO $$
DECLARE
    super_admin_role_id UUID;
    security_admin_role_id UUID;
    user_admin_role_id UUID;
    compliance_officer_role_id UUID;
    api_manager_role_id UUID;
    system_operator_role_id UUID;
    readonly_admin_role_id UUID;
    standard_user_role_id UUID;
    guest_role_id UUID;
    
    permission_record RECORD;
BEGIN
    -- Get role IDs
    SELECT id INTO super_admin_role_id FROM roles WHERE name = 'Super Admin';
    SELECT id INTO security_admin_role_id FROM roles WHERE name = 'Security Admin';
    SELECT id INTO user_admin_role_id FROM roles WHERE name = 'User Admin';
    SELECT id INTO compliance_officer_role_id FROM roles WHERE name = 'Compliance Officer';
    SELECT id INTO api_manager_role_id FROM roles WHERE name = 'API Manager';
    SELECT id INTO system_operator_role_id FROM roles WHERE name = 'System Operator';
    SELECT id INTO readonly_admin_role_id FROM roles WHERE name = 'Read Only Admin';
    SELECT id INTO standard_user_role_id FROM roles WHERE name = 'Standard User';
    SELECT id INTO guest_role_id FROM roles WHERE name = 'Guest';
    
    -- Assign ALL permissions to Super Admin
    FOR permission_record IN SELECT id FROM permissions LOOP
        INSERT INTO role_permissions (role_id, permission_id) 
        VALUES (super_admin_role_id, permission_record.id);
    END LOOP;
    
    -- Assign security-related permissions to Security Admin
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT security_admin_role_id, id FROM permissions 
    WHERE resource IN ('security_events', 'sessions', 'policies', 'encrypted_data', 'users', 'roles')
       OR action IN ('read', 'manage', 'export', 'terminate');
    
    -- Assign user management permissions to User Admin
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT user_admin_role_id, id FROM permissions 
    WHERE resource IN ('users', 'roles', 'permissions')
       OR (resource = 'sessions' AND action IN ('read', 'terminate'));
    
    -- Assign compliance permissions to Compliance Officer
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT compliance_officer_role_id, id FROM permissions 
    WHERE resource IN ('compliance', 'security_events')
       OR action IN ('read', 'export', 'generate');
    
    -- Assign API management permissions to API Manager
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT api_manager_role_id, id FROM permissions 
    WHERE resource IN ('api_keys', 'sessions')
       OR action IN ('read', 'create', 'update', 'rotate');
    
    -- Assign system operations permissions to System Operator
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT system_operator_role_id, id FROM permissions 
    WHERE resource IN ('system', 'sessions')
       OR action IN ('read', 'metrics', 'backup');
    
    -- Assign read-only permissions to Read Only Admin
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT readonly_admin_role_id, id FROM permissions 
    WHERE action IN ('read', 'metrics');
    
    -- Assign basic permissions to Standard User
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT standard_user_role_id, id FROM permissions 
    WHERE resource IN ('dashboard', 'profile')
       OR action IN ('read', 'manage', 'change_password', 'enable_mfa', 'disable_mfa');
    
    -- Assign minimal permissions to Guest
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT guest_role_id, id FROM permissions 
    WHERE resource = 'dashboard' AND action = 'read';
END $$;

-- Insert role hierarchy (child roles inherit parent permissions)
INSERT INTO role_hierarchy (parent_role_id, child_role_id)
SELECT p.id, c.id FROM roles p, roles c
WHERE (p.name = 'Super Admin' AND c.name IN ('Security Admin', 'User Admin', 'System Operator'))
   OR (p.name = 'Security Admin' AND c.name = 'Compliance Officer')
   OR (p.name = 'User Admin' AND c.name = 'Read Only Admin')
   OR (p.name = 'Read Only Admin' AND c.name = 'Standard User')
   OR (p.name = 'Standard User' AND c.name = 'Guest');

-- Insert default policy rules
INSERT INTO policy_rules (name, description, effect, subjects, actions, resources, priority, is_active, conditions)
VALUES
    (
        'Super Admin Full Access',
        'Super administrators have full access to all resources',
        'ALLOW',
        ARRAY['Super Admin'],
        ARRAY['*'],
        ARRAY['*'],
        1000,
        true,
        '[]'::jsonb
    ),
    (
        'User Self-Management',
        'Users can manage their own profile and settings',
        'ALLOW',
        ARRAY['Standard User'],
        ARRAY['read', 'update', 'change_password', 'enable_mfa', 'disable_mfa'],
        ARRAY['profile'],
        500,
        true,
        '[{"field": "resource.id", "operator": "eq", "value": "{{user.id}}", "type": "string"}]'::jsonb
    ),
    (
        'Business Hours Access Only',
        'Restrict access to business hours (9 AM - 6 PM UTC)',
        'DENY',
        ARRAY['Standard User', 'Guest'],
        ARRAY['*'],
        ARRAY['*'],
        400,
        false, -- Disabled by default
        '[{"field": "environment.timestamp", "operator": "lt", "value": "09:00", "type": "string"}, {"field": "environment.timestamp", "operator": "gt", "value": "18:00", "type": "string"}]'::jsonb
    ),
    (
        'MFA Required for Admin',
        'Administrative actions require MFA to be enabled',
        'DENY',
        ARRAY['Security Admin', 'User Admin', 'System Operator'],
        ARRAY['create', 'update', 'delete', 'manage'],
        ARRAY['users', 'roles', 'permissions', 'system'],
        700,
        true,
        '[{"field": "user.attributes.mfaEnabled", "operator": "eq", "value": false, "type": "boolean"}]'::jsonb
    ),
    (
        'Suspicious IP Block',
        'Block access from known suspicious IP ranges',
        'DENY',
        ARRAY['*'],
        ARRAY['*'],
        ARRAY['*'],
        900,
        true,
        '[{"field": "environment.ipAddress", "operator": "in", "value": ["192.168.1.100", "10.0.0.50"], "type": "array"}]'::jsonb
    );

-- Insert resource hierarchy examples
INSERT INTO resource_hierarchy (parent_resource, child_resource, inherit_permissions)
VALUES
    ('system', 'users', true),
    ('system', 'roles', true),
    ('system', 'permissions', true),
    ('system', 'security_events', true),
    ('users', 'profile', true),
    ('security_events', 'compliance', true);

-- Create default system admin user (password: 'SecureAdmin123!')
-- Note: This should be changed immediately after deployment
INSERT INTO users (email, username, password_hash, is_active, email_verified, mfa_enabled)
VALUES (
    'admin@urnlabs.ai',
    'admin',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewVyTKMJQjNQKZNi', -- 'SecureAdmin123!'
    true,
    true,
    false
);

-- Assign Super Admin role to default admin user
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id 
FROM users u, roles r 
WHERE u.username = 'admin' AND r.name = 'Super Admin';

-- Insert default API key for system integration
INSERT INTO api_keys (key_id, key_hash, name, description, scopes, rate_limit_per_hour, is_active)
VALUES (
    'sys_default_key',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewVyTKMJQjNQKZNi', -- Hash of 'default-system-key-change-me'
    'Default System API Key',
    'Default API key for system integration - CHANGE IMMEDIATELY',
    ARRAY['system:read', 'system:write', 'users:read'],
    10000,
    true
);

-- Insert system configuration policies
INSERT INTO policy_rules (name, description, effect, subjects, actions, resources, priority, is_active, conditions)
VALUES
    (
        'API Rate Limiting',
        'Enforce API rate limits based on user tier',
        'DENY',
        ARRAY['*'],
        ARRAY['*'],
        ARRAY['api'],
        300,
        true,
        '[{"field": "user.attributes.requestCount", "operator": "gt", "value": 1000, "type": "number"}]'::jsonb
    ),
    (
        'Encryption Required',
        'Require encryption for sensitive data operations',
        'DENY',
        ARRAY['*'],
        ARRAY['create', 'update'],
        ARRAY['encrypted_data'],
        800,
        true,
        '[{"field": "resource.attributes.encrypted", "operator": "eq", "value": false, "type": "boolean"}]'::jsonb
    );

-- Create initial system metrics and tracking
INSERT INTO security_events (event_type, description, severity, ip_address, user_agent, metadata)
VALUES (
    'SYSTEM_INITIALIZED',
    'Security framework initialized with default configuration',
    'LOW',
    '127.0.0.1',
    'system-init',
    '{"version": "1.0.0", "tables_created": true, "default_data_inserted": true}'::jsonb
);