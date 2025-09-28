#!/bin/bash

# Script to migrate existing secrets to Vault
set -euo pipefail

VAULT_ADDR="${VAULT_ADDR:-http://localhost:8200}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VAULT_INIT_FILE="$SCRIPT_DIR/vault-init.json"

# Check if Vault is ready and unsealed
if ! vault status | grep -q "Sealed.*false"; then
  echo "❌ Vault is not ready or is sealed. Please run init-vault.sh first."
  exit 1
fi

echo "🔄 Starting secrets migration to Vault..."

# Function to create secret in Vault
create_secret() {
  local path="$1"
  local data="$2"
  echo "📝 Creating secret at: secret/$path"
  vault kv put "secret/$path" $data
}

# Database secrets
echo "🗄️  Migrating database secrets..."
create_secret "database/postgres" \
  username="postgres" \
  password="postgres" \
  host="postgres" \
  port="5432" \
  database="urnlabs_dev"

create_secret "database/postgres-test" \
  username="postgres" \
  password="postgres" \
  host="postgres" \
  port="5432" \
  database="urnlabs_test"

create_secret "database/redis" \
  host="redis" \
  port="6379" \
  url="redis://redis:6379"

# JWT secrets
echo "🔐 Migrating JWT secrets..."
# Generate a strong JWT secret
JWT_SECRET=$(openssl rand -base64 48)
create_secret "jwt/main" \
  secret="$JWT_SECRET" \
  algorithm="HS256" \
  expiration="1h"

# Encryption keys
echo "🔑 Migrating encryption keys..."
# Generate a strong encryption key
ENCRYPTION_KEY=$(openssl rand -base64 32)
create_secret "app/encryption" \
  key="$ENCRYPTION_KEY" \
  algorithm="AES-256-GCM"

# API Keys placeholder (these should be set manually with real values)
echo "🔧 Creating API key placeholders..."
create_secret "api-keys/claude" \
  api_key="REPLACE_WITH_REAL_CLAUDE_API_KEY"

create_secret "api-keys/github" \
  app_id="REPLACE_WITH_REAL_GITHUB_APP_ID" \
  private_key="REPLACE_WITH_REAL_GITHUB_PRIVATE_KEY" \
  webhook_secret="REPLACE_WITH_REAL_GITHUB_WEBHOOK_SECRET" \
  client_id="REPLACE_WITH_REAL_GITHUB_CLIENT_ID" \
  client_secret="REPLACE_WITH_REAL_GITHUB_CLIENT_SECRET" \
  token="REPLACE_WITH_REAL_GITHUB_TOKEN"

create_secret "api-keys/slack" \
  client_id="REPLACE_WITH_REAL_SLACK_CLIENT_ID" \
  client_secret="REPLACE_WITH_REAL_SLACK_CLIENT_SECRET" \
  signing_secret="REPLACE_WITH_REAL_SLACK_SIGNING_SECRET" \
  bot_token="REPLACE_WITH_REAL_SLACK_BOT_TOKEN" \
  app_token="REPLACE_WITH_REAL_SLACK_APP_TOKEN" \
  team_id="REPLACE_WITH_REAL_SLACK_TEAM_ID"

create_secret "api-keys/monitoring" \
  datadog_api_key="REPLACE_WITH_REAL_DATADOG_API_KEY" \
  new_relic_license="REPLACE_WITH_REAL_NEW_RELIC_LICENSE" \
  sonar_host_url="REPLACE_WITH_REAL_SONAR_HOST_URL" \
  sonar_token="REPLACE_WITH_REAL_SONAR_TOKEN" \
  snyk_token="REPLACE_WITH_REAL_SNYK_TOKEN"

create_secret "api-keys/atlassian" \
  jira_api_token="REPLACE_WITH_REAL_JIRA_API_TOKEN" \
  jira_pat="REPLACE_WITH_REAL_JIRA_PAT" \
  confluence_api_token="REPLACE_WITH_REAL_CONFLUENCE_API_TOKEN"

create_secret "api-keys/jenkins" \
  api_token="REPLACE_WITH_REAL_JENKINS_API_TOKEN"

create_secret "api-keys/gitlab" \
  access_token="REPLACE_WITH_REAL_GITLAB_ACCESS_TOKEN"

create_secret "api-keys/ai-providers" \
  gemini_api_key="REPLACE_WITH_REAL_GEMINI_API_KEY" \
  qwen_api_key="REPLACE_WITH_REAL_QWEN_API_KEY"

# Application configuration secrets
echo "⚙️  Migrating application configuration..."
create_secret "app/config" \
  node_env="development" \
  log_level="info" \
  max_agents_per_org="100" \
  default_load_balancing="round_robin" \
  auto_scaling_enabled="true" \
  prometheus_enabled="true"

echo "✅ Secrets migration completed!"
echo ""
echo "⚠️  IMPORTANT: Replace placeholder values with real secrets:"
echo "1. Update API keys in Vault with real values"
echo "2. Configure applications to use Vault for secret retrieval"
echo "3. Remove hardcoded secrets from configuration files"
echo ""
echo "📋 To view migrated secrets:"
echo "vault kv list secret/"
echo "vault kv get secret/database/postgres"