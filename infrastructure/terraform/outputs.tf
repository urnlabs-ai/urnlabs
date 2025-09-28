output "region" {
  description = "AWS region"
  value       = var.aws_region
}

output "cluster_name" {
  description = "Kubernetes Cluster Name"
  value       = module.eks.cluster_name
}

output "cluster_endpoint" {
  description = "Endpoint for EKS control plane"
  value       = module.eks.cluster_endpoint
}

output "cluster_security_group_id" {
  description = "Security group ids attached to the cluster control plane"
  value       = module.eks.cluster_security_group_id
}

output "cluster_iam_role_name" {
  description = "IAM role name associated with EKS cluster"
  value       = module.eks.cluster_iam_role_name
}

output "cluster_certificate_authority_data" {
  description = "Base64 encoded certificate data required to communicate with the cluster"
  value       = module.eks.cluster_certificate_authority_data
}

output "cluster_primary_security_group_id" {
  description = "Cluster security group that was created by Amazon EKS for the cluster"
  value       = module.eks.cluster_primary_security_group_id
}

output "node_groups" {
  description = "EKS node groups"
  value       = module.eks.eks_managed_node_groups
}

output "cluster_oidc_issuer_url" {
  description = "The URL on the EKS cluster for the OpenID Connect identity provider"
  value       = module.eks.cluster_oidc_issuer_url
}

output "cluster_version" {
  description = "The Kubernetes version for the EKS cluster"
  value       = module.eks.cluster_version
}

output "cluster_platform_version" {
  description = "Platform version for the EKS cluster"
  value       = module.eks.cluster_platform_version
}

output "cluster_status" {
  description = "Status of the EKS cluster. One of `CREATING`, `ACTIVE`, `DELETING`, `FAILED`"
  value       = module.eks.cluster_status
}

# VPC Outputs
output "vpc_id" {
  description = "ID of the VPC where the cluster is deployed"
  value       = module.vpc.vpc_id
}

output "vpc_cidr_block" {
  description = "The CIDR block of the VPC"
  value       = module.vpc.vpc_cidr_block
}

output "private_subnets" {
  description = "List of IDs of private subnets"
  value       = module.vpc.private_subnets
}

output "public_subnets" {
  description = "List of IDs of public subnets"
  value       = module.vpc.public_subnets
}

output "intra_subnets" {
  description = "List of IDs of intra subnets"
  value       = module.vpc.intra_subnets
}

# RDS Outputs
output "rds_endpoint" {
  description = "RDS instance endpoint"
  value       = aws_db_instance.main.endpoint
  sensitive   = true
}

output "rds_port" {
  description = "RDS instance port"
  value       = aws_db_instance.main.port
}

output "rds_database_name" {
  description = "RDS database name"
  value       = aws_db_instance.main.db_name
}

output "rds_username" {
  description = "RDS database username"
  value       = aws_db_instance.main.username
  sensitive   = true
}

output "rds_password_secret_arn" {
  description = "ARN of the secret containing RDS password"
  value       = aws_secretsmanager_secret.rds_password.arn
}

output "rds_read_replica_endpoint" {
  description = "RDS read replica endpoint"
  value       = var.environment == "production" ? aws_db_instance.read_replica[0].endpoint : null
  sensitive   = true
}

# ElastiCache Outputs
output "elasticache_primary_endpoint" {
  description = "Address of the endpoint for the primary node in the replication group"
  value       = aws_elasticache_replication_group.main.configuration_endpoint_address
  sensitive   = true
}

output "elasticache_reader_endpoint" {
  description = "Address of the endpoint for the reader node in the replication group"
  value       = aws_elasticache_replication_group.main.reader_endpoint_address
  sensitive   = true
}

output "elasticache_port" {
  description = "ElastiCache port"
  value       = aws_elasticache_replication_group.main.port
}

output "elasticache_auth_token_secret_arn" {
  description = "ARN of the secret containing ElastiCache auth token"
  value       = aws_secretsmanager_secret.redis_auth_token.arn
}

# Security Groups
output "additional_security_group_id" {
  description = "ID of the additional security group"
  value       = aws_security_group.additional_eks.id
}

output "rds_security_group_id" {
  description = "ID of the RDS security group"
  value       = aws_security_group.rds.id
}

output "elasticache_security_group_id" {
  description = "ID of the ElastiCache security group"
  value       = aws_security_group.elasticache.id
}

# IAM Role ARNs
output "cluster_autoscaler_role_arn" {
  description = "ARN of the cluster autoscaler IAM role"
  value       = var.enable_cluster_autoscaler ? aws_iam_role.cluster_autoscaler[0].arn : null
}

output "load_balancer_controller_role_arn" {
  description = "ARN of the AWS Load Balancer Controller IAM role"
  value       = var.enable_load_balancer_controller ? aws_iam_role.load_balancer_controller[0].arn : null
}

# Command to configure kubectl
output "configure_kubectl" {
  description = "Configure kubectl: make sure you're logged in with the correct AWS profile and run the following command to update your kubeconfig"
  value       = "aws eks --region ${var.aws_region} update-kubeconfig --name ${module.eks.cluster_name}"
}

# Connection strings for applications
output "database_url" {
  description = "Database URL for applications"
  value       = "postgresql://${aws_db_instance.main.username}:${random_password.rds_password.result}@${aws_db_instance.main.endpoint}/${aws_db_instance.main.db_name}"
  sensitive   = true
}

output "redis_url" {
  description = "Redis URL for applications"
  value       = "redis://:${random_password.redis_auth_token.result}@${aws_elasticache_replication_group.main.configuration_endpoint_address}:${aws_elasticache_replication_group.main.port}"
  sensitive   = true
}

# Monitoring and Alerting
output "sns_topic_arn" {
  description = "SNS topic ARN for alerts"
  value       = var.environment == "production" ? aws_sns_topic.alerts[0].arn : null
}

# Kubernetes configuration helper
output "kubernetes_config_map_aws_auth" {
  description = "A kubernetes configuration to authenticate to this EKS cluster"
  value = yamlencode({
    apiVersion = "v1"
    kind       = "ConfigMap"
    metadata = {
      name      = "aws-auth"
      namespace = "kube-system"
    }
    data = {
      mapRoles = yamlencode([
        {
          rolearn  = module.eks.eks_managed_node_groups["general"].iam_role_arn
          username = "system:node:{{EC2PrivateDNSName}}"
          groups   = ["system:bootstrappers", "system:nodes"]
        }
      ])
    }
  })
}