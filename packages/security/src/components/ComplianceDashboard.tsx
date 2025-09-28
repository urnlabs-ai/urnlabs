import React, { useState, useEffect } from 'react';

interface ComplianceFramework {
  name: string;
  status: 'compliant' | 'non-compliant' | 'pending' | 'unknown';
  score: number;
  lastAssessment: string;
  controls: {
    total: number;
    passing: number;
    failing: number;
    pending: number;
  };
}

interface ComplianceDashboardData {
  frameworks: ComplianceFramework[];
  overallScore: number;
  lastUpdate: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  alerts: Array<{
    id: string;
    type: 'compliance' | 'security' | 'operational';
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    framework?: string;
    timestamp: string;
  }>;
}

interface ComplianceDashboardProps {
  apiBaseUrl?: string;
  refreshInterval?: number;
}

export const ComplianceDashboard: React.FC<ComplianceDashboardProps> = ({
  apiBaseUrl = '/admin/compliance',
  refreshInterval = 30000
}) => {
  const [dashboardData, setDashboardData] = useState<ComplianceDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFramework, setSelectedFramework] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${apiBaseUrl}/dashboard`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch dashboard data: ${response.statusText}`);
        }

        const data = await response.json();
        setDashboardData(data.dashboard);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, refreshInterval);

    return () => clearInterval(interval);
  }, [apiBaseUrl, refreshInterval]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'compliant': return 'text-green-600 bg-green-100';
      case 'non-compliant': return 'text-red-600 bg-red-100';
      case 'pending': return 'text-yellow-600 bg-yellow-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'low': return 'text-green-600 bg-green-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'high': return 'text-orange-600 bg-orange-100';
      case 'critical': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const generateReport = async (framework: string) => {
    try {
      const response = await fetch(`${apiBaseUrl}/report/${framework}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to generate report: ${response.statusText}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${framework}_compliance_report_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
    }
  };

  const runAssessment = async (framework: string) => {
    try {
      const response = await fetch(`${apiBaseUrl}/assessment/${framework}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to run assessment: ${response.statusText}`);
      }

      // Refresh dashboard data after assessment
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run assessment');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex">
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error loading compliance dashboard</h3>
            <div className="mt-2 text-sm text-red-700">{error}</div>
          </div>
        </div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="text-center py-8 text-gray-500">
        No compliance data available
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Compliance Dashboard</h1>
            <p className="text-sm text-gray-500">
              Last updated: {new Date(dashboardData.lastUpdate).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">{dashboardData.overallScore}%</div>
              <div className="text-sm text-gray-500">Overall Score</div>
            </div>
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${getRiskLevelColor(dashboardData.riskLevel)}`}>
              {dashboardData.riskLevel.toUpperCase()} RISK
            </div>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {dashboardData.alerts && dashboardData.alerts.length > 0 && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Alerts</h2>
          <div className="space-y-3">
            {dashboardData.alerts.slice(0, 5).map((alert) => (
              <div key={alert.id} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                <div className={`px-2 py-1 rounded text-xs font-medium ${
                  alert.severity === 'critical' ? 'bg-red-100 text-red-800' :
                  alert.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                  alert.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-blue-100 text-blue-800'
                }`}>
                  {alert.severity.toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-900">{alert.message}</p>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-xs text-gray-500">{alert.type}</span>
                    {alert.framework && (
                      <span className="text-xs text-gray-500">• {alert.framework}</span>
                    )}
                    <span className="text-xs text-gray-500">
                      • {new Date(alert.timestamp).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Frameworks Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {dashboardData.frameworks.map((framework) => (
          <div key={framework.name} className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{framework.name}</h3>
              <div className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(framework.status)}`}>
                {framework.status.replace('-', ' ').toUpperCase()}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm">
                  <span>Compliance Score</span>
                  <span className="font-medium">{framework.score}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                  <div
                    className={`h-2 rounded-full ${
                      framework.score >= 90 ? 'bg-green-500' :
                      framework.score >= 70 ? 'bg-yellow-500' :
                      'bg-red-500'
                    }`}
                    style={{ width: `${framework.score}%` }}
                  ></div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-green-600 font-medium">{framework.controls.passing}</div>
                  <div className="text-gray-500">Passing</div>
                </div>
                <div>
                  <div className="text-red-600 font-medium">{framework.controls.failing}</div>
                  <div className="text-gray-500">Failing</div>
                </div>
              </div>

              <div className="text-xs text-gray-500">
                Last assessment: {new Date(framework.lastAssessment).toLocaleDateString()}
              </div>

              <div className="flex space-x-2">
                <button
                  onClick={() => runAssessment(framework.name)}
                  className="flex-1 bg-blue-600 text-white text-xs py-2 px-3 rounded hover:bg-blue-700 transition-colors"
                >
                  Run Assessment
                </button>
                <button
                  onClick={() => generateReport(framework.name)}
                  className="flex-1 bg-gray-600 text-white text-xs py-2 px-3 rounded hover:bg-gray-700 transition-colors"
                >
                  Generate Report
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Framework Details Modal */}
      {selectedFramework && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">{selectedFramework} Details</h2>
                <button
                  onClick={() => setSelectedFramework(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {/* Framework details would go here */}
              <div className="text-gray-500">
                Detailed compliance information for {selectedFramework} framework...
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComplianceDashboard;