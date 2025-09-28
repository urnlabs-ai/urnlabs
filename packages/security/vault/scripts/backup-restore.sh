#!/bin/bash

# Vault backup and recovery script
set -euo pipefail

VAULT_ADDR="${VAULT_ADDR:-http://localhost:8200}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$SCRIPT_DIR/../backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Function to check if Vault is available and authenticated
check_vault() {
  if ! command -v vault &> /dev/null; then
    echo "❌ Vault CLI not found. Please install HashiCorp Vault CLI."
    exit 1
  fi

  if ! vault status &>/dev/null; then
    echo "❌ Cannot connect to Vault at $VAULT_ADDR"
    exit 1
  fi

  if ! vault token lookup &>/dev/null; then
    echo "❌ Not authenticated with Vault. Please set VAULT_TOKEN or login."
    exit 1
  fi
}

# Function to backup Vault secrets
backup_secrets() {
  local backup_file="$BACKUP_DIR/vault-secrets-backup-$TIMESTAMP.json"

  echo "🔐 Starting Vault secrets backup..."
  echo "📁 Backup location: $backup_file"

  # Create backup structure
  local backup_data="{\"timestamp\":\"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\",\"vault_addr\":\"$VAULT_ADDR\",\"secrets\":{}}"

  # Function to recursively backup secrets at a path
  backup_path() {
    local path="$1"
    local secrets_data="$2"

    echo "📂 Backing up path: $path"

    # Try to list secrets at this path
    if vault kv list -format=json "$path" &>/dev/null; then
      local keys
      keys=$(vault kv list -format=json "$path" 2>/dev/null || echo "[]")

      for key in $(echo "$keys" | jq -r '.[]? // empty'); do
        if [[ "$key" == */ ]]; then
          # It's a directory, recurse
          backup_path "$path$key" "$secrets_data"
        else
          # It's a secret, backup its data
          local secret_path="$path$key"
          local secret_data

          if secret_data=$(vault kv get -format=json "$secret_path" 2>/dev/null); then
            echo "🔑 Backing up secret: $secret_path"
            secrets_data=$(echo "$secrets_data" | jq --arg path "$secret_path" --argjson data "$secret_data" '.secrets[$path] = $data')
          else
            echo "⚠️  Failed to backup secret: $secret_path"
          fi
        fi
      done
    fi

    echo "$secrets_data"
  }

  # Backup all secrets starting from the root of secret engine
  backup_data=$(backup_path "secret/" "$backup_data")

  # Save backup to file
  echo "$backup_data" | jq '.' > "$backup_file"

  # Compress backup
  gzip "$backup_file"
  backup_file="${backup_file}.gz"

  echo "✅ Backup completed successfully"
  echo "📄 Backup saved to: $backup_file"
  echo "📊 Backup size: $(du -h "$backup_file" | cut -f1)"

  # Backup metadata and policies
  backup_metadata "$TIMESTAMP"
}

# Function to backup Vault metadata and policies
backup_metadata() {
  local timestamp="$1"
  local metadata_file="$BACKUP_DIR/vault-metadata-backup-$timestamp.json"

  echo "📋 Backing up Vault metadata and policies..."

  local metadata="{\"timestamp\":\"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\",\"vault_addr\":\"$VAULT_ADDR\"}"

  # Backup policies
  echo "📜 Backing up policies..."
  local policies
  if policies=$(vault policy list -format=json 2>/dev/null); then
    local policies_data="{}"
    for policy in $(echo "$policies" | jq -r '.[]'); do
      local policy_content
      if policy_content=$(vault policy read "$policy" 2>/dev/null); then
        policies_data=$(echo "$policies_data" | jq --arg name "$policy" --arg content "$policy_content" '.[$name] = $content')
      fi
    done
    metadata=$(echo "$metadata" | jq --argjson policies "$policies_data" '.policies = $policies')
  fi

  # Backup auth methods
  echo "🔐 Backing up auth methods..."
  local auth_methods
  if auth_methods=$(vault auth list -format=json 2>/dev/null); then
    metadata=$(echo "$metadata" | jq --argjson auth "$auth_methods" '.auth_methods = $auth')
  fi

  # Backup secret engines
  echo "🗄️  Backing up secret engines..."
  local secret_engines
  if secret_engines=$(vault secrets list -format=json 2>/dev/null); then
    metadata=$(echo "$metadata" | jq --argjson engines "$secret_engines" '.secret_engines = $engines')
  fi

  # Save metadata
  echo "$metadata" | jq '.' > "$metadata_file"
  gzip "$metadata_file"

  echo "✅ Metadata backup completed: ${metadata_file}.gz"
}

