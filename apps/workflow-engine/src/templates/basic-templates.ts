/**
 * Basic Workflow Templates
 * Pre-built workflow templates for common automation patterns
 */

import { WorkflowTemplate, WorkflowDefinition } from '@/types/workflow.js';

/**
 * Code Review Workflow Template
 */
export const codeReviewWorkflowTemplate: WorkflowTemplate = {
  id: 'code-review-workflow',
  name: 'Code Review Workflow',
  description: 'Automated code review process with AI analysis and human approval',
  category: 'development',
  tags: ['code-review', 'ci-cd', 'quality-assurance'],
  version: '1.0.0',
  author: 'Urnlabs',
  rating: 4.8,
  downloads: 1250,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-15'),
  parameters: [
    {
      name: 'repository_url',
      description: 'Git repository URL',
      type: 'string',
      required: true
    },
    {
      name: 'pull_request_id',
      description: 'Pull request ID to review',
      type: 'string',
      required: true
    },
    {
      name: 'reviewers',
      description: 'List of reviewer email addresses',
      type: 'array',
      required: true
    },
    {
      name: 'ai_review_enabled',
      description: 'Enable AI-powered code analysis',
      type: 'boolean',
      required: false,
      defaultValue: true
    }
  ],
  definition: {
    id: 'code-review-workflow',
    name: 'Code Review Workflow',
    version: '1.0.0',
    description: 'Automated code review process',
    steps: [
      {
        id: 'fetch-changes',
        name: 'Fetch Code Changes',
        type: 'agent-task',
        dependencies: [],
        configuration: {
          agentId: 'git-agent',
          function: 'fetchPullRequest',
          parameters: {
            repository: '{{repository_url}}',
            pullRequestId: '{{pull_request_id}}'
          }
        },
        retryPolicy: {
          maxAttempts: 3,
          baseDelay: 1000,
          maxDelay: 10000,
          backoffMultiplier: 2,
          retryableErrors: ['NETWORK_ERROR', 'TIMEOUT_ERROR'],
          nonRetryableErrors: ['AUTHENTICATION_ERROR', 'NOT_FOUND_ERROR']
        },
        timeout: 30000
      },
      {
        id: 'ai-code-analysis',
        name: 'AI Code Analysis',
        type: 'agent-task',
        dependencies: ['fetch-changes'],
        configuration: {
          agentId: 'code-analyzer-agent',
          function: 'analyzeCode',
          parameters: {
            changes: '{{fetch-changes_output.changes}}',
            analysisTypes: ['security', 'performance', 'style', 'complexity']
          }
        },
        condition: {
          type: 'expression',
          expression: 'input.ai_review_enabled === true'
        },
        retryPolicy: {
          maxAttempts: 2,
          baseDelay: 2000,
          maxDelay: 20000,
          backoffMultiplier: 2,
          retryableErrors: ['RATE_LIMIT_ERROR', 'SERVICE_UNAVAILABLE'],
          nonRetryableErrors: ['VALIDATION_ERROR']
        },
        timeout: 120000
      },
      {
        id: 'run-tests',
        name: 'Run Automated Tests',
        type: 'agent-task',
        dependencies: ['fetch-changes'],
        configuration: {
          agentId: 'ci-agent',
          function: 'runTests',
          parameters: {
            repository: '{{repository_url}}',
            branch: '{{fetch-changes_output.branch}}',
            testSuites: ['unit', 'integration']
          }
        },
        retryPolicy: {
          maxAttempts: 1,
          baseDelay: 1000,
          maxDelay: 1000,
          backoffMultiplier: 1,
          retryableErrors: [],
          nonRetryableErrors: ['*']
        },
        timeout: 600000 // 10 minutes
      },
      {
        id: 'security-scan',
        name: 'Security Vulnerability Scan',
        type: 'agent-task',
        dependencies: ['fetch-changes'],
        configuration: {
          agentId: 'security-scanner-agent',
          function: 'scanVulnerabilities',
          parameters: {
            changes: '{{fetch-changes_output.changes}}',
            scanTypes: ['dependencies', 'secrets', 'code']
          }
        },
        retryPolicy: {
          maxAttempts: 2,
          baseDelay: 1500,
          maxDelay: 15000,
          backoffMultiplier: 2,
          retryableErrors: ['TIMEOUT_ERROR'],
          nonRetryableErrors: ['AUTHENTICATION_ERROR']
        },
        timeout: 180000 // 3 minutes
      },
      {
        id: 'generate-review-report',
        name: 'Generate Review Report',
        type: 'data-transform',
        dependencies: ['ai-code-analysis', 'run-tests', 'security-scan'],
        configuration: {
          parameters: {
            transformations: [
              {
                type: 'aggregate',
                operation: 'merge',
                sources: [
                  '{{ai-code-analysis_output}}',
                  '{{run-tests_output}}',
                  '{{security-scan_output}}'
                ]
              }
            ]
          }
        },
        timeout: 10000
      },
      {
        id: 'request-human-review',
        name: 'Request Human Review',
        type: 'notification',
        dependencies: ['generate-review-report'],
        configuration: {
          parameters: {
            type: 'email',
            recipients: '{{reviewers}}',
            subject: 'Code Review Required: PR #{{pull_request_id}}',
            template: 'code-review-request',
            data: {
              pullRequestId: '{{pull_request_id}}',
              repository: '{{repository_url}}',
              report: '{{generate-review-report_output}}'
            }
          }
        },
        timeout: 30000
      },
      {
        id: 'await-approval',
        name: 'Await Manual Approval',
        type: 'manual-approval',
        dependencies: ['request-human-review'],
        configuration: {
          parameters: {
            approvers: '{{reviewers}}',
            timeoutHours: 48,
            approvalThreshold: 1
          }
        },
        timeout: 172800000 // 48 hours
      },
      {
        id: 'update-pr-status',
        name: 'Update Pull Request Status',
        type: 'agent-task',
        dependencies: ['await-approval'],
        configuration: {
          agentId: 'git-agent',
          function: 'updatePullRequestStatus',
          parameters: {
            repository: '{{repository_url}}',
            pullRequestId: '{{pull_request_id}}',
            status: '{{await-approval_output.approved ? "approved" : "rejected"}}',
            comments: '{{await-approval_output.comments}}'
          }
        },
        timeout: 30000
      }
    ],
    parameters: [
      {
        name: 'repository_url',
        type: 'string',
        required: true,
        description: 'Git repository URL'
      },
      {
        name: 'pull_request_id',
        type: 'string',
        required: true,
        description: 'Pull request ID to review'
      },
      {
        name: 'reviewers',
        type: 'array',
        required: true,
        description: 'List of reviewer email addresses'
      },
      {
        name: 'ai_review_enabled',
        type: 'boolean',
        required: false,
        defaultValue: true,
        description: 'Enable AI-powered code analysis'
      }
    ],
    triggers: [
      {
        id: 'pr-webhook',
        type: 'webhook',
        configuration: {
          webhook: {
            url: '/webhooks/pull-request',
            method: 'POST',
            authentication: {
              type: 'bearer',
              credentials: { token: '{{GITHUB_WEBHOOK_SECRET}}' }
            }
          }
        },
        enabled: true
      }
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
    tags: ['code-review', 'ci-cd']
  } as Partial<WorkflowDefinition>
};

/**
 * Data Processing Pipeline Template
 */
export const dataProcessingPipelineTemplate: WorkflowTemplate = {
  id: 'data-processing-pipeline',
  name: 'Data Processing Pipeline',
  description: 'ETL pipeline for data ingestion, transformation, and loading',
  category: 'data',
  tags: ['etl', 'data-processing', 'pipeline'],
  version: '1.0.0',
  author: 'Urnlabs',
  rating: 4.5,
  downloads: 890,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-10'),
  parameters: [
    {
      name: 'source_url',
      description: 'Data source URL or file path',
      type: 'string',
      required: true
    },
    {
      name: 'destination_table',
      description: 'Target database table name',
      type: 'string',
      required: true
    },
    {
      name: 'batch_size',
      description: 'Number of records to process in each batch',
      type: 'number',
      required: false,
      defaultValue: 1000
    },
    {
      name: 'transformation_rules',
      description: 'JSON object containing transformation rules',
      type: 'object',
      required: false,
      defaultValue: {}
    }
  ],
  definition: {
    id: 'data-processing-pipeline',
    name: 'Data Processing Pipeline',
    version: '1.0.0',
    description: 'ETL pipeline for data processing',
    steps: [
      {
        id: 'extract-data',
        name: 'Extract Data from Source',
        type: 'agent-task',
        dependencies: [],
        configuration: {
          agentId: 'data-extractor-agent',
          function: 'extractData',
          parameters: {
            source: '{{source_url}}',
            batchSize: '{{batch_size}}'
          }
        },
        retryPolicy: {
          maxAttempts: 3,
          baseDelay: 2000,
          maxDelay: 30000,
          backoffMultiplier: 2,
          retryableErrors: ['NETWORK_ERROR', 'TIMEOUT_ERROR'],
          nonRetryableErrors: ['AUTHENTICATION_ERROR', 'NOT_FOUND_ERROR']
        },
        timeout: 300000 // 5 minutes
      },
      {
        id: 'validate-data',
        name: 'Validate Data Quality',
        type: 'agent-task',
        dependencies: ['extract-data'],
        configuration: {
          agentId: 'data-validator-agent',
          function: 'validateData',
          parameters: {
            data: '{{extract-data_output.data}}',
            validationRules: {
              required_fields: ['id', 'timestamp'],
              data_types: {
                id: 'string',
                timestamp: 'datetime'
              }
            }
          }
        },
        timeout: 120000 // 2 minutes
      },
      {
        id: 'transform-data',
        name: 'Transform Data',
        type: 'data-transform',
        dependencies: ['validate-data'],
        configuration: {
          parameters: {
            transformations: [
              {
                type: 'map',
                mapping: '{{transformation_rules}}'
              },
              {
                type: 'filter',
                condition: 'record.timestamp > date_sub(now(), interval 30 day)'
              }
            ]
          }
        },
        timeout: 180000 // 3 minutes
      },
      {
        id: 'load-data',
        name: 'Load Data to Destination',
        type: 'agent-task',
        dependencies: ['transform-data'],
        configuration: {
          agentId: 'data-loader-agent',
          function: 'loadData',
          parameters: {
            data: '{{transform-data_output}}',
            destination: '{{destination_table}}',
            mode: 'append'
          }
        },
        retryPolicy: {
          maxAttempts: 2,
          baseDelay: 5000,
          maxDelay: 50000,
          backoffMultiplier: 2,
          retryableErrors: ['DATABASE_CONNECTION_ERROR'],
          nonRetryableErrors: ['VALIDATION_ERROR']
        },
        timeout: 600000 // 10 minutes
      },
      {
        id: 'generate-report',
        name: 'Generate Processing Report',
        type: 'notification',
        dependencies: ['load-data'],
        configuration: {
          parameters: {
            type: 'slack',
            webhook: '{{SLACK_WEBHOOK_URL}}',
            message: 'Data processing completed successfully. Processed {{load-data_output.recordCount}} records.'
          }
        },
        timeout: 30000
      }
    ],
    triggers: [
      {
        id: 'schedule-trigger',
        type: 'schedule',
        configuration: {
          schedule: {
            expression: '0 2 * * *', // Daily at 2 AM
            timezone: 'UTC',
            enabled: true
          }
        },
        enabled: true
      }
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
    tags: ['etl', 'data']
  } as Partial<WorkflowDefinition>
};

/**
 * Incident Response Workflow Template
 */
export const incidentResponseWorkflowTemplate: WorkflowTemplate = {
  id: 'incident-response-workflow',
  name: 'Incident Response Workflow',
  description: 'Automated incident detection, escalation, and resolution workflow',
  category: 'operations',
  tags: ['incident-response', 'monitoring', 'alerting'],
  version: '1.0.0',
  author: 'Urnlabs',
  rating: 4.9,
  downloads: 567,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-12'),
  parameters: [
    {
      name: 'alert_source',
      description: 'Source of the alert (monitoring system)',
      type: 'string',
      required: true
    },
    {
      name: 'severity',
      description: 'Incident severity level',
      type: 'string',
      required: true,
      options: ['low', 'medium', 'high', 'critical']
    },
    {
      name: 'affected_service',
      description: 'Name of the affected service',
      type: 'string',
      required: true
    },
    {
      name: 'on_call_team',
      description: 'On-call team to notify',
      type: 'string',
      required: true
    }
  ],
  definition: {
    id: 'incident-response-workflow',
    name: 'Incident Response Workflow',
    version: '1.0.0',
    description: 'Automated incident response process',
    steps: [
      {
        id: 'create-incident',
        name: 'Create Incident Record',
        type: 'agent-task',
        dependencies: [],
        configuration: {
          agentId: 'incident-management-agent',
          function: 'createIncident',
          parameters: {
            source: '{{alert_source}}',
            severity: '{{severity}}',
            service: '{{affected_service}}',
            team: '{{on_call_team}}'
          }
        },
        timeout: 30000
      },
      {
        id: 'initial-assessment',
        name: 'Perform Initial Assessment',
        type: 'agent-task',
        dependencies: ['create-incident'],
        configuration: {
          agentId: 'monitoring-agent',
          function: 'assessIncident',
          parameters: {
            incidentId: '{{create-incident_output.incidentId}}',
            service: '{{affected_service}}'
          }
        },
        timeout: 60000
      },
      {
        id: 'notify-on-call',
        name: 'Notify On-Call Team',
        type: 'notification',
        dependencies: ['initial-assessment'],
        configuration: {
          parameters: {
            type: 'pagerduty',
            escalationPolicy: '{{on_call_team}}',
            message: 'INCIDENT: {{severity}} severity issue with {{affected_service}}',
            data: '{{initial-assessment_output}}'
          }
        },
        timeout: 30000
      },
      {
        id: 'auto-remediation',
        name: 'Attempt Auto-Remediation',
        type: 'condition',
        dependencies: ['initial-assessment'],
        configuration: {
          condition: {
            type: 'expression',
            expression: 'input.severity !== "critical" && input.auto_remediation_available'
          }
        },
        timeout: 10000
      },
      {
        id: 'execute-runbook',
        name: 'Execute Runbook',
        type: 'agent-task',
        dependencies: ['auto-remediation'],
        configuration: {
          agentId: 'automation-agent',
          function: 'executeRunbook',
          parameters: {
            service: '{{affected_service}}',
            incident: '{{create-incident_output}}'
          }
        },
        condition: {
          type: 'expression',
          expression: 'auto-remediation_output.result === true'
        },
        timeout: 300000 // 5 minutes
      },
      {
        id: 'escalate-if-unresolved',
        name: 'Escalate if Unresolved',
        type: 'notification',
        dependencies: ['execute-runbook'],
        configuration: {
          parameters: {
            type: 'slack',
            channel: '#incident-escalation',
            message: 'Incident {{create-incident_output.incidentId}} requires manual intervention'
          }
        },
        condition: {
          type: 'expression',
          expression: 'execute-runbook_output.resolved !== true'
        },
        timeout: 30000
      }
    ],
    triggers: [
      {
        id: 'alert-webhook',
        type: 'webhook',
        configuration: {
          webhook: {
            url: '/webhooks/alert',
            method: 'POST'
          }
        },
        enabled: true
      }
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
    tags: ['incident', 'ops']
  } as Partial<WorkflowDefinition>
};

/**
 * Template registry
 */
export const workflowTemplates: WorkflowTemplate[] = [
  codeReviewWorkflowTemplate,
  dataProcessingPipelineTemplate,
  incidentResponseWorkflowTemplate
];

/**
 * Get template by ID
 */
export function getTemplate(templateId: string): WorkflowTemplate | undefined {
  return workflowTemplates.find(template => template.id === templateId);
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: string): WorkflowTemplate[] {
  return workflowTemplates.filter(template => template.category === category);
}

/**
 * Get templates by tag
 */
export function getTemplatesByTag(tag: string): WorkflowTemplate[] {
  return workflowTemplates.filter(template => template.tags.includes(tag));
}

/**
 * Search templates
 */
export function searchTemplates(query: string): WorkflowTemplate[] {
  const lowercaseQuery = query.toLowerCase();
  return workflowTemplates.filter(template =>
    template.name.toLowerCase().includes(lowercaseQuery) ||
    template.description.toLowerCase().includes(lowercaseQuery) ||
    template.tags.some(tag => tag.toLowerCase().includes(lowercaseQuery))
  );
}