import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Badge } from '@urnlabs/ui';
import {
  Workflow,
  Shield,
  BarChart3,
  GitBranch,
  Clock,
  Users,
  Lock,
  Zap,
  Database,
  Settings,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';

interface Feature {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  badge?: string;
  benefits: string[];
}

const Features: React.FC = () => {
  const features: Feature[] = [
    {
      icon: Workflow,
      title: "Visual Workflow Builder",
      description: "Drag-and-drop interface for creating complex AI agent workflows with conditional logic and parallel processing.",
      badge: "New",
      benefits: [
        "No-code workflow creation",
        "Real-time validation",
        "Template library",
        "Version control integration"
      ]
    },
    {
      icon: Shield,
      title: "Enterprise Governance",
      description: "Built-in security, compliance, and access controls that meet enterprise requirements out of the box.",
      benefits: [
        "SOC 2 Type II certified",
        "GDPR & HIPAA compliant",
        "Role-based access control",
        "Audit trail logging"
      ]
    },
    {
      icon: BarChart3,
      title: "ROI Analytics",
      description: "Comprehensive dashboards tracking task completion, cost savings, and business impact metrics.",
      benefits: [
        "Real-time performance monitoring",
        "Cost optimization insights",
        "Success rate tracking",
        "Custom KPI reporting"
      ]
    },
    {
      icon: GitBranch,
      title: "Multi-Agent Coordination",
      description: "Orchestrate multiple AI agents working together on complex tasks with intelligent load balancing.",
      badge: "Pro",
      benefits: [
        "Intelligent task distribution",
        "Agent communication protocols",
        "Failure recovery mechanisms",
        "Resource optimization"
      ]
    },
    {
      icon: Clock,
      title: "Deterministic Scheduling",
      description: "Reliable task scheduling with guaranteed execution times and automatic retry mechanisms.",
      benefits: [
        "Sub-200ms response times",
        "99.9% uptime guarantee",
        "Automatic scaling",
        "Intelligent retry logic"
      ]
    },
    {
      icon: Database,
      title: "Enterprise Integrations",
      description: "Connect to any system with pre-built connectors and custom API integration capabilities.",
      benefits: [
        "200+ pre-built connectors",
        "Custom API integrations",
        "Real-time data sync",
        "Webhook support"
      ]
    }
  ];

  return (
    <section className="py-24 bg-slate-900">
      <div className="container mx-auto px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <Badge variant="secondary" className="mb-4 bg-blue-500/10 text-blue-400 border-blue-500/20">
            Platform Features
          </Badge>
          <h2 className="text-4xl font-bold text-white mb-6">
            Everything you need for{' '}
            <span className="bg-gradient-to-r from-blue-400 to-green-400 bg-clip-text text-transparent">
              production-ready automation
            </span>
          </h2>
          <p className="text-xl text-slate-300 max-w-3xl mx-auto">
            Our platform combines enterprise-grade security with developer-friendly tools to deliver
            AI automation that actually works in production environments.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <Card
              key={index}
              className="bg-slate-800/50 border-slate-700/50 hover:bg-slate-800/70 transition-all duration-300 hover:scale-105 group"
            >
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500/20 to-green-500/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                    <feature.icon className="w-6 h-6 text-blue-400" />
                  </div>
                  {feature.badge && (
                    <Badge variant="outline" className="text-xs border-green-500/30 text-green-400">
                      {feature.badge}
                    </Badge>
                  )}
                </div>
                <CardTitle className="text-white text-xl group-hover:text-blue-400 transition-colors">
                  {feature.title}
                </CardTitle>
                <CardDescription className="text-slate-300 leading-relaxed">
                  {feature.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {feature.benefits.map((benefit, benefitIndex) => (
                    <li key={benefitIndex} className="flex items-center text-sm text-slate-400">
                      <CheckCircle2 className="w-4 h-4 text-green-400 mr-2 flex-shrink-0" />
                      {benefit}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="mt-16 text-center">
          <div className="bg-gradient-to-r from-blue-500/10 to-green-500/10 rounded-2xl p-8 border border-blue-500/20">
            <div className="flex items-center justify-center mb-4">
              <Zap className="w-6 h-6 text-yellow-400 mr-2" />
              <span className="text-white font-semibold">Ready to get started?</span>
            </div>
            <p className="text-slate-300 mb-6 max-w-2xl mx-auto">
              Join 1000+ teams already using Urnlabs to automate their workflows and boost productivity by 90%.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="/contact"
                className="inline-flex items-center justify-center rounded-md bg-blue-500 px-6 py-3 text-sm font-medium text-white hover:bg-blue-600 transition-colors"
              >
                Start Free Trial
              </a>
              <a
                href="/demo"
                className="inline-flex items-center justify-center rounded-md border border-slate-600 px-6 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors"
              >
                Watch Demo
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Features;