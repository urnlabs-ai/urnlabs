ui = true
disable_mlock = true

storage "raft" {
  path = "/vault/data"
  node_id = "node1"
}

listener "tcp" {
  address = "0.0.0.0:8200"
  cluster_address = "0.0.0.0:8201"
  tls_disable = "true"
  # In production, use TLS certificates
  # tls_cert_file = "/vault/tls/tls.crt"
  # tls_key_file = "/vault/tls/tls.key"
}

cluster_addr = "http://127.0.0.1:8201"
api_addr = "http://127.0.0.1:8200"

# Enable telemetry for monitoring
telemetry {
  prometheus_retention_time = "30s"
  disable_hostname = true
}

# High availability configuration
cluster_name = "urnlabs-vault"

# Logging
log_level = "info"
log_format = "json"

# Seal configuration (using auto-unseal in production)
# seal "awskms" {
#   region = "us-west-2"
#   kms_key_id = "alias/vault-unseal-key"
# }