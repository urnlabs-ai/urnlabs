import React from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Brain, Code, Zap, Mail, Github, Linkedin, ArrowRight, Star, Users, Trophy } from 'lucide-react';

const PersonalHero: React.FC = () => {
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      const header = document.querySelector('header');
      const headerHeight = header ? header.offsetHeight : 0;
      const targetPosition = element.offsetTop - headerHeight;
      
      window.scrollTo({
        top: targetPosition,
        behavior: 'smooth'
      });
    }
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-30" style={{
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23e2e8f0' fill-opacity='0.3'%3E%3Ccircle cx='7' cy='7' r='1'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")"
      }} />
      
      {/* Floating Elements */}
      <div className="absolute top-20 left-10 w-20 h-20 bg-blue-500/10 rounded-full blur-xl animate-pulse" />
      <div className="absolute top-40 right-20 w-32 h-32 bg-indigo-500/10 rounded-full blur-xl animate-bounce" style={{ animationDuration: '3s' }} />
      <div className="absolute bottom-40 left-20 w-16 h-16 bg-purple-500/10 rounded-full blur-xl animate-pulse" />
      
      <div className="relative z-10 container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Column - Main Content */}
            <div className="text-center lg:text-left">
              {/* Avatar with Status */}
              <div className="flex items-center justify-center lg:justify-start mb-8">
                <div className="relative">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 p-1 shadow-2xl">
                    <div className="w-full h-full rounded-full bg-white dark:bg-slate-800 flex items-center justify-center">
                      <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">UR</span>
                    </div>
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full border-4 border-white dark:border-slate-900 flex items-center justify-center">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  </div>
                </div>
                <div className="ml-4 lg:block hidden">
                  <div className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span>Available for projects</span>
                  </div>
                </div>
              </div>
              
              {/* Main Headline */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6">
                <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  Muhammad Usman Ramzan
                </span>
              </h1>
              
              {/* Subtitle with Pills */}
              <div className="mb-8">
                <div className="text-xl sm:text-2xl text-slate-600 dark:text-slate-300 mb-4">
                  <span className="font-semibold text-slate-800 dark:text-white">CTO & CEO</span> 
                  <span className="text-blue-600 dark:text-blue-400"> | </span> 
                  <span className="font-semibold text-slate-800 dark:text-white">Infrastructure Engineering Leader</span>
                </div>
                <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2">
                  <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm font-medium">Kubernetes (CKAD)</span>
                  <span className="px-3 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full text-sm font-medium">Cloud Migration</span>
                  <span className="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-sm font-medium">DevOps</span>
                  <span className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-sm font-medium">Multi-cloud</span>
                </div>
              </div>
              
              {/* Description */}
              <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto lg:mx-0 mb-8 leading-relaxed">
                <span className="font-semibold text-blue-600 dark:text-blue-400">Co-founder & CTO at ePrecisio</span> and 
                <span className="font-semibold text-green-600 dark:text-green-400"> CEO at URNLabs.ai</span>. 
                Leading infrastructure transformations with 5+ years experience in Kubernetes orchestration, 
                cloud migration (AWS/OCI), and scaling systems for millions of messages.
              </p>
              
              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start space-y-4 sm:space-y-0 sm:space-x-4 mb-8">
                <Button 
                  asChild
                  size="lg" 
                  className="group"
                  onClick={() => scrollToSection('projects')}
                >
                  <a href="#projects">
                    View My Work
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </a>
                </Button>
                <Button 
                  asChild
                  variant="outline" 
                  size="lg"
                  onClick={() => scrollToSection('contact')}
                >
                  <a href="#contact">
                    <Mail className="w-4 h-4 mr-2" />
                    Get In Touch
                  </a>
                </Button>
              </div>
              
              {/* Social Links */}
              <div className="flex items-center justify-center lg:justify-start space-x-4">
                <Button 
                  asChild
                  variant="ghost" 
                  size="icon" 
                  className="hover:bg-blue-50 dark:hover:bg-blue-900/20"
                >
                  <a 
                    href="https://github.com/muhammadusmanramzan" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    onClick={() => window.open('https://github.com/muhammadusmanramzan', '_blank', 'noopener,noreferrer')}
                  >
                    <Github className="w-5 h-5" />
                  </a>
                </Button>
                <Button 
                  asChild
                  variant="ghost" 
                  size="icon" 
                  className="hover:bg-blue-50 dark:hover:bg-blue-900/20"
                >
                  <a 
                    href="https://linkedin.com/in/muhammadusmanramzan" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    onClick={() => window.open('https://linkedin.com/in/muhammadusmanramzan', '_blank', 'noopener,noreferrer')}
                  >
                    <Linkedin className="w-5 h-5" />
                  </a>
                </Button>
                <Button 
                  asChild
                  variant="ghost" 
                  size="icon" 
                  className="hover:bg-blue-50 dark:hover:bg-blue-900/20"
                  onClick={() => scrollToSection('contact')}
                >
                  <a href="#contact">
                    <Mail className="w-5 h-5" />
                  </a>
                </Button>
              </div>
            </div>
            
            {/* Right Column - Feature Cards */}
            <div className="space-y-6">
              <Card className="group hover:shadow-xl transition-all duration-200 hover:-translate-y-1 border-0 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
                <CardHeader className="flex flex-row items-center space-y-0 pb-2">
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Brain className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="ml-4">
                    <CardTitle className="text-lg">Kubernetes Orchestration</CardTitle>
                    <CardDescription>CKAD Certified</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Expert in managing 300+ node Kubernetes clusters with Rancher, EKS, and OKE across multi-cloud environments.
                  </p>
                </CardContent>
              </Card>
              
              <Card className="group hover:shadow-xl transition-all duration-200 hover:-translate-y-1 border-0 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
                <CardHeader className="flex flex-row items-center space-y-0 pb-2">
                  <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Code className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="ml-4">
                    <CardTitle className="text-lg">Cloud Migration</CardTitle>
                    <CardDescription>AWS to OCI Expertise</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Led migration of 40+ applications and 20+ database servers from AWS to Oracle Cloud Infrastructure (OCI).
                  </p>
                </CardContent>
              </Card>
              
              <Card className="group hover:shadow-xl transition-all duration-200 hover:-translate-y-1 border-0 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
                <CardHeader className="flex flex-row items-center space-y-0 pb-2">
                  <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Zap className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="ml-4">
                    <CardTitle className="text-lg">Infrastructure Automation</CardTitle>
                    <CardDescription>DevOps & IaC</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Built automation to prevent recurring issues and custom Terraform modules for enhanced infrastructure stability.
                  </p>
                </CardContent>
              </Card>
              
              {/* Stats Row */}
              <div className="grid grid-cols-3 gap-4 pt-6">
                <div className="text-center">
                  <div className="flex items-center justify-center w-10 h-10 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg mb-2 mx-auto">
                    <Star className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                  </div>
                  <div className="text-2xl font-bold text-slate-800 dark:text-white">5+</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">Years Experience</div>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg mb-2 mx-auto">
                    <Trophy className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="text-2xl font-bold text-slate-800 dark:text-white">300+</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">K8s Nodes Managed</div>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg mb-2 mx-auto">
                    <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="text-2xl font-bold text-slate-800 dark:text-white">40+</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">Apps Migrated</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Scroll Indicator */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce">
        <div className="w-6 h-10 border-2 border-slate-400 dark:border-slate-500 rounded-full flex justify-center">
          <div className="w-1 h-3 bg-slate-400 dark:bg-slate-500 rounded-full mt-2 animate-pulse" />
        </div>
      </div>
    </section>
  );
};

export default PersonalHero;