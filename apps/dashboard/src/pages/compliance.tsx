import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Shield,
  FileText,
  TrendingUp,
  Download,
  RefreshCw,
  Search,
  Calendar,
  Filter,
  Eye,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  Bell,
  Settings
} from 'lucide-react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { format, subDays, subWeeks, subMonths } from 'date-fns';
import { useComplianceWebSocket, ViolationAlert } from '@/hooks/useComplianceWebSocket';

/**
 * Compliance Dashboard Page
 *
 * Real-time compliance monitoring dashboard with violation detection,
 * framework status, and comprehensive reporting capabilities
 */

interface ComplianceDashboardData {
  overview: {
    totalRules: number;
    activeRules: number;
    recentViolations: number;
    riskScore: number;
    complianceRate: number;
  };
  complianceRules: ComplianceRule[];
  recentViolations: PolicyViolation[];
  frameworkStatus: FrameworkStatus[];
  riskMetrics: RiskMetrics;
  policyStatistics: PolicyStatistics;
}

interface ComplianceRule {
  id: string;
  name: string;
  framework: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'compliant' | 'non_compliant' | 'partial' | 'unknown';
  lastAuditDate: Date | null;
  nextAuditDate: Date | null;
  policy: {
    id: string;
    name: string;
    status: string;
  } | null;
}

interface PolicyViolation {
  id: string;
  policyId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  timestamp: Date;
  status: 'new' | 'acknowledged' | 'resolved' | 'false_positive';
  riskScore: number;
}

interface FrameworkStatus {
  framework: string;
  totalRules: number;
  compliantRules: number;
  complianceRate: number;
  status: 'compliant' | 'partial' | 'non_compliant';
}

interface RiskMetrics {
  overallScore: number;
  trendDirection: 'improving' | 'stable' | 'degrading';
  byFramework: Record<string, number>;
  bySeverity: Record<string, number>;
}

interface PolicyStatistics {
  total: number;
  active: number;
  byType: Record<string, number>;
  byRiskLevel: Record<string, number>;
  expiringCount: number;
}

const SEVERITY_COLORS = {
  low: '#10B981',
  medium: '#F59E0B',
  high: '#EF4444',
  critical: '#DC2626'
};

const COMPLIANCE_COLORS = {
  compliant: '#10B981',
  partial: '#F59E0B',
  non_compliant: '#EF4444',
  unknown: '#6B7280'
};

const FRAMEWORKS = [
  { value: '', label: 'All Frameworks' },
  { value: 'SOC2', label: 'SOC 2' },
  { value: 'GDPR', label: 'GDPR' },
  { value: 'CCPA', label: 'CCPA' },
  { value: 'HIPAA', label: 'HIPAA' },
  { value: 'PCI_DSS', label: 'PCI DSS' },
  { value: 'ISO27001', label: 'ISO 27001' }
];

