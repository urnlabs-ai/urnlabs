import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button, Input, Select, Switch, Tabs } from '@urnlabs/ui';
import { Save, User, Bell, Shield, Database, Trash2 } from 'lucide-react';
export const SettingsPage = () => {
    const [settings, setSettings] = React.useState({
        profile: {
            name: 'John Doe',
            email: 'john@urnlabs.ai',
            role: 'Administrator',
            timezone: 'UTC-5',
            language: 'English',
        },
        notifications: {
            emailNotifications: true,
            slackNotifications: true,
            smsNotifications: false,
            agentAlerts: true,
            workflowUpdates: true,
            securityAlerts: true,
        },
        security: {
            twoFactorAuth: true,
            sessionTimeout: '8',
            apiKeyRotation: true,
            auditLogging: true,
        },
        system: {
            autoBackup: true,
            backupFrequency: 'daily',
            dataRetention: '90',
            maintenanceMode: false,
        },
        appearance: {
            theme: 'dark',
            language: 'en',
            dateFormat: 'MM/DD/YYYY',
            timeFormat: '12',
        },
    });
    const handleSave = () => {
        console.log('Saving settings:', settings);
        // Implement save functionality
    };
    const updateSetting = (section, key, value) => {
        setSettings(prev => ({
            ...prev,
            [section]: {
                ...prev[section],
                [key]: value,
            },
        }));
    };
    return (<div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">
            Manage your account preferences and system configuration.
          </p>
        </div>
        <Button onClick={handleSave} className="gap-2">
          <Save className="h-4 w-4"/>
          Save Changes
        </Button>
      </div>

      <Tabs defaultValue="profile" className="space-y-4">
        <div className="flex space-x-1 rounded-lg bg-muted p-1">
          <button className="flex-1 rounded-md bg-background px-3 py-2 text-sm font-medium shadow-sm">
            Profile
          </button>
          <button className="flex-1 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground">
            Notifications
          </button>
          <button className="flex-1 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground">
            Security
          </button>
          <button className="flex-1 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground">
            System
          </button>
          <button className="flex-1 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground">
            Appearance
          </button>
        </div>

        {/* Profile Settings */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <User className="h-5 w-5"/>
                <CardTitle>Profile Information</CardTitle>
              </div>
              <CardDescription>
                Update your personal information and account details.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Full Name</label>
                  <Input value={settings.profile.name} onChange={(e) => updateSetting('profile', 'name', e.target.value)}/>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email Address</label>
                  <Input type="email" value={settings.profile.email} onChange={(e) => updateSetting('profile', 'email', e.target.value)}/>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Role</label>
                  <Select value={settings.profile.role} onValueChange={(value) => updateSetting('profile', 'role', value)}>
                    <option value="Administrator">Administrator</option>
                    <option value="Manager">Manager</option>
                    <option value="User">User</option>
                    <option value="Viewer">Viewer</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Timezone</label>
                  <Select value={settings.profile.timezone} onValueChange={(value) => updateSetting('profile', 'timezone', value)}>
                    <option value="UTC-8">Pacific Time (UTC-8)</option>
                    <option value="UTC-7">Mountain Time (UTC-7)</option>
                    <option value="UTC-6">Central Time (UTC-6)</option>
                    <option value="UTC-5">Eastern Time (UTC-5)</option>
                    <option value="UTC+0">UTC</option>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5"/>
                <CardTitle>Notification Preferences</CardTitle>
              </div>
              <CardDescription>
                Configure how you want to receive notifications and alerts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Email Notifications</div>
                    <div className="text-sm text-muted-foreground">
                      Receive updates via email
                    </div>
                  </div>
                  <Switch checked={settings.notifications.emailNotifications} onCheckedChange={(checked) => updateSetting('notifications', 'emailNotifications', checked)}/>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Slack Notifications</div>
                    <div className="text-sm text-muted-foreground">
                      Send alerts to Slack channels
                    </div>
                  </div>
                  <Switch checked={settings.notifications.slackNotifications} onCheckedChange={(checked) => updateSetting('notifications', 'slackNotifications', checked)}/>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Agent Alerts</div>
                    <div className="text-sm text-muted-foreground">
                      Notifications when agents need attention
                    </div>
                  </div>
                  <Switch checked={settings.notifications.agentAlerts} onCheckedChange={(checked) => updateSetting('notifications', 'agentAlerts', checked)}/>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Workflow Updates</div>
                    <div className="text-sm text-muted-foreground">
                      Status updates for workflow executions
                    </div>
                  </div>
                  <Switch checked={settings.notifications.workflowUpdates} onCheckedChange={(checked) => updateSetting('notifications', 'workflowUpdates', checked)}/>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Security Alerts</div>
                    <div className="text-sm text-muted-foreground">
                      Critical security notifications
                    </div>
                  </div>
                  <Switch checked={settings.notifications.securityAlerts} onCheckedChange={(checked) => updateSetting('notifications', 'securityAlerts', checked)}/>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5"/>
                <CardTitle>Security Settings</CardTitle>
              </div>
              <CardDescription>
                Manage security features and access controls.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Two-Factor Authentication</div>
                    <div className="text-sm text-muted-foreground">
                      Add an extra layer of security to your account
                    </div>
                  </div>
                  <Switch checked={settings.security.twoFactorAuth} onCheckedChange={(checked) => updateSetting('security', 'twoFactorAuth', checked)}/>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Session Timeout (hours)</label>
                    <Input type="number" value={settings.security.sessionTimeout} onChange={(e) => updateSetting('security', 'sessionTimeout', e.target.value)}/>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Automatic API Key Rotation</div>
                    <div className="text-sm text-muted-foreground">
                      Rotate API keys periodically for enhanced security
                    </div>
                  </div>
                  <Switch checked={settings.security.apiKeyRotation} onCheckedChange={(checked) => updateSetting('security', 'apiKeyRotation', checked)}/>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Audit Logging</div>
                    <div className="text-sm text-muted-foreground">
                      Log all user actions for compliance
                    </div>
                  </div>
                  <Switch checked={settings.security.auditLogging} onCheckedChange={(checked) => updateSetting('security', 'auditLogging', checked)}/>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5"/>
                <CardTitle>System Configuration</CardTitle>
              </div>
              <CardDescription>
                Configure system-wide settings and maintenance options.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Automatic Backups</div>
                    <div className="text-sm text-muted-foreground">
                      Automatically backup system data
                    </div>
                  </div>
                  <Switch checked={settings.system.autoBackup} onCheckedChange={(checked) => updateSetting('system', 'autoBackup', checked)}/>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Backup Frequency</label>
                    <Select value={settings.system.backupFrequency} onValueChange={(value) => updateSetting('system', 'backupFrequency', value)}>
                      <option value="hourly">Hourly</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Data Retention (days)</label>
                    <Input type="number" value={settings.system.dataRetention} onChange={(e) => updateSetting('system', 'dataRetention', e.target.value)}/>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Maintenance Mode</div>
                    <div className="text-sm text-muted-foreground">
                      Temporarily disable system access for maintenance
                    </div>
                  </div>
                  <Switch checked={settings.system.maintenanceMode} onCheckedChange={(checked) => updateSetting('system', 'maintenanceMode', checked)}/>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-destructive"/>
                <CardTitle className="text-destructive">Danger Zone</CardTitle>
              </div>
              <CardDescription>
                Irreversible actions that will permanently affect your account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <div className="font-medium">Delete Account</div>
                    <div className="text-sm text-muted-foreground">
                      Permanently delete your account and all associated data
                    </div>
                  </div>
                  <Button variant="destructive" size="sm">
                    Delete Account
                  </Button>
                </div>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <div className="font-medium">Reset All Settings</div>
                    <div className="text-sm text-muted-foreground">
                      Reset all settings to their default values
                    </div>
                  </div>
                  <Button variant="outline" size="sm">
                    Reset Settings
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </Tabs>
    </div>);
};
//# sourceMappingURL=settings.js.map