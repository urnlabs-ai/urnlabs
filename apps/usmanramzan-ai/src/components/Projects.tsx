import * as React from "react"

interface Project {
  id: string;
  title: string;
  description: string;
  longDescription: string;
  technologies: string[];
  category: string;
  status: 'completed' | 'in-progress' | 'planning';
  impact: string;
  metrics: {
    label: string;
    value: string;
  }[];
  links?: {
    github?: string;
    demo?: string;
    docs?: string;
  };
  highlights: string[];
}

const projects: Project[] = [
  {
    id: 'urnlabs-ai',
    title: 'URNLabs.ai Platform',
    description: 'Comprehensive AI agent platform with governance-first architecture',
    longDescription: 'Building a production-ready AI agent platform that delivers deterministic workflows with built-in governance, security, and measurable ROI. The platform leverages Kubernetes orchestration and cloud-native technologies.',
    technologies: ['Node.js', 'Kubernetes', 'TypeScript', 'PostgreSQL', 'React', 'FastAPI', 'Docker'],
    category: 'AI Platform',
    status: 'in-progress',
    impact: 'Transforming how enterprises deploy and manage AI agents',
    metrics: [
      { label: 'Expected Cost Savings', value: '$500K+' },
      { label: 'Automation Rate', value: '90%' },
      { label: 'Performance Boost', value: '50%' }
    ],
    links: {
      github: 'https://github.com/urnlabs-ai',
      docs: 'https://docs.urnlabs.ai'
    },
    highlights: [
      'Governance-first architecture with built-in compliance',
      'Deterministic workflows for predictable outcomes',
      'Real-time monitoring and analytics dashboard',
      'Multi-cloud deployment with auto-scaling'
    ]
  },
  {
    id: 'unifonic-migration',
    title: 'Multi-Cloud Migration',
    description: 'Migrated 40+ applications and 20+ databases across cloud providers',
    longDescription: 'Led the critical infrastructure transformation at Unifonic, migrating applications from AWS EKS to OCI OKE and database servers while maintaining zero downtime and improving performance.',
    technologies: ['Kubernetes', 'AWS', 'OCI', 'Terraform', 'Ansible', 'Prometheus', 'Grafana'],
    category: 'Infrastructure',
    status: 'completed',
    impact: 'Achieved 30% cost reduction and improved performance',
    metrics: [
      { label: 'Applications Migrated', value: '40+' },
      { label: 'Database Servers', value: '20+' },
      { label: 'Cost Reduction', value: '30%' }
    ],
    highlights: [
      'Zero-downtime migration strategy execution',
      'Custom Terraform modules for infrastructure stability',
      'Comprehensive monitoring and alerting setup',
      'Team training and knowledge transfer'
    ]
  },
  {
    id: 'kafka-implementation',
    title: 'Strimzi Kafka Platform',
    description: 'Implemented enterprise-grade Kafka platform serving all products',
    longDescription: 'Designed and implemented a centralized Kafka platform using Strimzi operator on Kubernetes, serving as the messaging backbone for all product teams with high availability and scalability.',
    technologies: ['Apache Kafka', 'Strimzi', 'Kubernetes', 'Zookeeper', 'Schema Registry'],
    category: 'Data Platform',
    status: 'completed',
    impact: 'Enables real-time data processing across all products',
    metrics: [
      { label: 'Messages/Day', value: '10M+' },
      { label: 'Uptime', value: '99.9%' },
      { label: 'Teams Onboarded', value: '15+' }
    ],
    highlights: [
      'High-availability multi-broker setup',
      'Automated topic management and configuration',
      'Schema evolution with backward compatibility',
      'Real-time monitoring and alerting'
    ]
  },
  {
    id: 'ccoe-framework',
    title: 'Cloud Center of Excellence',
    description: 'Founded and led CCOE at Emumba with cloud architecture best practices',
    longDescription: 'Established the Cloud Center of Excellence from the ground up, defining cloud strategy, best practices, and governance frameworks. Led a team of DevOps engineers focusing on AWS and Azure implementations.',
    technologies: ['AWS', 'Azure', 'CloudFormation', 'ARM Templates', 'Terraform', 'Ansible'],
    category: 'Cloud Governance',
    status: 'completed',
    impact: 'Standardized cloud practices across 50+ projects',
    metrics: [
      { label: 'Projects Standardized', value: '50+' },
      { label: 'Team Size', value: '12' },
      { label: 'Cost Optimization', value: '25%' }
    ],
    highlights: [
      'HIPAA/HITECH compliant architecture designs',
      'CI/CD pipeline standardization',
      'Cloud cost optimization strategies',
      'Security and compliance frameworks'
    ]
  }
];

