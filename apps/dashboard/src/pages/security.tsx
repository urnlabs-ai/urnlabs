import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button, Badge, Switch } from '@urnlabs/ui'
import { Shield, Lock, Key, AlertTriangle, CheckCircle, Users, Eye, RefreshCw, Download, Settings } from 'lucide-react'

export const SecurityPage: React.FC = () => {
  const [securitySettings, setSecuritySettings] = React.useState({
    twoFactorAuth: true,
    ssoEnabled: true,
    apiKeyRotation: true,
    auditLogging: true,
    ipWhitelist: false,
    sessionTimeout: true,
    passwordPolicy: true,
    encryptionAtRest: true,
  })

  const securityAlerts = [
    {
      id: 1,
      type: 'warning',
      title: 'Unusual Login Activity',
      description: 'Multiple failed login attempts from IP 192.168.1.100',
      timestamp: '5 minutes ago',
      severity: 'medium',
      status: 'open',
    },
    {
      id: 2,
      type: 'info',
      title: 'API Key Rotated',
      description: 'Automatic API key rotation completed successfully',
      timestamp: '1 hour ago',
      severity: 'low',
      status: 'resolved',
    },
    {
      id: 3,
      type: 'error',
      title: 'Suspicious Data Access',
      description: 'Unusual data access pattern detected for user john@urnlabs.ai',
      timestamp: '3 hours ago',
      severity: 'high',
      status: 'investigating',
    },
    {
      id: 4,
      type: 'success',
      title: 'Security Scan Completed',
      description: 'Weekly security scan completed with no vulnerabilities found',
      timestamp: '1 day ago',
      severity: 'low',
      status: 'resolved',
    },
  ]

  const complianceStatus = [
    {
      framework: 'SOC 2 Type II',
      status: 'compliant',
      lastAudit: '2024-01-15',
      nextAudit: '2024-07-15',
      coverage: '98%',
    },
    {
      framework: 'GDPR',
      status: 'compliant',
      lastAudit: '2024-02-01',
      nextAudit: '2024-08-01',
      coverage: '100%',
    },
    {
      framework: 'HIPAA',
      status: 'in-progress',
      lastAudit: '2023-12-01',
      nextAudit: '2024-06-01',
      coverage: '85%',
    },
    {
      framework: 'ISO 27001',
      status: 'pending',
      lastAudit: 'N/A',
      nextAudit: '2024-09-01',
      coverage: '0%',
    },
  ]

  const accessLogs = [
    {
      id: 1,
      user: 'sarah@urnlabs.ai',
      action: 'Login',
      resource: 'Dashboard',
      ip: '192.168.1.50',
      timestamp: '2024-01-20 14:30:15',
      status: 'success',
    },
    {
      id: 2,
      user: 'mike@urnlabs.ai',
      action: 'API Call',
      resource: '/api/agents/create',
      ip: '10.0.0.25',
      timestamp: '2024-01-20 14:28:42',
      status: 'success',
    },
    {
      id: 3,
      user: 'unknown',
      action: 'Failed Login',
      resource: 'Login Page',
      ip: '203.0.113.1',
      timestamp: '2024-01-20 14:25:33',
      status: 'failed',
    },
    {
      id: 4,
      user: 'alex@urnlabs.ai',
      action: 'Data Export',
      resource: 'Customer Database',
      ip: '192.168.1.75',
      timestamp: '2024-01-20 14:20:18',
      status: 'success',
    },
  ]

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-red-500" />
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'info':
        return <Shield className="h-4 w-4 text-blue-500" />
      default:
        return <Shield className="h-4 w-4" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'compliant':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'in-progress':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'pending':
        return 'bg-gray-100 text-gray-800 border-gray-200'
      case 'non-compliant':
        return 'bg-red-100 text-red-800 border-red-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'low':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getActionStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'text-green-600'
      case 'failed':
        return 'text-red-600'
      case 'pending':
        return 'text-yellow-600'
      default:
        return 'text-gray-600'
    }
  }

  const updateSetting = (key: string, value: boolean) => {
    setSecuritySettings(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Security & Compliance</h1>
          <p className="text-muted-foreground">
            Monitor security status, manage access controls, and maintain compliance.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export Report
          </Button>
          <Button className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Run Security Scan
          </Button>
        </div>
      </div>

      {/* Security Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Security Score</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">98.5%</div>
            <p className="text-xs text-muted-foreground">+2.1% from last month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Threats</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">2</div>
            <p className="text-xs text-muted-foreground">Under investigation</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed Logins</CardTitle>
            <Lock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">47</div>
            <p className="text-xs text-muted-foreground">Last 24 hours</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">API Requests</CardTitle>
            <Key className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">12.4K</div>
            <p className="text-xs text-muted-foreground">Today</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Security Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Security Configuration</CardTitle>
            <CardDescription>
              Manage security features and access controls.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Two-Factor Authentication</div>
                <div className="text-sm text-muted-foreground">
                  Require 2FA for all user accounts
                </div>
              </div>
              <Switch
                checked={securitySettings.twoFactorAuth}
                onCheckedChange={(checked) => updateSetting('twoFactorAuth', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Single Sign-On (SSO)</div>
                <div className="text-sm text-muted-foreground">
                  Enable SAML/OAuth integration
                </div>
              </div>
              <Switch
                checked={securitySettings.ssoEnabled}
                onCheckedChange={(checked) => updateSetting('ssoEnabled', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">API Key Rotation</div>
                <div className="text-sm text-muted-foreground">
                  Automatically rotate API keys
                </div>
              </div>
              <Switch
                checked={securitySettings.apiKeyRotation}
                onCheckedChange={(checked) => updateSetting('apiKeyRotation', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Audit Logging</div>
                <div className="text-sm text-muted-foreground">
                  Log all user actions and API calls
                </div>
              </div>
              <Switch
                checked={securitySettings.auditLogging}
                onCheckedChange={(checked) => updateSetting('auditLogging', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">IP Whitelist</div>
                <div className="text-sm text-muted-foreground">
                  Restrict access to approved IP ranges
                </div>
              </div>
              <Switch
                checked={securitySettings.ipWhitelist}
                onCheckedChange={(checked) => updateSetting('ipWhitelist', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Session Timeout</div>
                <div className="text-sm text-muted-foreground">
                  Auto-logout inactive sessions
                </div>
              </div>
              <Switch
                checked={securitySettings.sessionTimeout}
                onCheckedChange={(checked) => updateSetting('sessionTimeout', checked)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Security Alerts */}
        <Card>
          <CardHeader>
            <CardTitle>Security Alerts</CardTitle>
            <CardDescription>
              Recent security events and notifications.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {securityAlerts.map((alert) => (
                <div key={alert.id} className="flex items-start gap-3 p-3 border rounded-lg">
                  {getAlertIcon(alert.type)}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-sm">{alert.title}</h4>
                      <Badge variant="outline" className={getSeverityColor(alert.severity)}>
                        {alert.severity}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {alert.description}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-muted-foreground">
                        {alert.timestamp}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {alert.status}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Compliance Status */}
        <Card>
          <CardHeader>
            <CardTitle>Compliance Status</CardTitle>
            <CardDescription>
              Track compliance with security frameworks and regulations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {complianceStatus.map((compliance) => (
                <div key={compliance.framework} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{compliance.framework}</h4>
                      <Badge variant="outline" className={getStatusColor(compliance.status)}>
                        {compliance.status}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Coverage: {compliance.coverage}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Last audit: {compliance.lastAudit} • Next: {compliance.nextAudit}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Access Logs */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Access Logs</CardTitle>
                <CardDescription>
                  Recent user activity and system access.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" className="gap-2">
                <Eye className="h-3 w-3" />
                View All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {accessLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium">{log.user}</div>
                    <div className="text-muted-foreground">
                      {log.action} • {log.resource}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {log.ip} • {log.timestamp}
                    </div>
                  </div>
                  <div className={`font-medium ${getActionStatusColor(log.status)}`}>
                    {log.status}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Security Management</CardTitle>
          <CardDescription>
            Common security administration tasks and tools.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Button variant="outline" className="flex-col h-auto py-4 gap-2">
              <Users className="h-6 w-6" />
              <span>Manage Users</span>
            </Button>
            <Button variant="outline" className="flex-col h-auto py-4 gap-2">
              <Key className="h-6 w-6" />
              <span>API Keys</span>
            </Button>
            <Button variant="outline" className="flex-col h-auto py-4 gap-2">
              <Settings className="h-6 w-6" />
              <span>Security Policy</span>
            </Button>
            <Button variant="outline" className="flex-col h-auto py-4 gap-2">
              <Download className="h-6 w-6" />
              <span>Audit Report</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}