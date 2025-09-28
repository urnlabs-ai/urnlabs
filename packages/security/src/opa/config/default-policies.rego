# Default Authorization Policies for Urnlabs AI Platform
# These policies provide basic security controls for the platform

package authz

import rego.v1

# Default deny rule - security by default
default allow := false

# Allow health checks and system monitoring
allow if {
    input.resource.type == "health"
}

allow if {
    input.resource.type == "metrics"
    input.subject.type == "system"
}

# Allow authenticated users to access their own profile
allow if {
    input.resource.type == "user"
    input.action.name == "read"
    input.resource.id == input.subject.id
}

# Allow users to update their own profile
allow if {
    input.resource.type == "user"
    input.action.name == "update"
    input.resource.id == input.subject.id
    input.subject.type == "user"
}

# Administrative access controls
allow if {
    input.subject.type == "user"
    "admin" in input.subject.roles
    input.resource.type in admin_resources
}

admin_resources := {
    "user",
    "policy",
    "audit",
    "system",
    "configuration"
}

# API access controls
allow if {
    input.subject.type == "service"
    input.resource.type == "api"
    api_access_permitted
}

api_access_permitted if {
    input.action.name == "read"
    input.resource.path in public_api_endpoints
}

api_access_permitted if {
    input.action.name in {"create", "update", "delete"}
    input.subject.permissions[_] == sprintf("api:%s:%s", [input.action.name, input.resource.type])
}

public_api_endpoints := {
    "/health",
    "/metrics",
    "/version",
    "/docs"
}

# Data access controls based on classification
allow if {
    input.action.name == "read"
    data_classification_permitted
}

data_classification_permitted if {
    input.resource.attributes.classification == "public"
}

data_classification_permitted if {
    input.resource.attributes.classification == "internal"
    input.subject.type in {"user", "service"}
}

data_classification_permitted if {
    input.resource.attributes.classification == "confidential"
    input.subject.type == "user"
    required_clearance_level <= user_clearance_level
}

data_classification_permitted if {
    input.resource.attributes.classification == "restricted"
    input.subject.type == "user"
    "security_cleared" in input.subject.attributes
    required_clearance_level <= user_clearance_level
}

# Clearance level mapping
required_clearance_level := 1 if input.resource.attributes.classification == "public"
required_clearance_level := 2 if input.resource.attributes.classification == "internal"
required_clearance_level := 3 if input.resource.attributes.classification == "confidential"
required_clearance_level := 4 if input.resource.attributes.classification == "restricted"

user_clearance_level := input.subject.attributes.clearance_level if input.subject.attributes.clearance_level
user_clearance_level := 1 # Default clearance level

# Time-based access controls
allow if {
    business_hours_check
    input.resource.attributes.business_hours_only == true
}

business_hours_check if {
    not input.resource.attributes.business_hours_only
}

business_hours_check if {
    input.resource.attributes.business_hours_only == true
    time.now_ns() >= business_hours_start
    time.now_ns() <= business_hours_end
}

# Business hours: 9 AM to 6 PM UTC
business_hours_start := 9 * 60 * 60 * 1000000000  # 9 AM in nanoseconds
business_hours_end := 18 * 60 * 60 * 1000000000   # 6 PM in nanoseconds

# Geo-location based access controls
allow if {
    geo_access_permitted
}

geo_access_permitted if {
    not input.resource.attributes.geo_restricted
}

geo_access_permitted if {
    input.resource.attributes.geo_restricted == true
    input.context.country in allowed_countries
}

allowed_countries := {
    "US", "CA", "GB", "DE", "FR", "AU", "JP", "SG"
}

# Rate limiting obligations
rate_limit_required if {
    input.subject.type == "service"
    not "unlimited_rate" in input.subject.attributes
}

rate_limit_required if {
    input.action.name in {"create", "update", "delete"}
    input.subject.type == "user"
}

# Audit logging obligations
audit_required if {
    input.resource.attributes.classification in {"confidential", "restricted"}
}

audit_required if {
    input.action.name in {"create", "update", "delete"}
}

audit_required if {
    "admin" in input.subject.roles
}

# MFA requirements
mfa_required if {
    input.resource.attributes.classification == "restricted"
}

mfa_required if {
    input.action.name in {"delete", "admin"}
}

mfa_required if {
    "admin" in input.subject.roles
    input.action.name in {"create", "update", "delete"}
}

# Policy obligations that must be enforced
obligations := {
    "rate_limit": {
        "limit": 1000,
        "window": 3600
    }
} if rate_limit_required

obligations := {
    "audit_sensitive": true
} if audit_required

obligations := {
    "require_mfa": true
} if mfa_required

# Deny reasons for debugging and compliance
deny_reasons contains "No applicable policy found" if {
    not allow
    count([rule | rule := data.authz[_]; rule == allow]) == 0
}

deny_reasons contains "Resource classification too high for user clearance" if {
    not allow
    input.resource.attributes.classification
    required_clearance_level > user_clearance_level
}

deny_reasons contains "Access outside business hours not permitted" if {
    not allow
    input.resource.attributes.business_hours_only == true
    not business_hours_check
}

deny_reasons contains "Geo-restricted resource accessed from unauthorized location" if {
    not allow
    input.resource.attributes.geo_restricted == true
    not input.context.country in allowed_countries
}

deny_reasons contains "Insufficient permissions for API access" if {
    not allow
    input.resource.type == "api"
    input.subject.type == "service"
    not api_access_permitted
}

deny_reasons contains "Administrative privileges required" if {
    not allow
    input.resource.type in admin_resources
    not "admin" in input.subject.roles
}

# Policy metadata
policy_info := {
    "version": "1.0.0",
    "author": "Urnlabs Security Team",
    "description": "Default authorization policies for Urnlabs AI Platform",
    "last_updated": "2024-01-15T00:00:00Z",
    "compliance_frameworks": ["SOX", "GDPR", "ISO27001", "PCI"],
    "tags": ["default", "authorization", "rbac", "abac"]
}