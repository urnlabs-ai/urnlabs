import React from 'react';
import { Card, CardContent, Badge } from '@urnlabs/ui';
import { Star, Quote } from 'lucide-react';
const Testimonials = () => {
    const testimonials = [
        {
            quote: "Urnlabs transformed our customer onboarding process. What used to take 2 weeks now happens automatically in 2 hours. The governance features give us confidence that everything is compliant and auditable.",
            author: "Sarah Chen",
            title: "Head of Operations",
            company: "TechFlow Inc",
            avatar: "https://images.unsplash.com/photo-1494790108755-2616b612b05b?w=100&h=100&fit=crop&crop=face&auto=format&q=80",
            rating: 5,
            metrics: {
                label: "Time Saved",
                value: "92%"
            }
        },
        {
            quote: "The ROI tracking is incredible. We can see exactly how much money our AI agents are saving us. In 6 months, we've automated 90% of our data processing workflows with measurable $500K+ annual savings.",
            author: "Marcus Rodriguez",
            title: "CTO",
            company: "DataCore Systems",
            avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face&auto=format&q=80",
            rating: 5,
            metrics: {
                label: "Annual Savings",
                value: "$500K+"
            }
        },
        {
            quote: "Security and compliance were our biggest concerns. Urnlabs solved both with built-in governance that actually works. Our audit team loves the complete audit trails and access controls.",
            author: "Jennifer Park",
            title: "Chief Security Officer",
            company: "FinanceSecure",
            avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop&crop=face&auto=format&q=80",
            rating: 5,
            metrics: {
                label: "Compliance Score",
                value: "100%"
            }
        },
        {
            quote: "The multi-agent coordination is game-changing. We have 15 AI agents working together seamlessly on complex tasks. The visual workflow builder makes it easy for non-technical team members to contribute.",
            author: "David Kim",
            title: "VP of Engineering",
            company: "InnovateAI",
            avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face&auto=format&q=80",
            rating: 5,
            metrics: {
                label: "Active Agents",
                value: "15"
            }
        },
        {
            quote: "99.9% uptime and sub-200ms response times in production. Our customers don't even know there are AI agents handling their requests - it's that seamless and reliable.",
            author: "Lisa Wang",
            title: "Product Manager",
            company: "CloudNext",
            avatar: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=100&h=100&fit=crop&crop=face&auto=format&q=80",
            rating: 5,
            metrics: {
                label: "Uptime",
                value: "99.9%"
            }
        },
        {
            quote: "From prototype to production in 2 weeks. The pre-built templates and integrations saved us months of development time. Our AI automation is now a competitive advantage.",
            author: "Alex Thompson",
            title: "Founder & CEO",
            company: "StartupFlow",
            avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=face&auto=format&q=80",
            rating: 5,
            metrics: {
                label: "Setup Time",
                value: "2 weeks"
            }
        }
    ];
    const renderStars = (rating) => {
        return Array.from({ length: 5 }, (_, i) => (<Star key={i} className={`w-4 h-4 ${i < rating ? 'text-yellow-400 fill-current' : 'text-slate-600'}`}/>));
    };
    return (<section className="py-24 bg-slate-900">
      <div className="container mx-auto px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <Badge variant="secondary" className="mb-4 bg-green-500/10 text-green-400 border-green-500/20">
            Customer Success
          </Badge>
          <h2 className="text-4xl font-bold text-white mb-6">
            Trusted by{' '}
            <span className="bg-gradient-to-r from-blue-400 to-green-400 bg-clip-text text-transparent">
              1000+ teams
            </span>
          </h2>
          <p className="text-xl text-slate-300 max-w-3xl mx-auto">
            See how companies across industries are using Urnlabs to automate their workflows
            and achieve measurable business outcomes.
          </p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16">
          <div className="text-center">
            <div className="text-3xl font-bold text-white mb-2">1000+</div>
            <div className="text-slate-400 text-sm">Active Users</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-white mb-2">10M+</div>
            <div className="text-slate-400 text-sm">Tasks Automated</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-white mb-2">99.9%</div>
            <div className="text-slate-400 text-sm">Uptime SLA</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-white mb-2">$50M+</div>
            <div className="text-slate-400 text-sm">Cost Savings</div>
          </div>
        </div>

        {/* Testimonials Grid */}
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {testimonials.map((testimonial, index) => (<Card key={index} className="bg-slate-800/50 border-slate-700/50 hover:bg-slate-800/70 transition-all duration-300 hover:scale-105">
              <CardContent className="p-6">
                {/* Quote Icon */}
                <Quote className="w-8 h-8 text-blue-400/50 mb-4"/>

                {/* Rating */}
                <div className="flex items-center mb-4">
                  {renderStars(testimonial.rating)}
                </div>

                {/* Quote */}
                <blockquote className="text-slate-300 mb-6 leading-relaxed">
                  "{testimonial.quote}"
                </blockquote>

                {/* Metric Badge */}
                {testimonial.metrics && (<div className="mb-6">
                    <div className="inline-flex items-center px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20">
                      <span className="text-green-400 font-semibold text-sm mr-2">
                        {testimonial.metrics.value}
                      </span>
                      <span className="text-green-300 text-xs">
                        {testimonial.metrics.label}
                      </span>
                    </div>
                  </div>)}

                {/* Author */}
                <div className="flex items-center">
                  <img src={testimonial.avatar} alt={testimonial.author} className="w-12 h-12 rounded-full object-cover mr-4"/>
                  <div>
                    <div className="text-white font-medium">{testimonial.author}</div>
                    <div className="text-slate-400 text-sm">
                      {testimonial.title} at {testimonial.company}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>))}
        </div>

        {/* Bottom CTA */}
        <div className="mt-16 text-center">
          <div className="bg-gradient-to-r from-blue-500/10 to-green-500/10 rounded-2xl p-8 border border-blue-500/20 max-w-3xl mx-auto">
            <h3 className="text-2xl font-bold text-white mb-4">
              Ready to join these successful teams?
            </h3>
            <p className="text-slate-300 mb-6">
              Start your free trial today and see how Urnlabs can transform your operations
              with measurable results.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a href="/contact" className="inline-flex items-center justify-center rounded-md bg-blue-500 px-6 py-3 text-sm font-medium text-white hover:bg-blue-600 transition-colors">
                Start Free Trial
              </a>
              <a href="/case-studies" className="inline-flex items-center text-blue-400 hover:text-blue-300 font-medium transition-colors">
                Read More Case Studies →
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>);
};
export default Testimonials;
//# sourceMappingURL=Testimonials.js.map