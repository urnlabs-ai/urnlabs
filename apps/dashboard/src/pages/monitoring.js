import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button, Badge } from '@urnlabs/ui';
import { AlertTriangle, CheckCircle, Clock, Cpu, HardDrive, MemoryStick, Network, RefreshCw, Server, XCircle, TrendingUp, TrendingDown, Eye, Settings, AlertCircle, Shield, Users, Bot } from 'lucide-react';
import { AreaChart, MetricCard } from '../components/charts';
export const MonitoringPage = () => {
    const [lastUpdated, setLastUpdated] = useState(new Date());
    const [autoRefresh, setAutoRefresh] = useState(true);
    // Real-time data simulation
    const [systemMetrics, setSystemMetrics] = useState([
        {
            id: 'cpu',
            name: 'CPU Usage',
            value: 67,
            unit: '%',
            status: 'healthy',
            trend: 'stable',
            lastUpdated: new Date()
        },
        {
            id: 'memory',
            name: 'Memory Usage',
            value: 82,
            unit: '%',
            status: 'warning',
            trend: 'up',
            lastUpdated: new Date()
        },
        {
            id: 'disk',
            name: 'Disk Usage',
            value: 45,
            unit: '%',
            status: 'healthy',
            trend: 'stable',
            lastUpdated: new Date()
        },
        {
            id: 'network',
            name: 'Network I/O',
            value: 234,
            unit: 'Mbps',
            status: 'healthy',
            trend: 'down',
            lastUpdated: new Date()
        }
    ]);
    const [services, setServices] = useState([
        {
            id: 'api-gateway',
            name: 'API Gateway',
            status: 'online',
            uptime: 99.9,
            responseTime: 120,
            lastChecked: new Date()
        },
        {
            id: 'agents-service',
            name: 'AI Agents Service',
            status: 'online',
            uptime: 99.7,
            responseTime: 85,
            lastChecked: new Date()
        },
        {
            id: 'database',
            name: 'Database Cluster',
            status: 'online',
            uptime: 100,
            responseTime: 45,
            lastChecked: new Date()
        },
        {
            id: 'workflow-engine',
            name: 'Workflow Engine',
            status: 'degraded',
            uptime: 97.2,
            responseTime: 340,
            lastChecked: new Date()
        },
        {
            id: 'monitoring',
            name: 'Monitoring Service',
            status: 'online',
            uptime: 99.8,
            responseTime: 65,
            lastChecked: new Date()
        },
        {
            id: 'auth-service',
            name: 'Authentication',
            status: 'online',
            uptime: 99.9,
            responseTime: 95,
            lastChecked: new Date()
        }
    ]);
    const [alerts, setAlerts] = useState([
        {
            id: '1',
            type: 'warning',
            service: 'Workflow Engine',
            message: 'High response time detected (>300ms)',
            timestamp: new Date(Date.now() - 5 * 60 * 1000),
            acknowledged: false
        },
        {
            id: '2',
            type: 'warning',
            service: 'Memory',
            message: 'Memory usage above 80% threshold',
            timestamp: new Date(Date.now() - 10 * 60 * 1000),
            acknowledged: false
        },
        {
            id: '3',
            type: 'info',
            service: 'Database',
            message: 'Maintenance window scheduled for tonight',
            timestamp: new Date(Date.now() - 30 * 60 * 1000),
            acknowledged: true
        },
        {
            id: '4',
            type: 'error',
            service: 'API Gateway',
            message: 'Rate limit exceeded for client 192.168.1.100',
            timestamp: new Date(Date.now() - 45 * 60 * 1000),
            acknowledged: true
        }
    ]);
    // Real-time performance data
    const [performanceData, setPerformanceData] = useState([
        { time: '00:00', cpu: 45, memory: 67, network: 234 },
        { time: '00:05', cpu: 52, memory: 71, network: 198 },
        { time: '00:10', cpu: 48, memory: 74, network: 267 },
        { time: '00:15', cpu: 61, memory: 78, network: 189 },
        { time: '00:20', cpu: 67, memory: 82, network: 234 }
    ]);
    // Simulate real-time updates
    useEffect(() => {
        if (!autoRefresh)
            return;
        const interval = setInterval(() => {
            // Update system metrics
            setSystemMetrics(prev => prev.map(metric => ({
                ...metric,
                value: Math.max(0, Math.min(100, metric.value + (Math.random() - 0.5) * 10)),
                lastUpdated: new Date()
            })));
            // Update performance data
            setPerformanceData(prev => {
                const newTime = new Date().toLocaleTimeString('en-US', {
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit'
                });
                const newData = [...prev.slice(-4), {
                        time: newTime,
                        cpu: Math.max(0, Math.min(100, prev[prev.length - 1].cpu + (Math.random() - 0.5) * 10)),
                        memory: Math.max(0, Math.min(100, prev[prev.length - 1].memory + (Math.random() - 0.5) * 5)),
                        network: Math.max(0, Math.min(500, prev[prev.length - 1].network + (Math.random() - 0.5) * 50))
                    }];
                return newData;
            });
            setLastUpdated(new Date());
        }, 5000);
        return () => clearInterval(interval);
    }, [autoRefresh]);
    const getStatusIcon = (status) => {
        switch (status) {
            case 'online':
            case 'healthy':
                return <CheckCircle className="h-4 w-4 text-green-500"/>;
            case 'warning':
            case 'degraded':
                return <AlertTriangle className="h-4 w-4 text-yellow-500"/>;
            case 'critical':
            case 'offline':
                return <XCircle className="h-4 w-4 text-red-500"/>;
            case 'maintenance':
                return <Settings className="h-4 w-4 text-blue-500"/>;
            default:
                return <Clock className="h-4 w-4 text-gray-500"/>;
        }
    };
    const getStatusColor = (status) => {
        switch (status) {
            case 'online':
            case 'healthy':
                return 'bg-green-100 text-green-800';
            case 'warning':
            case 'degraded':
                return 'bg-yellow-100 text-yellow-800';
            case 'critical':
            case 'offline':
                return 'bg-red-100 text-red-800';
            case 'maintenance':
                return 'bg-blue-100 text-blue-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };
    const getAlertIcon = (type) => {
        switch (type) {
            case 'error':
                return <XCircle className="h-4 w-4 text-red-500"/>;
            case 'warning':
                return <AlertTriangle className="h-4 w-4 text-yellow-500"/>;
            case 'info':
                return <AlertCircle className="h-4 w-4 text-blue-500"/>;
            default:
                return <AlertCircle className="h-4 w-4 text-gray-500"/>;
        }
    };
    const getTrendIcon = (trend) => {
        switch (trend) {
            case 'up':
                return <TrendingUp className="h-3 w-3 text-red-500"/>;
            case 'down':
                return <TrendingDown className="h-3 w-3 text-green-500"/>;
            default:
                return null;
        }
    };
    const acknowledgeAlert = (alertId) => {
        setAlerts(prev => prev.map(alert => alert.id === alertId ? { ...alert, acknowledged: true } : alert));
    };
    const formatUptime = (uptime) => {
        return `${uptime.toFixed(1)}%`;
    };
    const formatTime = (date) => {
        return date.toLocaleTimeString();
    };
    const unacknowledgedAlerts = alerts.filter(alert => !alert.acknowledged);
    return (<div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Real-time Monitoring</h1>
          <p className="text-muted-foreground">
            Monitor system health, performance metrics, and service status in real-time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-muted-foreground">
            Last updated: {formatTime(lastUpdated)}
          </div>
          <Button variant="outline" size="sm" onClick={() => setAutoRefresh(!autoRefresh)} className={autoRefresh ? 'text-green-600' : ''}>
            <RefreshCw className={`h-3 w-3 mr-1 ${autoRefresh ? 'animate-spin' : ''}`}/>
            {autoRefresh ? 'Auto' : 'Manual'}
          </Button>
          <Button variant="outline" size="sm">
            <Eye className="h-3 w-3 mr-1"/>
            View Logs
          </Button>
        </div>
      </div>

      {/* Alert Banner */}
      {unacknowledgedAlerts.length > 0 && (<Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600"/>
                <span className="text-sm font-medium text-yellow-800">
                  {unacknowledgedAlerts.length} unacknowledged alert{unacknowledgedAlerts.length > 1 ? 's' : ''}
                </span>
              </div>
              <Button variant="outline" size="sm" className="text-yellow-700 border-yellow-300">
                View All Alerts
              </Button>
            </div>
          </CardContent>
        </Card>)}

      {/* System Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {systemMetrics.map((metric) => (<MetricCard key={metric.id} title={metric.name} value={metric.value} suffix={metric.unit} status={metric.status === 'healthy' ? 'success' : metric.status === 'warning' ? 'warning' : 'error'} icon={metric.id === 'cpu' ? Cpu :
                metric.id === 'memory' ? MemoryStick :
                    metric.id === 'disk' ? HardDrive :
                        Network} className="relative">
            <div className="absolute top-2 right-2">
              {getTrendIcon(metric.trend)}
            </div>
          </MetricCard>))}
      </div>

      <div className="grid gap-4 md:grid-cols-7">
        {/* Real-time Performance Chart */}
        <div className="col-span-5">
          <AreaChart title="Real-time Performance" description="System performance metrics updated every 5 seconds" data={performanceData} areas={[
            { dataKey: 'cpu', color: '#3b82f6', name: 'CPU %', fillOpacity: 0.6 },
            { dataKey: 'memory', color: '#ef4444', name: 'Memory %', fillOpacity: 0.4 },
            { dataKey: 'network', color: '#10b981', name: 'Network Mbps', fillOpacity: 0.3 }
        ]} height={350} formatYAxisLabel={(value) => {
            if (value >= 1000)
                return `${(value / 1000).toFixed(1)}K`;
            return value.toString();
        }}/>
        </div>

        {/* Active Alerts */}
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4"/>
              Active Alerts
            </CardTitle>
            <CardDescription>
              Recent system alerts and notifications
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {alerts.slice(0, 5).map((alert) => (<div key={alert.id} className={`p-2 rounded border ${alert.acknowledged ? 'opacity-50' : ''}`}>
                  <div className="flex items-start gap-2">
                    {getAlertIcon(alert.type)}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium">{alert.service}</div>
                      <div className="text-xs text-muted-foreground">
                        {alert.message}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {formatTime(alert.timestamp)}
                      </div>
                    </div>
                    {!alert.acknowledged && (<Button variant="ghost" size="sm" onClick={() => acknowledgeAlert(alert.id)} className="h-6 px-2 text-xs">
                        Ack
                      </Button>)}
                  </div>
                </div>))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Service Status Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-4 w-4"/>
            Service Status
          </CardTitle>
          <CardDescription>
            Health and status of all system services
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => (<div key={service.id} className="p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(service.status)}
                    <span className="font-medium text-sm">{service.name}</span>
                  </div>
                  <Badge className={getStatusColor(service.status)}>
                    {service.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>
                    <span>Uptime:</span>
                    <div className="font-medium">{formatUptime(service.uptime)}</div>
                  </div>
                  <div>
                    <span>Response:</span>
                    <div className="font-medium">{service.responseTime}ms</div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  Last checked: {formatTime(service.lastChecked)}
                </div>
              </div>))}
          </div>
        </CardContent>
      </Card>

      {/* Additional Monitoring Widgets */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Active Users */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4"/>
              Active Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">1,247</div>
            <div className="text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3 inline text-green-500"/>
              +12% from yesterday
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-xs">
                <span>Web App</span>
                <span>834</span>
              </div>
              <div className="flex justify-between text-xs">
                <span>Mobile App</span>
                <span>287</span>
              </div>
              <div className="flex justify-between text-xs">
                <span>API</span>
                <span>126</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Active Agents */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Bot className="h-4 w-4"/>
              Active Agents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">47</div>
            <div className="text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3 inline text-green-500"/>
              3 more than yesterday
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-xs">
                <span>Processing</span>
                <span>23</span>
              </div>
              <div className="flex justify-between text-xs">
                <span>Idle</span>
                <span>18</span>
              </div>
              <div className="flex justify-between text-xs">
                <span>Maintenance</span>
                <span>6</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Security Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Shield className="h-4 w-4"/>
              Security Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">Secure</div>
            <div className="text-xs text-muted-foreground">
              Last scan: 2 hours ago
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-xs">
                <span>Threats Blocked</span>
                <span>0</span>
              </div>
              <div className="flex justify-between text-xs">
                <span>Failed Logins</span>
                <span>3</span>
              </div>
              <div className="flex justify-between text-xs">
                <span>SSL Status</span>
                <span className="text-green-600">Valid</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>);
};
//# sourceMappingURL=monitoring.js.map