#!/bin/bash

# Vault Setup Script for Urnlabs AI Platform
# Configures HashiCorp Vault for secrets management

set -e

# Configuration
VAULT_ADDR=${VAULT_ADDR:-"http://localhost:8200"}
VAULT_TOKEN=${VAULT_TOKEN:-""}
VAULT_UNSEAL_KEY=${VAULT_UNSEAL_KEY:-""}
SETUP_MODE=${SETUP_MODE:-"development"}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔐 Urnlabs Vault Setup${NC}"
echo "==============================="
echo "Vault Address: $VAULT_ADDR"
echo "Setup Mode: $SETUP_MODE"
echo ""

# Function to wait for Vault to be ready
wait_for_vault() {
    echo -e "${YELLOW}⏳ Waiting for Vault to be ready...${NC}"
    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if curl -s "$VAULT_ADDR/v1/sys/health" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Vault is ready${NC}"
            return 0
        fi

        echo "Attempt $attempt/$max_attempts - Vault not ready, waiting..."
        sleep 2
        attempt=$((attempt + 1))
    done

    echo -e "${RED}❌ Vault failed to become ready after $max_attempts attempts${NC}"
    exit 1
}

# Function to initialize Vault
initialize_vault() {
    echo -e "${BLUE}🔧 Initializing Vault...${NC}"

    # Check if Vault is already initialized
    local init_status=$(curl -s "$VAULT_ADDR/v1/sys/init" | jq -r '.initialized')

    if [ "$init_status" = "true" ]; then
        echo -e "${YELLOW}ℹ️  Vault is already initialized${NC}"
        return 0
    fi

    # Initialize Vault
    local init_response=$(curl -s -X POST \
        -d '{"secret_shares": 1, "secret_threshold": 1}' \
        "$VAULT_ADDR/v1/sys/init")

    # Extract keys and token
    local unseal_key=$(echo "$init_response" | jq -r '.keys[0]')
    local root_token=$(echo "$init_response" | jq -r '.root_token')

    echo -e "${GREEN}✅ Vault initialized successfully${NC}"
    echo -e "${YELLOW}🔑 Root Token: $root_token${NC}"
    echo -e "${YELLOW}🔓 Unseal Key: $unseal_key${NC}"

    # Save credentials for development
    if [ "$SETUP_MODE" = "development" ]; then
        echo "VAULT_TOKEN=$root_token" > .vault-dev-credentials
        echo "VAULT_UNSEAL_KEY=$unseal_key" >> .vault-dev-credentials
        echo -e "${YELLOW}💾 Credentials saved to .vault-dev-credentials${NC}"
        echo -e "${RED}⚠️  WARNING: This is for development only!${NC}"
    fi

    export VAULT_TOKEN="$root_token"
    export VAULT_UNSEAL_KEY="$unseal_key"
}

# Function to unseal Vault
unseal_vault() {
    echo -e "${BLUE}🔓 Unsealing Vault...${NC}"

    local seal_status=$(curl -s "$VAULT_ADDR/v1/sys/seal-status" | jq -r '.sealed')

    if [ "$seal_status" = "false" ]; then
        echo -e "${GREEN}✅ Vault is already unsealed${NC}"
        return 0
    fi

    if [ -z "$VAULT_UNSEAL_KEY" ]; then
        if [ -f ".vault-dev-credentials" ]; then
            source .vault-dev-credentials
        else
            echo -e "${RED}❌ VAULT_UNSEAL_KEY not provided and no dev credentials found${NC}"
            exit 1
        fi
    fi

    curl -s -X POST \
        -d "{\"key\": \"$VAULT_UNSEAL_KEY\"}" \
        "$VAULT_ADDR/v1/sys/unseal" > /dev/null

    echo -e "${GREEN}✅ Vault unsealed successfully${NC}"
}

