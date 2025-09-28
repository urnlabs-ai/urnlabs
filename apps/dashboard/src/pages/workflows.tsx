import React from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Badge
} from '@urnlabs/ui'
import { Plus, Workflow, Play, Pause, Settings, MoreHorizontal, Clock, Users, CheckCircle, AlertCircle } from 'lucide-react'

export const WorkflowsPage: React.FC = () => {
  const workflows = [
    {
      id: 1,
      name: 'Customer Onboarding',
      description: 'Automated customer onboarding process with email verification and profile setup',
      status: 'active',
      type: 'Automation',
      trigger: 'New user signup',
      lastRun: '10 minutes ago',
      successRate: '96.8%',
      avgDuration: '3.2 min',
      totalRuns: 1247,
      steps: 8,
    },
    {
      id: 2,
      name: 'Data Processing Pipeline',
      description: 'Processes customer data, generates insights, and updates analytics dashboard',
      status: 'running',
      type: 'Data Processing',
      trigger: 'Daily at 2:00 AM',
      lastRun: '2 hours ago',
      successRate: '99.2%',
      avgDuration: '45.6 min',
      totalRuns: 89,
      steps: 12,
    },
    {
      id: 3,
      name: 'Support Ticket Triage',
      description: 'Automatically categorizes and assigns support tickets to appropriate agents',
      status: 'active',
      type: 'Support',
      trigger: 'New ticket created',
      lastRun: '5 minutes ago',
      successRate: '94.5%',
      avgDuration: '0.8 min',
      totalRuns: 2156,
      steps: 6,
    },
    {
      id: 4,
      name: 'Content Publishing',
      description: 'Creates, reviews, and publishes marketing content across multiple channels',
      status: 'paused',
      type: 'Marketing',
      trigger: 'Manual trigger',
      lastRun: '1 day ago',
      successRate: '91.3%',
      avgDuration: '15.2 min',
      totalRuns: 67,
      steps: 10,
    },
    {
      id: 5,
      name: 'Security Audit',
      description: 'Runs comprehensive security checks and generates compliance reports',
      status: 'scheduled',
      type: 'Security',
      trigger: 'Weekly on Sundays',
      lastRun: '3 days ago',
      successRate: '100%',
      avgDuration: '28.7 min',
      totalRuns: 23,
      steps: 15,
    },
  ]

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'running':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'paused':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'scheduled':
        return 'bg-purple-100 text-purple-800 border-purple-200'
      case 'error':
        return 'bg-red-100 text-red-800 border-red-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-3 w-3" />
      case 'running':
        return <Play className="h-3 w-3" />
      case 'paused':
        return <Pause className="h-3 w-3" />
      case 'scheduled':
        return <Clock className="h-3 w-3" />
      case 'error':
        return <AlertCircle className="h-3 w-3" />
      default:
        return null
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Workflows</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              <span className="sm:hidden">Design, deploy, and monitor automated workflows.</span>
              <span className="hidden sm:inline">Design, deploy, and monitor automated workflows for your AI agents.</span>
            </p>
          </div>
          <Button className="gap-2 w-full sm:w-auto">
            <Plus className="h-4 w-4" />
            <span className="sm:hidden">Create</span>
            <span className="hidden sm:inline">Create Workflow</span>
          </Button>
        </div>

        <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">
                <span className="sm:hidden">Total</span>
                <span className="hidden sm:inline">Total Workflows</span>
              </CardTitle>
              <Workflow className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold">24</div>
              <p className="text-xs text-muted-foreground">
                <span className="sm:hidden">+3</span>
                <span className="hidden sm:inline">+3 from last month</span>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">
                <span className="sm:hidden">Active</span>
                <span className="hidden sm:inline">Active Workflows</span>
              </CardTitle>
              <Play className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold">18</div>
              <p className="text-xs text-muted-foreground">
                <span className="sm:hidden">75%</span>
                <span className="hidden sm:inline">75% of total workflows</span>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">
                <span className="sm:hidden">Today</span>
                <span className="hidden sm:inline">Executions Today</span>
              </CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold">3,247</div>
              <p className="text-xs text-muted-foreground">
                <span className="sm:hidden">+12%</span>
                <span className="hidden sm:inline">+12% from yesterday</span>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">
                <span className="sm:hidden">Success</span>
                <span className="hidden sm:inline">Success Rate</span>
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold">96.8%</div>
              <p className="text-xs text-muted-foreground">
                <span className="sm:hidden">+0.3%</span>
                <span className="hidden sm:inline">+0.3% from last week</span>
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {workflows.map((workflow) => (
            <Card key={workflow.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Workflow className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                        <CardTitle className="text-base sm:text-lg truncate">{workflow.name}</CardTitle>
                        <Badge variant="outline" className={getStatusColor(workflow.status)}>
                          <div className="flex items-center gap-1">
                            {getStatusIcon(workflow.status)}
                            <span className="text-xs">{workflow.status}</span>
                          </div>
                        </Badge>
                      </div>
                      <CardDescription className="mt-1 text-xs sm:text-sm line-clamp-2">
                        {workflow.description}
                      </CardDescription>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 mt-2 text-xs sm:text-sm text-muted-foreground">
                        <span>Type: {workflow.type}</span>
                        <span className="hidden sm:inline">•</span>
                        <span>Steps: {workflow.steps}</span>
                        <span className="hidden sm:inline">•</span>
                        <span>Runs: {workflow.totalRuns.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="pt-0">
                <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-4 text-xs sm:text-sm">
                  <div className="space-y-1">
                    <span className="text-muted-foreground block">Trigger</span>
                    <div className="font-medium truncate">{workflow.trigger}</div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-muted-foreground block">Last Run</span>
                    <div className="font-medium">{workflow.lastRun}</div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-muted-foreground block">Success Rate</span>
                    <div className="font-medium">{workflow.successRate}</div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-muted-foreground block">Avg Duration</span>
                    <div className="font-medium">{workflow.avgDuration}</div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-4">
                  <Button variant="outline" size="sm" className="flex-1 text-xs sm:text-sm">
                    {workflow.status === 'active' || workflow.status === 'running' ? (
                      <>
                        <Pause className="h-3 w-3 mr-1" />
                        Pause
                      </>
                    ) : (
                      <>
                        <Play className="h-3 w-3 mr-1" />
                        Start
                      </>
                    )}
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 text-xs sm:text-sm">
                    <Settings className="h-3 w-3 mr-1" />
                    <span className="sm:hidden">Config</span>
                    <span className="hidden sm:inline">Configure</span>
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 text-xs sm:text-sm">
                    <Workflow className="h-3 w-3 mr-1" />
                    Designer
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
    </div>
  )
}