#!/bin/bash

# Vault initialization and configuration script
set -euo pipefail

VAULT_ADDR="${VAULT_ADDR:-http://localhost:8200}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VAULT_INIT_FILE="$SCRIPT_DIR/vault-init.json"

echo "🔐 Starting Vault initialization..."

# Wait for Vault to be ready
echo "⏳ Waiting for Vault to be ready..."
until curl -s "$VAULT_ADDR/v1/sys/health" > /dev/null 2>&1; do
  echo "Waiting for Vault to start..."
  sleep 2
done

# Check if Vault is already initialized
if vault status &>/dev/null && vault status | grep -q "Initialized.*true"; then
  echo "✅ Vault is already initialized"

  # Check if we have the init file
  if [[ ! -f "$VAULT_INIT_FILE" ]]; then
    echo "⚠️  Vault init file not found. Cannot auto-unseal."
    echo "Please manually unseal Vault or provide the unseal keys."
    exit 1
  fi

  # Check if Vault is sealed
  if vault status | grep -q "Sealed.*true"; then
    echo "🔓 Unsealing Vault..."
    UNSEAL_KEY_1=$(jq -r '.unseal_keys_b64[0]' "$VAULT_INIT_FILE")
    UNSEAL_KEY_2=$(jq -r '.unseal_keys_b64[1]' "$VAULT_INIT_FILE")
    UNSEAL_KEY_3=$(jq -r '.unseal_keys_b64[2]' "$VAULT_INIT_FILE")

    vault operator unseal "$UNSEAL_KEY_1"
    vault operator unseal "$UNSEAL_KEY_2"
    vault operator unseal "$UNSEAL_KEY_3"
    echo "✅ Vault unsealed successfully"
  else
    echo "✅ Vault is already unsealed"
  fi

  exit 0
fi

# Initialize Vault
echo "🚀 Initializing Vault..."
vault operator init -key-shares=5 -key-threshold=3 -format=json > "$VAULT_INIT_FILE"

if [[ ! -f "$VAULT_INIT_FILE" ]]; then
  echo "❌ Failed to create Vault init file"
  exit 1
fi

echo "✅ Vault initialized successfully"
echo "🔑 Unseal keys and root token saved to: $VAULT_INIT_FILE"
echo "⚠️  IMPORTANT: Store these keys securely and delete this file in production!"

# Extract unseal keys and root token
UNSEAL_KEY_1=$(jq -r '.unseal_keys_b64[0]' "$VAULT_INIT_FILE")
UNSEAL_KEY_2=$(jq -r '.unseal_keys_b64[1]' "$VAULT_INIT_FILE")
UNSEAL_KEY_3=$(jq -r '.unseal_keys_b64[2]' "$VAULT_INIT_FILE")
ROOT_TOKEN=$(jq -r '.root_token' "$VAULT_INIT_FILE")

# Unseal Vault
echo "🔓 Unsealing Vault..."
vault operator unseal "$UNSEAL_KEY_1"
vault operator unseal "$UNSEAL_KEY_2"
vault operator unseal "$UNSEAL_KEY_3"

# Login with root token
echo "🔐 Logging in with root token..."
vault auth "$ROOT_TOKEN"

# Enable KV v2 secrets engine
echo "🗂️  Enabling KV v2 secrets engine..."
vault secrets enable -path=secret kv-v2

# Create policies
echo "📋 Creating policies..."
vault policy write app-policy "$SCRIPT_DIR/../policies/app-policy.hcl"
vault policy write admin-policy "$SCRIPT_DIR/../policies/admin-policy.hcl"

# Enable AppRole auth method
echo "🔑 Enabling AppRole auth method..."
vault auth enable approle

# Create AppRole for applications
echo "👤 Creating AppRole for applications..."
vault write auth/approle/role/urnlabs-app \
    token_policies="app-policy" \
    token_ttl=1h \
    token_max_ttl=4h \
    bind_secret_id=true

# Get AppRole credentials
ROLE_ID=$(vault read -field=role_id auth/approle/role/urnlabs-app/role-id)
SECRET_ID=$(vault write -field=secret_id -f auth/approle/role/urnlabs-app/secret-id)

echo "✅ AppRole created successfully"
echo "🆔 Role ID: $ROLE_ID"
echo "🔒 Secret ID: $SECRET_ID"

# Save AppRole credentials
cat > "$SCRIPT_DIR/approle-credentials.json" << EOF
{
  "role_id": "$ROLE_ID",
  "secret_id": "$SECRET_ID"
}
EOF

echo "💾 AppRole credentials saved to: $SCRIPT_DIR/approle-credentials.json"

# Enable audit logging
echo "📝 Enabling audit logging..."
vault audit enable file file_path=/vault/logs/vault-audit.log

echo "🎉 Vault setup completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Store the root token and unseal keys securely"
echo "2. Delete $VAULT_INIT_FILE in production"
echo "3. Configure your applications to use the AppRole credentials"
echo "4. Migrate your secrets to Vault"