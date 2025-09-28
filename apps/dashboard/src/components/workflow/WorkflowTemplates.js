import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Badge, Input, Label, ScrollArea } from '@urnlabs/ui';
import { Template, Search, Clock, Users, Mail, Database, Bot, FileText, Zap, Star, Download, Eye } from 'lucide-react';
const workflowTemplates = [
    {
        id: 'customer-onboarding',
        name: 'Customer Onboarding',
        description: 'Automated workflow for new customer onboarding with email sequences and account setup',
        category: 'automation',
        complexity: 'intermediate',
        estimatedTime: '2-3 hours',
        tags: ['email', 'customer', 'automation', 'crm'],
        usageCount: 342,
        rating: 4.8,
        icon: Users,
        nodes: [
            {
                id: 'trigger-1',
                type: 'trigger',
                position: { x: 100, y: 100 },
                data: {
                    label: 'New Customer Signup',
                    triggerType: 'webhook',
                    config: { webhookUrl: '/api/webhooks/customer-signup' }
                }
            },
            {
                id: 'action-1',
                type: 'action',
                position: { x: 100, y: 200 },
                data: {
                    label: 'Send Welcome Email',
                    actionType: 'email',
                    config: {
                        emailTemplate: 'welcome-template',
                        emailSubject: 'Welcome to our platform!'
                    }
                }
            },
            {
                id: 'action-2',
                type: 'action',
                position: { x: 100, y: 300 },
                data: {
                    label: 'Create User Account',
                    actionType: 'database',
                    config: {
                        operation: 'insert',
                        table: 'users'
                    }
                }
            },
            {
                id: 'output-1',
                type: 'output',
                position: { x: 100, y: 400 },
                data: {
                    label: 'Onboarding Complete',
                    outputType: 'success'
                }
            }
        ],
        edges: [
            { id: 'e1', source: 'trigger-1', target: 'action-1' },
            { id: 'e2', source: 'action-1', target: 'action-2' },
            { id: 'e3', source: 'action-2', target: 'output-1' }
        ]
    },
    {
        id: 'data-processing',
        name: 'Data Processing Pipeline',
        description: 'ETL pipeline for processing and transforming data from multiple sources',
        category: 'data',
        complexity: 'advanced',
        estimatedTime: '4-6 hours',
        tags: ['etl', 'data', 'transformation', 'analytics'],
        usageCount: 156,
        rating: 4.6,
        icon: Database,
        nodes: [
            {
                id: 'trigger-1',
                type: 'trigger',
                position: { x: 100, y: 100 },
                data: {
                    label: 'Scheduled Data Import',
                    triggerType: 'schedule',
                    config: { cronExpression: '0 2 * * *' }
                }
            },
            {
                id: 'action-1',
                type: 'action',
                position: { x: 100, y: 200 },
                data: {
                    label: 'Extract Data',
                    actionType: 'api-call',
                    config: {
                        apiUrl: 'https://api.datasource.com/export',
                        method: 'GET'
                    }
                }
            },
            {
                id: 'action-2',
                type: 'action',
                position: { x: 100, y: 300 },
                data: {
                    label: 'Transform Data',
                    actionType: 'script',
                    config: {
                        scriptType: 'python',
                        script: 'data_transformation.py'
                    }
                }
            },
            {
                id: 'action-3',
                type: 'action',
                position: { x: 100, y: 400 },
                data: {
                    label: 'Load to Warehouse',
                    actionType: 'database',
                    config: {
                        operation: 'insert',
                        table: 'processed_data'
                    }
                }
            },
            {
                id: 'output-1',
                type: 'output',
                position: { x: 100, y: 500 },
                data: {
                    label: 'Data Processing Complete',
                    outputType: 'success'
                }
            }
        ],
        edges: [
            { id: 'e1', source: 'trigger-1', target: 'action-1' },
            { id: 'e2', source: 'action-1', target: 'action-2' },
            { id: 'e3', source: 'action-2', target: 'action-3' },
            { id: 'e4', source: 'action-3', target: 'output-1' }
        ]
    },
    {
        id: 'ai-content-moderation',
        name: 'AI Content Moderation',
        description: 'Automated content moderation using AI to detect and flag inappropriate content',
        category: 'ai',
        complexity: 'intermediate',
        estimatedTime: '1-2 hours',
        tags: ['ai', 'moderation', 'content', 'safety'],
        usageCount: 89,
        rating: 4.7,
        icon: Bot,
        nodes: [
            {
                id: 'trigger-1',
                type: 'trigger',
                position: { x: 100, y: 100 },
                data: {
                    label: 'New Content Posted',
                    triggerType: 'webhook',
                    config: { webhookUrl: '/api/webhooks/content-posted' }
                }
            },
            {
                id: 'action-1',
                type: 'action',
                position: { x: 100, y: 200 },
                data: {
                    label: 'AI Content Analysis',
                    actionType: 'ai-agent',
                    config: {
                        agentType: 'claude',
                        prompt: 'Analyze this content for inappropriate material: {{content}}'
                    }
                }
            },
            {
                id: 'condition-1',
                type: 'condition',
                position: { x: 100, y: 300 },
                data: {
                    label: 'Content Appropriate?',
                    conditionType: 'if-else',
                    config: { condition: '{{ai_result.safe}} === true' }
                }
            },
            {
                id: 'action-2',
                type: 'action',
                position: { x: 300, y: 400 },
                data: {
                    label: 'Approve Content',
                    actionType: 'database',
                    config: {
                        operation: 'update',
                        table: 'content',
                        query: 'UPDATE content SET status = "approved" WHERE id = ?'
                    }
                }
            },
            {
                id: 'action-3',
                type: 'action',
                position: { x: 100, y: 400 },
                data: {
                    label: 'Flag for Review',
                    actionType: 'notification',
                    config: {
                        notificationChannel: 'slack',
                        message: 'Content flagged for manual review: {{content_id}}'
                    }
                }
            }
        ],
        edges: [
            { id: 'e1', source: 'trigger-1', target: 'action-1' },
            { id: 'e2', source: 'action-1', target: 'condition-1' },
            { id: 'e3', source: 'condition-1', target: 'action-2', sourceHandle: 'true' },
            { id: 'e4', source: 'condition-1', target: 'action-3', sourceHandle: 'false' }
        ]
    },
    {
        id: 'incident-response',
        name: 'Incident Response',
        description: 'Automated incident detection and response workflow with escalation procedures',
        category: 'monitoring',
        complexity: 'advanced',
        estimatedTime: '3-4 hours',
        tags: ['monitoring', 'alerts', 'incident', 'escalation'],
        usageCount: 234,
        rating: 4.9,
        icon: Zap,
        nodes: [
            {
                id: 'trigger-1',
                type: 'trigger',
                position: { x: 100, y: 100 },
                data: {
                    label: 'Alert Received',
                    triggerType: 'webhook',
                    config: { webhookUrl: '/api/webhooks/alert' }
                }
            },
            {
                id: 'condition-1',
                type: 'condition',
                position: { x: 100, y: 200 },
                data: {
                    label: 'Severity Check',
                    conditionType: 'if-else',
                    config: { condition: '{{alert.severity}} === "critical"' }
                }
            },
            {
                id: 'action-1',
                type: 'action',
                position: { x: 300, y: 300 },
                data: {
                    label: 'Page On-Call Engineer',
                    actionType: 'notification',
                    config: {
                        notificationChannel: 'pagerduty',
                        urgency: 'high'
                    }
                }
            },
            {
                id: 'action-2',
                type: 'action',
                position: { x: 100, y: 300 },
                data: {
                    label: 'Send Slack Alert',
                    actionType: 'notification',
                    config: {
                        notificationChannel: 'slack',
                        message: 'Alert: {{alert.message}}'
                    }
                }
            }
        ],
        edges: [
            { id: 'e1', source: 'trigger-1', target: 'condition-1' },
            { id: 'e2', source: 'condition-1', target: 'action-1', sourceHandle: 'true' },
            { id: 'e3', source: 'condition-1', target: 'action-2', sourceHandle: 'false' }
        ]
    },
    {
        id: 'email-campaign',
        name: 'Email Campaign Automation',
        description: 'Automated email marketing campaign with personalization and tracking',
        category: 'communication',
        complexity: 'simple',
        estimatedTime: '1 hour',
        tags: ['email', 'marketing', 'campaign', 'automation'],
        usageCount: 567,
        rating: 4.5,
        icon: Mail,
        nodes: [
            {
                id: 'trigger-1',
                type: 'trigger',
                position: { x: 100, y: 100 },
                data: {
                    label: 'Campaign Schedule',
                    triggerType: 'schedule',
                    config: { cronExpression: '0 9 * * 1' }
                }
            },
            {
                id: 'action-1',
                type: 'action',
                position: { x: 100, y: 200 },
                data: {
                    label: 'Get Subscriber List',
                    actionType: 'database',
                    config: {
                        operation: 'select',
                        table: 'subscribers',
                        query: 'SELECT * FROM subscribers WHERE active = true'
                    }
                }
            },
            {
                id: 'action-2',
                type: 'action',
                position: { x: 100, y: 300 },
                data: {
                    label: 'Send Personalized Emails',
                    actionType: 'email',
                    config: {
                        emailTemplate: 'campaign-template',
                        personalization: true
                    }
                }
            },
            {
                id: 'output-1',
                type: 'output',
                position: { x: 100, y: 400 },
                data: {
                    label: 'Campaign Sent',
                    outputType: 'success'
                }
            }
        ],
        edges: [
            { id: 'e1', source: 'trigger-1', target: 'action-1' },
            { id: 'e2', source: 'action-1', target: 'action-2' },
            { id: 'e3', source: 'action-2', target: 'output-1' }
        ]
    }
];
export const WorkflowTemplates = ({ onSelectTemplate }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [selectedComplexity, setSelectedComplexity] = useState('all');
    const categories = [
        { value: 'all', label: 'All Categories' },
        { value: 'automation', label: 'Automation' },
        { value: 'data', label: 'Data Processing' },
        { value: 'communication', label: 'Communication' },
        { value: 'ai', label: 'AI & ML' },
        { value: 'monitoring', label: 'Monitoring' }
    ];
    const complexityLevels = [
        { value: 'all', label: 'All Levels' },
        { value: 'simple', label: 'Simple' },
        { value: 'intermediate', label: 'Intermediate' },
        { value: 'advanced', label: 'Advanced' }
    ];
    const filteredTemplates = workflowTemplates.filter(template => {
        const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
            template.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
        const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory;
        const matchesComplexity = selectedComplexity === 'all' || template.complexity === selectedComplexity;
        return matchesSearch && matchesCategory && matchesComplexity;
    });
    const getComplexityColor = (complexity) => {
        switch (complexity) {
            case 'simple':
                return 'bg-green-100 text-green-800';
            case 'intermediate':
                return 'bg-yellow-100 text-yellow-800';
            case 'advanced':
                return 'bg-red-100 text-red-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };
    const getCategoryIcon = (category) => {
        switch (category) {
            case 'automation':
                return Zap;
            case 'data':
                return Database;
            case 'communication':
                return Mail;
            case 'ai':
                return Bot;
            case 'monitoring':
                return Eye;
            default:
                return FileText;
        }
    };
    const handleSelectTemplate = (template) => {
        onSelectTemplate(template);
        setIsOpen(false);
    };
    return (<Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Template className="h-3 w-3 mr-1"/>
          Templates
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Template className="h-4 w-4"/>
            Workflow Templates
          </DialogTitle>
          <DialogDescription>
            Choose from pre-built workflow templates to get started quickly.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Label htmlFor="search" className="sr-only">Search templates</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground"/>
                <Input id="search" placeholder="Search templates..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8"/>
              </div>
            </div>
            <div className="flex gap-2">
              <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="px-3 py-2 border border-input bg-background text-sm rounded-md">
                {categories.map(cat => (<option key={cat.value} value={cat.value}>{cat.label}</option>))}
              </select>
              <select value={selectedComplexity} onChange={(e) => setSelectedComplexity(e.target.value)} className="px-3 py-2 border border-input bg-background text-sm rounded-md">
                {complexityLevels.map(level => (<option key={level.value} value={level.value}>{level.label}</option>))}
              </select>
            </div>
          </div>

          {/* Templates Grid */}
          <ScrollArea className="h-[400px]">
            <div className="grid gap-4 md:grid-cols-2">
              {filteredTemplates.map(template => {
            const IconComponent = template.icon;
            const CategoryIcon = getCategoryIcon(template.category);
            return (<Card key={template.id} className="cursor-pointer hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
                            <IconComponent className="h-4 w-4 text-primary"/>
                          </div>
                          <div>
                            <CardTitle className="text-sm">{template.name}</CardTitle>
                            <div className="flex items-center gap-1 mt-1">
                              <CategoryIcon className="h-3 w-3 text-muted-foreground"/>
                              <span className="text-xs text-muted-foreground capitalize">
                                {template.category}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Star className="h-3 w-3 fill-yellow-400 text-yellow-400"/>
                          <span className="text-xs text-muted-foreground">{template.rating}</span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <CardDescription className="text-xs line-clamp-2">
                        {template.description}
                      </CardDescription>

                      <div className="flex flex-wrap gap-1">
                        {template.tags.slice(0, 3).map(tag => (<Badge key={tag} variant="secondary" className="text-xs px-1.5 py-0.5">
                            {tag}
                          </Badge>))}
                        {template.tags.length > 3 && (<Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                            +{template.tags.length - 3}
                          </Badge>)}
                      </div>

                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3"/>
                            {template.estimatedTime}
                          </div>
                          <div className="flex items-center gap-1">
                            <Download className="h-3 w-3"/>
                            {template.usageCount}
                          </div>
                        </div>
                        <Badge className={`text-xs ${getComplexityColor(template.complexity)}`}>
                          {template.complexity}
                        </Badge>
                      </div>

                      <Button onClick={() => handleSelectTemplate(template)} className="w-full" size="sm">
                        Use Template
                      </Button>
                    </CardContent>
                  </Card>);
        })}
            </div>

            {filteredTemplates.length === 0 && (<div className="text-center py-8">
                <Template className="h-12 w-12 text-muted-foreground mx-auto mb-4"/>
                <h3 className="text-sm font-medium">No templates found</h3>
                <p className="text-xs text-muted-foreground">
                  Try adjusting your search criteria or filters.
                </p>
              </div>)}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>);
};
//# sourceMappingURL=WorkflowTemplates.js.map