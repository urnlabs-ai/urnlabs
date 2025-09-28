# Application policy for accessing secrets
path "secret/data/app/*" {
  capabilities = ["read"]
}

path "secret/metadata/app/*" {
  capabilities = ["list", "read"]
}

# Database credentials path
path "secret/data/database/*" {
  capabilities = ["read"]
}

# JWT secrets path
path "secret/data/jwt/*" {
  capabilities = ["read"]
}

# API keys path
path "secret/data/api-keys/*" {
  capabilities = ["read"]
}

# Integration secrets path
path "secret/data/integrations/*" {
  capabilities = ["read"]
}

# Allow token self-renewal
path "auth/token/renew-self" {
  capabilities = ["update"]
}

# Allow token lookup
path "auth/token/lookup-self" {
  capabilities = ["read"]
}