export function Projects() {
  const [selectedProject, setSelectedProject] = React.useState<Project | null>(null);
  const [activeFilter, setActiveFilter] = React.useState<string>('all');

  const categories = ['all', ...Array.from(new Set(projects.map(p => p.category)))];
  const filteredProjects = activeFilter === 'all'
    ? projects
    : projects.filter(p => p.category === activeFilter);

  const getStatusColor = (status: Project['status']) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300';
      case 'in-progress': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300';
      case 'planning': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300';
    }
  };

  return (
    <div className="w-full">
      {/* Filter Tabs */}
      <div className="flex flex-wrap justify-center gap-2 mb-8">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setActiveFilter(category)}
            className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
              activeFilter === category
                ? 'bg-brand-600 text-white shadow-lg'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-brand-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
            }`}
          >
            {category === 'all' ? 'All Projects' : category}
          </button>
        ))}
      </div>

      {/* Projects Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {filteredProjects.map((project, index) => (
          <div
            key={project.id}
            className="project-card group relative bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-brand-300 dark:hover:border-brand-600 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer overflow-hidden"
            onClick={() => setSelectedProject(project)}
            style={{ animationDelay: `${index * 100}ms` }}
          >
            {/* Project Card Content */}
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                    {project.title}
                  </h3>
                  <span className={`inline-block px-2 py-1 rounded-md text-xs font-medium ${getStatusColor(project.status)}`}>
                    {project.status.replace('-', ' ').toUpperCase()}
                  </span>
                </div>
              </div>

              <p className="text-slate-600 dark:text-slate-300 mb-4 line-clamp-2">
                {project.description}
              </p>

              <div className="flex flex-wrap gap-1 mb-4">
                {project.technologies.slice(0, 3).map((tech) => (
                  <span
                    key={tech}
                    className="px-2 py-1 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 text-xs rounded-md"
                  >
                    {tech}
                  </span>
                ))}
                {project.technologies.length > 3 && (
                  <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs rounded-md">
                    +{project.technologies.length - 3}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  {project.category}
                </span>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <svg className="w-5 h-5 text-brand-600 dark:text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Hover Overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-brand-500/5 to-brand-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
          </div>
        ))}
      </div>

      {/* Project Detail Modal */}
      {selectedProject && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedProject(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                    {selectedProject.title}
                  </h2>
                  <span className={`inline-block px-3 py-1 rounded-md text-sm font-medium ${getStatusColor(selectedProject.status)}`}>
                    {selectedProject.status.replace('-', ' ').toUpperCase()}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedProject(null)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Overview</h3>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                      {selectedProject.longDescription}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Key Highlights</h3>
                    <ul className="space-y-2">
                      {selectedProject.highlights.map((highlight, index) => (
                        <li key={index} className="flex items-start">
                          <svg className="w-5 h-5 text-green-500 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          <span className="text-slate-600 dark:text-slate-300">{highlight}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Technologies</h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedProject.technologies.map((tech) => (
                        <span
                          key={tech}
                          className="px-3 py-1 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 text-sm rounded-md border border-brand-200 dark:border-brand-700"
                        >
                          {tech}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Impact</h3>
                    <p className="text-slate-600 dark:text-slate-300 text-sm bg-green-50 dark:bg-green-900/20 p-3 rounded-lg border border-green-200 dark:border-green-800">
                      {selectedProject.impact}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Key Metrics</h3>
                    <div className="space-y-3">
                      {selectedProject.metrics.map((metric, index) => (
                        <div key={index} className="flex justify-between items-center">
                          <span className="text-sm text-slate-600 dark:text-slate-300">{metric.label}</span>
                          <span className="font-semibold text-brand-600 dark:text-brand-400">{metric.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {selectedProject.links && (
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Links</h3>
                      <div className="space-y-2">
                        {selectedProject.links.github && (
                          <a
                            href={selectedProject.links.github}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                          >
                            <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                            </svg>
                            GitHub
                          </a>
                        )}
                        {selectedProject.links.demo && (
                          <a
                            href={selectedProject.links.demo}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                          >
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            Live Demo
                          </a>
                        )}
                        {selectedProject.links.docs && (
                          <a
                            href={selectedProject.links.docs}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                          >
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Documentation
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}