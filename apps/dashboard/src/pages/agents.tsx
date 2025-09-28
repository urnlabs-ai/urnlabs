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
import { Plus, Bot, Play, Pause, Settings, MoreHorizontal } from 'lucide-react'

export const AgentsPage: React.FC = () => {
  const agents = [
    {
      id: 1,
      name: 'Data Analysis Agent',
      description: 'Analyzes customer data and generates insights',
      status: 'active',
      type: 'Data Processor',
      lastRun: '2 minutes ago',
      successRate: '98.5%',
    },
    {
      id: 2,
      name: 'Customer Service Bot',
      description: 'Handles customer inquiries and support tickets',
      status: 'active',
      type: 'Support',
      lastRun: '5 minutes ago',
      successRate: '97.2%',
    },
    {
      id: 3,
      name: 'Content Generator',
      description: 'Creates marketing content and blog posts',
      status: 'paused',
      type: 'Content',
      lastRun: '1 hour ago',
      successRate: '95.8%',
    },
    {
      id: 4,
      name: 'Email Automation',
      description: 'Manages email campaigns and responses',
      status: 'active',
      type: 'Marketing',
      lastRun: '10 minutes ago',
      successRate: '99.1%',
    },
  ]

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'paused':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'error':
        return 'bg-red-100 text-red-800 border-red-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div className="space-y-1 sm:space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">AI Agents</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage and monitor your artificial intelligence agents.
          </p>
        </div>
        <Button className="gap-2 w-full sm:w-auto">
          <Plus className="h-4 w-4" />
          <span className="sm:hidden">Create</span>
          <span className="hidden sm:inline">Create Agent</span>
        </Button>
      </div>

      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <Card key={agent.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base sm:text-lg truncate">{agent.name}</CardTitle>
                      <Badge variant="outline" className={getStatusColor(agent.status)}>
                        {agent.status}
                      </Badge>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </div>
                <CardDescription className="text-xs sm:text-sm">{agent.description}</CardDescription>
              </CardHeader>

              <CardContent className="space-y-3 sm:space-y-4">
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <span className="text-muted-foreground">Type</span>
                  <span className="font-medium truncate ml-2">{agent.type}</span>
                </div>

                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <span className="text-muted-foreground">Last Run</span>
                  <span className="font-medium truncate ml-2">{agent.lastRun}</span>
                </div>

                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <span className="text-muted-foreground">Success Rate</span>
                  <span className="font-medium">{agent.successRate}</span>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                  <Button variant="outline" size="sm" className="flex-1 text-xs sm:text-sm">
                    {agent.status === 'active' ? (
                      <>
                        <Pause className="h-3 w-3 mr-1" />
                        <span className="sm:hidden">Pause</span>
                        <span className="hidden sm:inline">Pause</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-3 w-3 mr-1" />
                        <span className="sm:hidden">Start</span>
                        <span className="hidden sm:inline">Start</span>
                      </>
                    )}
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 text-xs sm:text-sm">
                    <Settings className="h-3 w-3 mr-1" />
                    <span className="sm:hidden">Config</span>
                    <span className="hidden sm:inline">Configure</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl">Agent Performance Overview</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Monitor the performance of all your AI agents.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
            <div className="text-center p-3 sm:p-4 bg-accent/5 rounded-lg">
              <div className="text-xl sm:text-2xl font-bold text-green-600">12</div>
              <div className="text-xs sm:text-sm text-muted-foreground">Active Agents</div>
            </div>
            <div className="text-center p-3 sm:p-4 bg-accent/5 rounded-lg">
              <div className="text-xl sm:text-2xl font-bold text-blue-600">1,234</div>
              <div className="text-xs sm:text-sm text-muted-foreground">
                <span className="sm:hidden">Tasks</span>
                <span className="hidden sm:inline">Tasks Today</span>
              </div>
            </div>
            <div className="text-center p-3 sm:p-4 bg-accent/5 rounded-lg">
              <div className="text-xl sm:text-2xl font-bold text-purple-600">98.5%</div>
              <div className="text-xs sm:text-sm text-muted-foreground">Success Rate</div>
            </div>
            <div className="text-center p-3 sm:p-4 bg-accent/5 rounded-lg">
              <div className="text-xl sm:text-2xl font-bold text-orange-600">1.2s</div>
              <div className="text-xs sm:text-sm text-muted-foreground">
                <span className="sm:hidden">Response</span>
                <span className="hidden sm:inline">Avg Response</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}