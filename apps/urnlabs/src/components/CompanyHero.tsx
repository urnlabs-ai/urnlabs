import React from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { ArrowRight, CheckCircle, Shield, BarChart3, Users, Star, TrendingUp, Zap } from 'lucide-react';

const CompanyHero: React.FC = () => {
  return (
    <section className="relative overflow-hidden bg-slate-900 min-h-screen flex items-center">
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
      
      {/* Floating Gradient Elements */}
      <div className="absolute top-0 -left-4 w-72 h-72 bg-blue-500/20 rounded-full mix-blend-multiply filter blur-xl animate-blob" />
      <div className="absolute top-0 -right-4 w-72 h-72 bg-green-500/20 rounded-full mix-blend-multiply filter blur-xl animate-blob animation-delay-2000" />
      <div className="absolute -bottom-8 left-20 w-72 h-72 bg-purple-500/20 rounded-full mix-blend-multiply filter blur-xl animate-blob animation-delay-4000" />
      
      <div className="relative mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left Column - Main Content */}
          <div className="text-center lg:text-left">
            {/* Badge */}
            <div className="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium bg-blue-500/10 text-blue-400 ring-1 ring-inset ring-blue-500/20 mb-8">
              <Zap className="w-4 h-4 mr-2" />
              Production-Ready AI Platform
            </div>
            
            {/* Main Headline */}
            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl mb-8">
              Agents that
              <span className="bg-gradient-to-r from-blue-400 to-green-400 bg-clip-text text-transparent block lg:inline lg:ml-4">
                ship work
              </span>
            </h1>
            
            {/* Description */}
            <p className="text-xl leading-8 text-slate-300 max-w-2xl mx-auto lg:mx-0 mb-10">
              Build deterministic AI workflows with governance-first approach. 
              Transform your operations with measurable ROI and enterprise-grade security.
            </p>
            
            {/* Social Proof */}
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-6 mb-10">
              <div className="flex items-center gap-2">
                <div className="flex -space-x-1">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 text-yellow-400 fill-current" />
                  ))}
                </div>
                <span className="text-slate-300 text-sm">5.0 from 120+ reviews</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-green-400" />
                <span className="text-slate-300 text-sm">1000+ active users</span>
              </div>
            </div>
            
            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 mb-12">
              <Button size="lg" className="bg-blue-500 hover:bg-blue-600 text-white group">
                Book Discovery Sprint
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button variant="outline" size="lg" className="border-slate-600 text-slate-300 hover:bg-slate-800">
                Learn more
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
            
            {/* Trust Indicators */}
            <div className="text-center lg:text-left">
              <p className="text-xs text-slate-500 mb-4">Trusted by leading companies</p>
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-8 opacity-60">
                <div className="text-slate-400 font-semibold">TechCorp</div>
                <div className="text-slate-400 font-semibold">InnovateAI</div>
                <div className="text-slate-400 font-semibold">DataFlow</div>
                <div className="text-slate-400 font-semibold">CloudNext</div>
              </div>
            </div>
          </div>
          
          {/* Right Column - Feature Cards */}
          <div className="space-y-6">
            {/* Main Stats Card */}
            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-white text-xl">Platform Metrics</CardTitle>
                <CardDescription className="text-slate-400">
                  Real performance data from production deployments
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 bg-slate-700/50 rounded-lg">
                    <div className="text-2xl font-bold text-green-400">90%</div>
                    <div className="text-xs text-slate-400">Process Automation</div>
                  </div>
                  <div className="text-center p-3 bg-slate-700/50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-400">99.9%</div>
                    <div className="text-xs text-slate-400">Uptime SLA</div>
                  </div>
                  <div className="text-center p-3 bg-slate-700/50 rounded-lg">
                    <div className="text-2xl font-bold text-purple-400">&lt;200ms</div>
                    <div className="text-xs text-slate-400">Response Time</div>
                  </div>
                  <div className="text-center p-3 bg-slate-700/50 rounded-lg">
                    <div className="text-2xl font-bold text-yellow-400">$500K+</div>
                    <div className="text-xs text-slate-400">Annual Savings</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* Value Props */}
            <div className="grid gap-4">
              <Card className="bg-slate-800/30 border-slate-700/50 hover:bg-slate-800/50 transition-colors group">
                <CardHeader className="flex flex-row items-center space-y-0 pb-2">
                  <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                    <CheckCircle className="w-5 h-5 text-blue-400" />
                  </div>
                  <div className="ml-4">
                    <CardTitle className="text-white text-lg">Deterministic Workflows</CardTitle>
                    <CardDescription className="text-slate-400">
                      Predictable, repeatable automation with audit trails
                    </CardDescription>
                  </div>
                </CardHeader>
              </Card>
              
              <Card className="bg-slate-800/30 border-slate-700/50 hover:bg-slate-800/50 transition-colors group">
                <CardHeader className="flex flex-row items-center space-y-0 pb-2">
                  <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Shield className="w-5 h-5 text-green-400" />
                  </div>
                  <div className="ml-4">
                    <CardTitle className="text-white text-lg">Governance First</CardTitle>
                    <CardDescription className="text-slate-400">
                      Built-in security, compliance, and access controls
                    </CardDescription>
                  </div>
                </CardHeader>
              </Card>
              
              <Card className="bg-slate-800/30 border-slate-700/50 hover:bg-slate-800/50 transition-colors group">
                <CardHeader className="flex flex-row items-center space-y-0 pb-2">
                  <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                    <BarChart3 className="w-5 h-5 text-purple-400" />
                  </div>
                  <div className="ml-4">
                    <CardTitle className="text-white text-lg">Measured ROI</CardTitle>
                    <CardDescription className="text-slate-400">
                      Track every task and measure business outcomes
                    </CardDescription>
                  </div>
                </CardHeader>
              </Card>
            </div>
            
            {/* Growth Indicator */}
            <div className="bg-gradient-to-r from-blue-500/10 to-green-500/10 rounded-lg p-4 border border-blue-500/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-semibold">Platform Growth</p>
                  <p className="text-slate-400 text-sm">Monthly active deployments</p>
                </div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-green-400" />
                  <span className="text-green-400 font-semibold">+127%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Bottom Gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-slate-900 to-transparent" />
    </section>
  );
};

export default CompanyHero;