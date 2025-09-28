# EKS Cluster
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 19.15"

  cluster_name    = var.cluster_name != "" ? var.cluster_name : "${local.name_prefix}-eks"
  cluster_version = var.cluster_version

  vpc_id                         = module.vpc.vpc_id
  subnet_ids                     = module.vpc.private_subnets
  cluster_endpoint_public_access = true
  cluster_endpoint_private_access = true

  cluster_addons = {
    coredns = {
      most_recent = true
    }
    kube-proxy = {
      most_recent = true
    }
    vpc-cni = {
      most_recent = true
    }
    aws-ebs-csi-driver = {
      most_recent = true
    }
  }

  # EKS Managed Node Groups
  eks_managed_node_groups = {
    for name, config in var.node_groups : name => {
      name = "${local.name_prefix}-${name}"

      instance_types = config.instance_types
      capacity_type  = config.capacity_type

      min_size     = config.min_size
      max_size     = config.max_size
      desired_size = config.desired_size

      disk_size = config.disk_size
      disk_type = "gp3"

      labels = merge(config.labels, {
        Environment = var.environment
        NodeGroup   = name
      })

      dynamic "taints" {
        for_each = config.taints
        content {
          key    = taints.value.key
          value  = taints.value.value
          effect = taints.value.effect
        }
      }

      # Launch template configuration
      create_launch_template = true
      launch_template_name   = "${local.name_prefix}-${name}"
      
      update_config = {
        max_unavailable_percentage = 25
      }

      # Security groups
      vpc_security_group_ids = [aws_security_group.additional_eks.id]

      tags = merge(local.common_tags, {
        NodeGroup = name
      })
    }
  }

  # Cluster security group additional rules
  cluster_security_group_additional_rules = {
    ingress_nodes_ephemeral_ports_tcp = {
      description                = "Nodes on ephemeral ports"
      protocol                   = "tcp"
      from_port                  = 1025
      to_port                    = 65535
      type                       = "ingress"
      source_node_security_group = true
    }
  }

  # Node security group additional rules
  node_security_group_additional_rules = {
    ingress_self_all = {
      description = "Node to node all ports/protocols"
      protocol    = "-1"
      from_port   = 0
      to_port     = 0
      type        = "ingress"
      self        = true
    }
    
    ingress_cluster_to_node_all_traffic = {
      description                   = "Cluster API to nodes all traffic"
      protocol                      = "-1"
      from_port                     = 0
      to_port                       = 0
      type                          = "ingress"
      source_cluster_security_group = true
    }
  }

  # IRSA (IAM Roles for Service Accounts)
  enable_irsa = var.enable_irsa

  tags = local.common_tags
}

# IAM role for cluster autoscaler
resource "aws_iam_role" "cluster_autoscaler" {
  count = var.enable_cluster_autoscaler ? 1 : 0
  
  name = "${local.name_prefix}-cluster-autoscaler"

  assume_role_policy = jsonencode({
    Statement = [{
      Action = "sts:AssumeRoleWithWebIdentity"
      Effect = "Allow"
      Condition = {
        StringEquals = {
          "${replace(module.eks.cluster_oidc_issuer_url, "https://", "")}:sub": "system:serviceaccount:kube-system:cluster-autoscaler"
          "${replace(module.eks.cluster_oidc_issuer_url, "https://", "")}:aud": "sts.amazonaws.com"
        }
      }
      Principal = {
        Federated = module.eks.oidc_provider_arn
      }
    }]
    Version = "2012-10-17"
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "cluster_autoscaler" {
  count = var.enable_cluster_autoscaler ? 1 : 0
  
  policy_arn = aws_iam_policy.cluster_autoscaler[0].arn
  role       = aws_iam_role.cluster_autoscaler[0].name
}

resource "aws_iam_policy" "cluster_autoscaler" {
  count = var.enable_cluster_autoscaler ? 1 : 0
  
  name        = "${local.name_prefix}-cluster-autoscaler"
  description = "EKS cluster-autoscaler policy for cluster ${module.eks.cluster_name}"

  policy = jsonencode({
    Statement = [
      {
        Action = [
          "autoscaling:DescribeAutoScalingGroups",
          "autoscaling:DescribeAutoScalingInstances",
          "autoscaling:DescribeLaunchConfigurations",
          "autoscaling:DescribeScalingActivities",
          "autoscaling:DescribeTags",
          "ec2:DescribeInstanceTypes",
          "ec2:DescribeLaunchTemplateVersions"
        ]
        Effect   = "Allow"
        Resource = "*"
      },
      {
        Action = [
          "autoscaling:SetDesiredCapacity",
          "autoscaling:TerminateInstanceInAutoScalingGroup",
          "ec2:DescribeImages",
          "ec2:GetInstanceTypesFromInstanceRequirements",
          "eks:DescribeNodegroup"
        ]
        Effect   = "Allow"
        Resource = "*"
      }
    ]
    Version = "2012-10-17"
  })

  tags = local.common_tags
}

# IAM role for AWS Load Balancer Controller
resource "aws_iam_role" "load_balancer_controller" {
  count = var.enable_load_balancer_controller ? 1 : 0
  
  name = "${local.name_prefix}-aws-load-balancer-controller"

  assume_role_policy = jsonencode({
    Statement = [{
      Action = "sts:AssumeRoleWithWebIdentity"
      Effect = "Allow"
      Condition = {
        StringEquals = {
          "${replace(module.eks.cluster_oidc_issuer_url, "https://", "")}:sub": "system:serviceaccount:kube-system:aws-load-balancer-controller"
          "${replace(module.eks.cluster_oidc_issuer_url, "https://", "")}:aud": "sts.amazonaws.com"
        }
      }
      Principal = {
        Federated = module.eks.oidc_provider_arn
      }
    }]
    Version = "2012-10-17"
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "load_balancer_controller" {
  count = var.enable_load_balancer_controller ? 1 : 0
  
  policy_arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/AWSLoadBalancerControllerIAMPolicy"
  role       = aws_iam_role.load_balancer_controller[0].name
}

# Storage Classes
resource "kubernetes_storage_class" "gp3" {
  depends_on = [module.eks]
  
  metadata {
    name = "gp3"
    annotations = {
      "storageclass.kubernetes.io/is-default-class" = "true"
    }
  }
  
  storage_provisioner    = "ebs.csi.aws.com"
  reclaim_policy        = "Delete"
  volume_binding_mode   = "WaitForFirstConsumer"
  allow_volume_expansion = true
  
  parameters = {
    type      = "gp3"
    encrypted = "true"
  }
}

resource "kubernetes_storage_class" "fast_ssd" {
  depends_on = [module.eks]
  
  metadata {
    name = "fast-ssd"
  }
  
  storage_provisioner    = "ebs.csi.aws.com"
  reclaim_policy        = "Delete"
  volume_binding_mode   = "WaitForFirstConsumer"
  allow_volume_expansion = true
  
  parameters = {
    type      = "gp3"
    iops      = "3000"
    throughput = "125"
    encrypted = "true"
  }
}