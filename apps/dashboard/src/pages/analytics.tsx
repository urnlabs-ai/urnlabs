import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button } from '@urnlabs/ui'
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Users,
  Zap,
  Clock,
  DollarSign,
  Filter,
  Bot,
  Activity,
  Target
} from 'lucide-react'
import {
  LineChart,
  BarChart,
  PieChart,
  AreaChart,
  DonutChart,
  MetricCard,
  RevenueCard,
  UsersCard,
  ActivityCard,
  PerformanceCard,
  TimeCard,
  ConversionCard
} from '../components/charts'

export const AnalyticsPage: React.FC = () => {
  // Sample data for charts
  const performanceData = [
    { name: 'Jan', tasks: 4000, success: 3600, errors: 400 },
    { name: 'Feb', tasks: 3000, success: 2700, errors: 300 },
    { name: 'Mar', tasks: 5000, success: 4500, errors: 500 },
    { name: 'Apr', tasks: 4500, success: 4200, errors: 300 },
    { name: 'May', tasks: 6000, success: 5700, errors: 300 },
    { name: 'Jun', tasks: 5500, success: 5200, errors: 300 },
    { name: 'Jul', tasks: 7000, success: 6650, errors: 350 }
  ]

  const agentUsageData = [
    { name: 'Data Analysis', value: 35, color: '#0088FE' },
    { name: 'Customer Service', value: 25, color: '#00C49F' },
    { name: 'Content Generation', value: 20, color: '#FFBB28' },
    { name: 'Email Automation', value: 15, color: '#FF8042' },
    { name: 'Security Monitoring', value: 5, color: '#8884D8' }
  ]

  const costData = [
    { name: 'Compute', value: 2847, color: '#8884D8' },
    { name: 'API Calls', value: 1234, color: '#82CA9D' },
    { name: 'Storage', value: 456, color: '#FFC658' },
    { name: 'Data Transfer', value: 123, color: '#FF7C7C' }
  ]

  const weeklyActivityData = [
    { name: 'Mon', value: 1200 },
    { name: 'Tue', value: 1800 },
    { name: 'Wed', value: 1600 },
    { name: 'Thu', value: 2200 },
    { name: 'Fri', value: 2000 },
    { name: 'Sat', value: 800 },
    { name: 'Sun', value: 600 }
  ]

  const recentActivities = [
    {
      id: 1,
      action: 'New workflow deployed',
      user: 'Sarah Johnson',
      time: '2 minutes ago',
      status: 'success',
    },
    {
      id: 2,
      action: 'Agent performance optimized',
      user: 'Mike Chen',
      time: '15 minutes ago',
      status: 'success',
    },
    {
      id: 3,
      action: 'Security scan completed',
      user: 'System',
      time: '1 hour ago',
      status: 'info',
    },
    {
      id: 4,
      action: 'Data backup initiated',
      user: 'Alex Rivera',
      time: '2 hours ago',
      status: 'warning',
    },
    {
      id: 5,
      action: 'API rate limit exceeded',
      user: 'System',
      time: '3 hours ago',
      status: 'error',
    },
  ]

  const topAgents = [
    {
      name: 'Data Analysis Agent',
      tasks: 1247,
      successRate: 98.5,
      performance: 'excellent',
    },
    {
      name: 'Customer Service Bot',
      tasks: 2156,
      successRate: 97.2,
      performance: 'excellent',
    },
    {
      name: 'Content Generator',
      tasks: 894,
      successRate: 95.8,
      performance: 'good',
    },
    {
      name: 'Email Automation',
      tasks: 3421,
      successRate: 99.1,
      performance: 'excellent',
    },
    {
      name: 'Security Monitor',
      tasks: 567,
      successRate: 100,
      performance: 'excellent',
    },
  ]

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-green-100 text-green-800'
      case 'warning':
        return 'bg-yellow-100 text-yellow-800'
      case 'error':
        return 'bg-red-100 text-red-800'
      case 'info':
        return 'bg-blue-100 text-blue-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getPerformanceColor = (performance: string) => {
    switch (performance) {
      case 'excellent':
        return 'text-green-600'
      case 'good':
        return 'text-blue-600'
      case 'fair':
        return 'text-yellow-600'
      case 'poor':
        return 'text-red-600'
      default:
        return 'text-gray-600'
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">
            Monitor performance, track metrics, and analyze AI agent efficiency.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <Filter className="h-4 w-4" />
            Filter
          </Button>
          <Button className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <RevenueCard
          title="Total Revenue"
          value={45231}
          change={{ value: 20.1, period: 'last month', type: 'increase' }}
          trend={{ data: [32000, 35000, 38000, 42000, 45231], color: '#10b981' }}
        />
        <UsersCard
          title="Active Users"
          value={2350}
          change={{ value: 180.1, period: 'last month', type: 'increase' }}
          trend={{ data: [1200, 1400, 1800, 2100, 2350], color: '#3b82f6' }}
        />
        <ActivityCard
          title="Tasks Completed"
          value={12234}
          change={{ value: 19, period: 'last week', type: 'increase' }}
          trend={{ data: [8000, 9200, 10500, 11200, 12234], color: '#f59e0b' }}
        />
        <TimeCard
          title="Avg Response Time"
          value={1.2}
          change={{ value: 5.3, period: 'last week', type: 'decrease' }}
          trend={{ data: [2.1, 1.8, 1.5, 1.3, 1.2], color: '#ef4444' }}
          status="success"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-7">
        {/* Performance Chart */}
        <div className="col-span-4">
          <LineChart
            title="Performance Overview"
            description="Agent performance and task completion trends over the last 7 months"
            data={performanceData}
            lines={[
              { dataKey: 'tasks', color: '#3b82f6', name: 'Total Tasks' },
              { dataKey: 'success', color: '#10b981', name: 'Successful' },
              { dataKey: 'errors', color: '#ef4444', name: 'Errors' }
            ]}
            height={350}
            formatYAxisLabel={(value) => {
              if (value >= 1000) return `${(value / 1000).toFixed(1)}K`
              return value.toString()
            }}
          />
        </div>

        {/* Top Performing Agents */}
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Top Performing Agents</CardTitle>
            <CardDescription>
              Best performing AI agents by task completion and success rate.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topAgents.map((agent, index) => (
                <div key={agent.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                      {index + 1}
                    </div>
                    <div>
                      <div className="font-medium text-sm">{agent.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {agent.tasks.toLocaleString()} tasks
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">{agent.successRate}%</div>
                    <div className={`text-xs capitalize ${getPerformanceColor(agent.performance)}`}>
                      {agent.performance}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Agent Usage Distribution */}
        <PieChart
          title="Agent Usage Distribution"
          description="Distribution of tasks across different AI agents"
          data={agentUsageData}
          height={300}
          showValues={true}
        />

        {/* Cost Breakdown */}
        <DonutChart
          title="Cost Breakdown"
          description="Monthly cost distribution by resource type"
          data={costData}
          centerLabel="Total"
          centerValue="$4,660"
          height={300}
          formatTooltip={(value, name) => [`$${value.toLocaleString()}`, name]}
        />

        {/* Weekly Activity */}
        <BarChart
          title="Weekly Activity"
          description="Task activity distribution throughout the week"
          data={weeklyActivityData}
          bars={[{ dataKey: 'value', color: '#6366f1', name: 'Tasks', radius: [4, 4, 0, 0] }]}
          height={300}
          showLegend={false}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Recent Activities */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activities</CardTitle>
            <CardDescription>
              Latest actions and events across your AI agent platform.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivities.map((activity) => (
                <div key={activity.id} className="flex items-center gap-4">
                  <div className={`w-2 h-2 rounded-full ${getStatusColor(activity.status).replace('text-', 'bg-').split(' ')[0]}`}></div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{activity.action}</p>
                    <p className="text-xs text-muted-foreground">
                      by {activity.user} • {activity.time}
                    </p>
                  </div>
                  <div className={`px-2 py-1 rounded-full text-xs ${getStatusColor(activity.status)}`}>
                    {activity.status}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Performance Insights */}
        <Card>
          <CardHeader>
            <CardTitle>Performance Insights</CardTitle>
            <CardDescription>
              Key insights and recommendations for optimization.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-green-500 mt-2"></div>
                <div>
                  <p className="text-sm font-medium">High Success Rate</p>
                  <p className="text-xs text-muted-foreground">
                    Your agents maintain a 97.8% average success rate, exceeding industry standards.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-blue-500 mt-2"></div>
                <div>
                  <p className="text-sm font-medium">Response Time Optimization</p>
                  <p className="text-xs text-muted-foreground">
                    Response times improved by 15% this month through caching optimizations.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-yellow-500 mt-2"></div>
                <div>
                  <p className="text-sm font-medium">Resource Usage Alert</p>
                  <p className="text-xs text-muted-foreground">
                    Consider scaling up compute resources during peak hours (2-4 PM).
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-purple-500 mt-2"></div>
                <div>
                  <p className="text-sm font-medium">Cost Savings</p>
                  <p className="text-xs text-muted-foreground">
                    Automation has saved $8,432 in operational costs this month.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}