# Function to setup auth methods
setup_auth_methods() {
    echo -e "${BLUE}🔐 Setting up authentication methods...${NC}"

    # Enable AppRole auth method
    curl -s -X POST \
        -H "X-Vault-Token: $VAULT_TOKEN" \
        -d '{"type": "approle"}' \
        "$VAULT_ADDR/v1/sys/auth/approle" || true

    echo -e "${GREEN}✅ AppRole auth method enabled${NC}"

    # Create policy for Urnlabs services
    local policy_data='{"policy": "path \"secret/data/urnlabs/*\" { capabilities = [\"read\", \"list\"] } path \"secret/metadata/urnlabs/*\" { capabilities = [\"read\", \"list\"] }"}'

    curl -s -X POST \
        -H "X-Vault-Token: $VAULT_TOKEN" \
        -d "$policy_data" \
        "$VAULT_ADDR/v1/sys/policies/acl/urnlabs-services"

    echo -e "${GREEN}✅ Urnlabs services policy created${NC}"

    # Create AppRole for services
    local role_data='{"policies": ["urnlabs-services"], "token_ttl": "1h", "token_max_ttl": "4h", "bind_secret_id": true}'

    curl -s -X POST \
        -H "X-Vault-Token: $VAULT_TOKEN" \
        -d "$role_data" \
        "$VAULT_ADDR/v1/auth/approle/role/urnlabs-services"

    # Get Role ID
    local role_id=$(curl -s -H "X-Vault-Token: $VAULT_TOKEN" \
        "$VAULT_ADDR/v1/auth/approle/role/urnlabs-services/role-id" | jq -r '.data.role_id')

    # Generate Secret ID
    local secret_id=$(curl -s -X POST \
        -H "X-Vault-Token: $VAULT_TOKEN" \
        "$VAULT_ADDR/v1/auth/approle/role/urnlabs-services/secret-id" | jq -r '.data.secret_id')

    echo -e "${GREEN}✅ AppRole created for Urnlabs services${NC}"
    echo -e "${YELLOW}🆔 Role ID: $role_id${NC}"
    echo -e "${YELLOW}🔐 Secret ID: $secret_id${NC}"

    # Save AppRole credentials
    if [ "$SETUP_MODE" = "development" ]; then
        echo "VAULT_ROLE_ID=$role_id" >> .vault-dev-credentials
        echo "VAULT_SECRET_ID=$secret_id" >> .vault-dev-credentials
        echo -e "${YELLOW}💾 AppRole credentials saved to .vault-dev-credentials${NC}"
    fi
}

# Function to setup secrets engines
setup_secrets_engines() {
    echo -e "${BLUE}🗄️  Setting up secrets engines...${NC}"

    # Enable KV v2 secrets engine
    curl -s -X POST \
        -H "X-Vault-Token: $VAULT_TOKEN" \
        -d '{"type": "kv", "options": {"version": "2"}}' \
        "$VAULT_ADDR/v1/sys/mounts/secret" || true

    echo -e "${GREEN}✅ KV v2 secrets engine enabled${NC}"

    # Create initial secrets structure
    setup_initial_secrets
}

# Function to create initial secrets
setup_initial_secrets() {
    echo -e "${BLUE}📝 Creating initial secrets structure...${NC}"

    # Database secrets
    local db_secrets='{"data": {"password": "dev_password_123", "connection_string": "postgresql://urnlabs:dev_password_123@postgres:5432/urnlabs", "encryption_key": "dev_encryption_key_456"}}'

    curl -s -X POST \
        -H "X-Vault-Token: $VAULT_TOKEN" \
        -d "$db_secrets" \
        "$VAULT_ADDR/v1/secret/data/urnlabs/database"

    # API secrets
    local api_secrets='{"data": {"jwt_secret": "dev_jwt_secret_789", "api_key": "dev_api_key_abc", "webhook_secret": "dev_webhook_secret_def"}}'

    curl -s -X POST \
        -H "X-Vault-Token: $VAULT_TOKEN" \
        -d "$api_secrets" \
        "$VAULT_ADDR/v1/secret/data/urnlabs/api"

    # Auth secrets
    local auth_secrets='{"data": {"oauth_client_secret": "dev_oauth_secret_ghi", "session_secret": "dev_session_secret_jkl", "encryption_key": "dev_auth_encryption_mno"}}'

    curl -s -X POST \
        -H "X-Vault-Token: $VAULT_TOKEN" \
        -d "$auth_secrets" \
        "$VAULT_ADDR/v1/secret/data/urnlabs/auth"

    # External service secrets
    local external_secrets='{"data": {"slack_token": "xoxb-dev-slack-token", "github_token": "ghp_dev_github_token", "monitoring_key": "dev_monitoring_key_pqr"}}'

    curl -s -X POST \
        -H "X-Vault-Token: $VAULT_TOKEN" \
        -d "$external_secrets" \
        "$VAULT_ADDR/v1/secret/data/urnlabs/external"

    echo -e "${GREEN}✅ Initial secrets created${NC}"
    echo -e "${YELLOW}⚠️  These are development secrets - replace in production!${NC}"
}

# Function to setup automatic secret rotation
setup_secret_rotation() {
    echo -e "${BLUE}🔄 Setting up secret rotation...${NC}"

    # This would typically integrate with database plugins
    # For now, we'll just document the process

    cat > vault-rotation-config.json << EOF
{
  "rotation_schedule": "0 2 * * *",
  "secrets": [
    {
      "path": "urnlabs/database/password",
      "rotation_period": "30d",
      "type": "postgresql"
    },
    {
      "path": "urnlabs/api/jwt_secret",
      "rotation_period": "7d",
      "type": "manual"
    }
  ]
}
EOF

    echo -e "${GREEN}✅ Secret rotation configuration saved${NC}"
    echo -e "${YELLOW}ℹ️  Implement rotation logic in your application${NC}"
}

