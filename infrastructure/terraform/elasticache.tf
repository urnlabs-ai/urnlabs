# ElastiCache Subnet Group
resource "aws_elasticache_subnet_group" "main" {
  name       = "${local.name_prefix}-cache-subnet"
  subnet_ids = module.vpc.intra_subnets

  tags = local.common_tags
}

# ElastiCache Parameter Group
resource "aws_elasticache_parameter_group" "main" {
  family = "redis7.x"
  name   = "${local.name_prefix}-redis7"

  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  parameter {
    name  = "timeout"
    value = "300"
  }

  parameter {
    name  = "tcp-keepalive"
    value = "300"
  }

  tags = local.common_tags
}

# Generate random auth token for Redis
resource "random_password" "redis_auth_token" {
  length  = 32
  special = false
}

# Store Redis auth token in AWS Secrets Manager
resource "aws_secretsmanager_secret" "redis_auth_token" {
  name                    = "${local.name_prefix}-redis-auth-token"
  description             = "Redis auth token for ${local.name_prefix}"
  recovery_window_in_days = var.environment == "production" ? 30 : 0

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "redis_auth_token" {
  secret_id = aws_secretsmanager_secret.redis_auth_token.id
  secret_string = jsonencode({
    auth_token = random_password.redis_auth_token.result
  })
}

# ElastiCache Replication Group
resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = "${local.name_prefix}-redis"
  description                = "Redis cluster for ${local.name_prefix}"

  # Configuration
  node_type                  = var.elasticache_node_type
  port                       = 6379
  parameter_group_name       = aws_elasticache_parameter_group.main.name

  # Cluster configuration
  num_cache_clusters         = var.elasticache_num_cache_nodes
  preferred_cache_cluster_azs = slice(local.azs, 0, var.elasticache_num_cache_nodes)

  # Network
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.elasticache.id]

  # Security
  auth_token                 = random_password.redis_auth_token.result
  transit_encryption_enabled = true
  at_rest_encryption_enabled = true

  # Backup
  snapshot_retention_limit   = var.environment == "production" ? 5 : 1
  snapshot_window           = "03:00-05:00"
  maintenance_window        = "sun:05:00-sun:07:00"

  # Automatic failover for production
  automatic_failover_enabled = var.environment == "production" && var.elasticache_num_cache_nodes > 1
  multi_az_enabled          = var.environment == "production" && var.elasticache_num_cache_nodes > 1

  # Notifications
  notification_topic_arn     = var.environment == "production" ? aws_sns_topic.alerts[0].arn : null

  # Logging
  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.elasticache_slow.name
    destination_type = "cloudwatch-logs"
    log_format       = "text"
    log_type         = "slow-log"
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-redis"
  })
}

# CloudWatch Log Group for ElastiCache
resource "aws_cloudwatch_log_group" "elasticache_slow" {
  name              = "/aws/elasticache/redis/${local.name_prefix}/slow-log"
  retention_in_days = var.environment == "production" ? 30 : 7

  tags = local.common_tags
}

# SNS Topic for alerts (Production only)
resource "aws_sns_topic" "alerts" {
  count = var.environment == "production" ? 1 : 0
  
  name = "${local.name_prefix}-alerts"

  tags = local.common_tags
}

# CloudWatch Alarms for ElastiCache
resource "aws_cloudwatch_metric_alarm" "redis_cpu" {
  alarm_name          = "${local.name_prefix}-redis-cpu-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors Redis CPU utilization"
  alarm_actions       = var.environment == "production" ? [aws_sns_topic.alerts[0].arn] : []

  dimensions = {
    CacheClusterId = "${local.name_prefix}-redis-001"
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "redis_memory" {
  alarm_name          = "${local.name_prefix}-redis-memory-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "90"
  alarm_description   = "This metric monitors Redis memory utilization"
  alarm_actions       = var.environment == "production" ? [aws_sns_topic.alerts[0].arn] : []

  dimensions = {
    CacheClusterId = "${local.name_prefix}-redis-001"
  }

  tags = local.common_tags
}