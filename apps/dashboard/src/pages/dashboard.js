import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@urnlabs/ui';
export const DashboardPage = () => {
    return (<div className="space-y-4 sm:space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Welcome to your URN Labs AI Agent platform overview.
        </p>
      </div>

      <div className="@container grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="@container">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm @sm:text-base font-medium">Active Agents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl @md:text-3xl font-bold">12</div>
            <p className="text-xs @sm:text-sm text-muted-foreground">+2 from last month</p>
          </CardContent>
        </Card>

        <Card className="@container">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm @sm:text-base font-medium">Running Workflows</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl @md:text-3xl font-bold">5</div>
            <p className="text-xs @sm:text-sm text-muted-foreground">3 completed today</p>
          </CardContent>
        </Card>

        <Card className="@container">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm @sm:text-base font-medium">Tasks Processed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl @md:text-3xl font-bold">1,234</div>
            <p className="text-xs @sm:text-sm text-muted-foreground">+15% from last week</p>
          </CardContent>
        </Card>

        <Card className="@container">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm @sm:text-base font-medium">Success Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl @md:text-3xl font-bold">98.5%</div>
            <p className="text-xs @sm:text-sm text-muted-foreground">+0.5% from yesterday</p>
          </CardContent>
        </Card>
      </div>

      <div className="@container grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-7">
        <Card className="@container lg:col-span-4">
          <CardHeader>
            <CardTitle className="text-lg @lg:text-xl">Recent Activity</CardTitle>
            <CardDescription className="text-sm @md:text-base">
              Your latest agent activities and workflow executions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 @md:space-y-4">
              <div className="flex items-center gap-3 @md:gap-4">
                <div className="w-2 h-2 @md:w-3 @md:h-3 bg-green-500 rounded-full flex-shrink-0"></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm @md:text-base font-medium truncate">Data Analysis Agent completed</p>
                  <p className="text-xs @md:text-sm text-muted-foreground">2 minutes ago</p>
                </div>
              </div>
              <div className="flex items-center gap-3 @md:gap-4">
                <div className="w-2 h-2 @md:w-3 @md:h-3 bg-blue-500 rounded-full flex-shrink-0"></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm @md:text-base font-medium truncate">Customer Service Workflow started</p>
                  <p className="text-xs @md:text-sm text-muted-foreground">5 minutes ago</p>
                </div>
              </div>
              <div className="flex items-center gap-3 @md:gap-4">
                <div className="w-2 h-2 @md:w-3 @md:h-3 bg-yellow-500 rounded-full flex-shrink-0"></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm @md:text-base font-medium truncate">Report Generation pending review</p>
                  <p className="text-xs @md:text-sm text-muted-foreground">10 minutes ago</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="@container lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-lg @lg:text-xl">Performance Metrics</CardTitle>
            <CardDescription className="text-sm @md:text-base">
              Key performance indicators for your AI operations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 @md:space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm @md:text-base">Response Time</span>
                <span className="text-sm @md:text-base font-medium">1.2s avg</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm @md:text-base">Error Rate</span>
                <span className="text-sm @md:text-base font-medium">0.5%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm @md:text-base">Uptime</span>
                <span className="text-sm @md:text-base font-medium">99.9%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm @md:text-base">Active Users</span>
                <span className="text-sm @md:text-base font-medium">24</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>);
};
//# sourceMappingURL=dashboard.js.map