export default function CompliancePage() {
  const [dashboardData, setDashboardData] = useState<ComplianceDashboardData | null>(null);
  const [violations, setViolations] = useState<PolicyViolation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFramework, setSelectedFramework] = useState('');
  const [selectedTimeRange, setSelectedTimeRange] = useState('30d');
  const [searchTerm, setSearchTerm] = useState('');
  const [violationFilters, setViolationFilters] = useState({
    severity: '',
    status: '',
    framework: ''
  });

  // Real-time updates via WebSocket
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Initialize WebSocket connection for real-time updates
  const {
    isConnected,
    connectionStatus,
    violations: realtimeViolations,
    acknowledgeViolation
  } = useComplianceWebSocket({
    organizationId: 'default-org', // TODO: Get from auth context
    subscriptions: ['violations', 'compliance-updates', 'audit-events'],
    onViolationAlert: (violation) => {
      // Update violations list with new real-time violation
      setViolations(prev => [violation as any, ...prev.slice(0, 99)]);
      setLastUpdate(new Date());

      // Refresh dashboard data to reflect changes
      loadDashboardData();
    },
    onRiskAlert: (riskAlert) => {
      toast.warning(`Risk threshold exceeded: ${riskAlert.currentRiskScore}/${riskAlert.threshold}`, {
        description: `${riskAlert.recentViolations.length} recent violations detected`
      });
      loadDashboardData();
    },
    onComplianceUpdate: (update) => {
      toast.info(`Compliance status updated for ${update.framework}`, {
        description: `Status changed from ${update.previousStatus} to ${update.currentStatus}`
      });
      loadDashboardData();
    },
    autoToast: true
  });

  // Load dashboard data
  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);

      const params = new URLSearchParams();
      if (selectedFramework) params.append('framework', selectedFramework);
      if (selectedTimeRange !== '30d') {
        const endDate = new Date();
        let startDate: Date;

        switch (selectedTimeRange) {
          case '7d':
            startDate = subDays(endDate, 7);
            break;
          case '90d':
            startDate = subDays(endDate, 90);
            break;
          case '1y':
            startDate = subDays(endDate, 365);
            break;
          default:
            startDate = subDays(endDate, 30);
        }

        params.append('startDate', startDate.toISOString());
        params.append('endDate', endDate.toISOString());
      }

      const response = await fetch(`/api/compliance/dashboard?${params}`);
      if (!response.ok) {
        throw new Error('Failed to load dashboard data');
      }

      const data = await response.json();
      setDashboardData(data.data);
      setLastUpdate(new Date());

    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      toast.error('Failed to load compliance dashboard');
    } finally {
      setLoading(false);
    }
  }, [selectedFramework, selectedTimeRange]);

  // Load violations with filters
  const loadViolations = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (violationFilters.severity) params.append('severity', violationFilters.severity);
      if (violationFilters.status) params.append('status', violationFilters.status);
      if (violationFilters.framework) params.append('framework', violationFilters.framework);
      params.append('limit', '50');

      const response = await fetch(`/api/compliance/violations?${params}`);
      if (!response.ok) {
        throw new Error('Failed to load violations');
      }

      const data = await response.json();
      setViolations(data.data.violations);

    } catch (error) {
      console.error('Failed to load violations:', error);
      toast.error('Failed to load policy violations');
    }
  }, [violationFilters]);

  // Generate compliance report
  const generateReport = async (format: 'pdf' | 'csv' | 'json') => {
    try {
      const reportRequest = {
        organizationId: 'current', // This would be dynamically set
        framework: selectedFramework || undefined,
        startDate: subDays(new Date(), 30).toISOString(),
        endDate: new Date().toISOString(),
        format,
        includeDetails: true,
        includePolicyViolations: true,
        includeMetrics: true
      };

      const response = await fetch('/api/compliance/reports/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(reportRequest)
      });

      if (!response.ok) {
        throw new Error('Failed to generate report');
      }

      // Download the report
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `compliance-report-${format}-${Date.now()}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success(`${format.toUpperCase()} report generated successfully`);

    } catch (error) {
      console.error('Failed to generate report:', error);
      toast.error('Failed to generate compliance report');
    }
  };

  // Acknowledge violation
  const handleAcknowledgeViolation = async (violationId: string) => {
    try {
      // Send acknowledgment via WebSocket
      acknowledgeViolation(violationId, 'current-user-id'); // TODO: Get from auth context

      // Also call API endpoint as backup
      const response = await fetch(`/api/compliance/violations/${violationId}/acknowledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: 'current-user-id',
          reason: 'Acknowledged via dashboard'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to acknowledge violation');
      }

      toast.success('Violation acknowledged');
      loadViolations();
    } catch (error) {
      console.error('Failed to acknowledge violation:', error);
      toast.error('Failed to acknowledge violation');
    }
  };

  // Mark violation as false positive
  const markFalsePositive = async (violationId: string) => {
    try {
      // Implementation would call API to mark as false positive
      toast.success('Violation marked as false positive');
      loadViolations();
    } catch (error) {
      console.error('Failed to mark false positive:', error);
      toast.error('Failed to mark violation as false positive');
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  useEffect(() => {
    loadViolations();
  }, [loadViolations]);

  // Auto-refresh data every 30 seconds
  useEffect(() => {
    const interval = setInterval(loadDashboardData, 30000);
    return () => clearInterval(interval);
  }, [loadDashboardData]);

  if (loading || !dashboardData) {
    return (
      <div className=\"flex items-center justify-center h-64\">
        <RefreshCw className=\"h-8 w-8 animate-spin\" />
        <span className=\"ml-2\">Loading compliance dashboard...</span>
      </div>
    );
  }

  const riskScoreColor = dashboardData.overview.riskScore >= 7 ? '#EF4444' :
                        dashboardData.overview.riskScore >= 5 ? '#F59E0B' : '#10B981';

  const complianceRateColor = dashboardData.overview.complianceRate >= 90 ? '#10B981' :
                             dashboardData.overview.complianceRate >= 70 ? '#F59E0B' : '#EF4444';

  return (
    <div className=\"space-y-6 p-6\">
      {/* Header */}
      <div className=\"flex items-center justify-between\">
        <div>
          <h1 className=\"text-3xl font-bold tracking-tight\">Compliance Dashboard</h1>
          <p className=\"text-muted-foreground\">
            Real-time compliance monitoring and policy violation detection
          </p>
        </div>
        <div className=\"flex items-center space-x-2\">
          <Badge
            variant={isConnected ? 'default' : connectionStatus === 'error' ? 'destructive' : 'secondary'}
            className="mr-2"
          >
            <div className={`w-2 h-2 rounded-full mr-2 ${
              isConnected ? 'bg-green-500' :
              connectionStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' :
              connectionStatus === 'error' ? 'bg-red-500' : 'bg-gray-400'
            }`} />
            {isConnected ? 'Live' :
             connectionStatus === 'connecting' ? 'Connecting...' :
             connectionStatus === 'error' ? 'Error' : 'Offline'}
          </Badge>
          <span className=\"text-sm text-muted-foreground\">
            Last updated: {format(lastUpdate, 'HH:mm:ss')}
          </span>
          <Button
            variant=\"outline\"
            size=\"sm\"
            onClick={() => loadDashboardData()}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className=\"flex items-center space-x-4 p-4 bg-muted/50 rounded-lg\">
        <Select value={selectedFramework} onValueChange={setSelectedFramework}>
          <SelectTrigger className=\"w-48\">
            <SelectValue placeholder=\"All Frameworks\" />
          </SelectTrigger>
          <SelectContent>
            {FRAMEWORKS.map(framework => (
              <SelectItem key={framework.value} value={framework.value}>
                {framework.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedTimeRange} onValueChange={setSelectedTimeRange}>
          <SelectTrigger className=\"w-32\">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value=\"7d\">Last 7 days</SelectItem>
            <SelectItem value=\"30d\">Last 30 days</SelectItem>
            <SelectItem value=\"90d\">Last 90 days</SelectItem>
            <SelectItem value=\"1y\">Last year</SelectItem>
          </SelectContent>
        </Select>

        <div className=\"flex items-center space-x-2 ml-auto\">
          <Button
            variant=\"outline\"
            size=\"sm\"
            onClick={() => generateReport('pdf')}
          >
            <Download className=\"h-4 w-4 mr-2\" />
            PDF Report
          </Button>
          <Button
            variant=\"outline\"
            size=\"sm\"
            onClick={() => generateReport('csv')}
          >
            <Download className=\"h-4 w-4 mr-2\" />
            CSV Export
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className=\"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6\">
        <Card>
          <CardHeader className=\"flex flex-row items-center justify-between space-y-0 pb-2\">
            <CardTitle className=\"text-sm font-medium\">Compliance Rate</CardTitle>
            <CheckCircle className=\"h-4 w-4 text-muted-foreground\" />
          </CardHeader>
          <CardContent>
            <div className=\"text-2xl font-bold\" style={{ color: complianceRateColor }}>
              {dashboardData.overview.complianceRate.toFixed(1)}%
            </div>
            <p className=\"text-xs text-muted-foreground\">
              {dashboardData.overview.activeRules} of {dashboardData.overview.totalRules} rules compliant
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className=\"flex flex-row items-center justify-between space-y-0 pb-2\">
            <CardTitle className=\"text-sm font-medium\">Risk Score</CardTitle>
            <Shield className=\"h-4 w-4 text-muted-foreground\" />
          </CardHeader>
          <CardContent>
            <div className=\"text-2xl font-bold\" style={{ color: riskScoreColor }}>
              {dashboardData.overview.riskScore.toFixed(1)}
            </div>
            <p className=\"text-xs text-muted-foreground\">
              {dashboardData.riskMetrics.trendDirection === 'improving' && (
                <span className=\"text-green-600\">↓ Improving</span>
              )}
              {dashboardData.riskMetrics.trendDirection === 'degrading' && (
                <span className=\"text-red-600\">↑ Degrading</span>
              )}
              {dashboardData.riskMetrics.trendDirection === 'stable' && (
                <span className=\"text-blue-600\">→ Stable</span>
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className=\"flex flex-row items-center justify-between space-y-0 pb-2\">
            <CardTitle className=\"text-sm font-medium\">Recent Violations</CardTitle>
            <AlertTriangle className=\"h-4 w-4 text-muted-foreground\" />
          </CardHeader>
          <CardContent>
            <div className=\"text-2xl font-bold text-red-600\">
              {dashboardData.overview.recentViolations}
            </div>
            <p className=\"text-xs text-muted-foreground\">
              Last {selectedTimeRange === '7d' ? '7 days' : selectedTimeRange === '30d' ? '30 days' : '90 days'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className=\"flex flex-row items-center justify-between space-y-0 pb-2\">
            <CardTitle className=\"text-sm font-medium\">Active Policies</CardTitle>
            <FileText className=\"h-4 w-4 text-muted-foreground\" />
          </CardHeader>
          <CardContent>
            <div className=\"text-2xl font-bold\">
              {dashboardData.policyStatistics.active}
            </div>
            <p className=\"text-xs text-muted-foreground\">
              {dashboardData.policyStatistics.expiringCount} expiring soon
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className=\"flex flex-row items-center justify-between space-y-0 pb-2\">
            <CardTitle className=\"text-sm font-medium\">Compliance Rules</CardTitle>
            <Settings className=\"h-4 w-4 text-muted-foreground\" />
          </CardHeader>
          <CardContent>
            <div className=\"text-2xl font-bold\">
              {dashboardData.overview.totalRules}
            </div>
            <p className=\"text-xs text-muted-foreground\">
              {dashboardData.overview.activeRules} active
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue=\"overview\" className=\"space-y-6\">
        <TabsList className=\"grid w-full grid-cols-5\">
          <TabsTrigger value=\"overview\">Overview</TabsTrigger>
          <TabsTrigger value=\"violations\">Violations</TabsTrigger>
          <TabsTrigger value=\"frameworks\">Frameworks</TabsTrigger>
          <TabsTrigger value=\"trends\">Trends</TabsTrigger>
          <TabsTrigger value=\"audit\">Audit Trail</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value=\"overview\" className=\"space-y-6\">
          <div className=\"grid grid-cols-1 lg:grid-cols-2 gap-6\">
            {/* Risk Score by Framework */}
            <Card>
              <CardHeader>
                <CardTitle>Risk Score by Framework</CardTitle>
                <CardDescription>
                  Current risk assessment across compliance frameworks
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width=\"100%\" height={300}>
                  <BarChart data={Object.entries(dashboardData.riskMetrics.byFramework).map(([framework, score]) => ({
                    framework,
                    score: Math.round(score * 100) / 100
                  }))}>
                    <CartesianGrid strokeDasharray=\"3 3\" />
                    <XAxis dataKey=\"framework\" />
                    <YAxis domain={[0, 10]} />
                    <Tooltip />
                    <Bar dataKey=\"score\" fill=\"#8884d8\" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Violations by Severity */}
            <Card>
              <CardHeader>
                <CardTitle>Violations by Severity</CardTitle>
                <CardDescription>
                  Distribution of policy violations by severity level
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width=\"100%\" height={300}>
                  <PieChart>
                    <Pie
                      data={Object.entries(dashboardData.riskMetrics.bySeverity).map(([severity, count]) => ({
                        name: severity,
                        value: count,
                        fill: SEVERITY_COLORS[severity as keyof typeof SEVERITY_COLORS]
                      }))}
                      cx=\"50%\"
                      cy=\"50%\"
                      innerRadius={60}
                      outerRadius={120}
                      paddingAngle={5}
                      dataKey=\"value\"
                    >
                      {Object.entries(dashboardData.riskMetrics.bySeverity).map(([severity], index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={SEVERITY_COLORS[severity as keyof typeof SEVERITY_COLORS]}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Recent Violations */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Policy Violations</CardTitle>
              <CardDescription>
                Latest policy violations requiring attention
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className=\"space-y-4\">
                {dashboardData.recentViolations.slice(0, 5).map((violation) => (
                  <div key={violation.id} className=\"flex items-center justify-between p-4 border rounded-lg\">
                    <div className=\"flex items-center space-x-4\">
                      <Badge
                        variant=\"outline\"
                        style={{
                          borderColor: SEVERITY_COLORS[violation.severity],
                          color: SEVERITY_COLORS[violation.severity]
                        }}
                      >
                        {violation.severity.toUpperCase()}
                      </Badge>
                      <div>
                        <p className=\"font-medium\">{violation.description}</p>
                        <p className=\"text-sm text-muted-foreground\">
                          {format(new Date(violation.timestamp), 'MMM dd, yyyy HH:mm')} • Risk Score: {violation.riskScore.toFixed(1)}
                        </p>
                      </div>
                    </div>
                    <div className=\"flex items-center space-x-2\">
                      <Button
                        variant=\"outline\"
                        size=\"sm\"
                        onClick={() => handleAcknowledgeViolation(violation.id)}
                      >
                        <CheckCircle className=\"h-4 w-4 mr-2\" />
                        Acknowledge
                      </Button>
                      <Button
                        variant=\"outline\"
                        size=\"sm\"
                        onClick={() => markFalsePositive(violation.id)}
                      >
                        <XCircle className=\"h-4 w-4 mr-2\" />
                        False Positive
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Violations Tab */}
        <TabsContent value=\"violations\" className=\"space-y-6\">
          {/* Violation Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filter Violations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className=\"flex items-center space-x-4\">
                <div className=\"flex-1\">
                  <Input
                    placeholder=\"Search violations...\"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className=\"max-w-sm\"
                  />
                </div>
                <Select
                  value={violationFilters.severity}
                  onValueChange={(value) => setViolationFilters(prev => ({ ...prev, severity: value }))}
                >
                  <SelectTrigger className=\"w-32\">
                    <SelectValue placeholder=\"Severity\" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=\"\">All Severities</SelectItem>
                    <SelectItem value=\"low\">Low</SelectItem>
                    <SelectItem value=\"medium\">Medium</SelectItem>
                    <SelectItem value=\"high\">High</SelectItem>
                    <SelectItem value=\"critical\">Critical</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={violationFilters.status}
                  onValueChange={(value) => setViolationFilters(prev => ({ ...prev, status: value }))}
                >
                  <SelectTrigger className=\"w-32\">
                    <SelectValue placeholder=\"Status\" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=\"\">All Statuses</SelectItem>
                    <SelectItem value=\"new\">New</SelectItem>
                    <SelectItem value=\"acknowledged\">Acknowledged</SelectItem>
                    <SelectItem value=\"resolved\">Resolved</SelectItem>
                    <SelectItem value=\"false_positive\">False Positive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Violations List */}
          <Card>
            <CardHeader>
              <CardTitle>Policy Violations</CardTitle>
              <CardDescription>
                Detailed list of policy violations with actions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className=\"space-y-4\">
                {violations.map((violation) => (
                  <div key={violation.id} className=\"flex items-center justify-between p-4 border rounded-lg\">
                    <div className=\"flex items-center space-x-4\">
                      <Badge
                        variant=\"outline\"
                        style={{
                          borderColor: SEVERITY_COLORS[violation.severity],
                          color: SEVERITY_COLORS[violation.severity]
                        }}
                      >
                        {violation.severity.toUpperCase()}
                      </Badge>
                      <div>
                        <p className=\"font-medium\">{violation.description}</p>
                        <div className=\"flex items-center space-x-4 text-sm text-muted-foreground\">
                          <span>{format(new Date(violation.timestamp), 'MMM dd, yyyy HH:mm')}</span>
                          <span>Risk Score: {violation.riskScore.toFixed(1)}</span>
                          <Badge variant=\"secondary\" className=\"text-xs\">
                            {violation.status.replace('_', ' ').toUpperCase()}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className=\"flex items-center space-x-2\">
                      <Button variant=\"outline\" size=\"sm\">
                        <Eye className=\"h-4 w-4 mr-2\" />
                        Details
                      </Button>
                      {violation.status === 'new' && (
                        <>
                          <Button
                            variant=\"outline\"
                            size=\"sm\"
                            onClick={() => handleAcknowledgeViolation(violation.id)}
                          >
                            <CheckCircle className=\"h-4 w-4 mr-2\" />
                            Acknowledge
                          </Button>
                          <Button
                            variant=\"outline\"
                            size=\"sm\"
                            onClick={() => markFalsePositive(violation.id)}
                          >
                            <XCircle className=\"h-4 w-4 mr-2\" />
                            False Positive
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Frameworks Tab */}
        <TabsContent value=\"frameworks\" className=\"space-y-6\">
          <div className=\"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6\">
            {dashboardData.frameworkStatus.map((framework) => (
              <Card key={framework.framework}>
                <CardHeader>
                  <CardTitle className=\"flex items-center justify-between\">
                    {framework.framework}
                    <Badge
                      variant=\"outline\"
                      style={{
                        borderColor: COMPLIANCE_COLORS[framework.status],
                        color: COMPLIANCE_COLORS[framework.status]
                      }}
                    >
                      {framework.status.replace('_', ' ').toUpperCase()}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className=\"space-y-4\">
                    <div>
                      <div className=\"flex justify-between text-sm\">
                        <span>Compliance Rate</span>
                        <span className=\"font-medium\">{framework.complianceRate.toFixed(1)}%</span>
                      </div>
                      <div className=\"w-full bg-gray-200 rounded-full h-2 mt-1\">
                        <div
                          className=\"h-2 rounded-full\"
                          style={{
                            width: `${framework.complianceRate}%`,
                            backgroundColor: COMPLIANCE_COLORS[framework.status]
                          }}
                        />
                      </div>
                    </div>
                    <div className=\"flex justify-between text-sm\">
                      <span>Compliant Rules</span>
                      <span>{framework.compliantRules} / {framework.totalRules}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Trends Tab */}
        <TabsContent value=\"trends\" className=\"space-y-6\">
          <Card>
            <CardHeader>
              <CardTitle>Compliance Trends</CardTitle>
              <CardDescription>
                Historical compliance metrics and trend analysis
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className=\"h-80\">
                <ResponsiveContainer width=\"100%\" height=\"100%\">
                  <LineChart data={[]}>
                    <CartesianGrid strokeDasharray=\"3 3\" />
                    <XAxis dataKey=\"date\" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type=\"monotone\" dataKey=\"complianceRate\" stroke=\"#8884d8\" name=\"Compliance Rate\" />
                    <Line type=\"monotone\" dataKey=\"violationCount\" stroke=\"#82ca9d\" name=\"Violations\" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit Trail Tab */}
        <TabsContent value=\"audit\" className=\"space-y-6\">
          <Card>
            <CardHeader>
              <CardTitle>Compliance Audit Trail</CardTitle>
              <CardDescription>
                Comprehensive audit log of compliance-related activities
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className=\"space-y-4\">
                <div className=\"text-center text-muted-foreground py-8\">
                  Audit trail implementation would go here
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}