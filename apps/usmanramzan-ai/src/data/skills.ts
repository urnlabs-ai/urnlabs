export interface Skill {
  id: string;
  name: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  levelPercentage: number;
  icon: string;
  description?: string;
  yearsOfExperience?: number;
  projects?: string[];
}

export interface SkillCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  skills: Skill[];
}

export const skillCategories: SkillCategory[] = [
  {
    id: 'infrastructure-cloud',
    name: 'Infrastructure & Cloud',
    description: 'Enterprise infrastructure, cloud platforms, and container orchestration',
    icon: 'cloud',
    skills: [
      {
        id: 'kubernetes',
        name: 'Kubernetes',
        level: 'expert',
        levelPercentage: 95,
        icon: 'settings',
        description: 'CKAD certified - Expert in managing 300+ node clusters across Rancher, EKS, OKE',
        yearsOfExperience: 4,
        projects: ['Unifonic Infrastructure', 'Multi-cloud Kubernetes']
      },
      {
        id: 'aws',
        name: 'Amazon Web Services',
        level: 'expert',
        levelPercentage: 92,
        icon: 'cloud',
        description: 'Advanced AWS services, EKS, EC2, RDS, Lambda, and cost optimization',
        yearsOfExperience: 5,
        projects: ['AWS to OCI Migration', 'Multi-cloud Architecture']
      },
      {
        id: 'oracle-cloud',
        name: 'Oracle Cloud (OCI)',
        level: 'expert',
        levelPercentage: 90,
        icon: 'database',
        description: 'OKE, database migration, and hybrid cloud implementations',
        yearsOfExperience: 3,
        projects: ['40+ App Migration to OCI', 'Database Server Migration']
      },
      {
        id: 'cloud-migration',
        name: 'Cloud Migration',
        level: 'expert',
        levelPercentage: 95,
        icon: 'arrow-right',
        description: 'Led migration of 40+ applications and 20+ database servers',
        yearsOfExperience: 4,
        projects: ['AWS to OCI Migration', 'Multi-cloud Strategy']
      },
      {
        id: 'helm-charts',
        name: 'Helm Charts',
        level: 'expert',
        levelPercentage: 88,
        icon: 'package',
        description: 'Custom Helm charts for cloud-agnostic deployments',
        yearsOfExperience: 3,
        projects: ['WhatsApp Business Deployment']
      }
    ]
  },
  {
    id: 'devops-automation',
    name: 'DevOps & Automation',
    description: 'CI/CD, infrastructure automation, and deployment strategies',
    icon: 'git-branch',
    skills: [
      {
        id: 'terraform',
        name: 'Terraform',
        level: 'expert',
        levelPercentage: 90,
        icon: 'layers',
        description: 'Custom modules for enhanced infrastructure stability and maintainability',
        yearsOfExperience: 4,
        projects: ['Infrastructure as Code', 'Multi-cloud Deployments']
      },
      {
        id: 'docker',
        name: 'Docker',
        level: 'expert',
        levelPercentage: 92,
        icon: 'box',
        description: 'Containerization, multi-stage builds, and orchestration',
        yearsOfExperience: 5,
        projects: ['Containerized Applications', 'CI/CD Pipelines']
      },
      {
        id: 'ci-cd',
        name: 'CI/CD Pipelines',
        level: 'expert',
        levelPercentage: 88,
        icon: 'workflow',
        description: 'Automated build, test, and deployment workflows',
        yearsOfExperience: 5,
        projects: ['GitHub Actions', 'ArgoCD', 'VMware vSphere VDI']
      },
      {
        id: 'monitoring',
        name: 'Monitoring & Observability',
        level: 'advanced',
        levelPercentage: 85,
        icon: 'activity',
        description: 'Prometheus, Grafana, and application monitoring',
        yearsOfExperience: 4,
        projects: ['Production Monitoring', 'Infrastructure Observability']
      },
      {
        id: 'bash-scripting',
        name: 'Bash & Python Scripting',
        level: 'expert',
        levelPercentage: 90,
        icon: 'terminal',
        description: 'Automation scripts for deployment and infrastructure management',
        yearsOfExperience: 5,
        projects: ['Deployment Automation', 'Infrastructure Scripts']
      }
    ]
  },
  {
    id: 'database-messaging',
    name: 'Database & Messaging',
    description: 'Database administration, migration, and messaging systems',
    icon: 'database',
    skills: [
      {
        id: 'database-migration',
        name: 'Database Migration',
        level: 'expert',
        levelPercentage: 95,
        icon: 'arrow-right',
        description: 'Led migration of 20+ database servers (16 CPU/64GB RAM each)',
        yearsOfExperience: 4,
        projects: ['AWS to Oracle Migration', 'Multi-cloud Database Strategy']
      },
      {
        id: 'mysql-postgresql',
        name: 'MySQL & PostgreSQL',
        level: 'expert',
        levelPercentage: 88,
        icon: 'database',
        description: 'Advanced database design, optimization, and administration',
        yearsOfExperience: 5,
        projects: ['Production Database Management']
      },
      {
        id: 'redis-memcache',
        name: 'Redis & Memcache',
        level: 'advanced',
        levelPercentage: 82,
        icon: 'zap',
        description: 'Caching solutions and session management for scalability',
        yearsOfExperience: 4,
        projects: ['Application Dependency Management']
      },
      {
        id: 'apache-kafka',
        name: 'Apache Kafka (Strimzi)',
        level: 'expert',
        levelPercentage: 90,
        icon: 'message-circle',
        description: 'Implemented Strimzi Kafka as shared service for all products',
        yearsOfExperience: 3,
        projects: ['Shared Messaging Service', 'Event-driven Architecture']
      },
      {
        id: 'rabbitmq',
        name: 'RabbitMQ',
        level: 'advanced',
        levelPercentage: 80,
        icon: 'message-square',
        description: 'Message queuing and asynchronous communication',
        yearsOfExperience: 3,
        projects: ['Application Messaging']
      }
    ]
  },
  {
    id: 'leadership-strategy',
    name: 'Leadership & Strategy',
    description: 'Executive leadership, team management, and strategic planning',
    icon: 'users',
    skills: [
      {
        id: 'team-leadership',
        name: 'Team Leadership',
        level: 'expert',
        levelPercentage: 92,
        icon: 'users',
        description: 'Led cross-functional teams and guided 10+ teams during migrations',
        yearsOfExperience: 4,
        projects: ['Cloud Centre of Excellence', 'Cross-team Collaboration']
      },
      {
        id: 'infrastructure-strategy',
        name: 'Infrastructure Strategy',
        level: 'expert',
        levelPercentage: 95,
        icon: 'trending-up',
        description: 'Strategic planning for enterprise infrastructure transformations',
        yearsOfExperience: 5,
        projects: ['Multi-cloud Strategy', 'Cost Optimization Initiatives']
      },
      {
        id: 'cost-optimization',
        name: 'Cost Optimization',
        level: 'expert',
        levelPercentage: 90,
        icon: 'dollar-sign',
        description: 'Contributed to significant cost-cutting initiatives for cloud infrastructure',
        yearsOfExperience: 4,
        projects: ['AWS/OCI Cost Reduction']
      },
      {
        id: 'project-management',
        name: 'Project Management',
        level: 'advanced',
        levelPercentage: 85,
        icon: 'clipboard',
        description: 'Managing complex migration projects and deliverable timelines',
        yearsOfExperience: 5,
        projects: ['Large-scale Migrations', 'Infrastructure Projects']
      },
      {
        id: 'mentoring',
        name: 'Mentoring & Training',
        level: 'advanced',
        levelPercentage: 82,
        icon: 'book-open',
        description: 'Guided teams on infrastructure best practices and automation',
        yearsOfExperience: 4,
        projects: ['Team Development', 'Knowledge Transfer']
      }
    ]
  },
  {
    id: 'ai-platform',
    name: 'AI Platform Development',
    description: 'AI agent platforms and automation workflows (URNLabs focus)',
    icon: 'brain',
    skills: [
      {
        id: 'ai-orchestration',
        name: 'AI Agent Orchestration',
        level: 'advanced',
        levelPercentage: 85,
        icon: 'bot',
        description: 'Building AI agent platforms and automation workflows for URNLabs',
        yearsOfExperience: 2,
        projects: ['URNLabs AI Platform']
      },
      {
        id: 'automation-workflows',
        name: 'Intelligent Automation',
        level: 'expert',
        levelPercentage: 88,
        icon: 'workflow',
        description: 'Process automation and workflow optimization',
        yearsOfExperience: 4,
        projects: ['Infrastructure Automation', 'URNLabs Workflows']
      }
    ]
  }
];

export const getAllSkills = (): Skill[] => {
  return skillCategories.flatMap(category => category.skills);
};

export const getSkillsByLevel = (level: Skill['level']): Skill[] => {
  return getAllSkills().filter(skill => skill.level === level);
};

export const getTopSkills = (limit: number = 10): Skill[] => {
  return getAllSkills()
    .sort((a, b) => b.levelPercentage - a.levelPercentage)
    .slice(0, limit);
};

export const getSkillsByCategory = (categoryId: string): Skill[] => {
  const category = skillCategories.find(cat => cat.id === categoryId);
  return category ? category.skills : [];
};