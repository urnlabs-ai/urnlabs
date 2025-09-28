import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button, Input } from '@urnlabs/ui';
import { Search, Book, MessageCircle, Video, ExternalLink, ChevronRight, HelpCircle, FileText, Users, Zap } from 'lucide-react';
export const HelpPage = () => {
    const [searchQuery, setSearchQuery] = React.useState('');
    const quickLinks = [
        {
            title: 'Getting Started',
            description: 'Learn the basics of using URN Labs AI Agent platform',
            icon: Book,
            href: '/docs/getting-started',
            category: 'Documentation',
        },
        {
            title: 'API Documentation',
            description: 'Complete API reference and integration guides',
            icon: FileText,
            href: '/docs/api',
            category: 'Documentation',
        },
        {
            title: 'Video Tutorials',
            description: 'Step-by-step video guides for common tasks',
            icon: Video,
            href: '/tutorials',
            category: 'Learning',
        },
        {
            title: 'Community Forum',
            description: 'Connect with other users and share experiences',
            icon: Users,
            href: '/community',
            category: 'Community',
        },
        {
            title: 'Contact Support',
            description: 'Get help from our technical support team',
            icon: MessageCircle,
            href: '/support',
            category: 'Support',
        },
        {
            title: 'Feature Requests',
            description: 'Suggest new features and improvements',
            icon: Zap,
            href: '/feedback',
            category: 'Feedback',
        },
    ];
    const faqItems = [
        {
            question: 'How do I create my first AI agent?',
            answer: 'To create your first AI agent, navigate to the Agents page and click "Create Agent". Follow the setup wizard to configure your agent\'s capabilities, data sources, and workflows. Our getting started guide provides detailed steps.',
            category: 'Getting Started',
        },
        {
            question: 'What data sources can I connect?',
            answer: 'URN Labs supports a wide variety of data sources including databases (PostgreSQL, MySQL, MongoDB), cloud storage (AWS S3, Google Cloud), APIs, CRM systems (Salesforce, HubSpot), and more. Check our integrations page for the complete list.',
            category: 'Integrations',
        },
        {
            question: 'How is my data protected?',
            answer: 'We implement enterprise-grade security including end-to-end encryption, SOC 2 compliance, role-based access controls, and audit logging. Your data is never used to train our models and remains completely private.',
            category: 'Security',
        },
        {
            question: 'Can I integrate with my existing tools?',
            answer: 'Yes! URN Labs provides REST APIs, webhooks, and pre-built integrations with popular tools like Slack, Microsoft Teams, Zapier, and more. Our API documentation includes code examples for common programming languages.',
            category: 'Integrations',
        },
        {
            question: 'What are workflows and how do they work?',
            answer: 'Workflows are automated sequences of tasks that your AI agents can execute. You can design workflows using our visual editor, set triggers (time-based, event-driven, or manual), and configure decision logic for complex automation.',
            category: 'Workflows',
        },
        {
            question: 'How do I monitor agent performance?',
            answer: 'The Analytics dashboard provides comprehensive metrics including success rates, response times, error logs, and resource usage. You can set up alerts for performance thresholds and receive notifications via email or Slack.',
            category: 'Monitoring',
        },
        {
            question: 'What support options are available?',
            answer: 'We offer multiple support channels: email support (response within 24 hours), live chat during business hours, community forum, comprehensive documentation, and video tutorials. Enterprise customers get priority support.',
            category: 'Support',
        },
        {
            question: 'How does billing work?',
            answer: 'Billing is based on your usage including agent compute time, API calls, and storage. We offer flexible plans from starter to enterprise with transparent pricing. You can monitor usage in real-time and set spending alerts.',
            category: 'Billing',
        },
    ];
    const supportChannels = [
        {
            name: 'Live Chat',
            description: 'Get instant help from our support team',
            availability: 'Mon-Fri, 9AM-6PM PST',
            responseTime: 'Immediate',
            icon: MessageCircle,
        },
        {
            name: 'Email Support',
            description: 'Send us a detailed message about your issue',
            availability: '24/7',
            responseTime: 'Within 24 hours',
            icon: FileText,
        },
        {
            name: 'Community Forum',
            description: 'Connect with other users and experts',
            availability: '24/7',
            responseTime: 'Community-driven',
            icon: Users,
        },
        {
            name: 'Phone Support',
            description: 'Talk directly with our technical team',
            availability: 'Enterprise customers only',
            responseTime: 'Immediate',
            icon: Video,
        },
    ];
    const filteredFAQ = faqItems.filter(item => item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.answer.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase()));
    return (<div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Help & Support</h1>
          <p className="text-muted-foreground">
            Find answers, get support, and learn how to make the most of URN Labs.
          </p>
        </div>
        <Button className="gap-2">
          <MessageCircle className="h-4 w-4"/>
          Contact Support
        </Button>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
            <Input placeholder="Search for help articles, FAQs, or topics..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10"/>
          </div>
        </CardContent>
      </Card>

      {/* Quick Links */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Quick Links</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((link) => (<Card key={link.title} className="cursor-pointer hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <link.icon className="h-5 w-5 text-primary"/>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">{link.title}</h3>
                      <ChevronRight className="h-4 w-4 text-muted-foreground"/>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {link.description}
                    </p>
                    <div className="mt-2">
                      <span className="text-xs bg-secondary px-2 py-1 rounded">
                        {link.category}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>))}
        </div>
      </div>

      {/* Support Channels */}
      <Card>
        <CardHeader>
          <CardTitle>Support Channels</CardTitle>
          <CardDescription>
            Choose the best way to get help based on your needs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {supportChannels.map((channel) => (<div key={channel.name} className="flex items-start gap-3 p-4 border rounded-lg">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <channel.icon className="h-4 w-4 text-primary"/>
                </div>
                <div className="flex-1">
                  <h4 className="font-medium">{channel.name}</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    {channel.description}
                  </p>
                  <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                    <span>{channel.availability}</span>
                    <span>Response: {channel.responseTime}</span>
                  </div>
                </div>
              </div>))}
          </div>
        </CardContent>
      </Card>

      {/* FAQ Section */}
      <Card>
        <CardHeader>
          <CardTitle>Frequently Asked Questions</CardTitle>
          <CardDescription>
            Common questions and answers about using URN Labs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredFAQ.map((faq, index) => (<div key={index} className="border rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <HelpCircle className="h-4 w-4 text-primary"/>
                      {faq.question}
                    </h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {faq.answer}
                    </p>
                    <div className="mt-3">
                      <span className="text-xs bg-secondary px-2 py-1 rounded">
                        {faq.category}
                      </span>
                    </div>
                  </div>
                </div>
              </div>))}

            {filteredFAQ.length === 0 && searchQuery && (<div className="text-center py-8">
                <HelpCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4"/>
                <h3 className="font-medium mb-2">No results found</h3>
                <p className="text-muted-foreground">
                  Try adjusting your search terms or browse our documentation.
                </p>
              </div>)}
          </div>
        </CardContent>
      </Card>

      {/* Additional Resources */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Documentation</CardTitle>
            <CardDescription>
              Comprehensive guides and references.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" className="w-full justify-between">
              <span>Getting Started Guide</span>
              <ExternalLink className="h-4 w-4"/>
            </Button>
            <Button variant="outline" className="w-full justify-between">
              <span>API Reference</span>
              <ExternalLink className="h-4 w-4"/>
            </Button>
            <Button variant="outline" className="w-full justify-between">
              <span>Integration Guides</span>
              <ExternalLink className="h-4 w-4"/>
            </Button>
            <Button variant="outline" className="w-full justify-between">
              <span>Best Practices</span>
              <ExternalLink className="h-4 w-4"/>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Learning Resources</CardTitle>
            <CardDescription>
              Tutorials and educational content.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" className="w-full justify-between">
              <span>Video Tutorials</span>
              <Video className="h-4 w-4"/>
            </Button>
            <Button variant="outline" className="w-full justify-between">
              <span>Webinar Recordings</span>
              <Video className="h-4 w-4"/>
            </Button>
            <Button variant="outline" className="w-full justify-between">
              <span>Use Case Examples</span>
              <FileText className="h-4 w-4"/>
            </Button>
            <Button variant="outline" className="w-full justify-between">
              <span>Community Workshops</span>
              <Users className="h-4 w-4"/>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Contact Information */}
      <Card>
        <CardHeader>
          <CardTitle>Still Need Help?</CardTitle>
          <CardDescription>
            Our support team is here to help you succeed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="text-center p-4 border rounded-lg">
              <MessageCircle className="h-8 w-8 text-primary mx-auto mb-2"/>
              <h4 className="font-medium">Live Chat</h4>
              <p className="text-sm text-muted-foreground">
                Available Mon-Fri, 9AM-6PM PST
              </p>
              <Button className="mt-3" size="sm">
                Start Chat
              </Button>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <FileText className="h-8 w-8 text-primary mx-auto mb-2"/>
              <h4 className="font-medium">Email Support</h4>
              <p className="text-sm text-muted-foreground">
                support@urnlabs.ai
              </p>
              <Button className="mt-3" variant="outline" size="sm">
                Send Email
              </Button>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <Users className="h-8 w-8 text-primary mx-auto mb-2"/>
              <h4 className="font-medium">Community</h4>
              <p className="text-sm text-muted-foreground">
                Join our user community
              </p>
              <Button className="mt-3" variant="outline" size="sm">
                Visit Forum
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>);
};
//# sourceMappingURL=help.js.map