# Function to create Docker Compose integration
setup_docker_integration() {
    echo -e "${BLUE}🐳 Setting up Docker Compose integration...${NC}"

    # Create Vault agent configuration
    cat > vault-agent.hcl << EOF
pid_file = "./pidfile"

vault {
  address = "$VAULT_ADDR"
}

auto_auth {
  method "approle" {
    mount_path = "auth/approle"
    config = {
      role_id_file_path = "/vault/config/role-id"
      secret_id_file_path = "/vault/config/secret-id"
    }
  }

  sink "file" {
    config = {
      path = "/vault/secrets/token"
    }
  }
}

template {
  source      = "/vault/templates/env.tpl"
  destination = "/vault/secrets/.env"
}
EOF

    # Create environment template
    mkdir -p templates
    cat > templates/env.tpl << EOF
# Auto-generated environment file from Vault
{{ with secret "secret/data/urnlabs/database" }}
DB_PASSWORD={{ .Data.data.password }}
DB_CONNECTION_STRING={{ .Data.data.connection_string }}
{{ end }}

{{ with secret "secret/data/urnlabs/api" }}
JWT_SECRET={{ .Data.data.jwt_secret }}
API_KEY={{ .Data.data.api_key }}
{{ end }}

{{ with secret "secret/data/urnlabs/auth" }}
SESSION_SECRET={{ .Data.data.session_secret }}
OAUTH_CLIENT_SECRET={{ .Data.data.oauth_client_secret }}
{{ end }}
EOF

    echo -e "${GREEN}✅ Docker integration files created${NC}"
    echo -e "${YELLOW}ℹ️  Use vault-agent to inject secrets into containers${NC}"
}

# Function to verify setup
verify_setup() {
    echo -e "${BLUE}✅ Verifying Vault setup...${NC}"

    # Check Vault status
    local status=$(curl -s "$VAULT_ADDR/v1/sys/health")
    local initialized=$(echo "$status" | jq -r '.initialized')
    local sealed=$(echo "$status" | jq -r '.sealed')

    if [ "$initialized" = "true" ] && [ "$sealed" = "false" ]; then
        echo -e "${GREEN}✅ Vault is properly initialized and unsealed${NC}"
    else
        echo -e "${RED}❌ Vault setup verification failed${NC}"
        exit 1
    fi

    # Test secret retrieval
    if curl -s -H "X-Vault-Token: $VAULT_TOKEN" \
        "$VAULT_ADDR/v1/secret/data/urnlabs/database" | jq -r '.data.data.password' > /dev/null; then
        echo -e "${GREEN}✅ Secret retrieval test passed${NC}"
    else
        echo -e "${RED}❌ Secret retrieval test failed${NC}"
        exit 1
    fi
}

# Function to print summary
print_summary() {
    echo ""
    echo -e "${GREEN}🎉 Vault setup completed successfully!${NC}"
    echo "======================================"
    echo "Vault Address: $VAULT_ADDR"
    echo "Status: Initialized and Unsealed"
    echo ""
    echo -e "${YELLOW}📋 Next Steps:${NC}"
    echo "1. Update your application configuration to use Vault"
    echo "2. Replace hardcoded secrets with Vault references"
    echo "3. Test secret retrieval in your applications"
    echo "4. Configure secret rotation schedules"
    echo "5. Set up monitoring and alerting for Vault"
    echo ""

    if [ "$SETUP_MODE" = "development" ]; then
        echo -e "${YELLOW}🔑 Development Credentials:${NC}"
        echo "Check .vault-dev-credentials file for access tokens"
        echo ""
        echo -e "${RED}⚠️  SECURITY WARNING:${NC}"
        echo "This setup is for development only!"
        echo "Use proper security measures in production:"
        echo "- Use TLS encryption"
        echo "- Implement proper authentication"
        echo "- Set up audit logging"
        echo "- Use auto-unseal mechanisms"
    fi
}

# Main execution
main() {
    wait_for_vault
    initialize_vault
    unseal_vault
    setup_auth_methods
    setup_secrets_engines
    setup_secret_rotation
    setup_docker_integration
    verify_setup
    print_summary
}

# Check dependencies
command -v curl >/dev/null 2>&1 || { echo -e "${RED}❌ curl is required but not installed${NC}" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo -e "${RED}❌ jq is required but not installed${NC}" >&2; exit 1; }

# Load dev credentials if they exist
if [ -f ".vault-dev-credentials" ]; then
    source .vault-dev-credentials
fi

# Run main function
main