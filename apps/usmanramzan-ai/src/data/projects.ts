export interface Project {
  id: string;
  title: string;
  description: string;
  longDescription: string;
  technologies: string[];
  githubUrl?: string;
  liveUrl?: string;
  imageUrl?: string;
  featured: boolean;
  category: 'infrastructure' | 'migration' | 'platform' | 'automation';
  status: 'completed' | 'in-progress' | 'ongoing';
  startDate: string;
  endDate?: string;
  metrics?: {
    label: string;
    value: string;
  }[];
}

export const projects: Project[] = [
  {
    id: 'aws-oci-migration',
    title: 'AWS to OCI Migration',
    description: 'Led comprehensive migration of 40+ applications and 20+ database servers from AWS to Oracle Cloud Infrastructure.',
    longDescription: 'Spearheaded a critical cloud migration project at Unifonic, successfully transitioning enterprise-scale infrastructure from AWS to Oracle Cloud Infrastructure. Coordinated with 10+ teams across the organization to ensure zero-downtime migrations while optimizing for cost and performance.',
    technologies: ['AWS EKS', 'OCI OKE', 'Kubernetes', 'Terraform', 'Docker', 'Helm', 'MySQL', 'PostgreSQL', 'Oracle Database'],
    imageUrl: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&h=400&fit=crop',
    featured: true,
    category: 'migration',
    status: 'completed',
    startDate: '2023-01',
    endDate: '2024-06',
    metrics: [
      { label: 'Applications Migrated', value: '40+' },
      { label: 'Database Servers', value: '20+' },
      { label: 'Teams Coordinated', value: '10+' },
      { label: 'Downtime', value: 'Near Zero' }
    ]
  },
  {
    id: 'kubernetes-orchestration',
    title: 'Enterprise Kubernetes Management',
    description: 'Managed 300+ node Kubernetes infrastructure across multiple cloud providers with Rancher, EKS, and OKE.',
    longDescription: 'Architected and maintained large-scale Kubernetes infrastructure supporting millions of messages daily. Implemented best practices for container orchestration, resource optimization, and automated scaling across multi-cloud environments.',
    technologies: ['Kubernetes', 'Rancher', 'AWS EKS', 'OCI OKE', 'Docker', 'Helm Charts', 'Prometheus', 'Grafana', 'NGINX Ingress'],
    imageUrl: 'https://images.unsplash.com/photo-1667372393119-3d4c48d07fc9?w=800&h=400&fit=crop',
    featured: true,
    category: 'infrastructure',
    status: 'ongoing',
    startDate: '2022-01',
    metrics: [
      { label: 'Kubernetes Nodes', value: '300+' },
      { label: 'Cluster Uptime', value: '99.9%' },
      { label: 'Message Processing', value: 'Millions/day' },
      { label: 'Multi-cloud Support', value: '3 Providers' }
    ]
  },
  {
    id: 'infrastructure-automation',
    title: 'Infrastructure as Code Platform',
    description: 'Built comprehensive automation using custom Terraform modules to enhance infrastructure stability and deployment efficiency.',
    longDescription: 'Developed and implemented Infrastructure as Code practices using Terraform, creating reusable modules that improved deployment consistency and reduced manual configuration errors. Automated infrastructure provisioning across multi-cloud environments.',
    technologies: ['Terraform', 'AWS', 'OCI', 'Ansible', 'Python', 'Bash', 'GitHub Actions', 'Docker', 'Kubernetes'],
    imageUrl: 'https://images.unsplash.com/photo-1518432031352-d6fc5c10da5a?w=800&h=400&fit=crop',
    featured: true,
    category: 'automation',
    status: 'completed',
    startDate: '2022-06',
    endDate: '2024-03',
    metrics: [
      { label: 'Deployment Time', value: '70% Reduction' },
      { label: 'Manual Errors', value: '90% Reduction' },
      { label: 'Infrastructure Consistency', value: '99%' },
      { label: 'Cloud Providers', value: 'Multi-cloud' }
    ]
  },
  {
    id: 'messaging-architecture',
    title: 'Kafka Messaging Platform',
    description: 'Implemented Strimzi Kafka as a shared messaging service accessible to all products, enabling event-driven architecture.',
    longDescription: 'Designed and deployed enterprise-grade messaging infrastructure using Strimzi Kafka on Kubernetes. Created a centralized messaging platform that serves all product teams, enabling reliable event-driven communication and reducing system coupling.',
    technologies: ['Apache Kafka', 'Strimzi', 'Kubernetes', 'Zookeeper', 'Schema Registry', 'Kafka Connect', 'Monitoring', 'Helm'],
    imageUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&h=400&fit=crop',
    featured: false,
    category: 'platform',
    status: 'completed',
    startDate: '2023-03',
    endDate: '2023-09',
    metrics: [
      { label: 'Message Throughput', value: 'Millions/day' },
      { label: 'Service Availability', value: '99.95%' },
      { label: 'Product Teams Served', value: 'All' },
      { label: 'Event Processing Latency', value: '<100ms' }
    ]
  },
  {
    id: 'database-optimization',
    title: 'Database Infrastructure Optimization',
    description: 'Managed and optimized database infrastructure including Redis, Memcache, RabbitMQ, Cassandra, MySQL, and PostgreSQL.',
    longDescription: 'Architected and maintained diverse database ecosystem supporting high-traffic applications. Implemented caching strategies, optimized query performance, and ensured high availability across multiple database technologies.',
    technologies: ['MySQL', 'PostgreSQL', 'Redis', 'Memcache', 'Cassandra', 'RabbitMQ', 'Database Monitoring', 'Backup Systems'],
    imageUrl: 'https://images.unsplash.com/photo-1544383835-bda2bc66a55d?w=800&h=400&fit=crop',
    featured: false,
    category: 'infrastructure',
    status: 'ongoing',
    startDate: '2022-01',
    metrics: [
      { label: 'Database Uptime', value: '99.9%' },
      { label: 'Query Performance', value: '40% Improvement' },
      { label: 'Cache Hit Rate', value: '95%+' },
      { label: 'Data Consistency', value: '100%' }
    ]
  },
  {
    id: 'ci-cd-pipelines',
    title: 'Advanced CI/CD Pipeline Architecture',
    description: 'Developed comprehensive CI/CD workflows including VMware vSphere VDI image building, testing, and automated deployments.',
    longDescription: 'Built sophisticated continuous integration and deployment pipelines supporting diverse infrastructure needs. Implemented automated testing, security scanning, and deployment strategies across multiple environments and platforms.',
    technologies: ['GitHub Actions', 'ArgoCD', 'VMware vSphere', 'Docker', 'Kubernetes', 'Terraform', 'Security Scanning', 'Automated Testing'],
    imageUrl: 'https://images.unsplash.com/photo-1629904853893-c2c8981a1dc5?w=800&h=400&fit=crop',
    featured: false,
    category: 'automation',
    status: 'completed',
    startDate: '2021-06',
    endDate: '2023-12',
    metrics: [
      { label: 'Deployment Frequency', value: '10x Increase' },
      { label: 'Build Success Rate', value: '98%+' },
      { label: 'Time to Production', value: '80% Reduction' },
      { label: 'Security Compliance', value: '100%' }
    ]
  },
  {
    id: 'cloud-cost-optimization',
    title: 'Multi-Cloud Cost Optimization',
    description: 'Led cost optimization initiatives across AWS and OCI infrastructure, achieving significant operational savings.',
    longDescription: 'Implemented comprehensive cost optimization strategies across multi-cloud infrastructure. Analyzed usage patterns, rightsized resources, and implemented automated scaling policies to reduce operational costs while maintaining performance.',
    technologies: ['AWS Cost Explorer', 'OCI Cost Analysis', 'Kubernetes HPA', 'Resource Optimization', 'Automated Scaling', 'Monitoring'],
    imageUrl: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&h=400&fit=crop',
    featured: false,
    category: 'infrastructure',
    status: 'ongoing',
    startDate: '2022-01',
    metrics: [
      { label: 'Cost Reduction', value: '30%+' },
      { label: 'Resource Utilization', value: '85%+' },
      { label: 'Automated Scaling', value: 'Dynamic' },
      { label: 'Performance Impact', value: 'None' }
    ]
  },
  {
    id: 'urnlabs-platform',
    title: 'URNLabs AI Platform',
    description: 'Building next-generation AI agent platform as CEO & Founder, leveraging infrastructure expertise for scalable AI workflows.',
    longDescription: 'Founding and developing URNLabs.ai, an innovative AI agent platform that combines enterprise infrastructure expertise with cutting-edge AI capabilities. Building scalable, production-ready AI workflows for business automation.',
    technologies: ['AI Agents', 'Kubernetes', 'Multi-cloud', 'API Gateway', 'Event-driven Architecture', 'Microservices', 'Infrastructure as Code'],
    imageUrl: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&h=400&fit=crop',
    featured: true,
    category: 'platform',
    status: 'in-progress',
    startDate: '2024-01',
    metrics: [
      { label: 'Platform Architecture', value: 'Microservices' },
      { label: 'Scalability Target', value: 'Enterprise' },
      { label: 'AI Integration', value: 'Native' },
      { label: 'Infrastructure', value: 'Cloud Native' }
    ]
  }
];

export const featuredProjects = projects.filter(project => project.featured);
export const projectsByCategory = (category: Project['category']) => 
  projects.filter(project => project.category === category);