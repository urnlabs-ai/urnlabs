import React, { useState, useEffect, useCallback } from 'react';
import { 
  RefreshCw, 
  Settings, 
  Download, 
  Filter, 
  Calendar,
  AlertTriangle,
  TrendingUp,
  BarChart3,
  PieChart,
  Activity,
  DollarSign,
  Users,
  Zap
} from 'lucide-react';
import { KPIGrid } from './KPIGrid';
import { InteractiveChart, ChartSeries, ChartConfig } from './InteractiveChart';
import { ForecastWidget } from './ForecastWidget';
import { DrillDownAnalytics } from './DrillDownAnalytics';
import { 
  MetricsAggregator, 
  BusinessKPI, 
  TimeRange, 
  PerformanceMetrics,
  CostMetrics,
  UsageMetrics,
  ROIMetrics
} from '../../services/MetricsAggregator';
import { AnalyticsService, Alert, ForecastData } from '../../services/AnalyticsService';

interface BIDashboardProps {
  className?: string;
}

interface DashboardState {
  kpis: BusinessKPI[];
  performanceMetrics: PerformanceMetrics | null;
  costMetrics: CostMetrics | null;
  usageMetrics: UsageMetrics | null;
  roiMetrics: ROIMetrics | null;
  alerts: Alert[];
  forecast: ForecastData | null;
  loading: boolean;
  lastUpdated: Date;
}

