# Admin policy for full access to secrets management
path "*" {
  capabilities = ["create", "read", "update", "delete", "list", "sudo"]
}

# System backend
path "sys/*" {
  capabilities = ["create", "read", "update", "delete", "list", "sudo"]
}

# Auth methods
path "auth/*" {
  capabilities = ["create", "read", "update", "delete", "list", "sudo"]
}

# Secret engines
path "secret/*" {
  capabilities = ["create", "read", "update", "delete", "list", "sudo"]
}