# Function to restore Vault secrets
restore_secrets() {
  local backup_file="$1"

  if [[ ! -f "$backup_file" ]]; then
    echo "❌ Backup file not found: $backup_file"
    exit 1
  fi

  echo "🔄 Starting Vault secrets restore..."
  echo "📁 Restore from: $backup_file"

  # Decompress if needed
  if [[ "$backup_file" == *.gz ]]; then
    local temp_file
    temp_file=$(mktemp)
    gunzip -c "$backup_file" > "$temp_file"
    backup_file="$temp_file"
  fi

  # Read backup data
  local backup_data
  backup_data=$(cat "$backup_file")

  # Verify backup format
  if ! echo "$backup_data" | jq -e '.secrets' &>/dev/null; then
    echo "❌ Invalid backup format"
    exit 1
  fi

  # Restore each secret
  local restored=0
  local failed=0

  for secret_path in $(echo "$backup_data" | jq -r '.secrets | keys[]'); do
    echo "🔑 Restoring secret: $secret_path"

    local secret_data
    secret_data=$(echo "$backup_data" | jq -r --arg path "$secret_path" '.secrets[$path].data.data')

    if vault kv put "$secret_path" - <<< "$secret_data" &>/dev/null; then
      ((restored++))
    else
      echo "⚠️  Failed to restore secret: $secret_path"
      ((failed++))
    fi
  done

  echo "✅ Restore completed"
  echo "📊 Restored: $restored secrets"
  if [[ $failed -gt 0 ]]; then
    echo "⚠️  Failed: $failed secrets"
  fi

  # Cleanup temporary file
  if [[ "$backup_file" == /tmp/* ]]; then
    rm -f "$backup_file"
  fi
}

# Function to list available backups
list_backups() {
  echo "📁 Available backups in $BACKUP_DIR:"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if [[ -d "$BACKUP_DIR" ]]; then
    for file in "$BACKUP_DIR"/vault-secrets-backup-*.json.gz; do
      if [[ -f "$file" ]]; then
        local timestamp
        timestamp=$(basename "$file" | sed 's/vault-secrets-backup-\(.*\)\.json\.gz/\1/')
        local size
        size=$(du -h "$file" | cut -f1)
        local date
        date=$(date -d "${timestamp:0:8} ${timestamp:9:2}:${timestamp:11:2}:${timestamp:13:2}" 2>/dev/null || echo "Unknown")

        echo "📄 $file"
        echo "   Date: $date"
        echo "   Size: $size"
        echo ""
      fi
    done
  else
    echo "No backup directory found"
  fi
}

# Function to cleanup old backups
cleanup_backups() {
  local days="${1:-30}"

  echo "🧹 Cleaning up backups older than $days days..."

  if [[ -d "$BACKUP_DIR" ]]; then
    local deleted=0

    # Find and delete old backups
    while IFS= read -r -d '' file; do
      rm -f "$file"
      echo "🗑️  Deleted: $(basename "$file")"
      ((deleted++))
    done < <(find "$BACKUP_DIR" -name "vault-*-backup-*.gz" -mtime +$days -print0 2>/dev/null)

    echo "✅ Cleaned up $deleted old backup files"
  else
    echo "No backup directory found"
  fi
}

# Function to verify backup integrity
verify_backup() {
  local backup_file="$1"

  if [[ ! -f "$backup_file" ]]; then
    echo "❌ Backup file not found: $backup_file"
    exit 1
  fi

  echo "🔍 Verifying backup integrity..."

  # Check if file can be decompressed and parsed
  if [[ "$backup_file" == *.gz ]]; then
    if ! gunzip -t "$backup_file" &>/dev/null; then
      echo "❌ Backup file is corrupted (cannot decompress)"
      return 1
    fi

    local content
    content=$(gunzip -c "$backup_file")
  else
    local content
    content=$(cat "$backup_file")
  fi

  # Verify JSON structure
  if ! echo "$content" | jq -e '.timestamp and .vault_addr and .secrets' &>/dev/null; then
    echo "❌ Backup file has invalid structure"
    return 1
  fi

  local secret_count
  secret_count=$(echo "$content" | jq '.secrets | length')
  local backup_date
  backup_date=$(echo "$content" | jq -r '.timestamp')

  echo "✅ Backup verification passed"
  echo "📊 Secrets count: $secret_count"
  echo "📅 Backup date: $backup_date"

  return 0
}

# Main command handling
case "${1:-}" in
  "backup")
    check_vault
    backup_secrets
    ;;
  "restore")
    if [[ -z "${2:-}" ]]; then
      echo "Usage: $0 restore <backup-file>"
      exit 1
    fi
    check_vault
    restore_secrets "$2"
    ;;
  "list")
    list_backups
    ;;
  "cleanup")
    cleanup_backups "${2:-30}"
    ;;
  "verify")
    if [[ -z "${2:-}" ]]; then
      echo "Usage: $0 verify <backup-file>"
      exit 1
    fi
    verify_backup "$2"
    ;;
  *)
    echo "Vault Backup and Recovery Tool"
    echo "=============================="
    echo ""
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  backup                Create a new backup of all Vault secrets"
    echo "  restore <file>        Restore secrets from a backup file"
    echo "  list                  List available backup files"
    echo "  cleanup [days]        Remove backups older than N days (default: 30)"
    echo "  verify <file>         Verify backup file integrity"
    echo ""
    echo "Environment Variables:"
    echo "  VAULT_ADDR            Vault server address (default: http://localhost:8200)"
    echo "  VAULT_TOKEN           Vault authentication token"
    echo "  BACKUP_DIR            Backup directory (default: ./backups)"
    echo ""
    echo "Examples:"
    echo "  $0 backup"
    echo "  $0 restore vault-secrets-backup-20231201_120000.json.gz"
    echo "  $0 cleanup 7"
    echo "  $0 verify vault-secrets-backup-20231201_120000.json.gz"
    exit 1
    ;;
esac