export const BIDashboard: React.FC<BIDashboardProps> = ({ className = '' }) => {
  const [timeRange, setTimeRange] = useState<TimeRange>(
    MetricsAggregator.createTimeRange('24h')
  );
  const [activeTab, setActiveTab] = useState<'overview' | 'performance' | 'cost' | 'usage' | 'forecast' | 'drilldown'>('overview');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30000);
  const [selectedKPI, setSelectedKPI] = useState<BusinessKPI | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const [dashboardState, setDashboardState] = useState<DashboardState>({
    kpis: [],
    performanceMetrics: null,
    costMetrics: null,
    usageMetrics: null,
    roiMetrics: null,
    alerts: [],
    forecast: null,
    loading: true,
    lastUpdated: new Date()
  });

  // Initialize services
  const metricsAggregator = new MetricsAggregator();
  const analyticsService = new AnalyticsService();

  // Load dashboard data
  const loadDashboardData = useCallback(async () => {
    try {
      setDashboardState(prev => ({ ...prev, loading: true }));

      const [
        kpis,
        performanceMetrics,
        costMetrics,
        usageMetrics,
        roiMetrics,
        alerts
      ] = await Promise.all([
        metricsAggregator.getBusinessKPIs(timeRange),
        metricsAggregator.getPerformanceMetrics(timeRange),
        metricsAggregator.getCostMetrics(timeRange),
        metricsAggregator.getUsageMetrics(timeRange),
        metricsAggregator.getROIMetrics(timeRange),
        analyticsService.getAlerts()
      ]);

      // Load forecast for the primary KPI
      let forecast: ForecastData | null = null;
      if (kpis.length > 0) {
        try {
          forecast = await analyticsService.getForecast(kpis[0].name, timeRange, 30);
        } catch (error) {
          console.warn('Failed to load forecast data:', error);
        }
      }

      setDashboardState({
        kpis,
        performanceMetrics,
        costMetrics,
        usageMetrics,
        roiMetrics,
        alerts: alerts.filter(alert => !alert.resolved),
        forecast,
        loading: false,
        lastUpdated: new Date()
      });
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      setDashboardState(prev => ({ ...prev, loading: false }));
    }
  }, [timeRange]);

  // Auto-refresh functionality
  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(loadDashboardData, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, loadDashboardData]);

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!autoRefresh) return;

    const handleMetricUpdate = (data: any) => {
      // Update specific metrics in real-time
      setDashboardState(prev => ({
        ...prev,
        lastUpdated: new Date()
      }));
    };

    const handleAlert = (alert: Alert) => {
      setDashboardState(prev => ({
        ...prev,
        alerts: [alert, ...prev.alerts.slice(0, 9)] // Keep last 10 alerts
      }));
    };

    analyticsService.subscribeToMetrics(['kpis', 'performance', 'cost'], handleMetricUpdate);
    analyticsService.addEventListener('alert', handleAlert);

    return () => {
      analyticsService.unsubscribeFromMetrics(handleMetricUpdate);
      analyticsService.removeEventListener('alert', handleAlert);
    };
  }, [autoRefresh]);

  const handleTimeRangeChange = (period: string) => {
    setTimeRange(MetricsAggregator.createTimeRange(period));
  };

  const handleKPIClick = (kpi: BusinessKPI) => {
    setSelectedKPI(kpi);
    setActiveTab('drilldown');
  };

  const handleExport = async (format: 'pdf' | 'csv' | 'xlsx' = 'pdf') => {
    try {
      const blob = await analyticsService.exportDashboard({
        format,
        widgets: [activeTab],
        timeRange,
        includeCharts: true,
        includeData: true
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bi-dashboard-${activeTab}-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const generateChartSeries = (metrics: any, type: string): ChartSeries[] => {
    if (!metrics) return [];

    const series: ChartSeries[] = [];

    Object.entries(metrics).forEach(([key, metric]: [string, any]) => {
      if (metric?.data) {
        series.push({
          name: metric.name || key,
          data: metric.data.map((point: any) => ({
            timestamp: point.timestamp,
            value: point.value
          })),
          color: getMetricColor(key),
          type: 'line'
        });
      }
    });

    return series;
  };

  const getMetricColor = (metric: string): string => {
    const colors = {
      apiResponseTime: '#3B82F6',
      errorRate: '#EF4444',
      throughput: '#10B981',
      uptime: '#8B5CF6',
      totalCost: '#F59E0B',
      costPerExecution: '#06B6D4',
      costSavings: '#84CC16',
      efficiency: '#F97316',
      activeUsers: '#3B82F6',
      executionsCount: '#10B981',
      dataProcessed: '#8B5CF6',
      userEngagement: '#F59E0B'
    };
    return colors[metric as keyof typeof colors] || '#6B7280';
  };

  const getTabIcon = (tab: string) => {
    const icons = {
      overview: <BarChart3 className="w-4 h-4" />,
      performance: <Activity className="w-4 h-4" />,
      cost: <DollarSign className="w-4 h-4" />,
      usage: <Users className="w-4 h-4" />,
      forecast: <TrendingUp className="w-4 h-4" />,
      drilldown: <PieChart className="w-4 h-4" />
    };
    return icons[tab as keyof typeof icons];
  };

  const tabs = [
    { id: 'overview', label: 'Overview', description: 'High-level business KPIs' },
    { id: 'performance', label: 'Performance', description: 'System performance metrics' },
    { id: 'cost', label: 'Cost', description: 'Cost analysis and optimization' },
    { id: 'usage', label: 'Usage', description: 'User engagement and usage patterns' },
    { id: 'forecast', label: 'Forecast', description: 'Predictive analytics' },
    { id: 'drilldown', label: 'Drill-Down', description: 'Detailed analysis' }
  ];

  const renderTabContent = () => {
    const chartConfig: ChartConfig = {
      type: 'line',
      title: '',
      showLegend: true,
      showGrid: true,
      showTooltip: true,
      showBrush: true,
      height: 350
    };

    switch (activeTab) {
      case 'overview':
        return (
          <div className="space-y-6">
            <KPIGrid
              kpis={dashboardState.kpis}
              loading={dashboardState.loading}
              onKPIClick={handleKPIClick}
              onRefresh={loadDashboardData}
              onExport={() => handleExport('csv')}
              autoRefresh={autoRefresh}
              refreshInterval={refreshInterval}
            />
            
            {/* Summary Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {dashboardState.performanceMetrics && (
                <InteractiveChart
                  series={generateChartSeries(dashboardState.performanceMetrics, 'performance')}
                  config={{ ...chartConfig, title: 'Performance Metrics Overview' }}
                  loading={dashboardState.loading}
                />
              )}
              
              {dashboardState.costMetrics && (
                <InteractiveChart
                  series={generateChartSeries(dashboardState.costMetrics, 'cost')}
                  config={{ ...chartConfig, title: 'Cost Metrics Overview' }}
                  loading={dashboardState.loading}
                />
              )}
            </div>
          </div>
        );

      case 'performance':
        return dashboardState.performanceMetrics ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <InteractiveChart
                series={[{
                  name: 'API Response Time',
                  data: dashboardState.performanceMetrics.apiResponseTime.data,
                  color: '#3B82F6'
                }]}
                config={{ ...chartConfig, title: 'API Response Time', yAxisLabel: 'ms' }}
                loading={dashboardState.loading}
              />
              
              <InteractiveChart
                series={[{
                  name: 'Error Rate',
                  data: dashboardState.performanceMetrics.errorRate.data,
                  color: '#EF4444'
                }]}
                config={{ ...chartConfig, title: 'Error Rate', yAxisLabel: '%' }}
                loading={dashboardState.loading}
              />
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <InteractiveChart
                series={[{
                  name: 'Throughput',
                  data: dashboardState.performanceMetrics.throughput.data,
                  color: '#10B981'
                }]}
                config={{ ...chartConfig, title: 'Throughput', yAxisLabel: 'req/s' }}
                loading={dashboardState.loading}
              />
              
              <InteractiveChart
                series={[{
                  name: 'Uptime',
                  data: dashboardState.performanceMetrics.uptime.data,
                  color: '#8B5CF6'
                }]}
                config={{ ...chartConfig, title: 'System Uptime', yAxisLabel: '%' }}
                loading={dashboardState.loading}
              />
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
            Performance metrics not available
          </div>
        );

      case 'cost':
        return dashboardState.costMetrics ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <InteractiveChart
                series={[{
                  name: 'Total Cost',
                  data: dashboardState.costMetrics.totalCost.data,
                  color: '#F59E0B'
                }]}
                config={{ ...chartConfig, title: 'Total Operating Cost', yAxisLabel: '$' }}
                loading={dashboardState.loading}
              />
              
              <InteractiveChart
                series={[{
                  name: 'Cost Savings',
                  data: dashboardState.costMetrics.costSavings.data,
                  color: '#10B981'
                }]}
                config={{ ...chartConfig, title: 'Cost Savings', yAxisLabel: '$' }}
                loading={dashboardState.loading}
              />
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <InteractiveChart
                series={[{
                  name: 'Cost per Execution',
                  data: dashboardState.costMetrics.costPerExecution.data,
                  color: '#06B6D4'
                }]}
                config={{ ...chartConfig, title: 'Cost per Execution', yAxisLabel: '$' }}
                loading={dashboardState.loading}
              />
              
              <InteractiveChart
                series={[{
                  name: 'Efficiency',
                  data: dashboardState.costMetrics.efficiency.data,
                  color: '#84CC16'
                }]}
                config={{ ...chartConfig, title: 'Cost Efficiency', yAxisLabel: '%' }}
                loading={dashboardState.loading}
              />
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
            Cost metrics not available
          </div>
        );

      case 'usage':
        return dashboardState.usageMetrics ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <InteractiveChart
                series={[{
                  name: 'Active Users',
                  data: dashboardState.usageMetrics.activeUsers.data,
                  color: '#3B82F6'
                }]}
                config={{ ...chartConfig, title: 'Monthly Active Users', yAxisLabel: 'users' }}
                loading={dashboardState.loading}
              />
              
              <InteractiveChart
                series={[{
                  name: 'Executions',
                  data: dashboardState.usageMetrics.executionsCount.data,
                  color: '#10B981'
                }]}
                config={{ ...chartConfig, title: 'Daily Executions', yAxisLabel: 'count' }}
                loading={dashboardState.loading}
              />
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <InteractiveChart
                series={[{
                  name: 'Data Processed',
                  data: dashboardState.usageMetrics.dataProcessed.data,
                  color: '#8B5CF6'
                }]}
                config={{ ...chartConfig, title: 'Data Processed', yAxisLabel: 'GB' }}
                loading={dashboardState.loading}
              />
              
              <InteractiveChart
                series={[{
                  name: 'User Engagement',
                  data: dashboardState.usageMetrics.userEngagement.data,
                  color: '#F59E0B'
                }]}
                config={{ ...chartConfig, title: 'User Engagement Score', yAxisLabel: 'score' }}
                loading={dashboardState.loading}
              />
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
            Usage metrics not available
          </div>
        );

      case 'forecast':
        return dashboardState.forecast ? (
          <ForecastWidget
            forecast={dashboardState.forecast}
            loading={dashboardState.loading}
          />
        ) : (
          <div className="text-center py-12 text-gray-500">
            Forecast data not available
          </div>
        );

      case 'drilldown':
        return (
          <DrillDownAnalytics
            metric={selectedKPI?.name || 'Default Metric'}
            timeRange={timeRange}
            onExport={(data, format) => console.log('Export drill-down:', data, format)}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className={`min-h-screen bg-gray-50 ${className}`}>
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-gray-900">
                Business Intelligence Dashboard
              </h1>
              
              {/* Time Range Selector */}
              <select
                value={`${timeRange.granularity}:${Math.round((timeRange.end.getTime() - timeRange.start.getTime()) / (1000 * 60 * 60))}`}
                onChange={(e) => {
                  const [, hours] = e.target.value.split(':');
                  const period = hours === '1' ? '1h' : 
                                hours === '24' ? '24h' :
                                hours === '168' ? '7d' :
                                hours === '720' ? '30d' : '24h';
                  handleTimeRangeChange(period);
                }}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="hour:1">Last Hour</option>
                <option value="hour:24">Last 24 Hours</option>
                <option value="day:168">Last 7 Days</option>
                <option value="day:720">Last 30 Days</option>
              </select>
            </div>

            <div className="flex items-center space-x-3">
              {/* Alerts Badge */}
              {dashboardState.alerts.length > 0 && (
                <div className="relative">
                  <button className="p-2 text-red-600 hover:bg-red-50 rounded-lg">
                    <AlertTriangle className="w-5 h-5" />
                  </button>
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {dashboardState.alerts.length}
                  </span>
                </div>
              )}

              {/* Refresh Button */}
              <button
                onClick={loadDashboardData}
                disabled={dashboardState.loading}
                className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${dashboardState.loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>

              {/* Export Button */}
              <button
                onClick={() => handleExport()}
                className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                <Download className="w-4 h-4 mr-2" />
                Export
              </button>

              {/* Settings Button */}
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </button>
            </div>
          </div>

          {/* Status Bar */}
          <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
            <div className="flex items-center space-x-4">
              <span>Last updated: {dashboardState.lastUpdated.toLocaleTimeString()}</span>
              {autoRefresh && (
                <span className="flex items-center">
                  <Zap className="w-4 h-4 mr-1 text-green-500" />
                  Auto-refreshing every {refreshInterval / 1000}s
                </span>
              )}
            </div>
            
            <div className="flex items-center space-x-4">
              <span>{dashboardState.kpis.length} KPIs</span>
              <span>{dashboardState.alerts.length} active alerts</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6">
          <div className="flex space-x-8 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`
                  flex items-center space-x-2 py-3 px-1 border-b-2 font-medium text-sm whitespace-nowrap
                  ${activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                {getTabIcon(tab.id)}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-6 py-6">
        {renderTabContent()}
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Dashboard Settings</h3>
            
            <div className="space-y-4">
              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm font-medium text-gray-700">Auto-refresh</span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Refresh Interval (seconds)
                </label>
                <input
                  type="number"
                  value={refreshInterval / 1000}
                  onChange={(e) => setRefreshInterval(parseInt(e.target.value) * 1000)}
                  min="10"
                  max="300"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 mt-6">
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BIDashboard;