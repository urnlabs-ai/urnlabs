import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button, Badge } from '@urnlabs/ui';
import { Check, Zap, Shield, Rocket, Crown } from 'lucide-react';
const Pricing = () => {
    const pricingTiers = [
        {
            name: "Starter",
            icon: Zap,
            price: "Free",
            period: "forever",
            description: "Perfect for individuals and small teams getting started with AI automation.",
            features: [
                "5 active workflows",
                "1,000 task executions/month",
                "Basic analytics dashboard",
                "Community support",
                "Email notifications",
                "Basic workflow templates"
            ],
            limitations: [
                "No advanced integrations",
                "Standard response times",
                "Community support only"
            ],
            cta: "Start Free",
            ctaVariant: "outline"
        },
        {
            name: "Professional",
            icon: Rocket,
            price: "$99",
            period: "/month",
            description: "For growing teams that need more power and advanced features.",
            badge: "Most Popular",
            features: [
                "Unlimited workflows",
                "25,000 task executions/month",
                "Advanced analytics & reporting",
                "Priority email support",
                "Slack & webhook integrations",
                "Custom workflow templates",
                "A/B testing capabilities",
                "Basic governance controls"
            ],
            cta: "Start 14-day Trial",
            ctaVariant: "default",
            popular: true
        },
        {
            name: "Enterprise",
            icon: Crown,
            price: "Custom",
            period: "pricing",
            description: "For large organizations requiring enterprise-grade security and compliance.",
            badge: "Custom",
            features: [
                "Unlimited everything",
                "Dedicated infrastructure",
                "Advanced governance & compliance",
                "24/7 dedicated support",
                "Custom integrations",
                "Multi-region deployment",
                "Advanced security controls",
                "SLA guarantees",
                "Dedicated success manager",
                "Custom training & onboarding"
            ],
            cta: "Contact Sales",
            ctaVariant: "secondary"
        }
    ];
    return (<section className="py-24 bg-slate-950">
      <div className="container mx-auto px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <Badge variant="secondary" className="mb-4 bg-green-500/10 text-green-400 border-green-500/20">
            Pricing Plans
          </Badge>
          <h2 className="text-4xl font-bold text-white mb-6">
            Scale with{' '}
            <span className="bg-gradient-to-r from-blue-400 to-green-400 bg-clip-text text-transparent">
              confidence
            </span>
          </h2>
          <p className="text-xl text-slate-300 max-w-3xl mx-auto mb-8">
            Choose the plan that fits your needs. Start free and scale as you grow.
            All plans include our core platform features and security.
          </p>

          {/* Usage-based pricing note */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 max-w-2xl mx-auto">
            <p className="text-sm text-slate-300">
              <Shield className="w-4 h-4 inline mr-2 text-green-400"/>
              All plans include: 99.9% uptime SLA, SOC 2 compliance, and encrypted data processing
            </p>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid gap-8 lg:grid-cols-3">
          {pricingTiers.map((tier, index) => (<Card key={index} className={`relative bg-slate-800/50 border-slate-700/50 hover:bg-slate-800/70 transition-all duration-300 ${tier.popular ? 'ring-2 ring-blue-500/50 scale-105' : 'hover:scale-105'}`}>
              {tier.popular && (<div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <Badge className="bg-blue-500 text-white">
                    {tier.badge}
                  </Badge>
                </div>)}

              {tier.badge && !tier.popular && (<div className="absolute top-4 right-4">
                  <Badge variant="outline" className="border-green-500/30 text-green-400">
                    {tier.badge}
                  </Badge>
                </div>)}

              <CardHeader className="text-center pb-6">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500/20 to-green-500/20 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <tier.icon className="w-6 h-6 text-blue-400"/>
                </div>

                <CardTitle className="text-white text-2xl mb-2">
                  {tier.name}
                </CardTitle>

                <div className="mb-4">
                  <span className="text-4xl font-bold text-white">{tier.price}</span>
                  <span className="text-slate-400 ml-1">{tier.period}</span>
                </div>

                <CardDescription className="text-slate-300">
                  {tier.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-6">
                {/* Features */}
                <div>
                  <h4 className="text-white font-medium mb-3">What's included:</h4>
                  <ul className="space-y-2">
                    {tier.features.map((feature, featureIndex) => (<li key={featureIndex} className="flex items-start text-sm text-slate-300">
                        <Check className="w-4 h-4 text-green-400 mr-3 mt-0.5 flex-shrink-0"/>
                        {feature}
                      </li>))}
                  </ul>
                </div>

                {/* Limitations */}
                {tier.limitations && tier.limitations.length > 0 && (<div>
                    <h4 className="text-slate-400 font-medium mb-3 text-sm">Limitations:</h4>
                    <ul className="space-y-1">
                      {tier.limitations.map((limitation, limitationIndex) => (<li key={limitationIndex} className="text-xs text-slate-500">
                          • {limitation}
                        </li>))}
                    </ul>
                  </div>)}

                {/* CTA Button */}
                <Button variant={tier.ctaVariant} className={`w-full ${tier.popular
                ? 'bg-blue-500 hover:bg-blue-600 text-white'
                : tier.ctaVariant === 'outline'
                    ? 'border-slate-600 text-slate-300 hover:bg-slate-800'
                    : ''}`} size="lg">
                  {tier.cta}
                </Button>
              </CardContent>
            </Card>))}
        </div>

        {/* Bottom FAQ Section */}
        <div className="mt-16 text-center">
          <h3 className="text-2xl font-bold text-white mb-8">Frequently Asked Questions</h3>
          <div className="grid gap-6 md:grid-cols-2 max-w-4xl mx-auto text-left">
            <div className="bg-slate-800/30 rounded-lg p-6">
              <h4 className="text-white font-medium mb-2">How does billing work?</h4>
              <p className="text-sm text-slate-300">
                We bill monthly based on your task executions. Unused executions don't roll over,
                but you can upgrade or downgrade anytime.
              </p>
            </div>
            <div className="bg-slate-800/30 rounded-lg p-6">
              <h4 className="text-white font-medium mb-2">Can I change plans anytime?</h4>
              <p className="text-sm text-slate-300">
                Yes! You can upgrade, downgrade, or cancel your subscription at any time.
                Changes take effect at your next billing cycle.
              </p>
            </div>
            <div className="bg-slate-800/30 rounded-lg p-6">
              <h4 className="text-white font-medium mb-2">What happens if I exceed my limits?</h4>
              <p className="text-sm text-slate-300">
                We'll notify you when you're approaching your limits. You can upgrade your plan
                or purchase additional executions to avoid interruption.
              </p>
            </div>
            <div className="bg-slate-800/30 rounded-lg p-6">
              <h4 className="text-white font-medium mb-2">Do you offer discounts?</h4>
              <p className="text-sm text-slate-300">
                Yes! We offer annual billing discounts, startup credits, and volume pricing for
                enterprise customers. Contact sales for details.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>);
};
export default Pricing;
//# sourceMappingURL=Pricing.js.map