import React, { useState } from 'react';
import { Download, FileText, Table, BarChart3, Calendar, Mail, Clock, Check } from 'lucide-react';
import { format } from 'date-fns';
import { TimeRange } from '../../services/MetricsAggregator';
import { ExportConfig } from '../../services/AnalyticsService';

interface ExportManagerProps {
  onExport: (config: ExportConfig) => Promise<void>;
  onScheduleReport: (config: ScheduledReportConfig) => Promise<void>;
  availableWidgets: string[];
  timeRange: TimeRange;
  className?: string;
}

interface ScheduledReportConfig extends ExportConfig {
  schedule: 'daily' | 'weekly' | 'monthly';
  recipients: string[];
  name: string;
  enabled: boolean;
}

export const ExportManager: React.FC<ExportManagerProps> = ({
  onExport,
  onScheduleReport,
  availableWidgets,
  timeRange,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'export' | 'schedule'>('export');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const [exportConfig, setExportConfig] = useState<ExportConfig>({
    format: 'pdf',
    widgets: availableWidgets,
    timeRange,
    includeCharts: true,
    includeData: true
  });

  const [scheduleConfig, setScheduleConfig] = useState<ScheduledReportConfig>({
    ...exportConfig,
    schedule: 'weekly',
    recipients: [''],
    name: '',
    enabled: true
  });

  const formatOptions = [
    { value: 'pdf', label: 'PDF Report', icon: <FileText className="w-4 h-4" />, description: 'Complete visual report' },
    { value: 'csv', label: 'CSV Data', icon: <Table className="w-4 h-4" />, description: 'Raw data export' },
    { value: 'xlsx', label: 'Excel Workbook', icon: <Table className="w-4 h-4" />, description: 'Formatted spreadsheet' },
    { value: 'json', label: 'JSON Data', icon: <BarChart3 className="w-4 h-4" />, description: 'Structured data format' }
  ];

  const scheduleOptions = [
    { value: 'daily', label: 'Daily', icon: <Calendar className="w-4 h-4" />, description: 'Every day at 9 AM' },
    { value: 'weekly', label: 'Weekly', icon: <Calendar className="w-4 h-4" />, description: 'Every Monday at 9 AM' },
    { value: 'monthly', label: 'Monthly', icon: <Calendar className="w-4 h-4" />, description: 'First day of month at 9 AM' }
  ];

  const handleExport = async () => {
    setLoading(true);
    setSuccess(false);
    
    try {
      await onExport(exportConfig);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleScheduleReport = async () => {
    if (!scheduleConfig.name.trim()) {
      alert('Please enter a report name');
      return;
    }

    if (scheduleConfig.recipients.some(email => !email.includes('@'))) {
      alert('Please enter valid email addresses');
      return;
    }

    setLoading(true);
    setSuccess(false);

    try {
      await onScheduleReport(scheduleConfig);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setIsOpen(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to schedule report:', error);
    } finally {
      setLoading(false);
    }
  };

  const addRecipient = () => {
    setScheduleConfig(prev => ({
      ...prev,
      recipients: [...prev.recipients, '']
    }));
  };

  const updateRecipient = (index: number, email: string) => {
    setScheduleConfig(prev => ({
      ...prev,
      recipients: prev.recipients.map((recipient, i) => i === index ? email : recipient)
    }));
  };

  const removeRecipient = (index: number) => {
    setScheduleConfig(prev => ({
      ...prev,
      recipients: prev.recipients.filter((_, i) => i !== index)
    }));
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={`inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${className}`}
      >
        <Download className="w-4 h-4 mr-2" />
        Export & Reports
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Export & Reports</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-gray-600"
          >
            <span className="sr-only">Close</span>
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('export')}
            className={`flex-1 py-3 px-4 text-sm font-medium ${
              activeTab === 'export'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Download className="w-4 h-4 inline mr-2" />
            One-time Export
          </button>
          <button
            onClick={() => setActiveTab('schedule')}
            className={`flex-1 py-3 px-4 text-sm font-medium ${
              activeTab === 'schedule'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Clock className="w-4 h-4 inline mr-2" />
            Scheduled Reports
          </button>
        </div>

        <div className="p-6">
          {activeTab === 'export' ? (
            <div className="space-y-6">
              {/* Format Selection */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">Export Format</h3>
                <div className="grid grid-cols-2 gap-3">
                  {formatOptions.map((format) => (
                    <button
                      key={format.value}
                      onClick={() => setExportConfig(prev => ({ ...prev, format: format.value as any }))}
                      className={`p-4 border-2 rounded-lg text-left transition-colors ${
                        exportConfig.format === format.value
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        {format.icon}
                        <div>
                          <div className="font-medium text-gray-900">{format.label}</div>
                          <div className="text-sm text-gray-500">{format.description}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Widget Selection */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">Include Widgets</h3>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={exportConfig.widgets.length === availableWidgets.length}
                      onChange={(e) => {
                        setExportConfig(prev => ({
                          ...prev,
                          widgets: e.target.checked ? availableWidgets : []
                        }));
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm font-medium text-gray-900">Select All</span>
                  </label>
                  {availableWidgets.map((widget) => (
                    <label key={widget} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={exportConfig.widgets.includes(widget)}
                        onChange={(e) => {
                          setExportConfig(prev => ({
                            ...prev,
                            widgets: e.target.checked
                              ? [...prev.widgets, widget]
                              : prev.widgets.filter(w => w !== widget)
                          }));
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm text-gray-700 capitalize">
                        {widget.replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Content Options */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">Content Options</h3>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={exportConfig.includeCharts}
                      onChange={(e) => setExportConfig(prev => ({ ...prev, includeCharts: e.target.checked }))}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Include Charts & Visualizations</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={exportConfig.includeData}
                      onChange={(e) => setExportConfig(prev => ({ ...prev, includeData: e.target.checked }))}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Include Raw Data Tables</span>
                  </label>
                </div>
              </div>

              {/* Time Range Info */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="text-sm font-medium text-gray-900 mb-2">Time Range</h4>
                <p className="text-sm text-gray-600">
                  {format(timeRange.start, 'PPP')} - {format(timeRange.end, 'PPP')}
                </p>
              </div>

              {/* Export Button */}
              <button
                onClick={handleExport}
                disabled={loading || exportConfig.widgets.length === 0}
                className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Exporting...
                  </>
                ) : success ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Export Complete!
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Export Dashboard
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Report Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Report Name
                </label>
                <input
                  type="text"
                  value={scheduleConfig.name}
                  onChange={(e) => setScheduleConfig(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Weekly Performance Report"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Schedule Selection */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">Schedule</h3>
                <div className="grid grid-cols-1 gap-3">
                  {scheduleOptions.map((schedule) => (
                    <button
                      key={schedule.value}
                      onClick={() => setScheduleConfig(prev => ({ ...prev, schedule: schedule.value as any }))}
                      className={`p-4 border-2 rounded-lg text-left transition-colors ${
                        scheduleConfig.schedule === schedule.value
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        {schedule.icon}
                        <div>
                          <div className="font-medium text-gray-900">{schedule.label}</div>
                          <div className="text-sm text-gray-500">{schedule.description}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Recipients */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">Recipients</h3>
                <div className="space-y-2">
                  {scheduleConfig.recipients.map((recipient, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <input
                        type="email"
                        value={recipient}
                        onChange={(e) => updateRecipient(index, e.target.value)}
                        placeholder="email@example.com"
                        className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      {scheduleConfig.recipients.length > 1 && (
                        <button
                          onClick={() => removeRecipient(index)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={addRecipient}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    + Add Recipient
                  </button>
                </div>
              </div>

              {/* Format and Content (same as export) */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">Report Format</h3>
                <select
                  value={scheduleConfig.format}
                  onChange={(e) => setScheduleConfig(prev => ({ ...prev, format: e.target.value as any }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {formatOptions.map((format) => (
                    <option key={format.value} value={format.value}>
                      {format.label} - {format.description}
                    </option>
                  ))}
                </select>
              </div>

              {/* Schedule Button */}
              <button
                onClick={handleScheduleReport}
                disabled={loading || !scheduleConfig.name.trim() || scheduleConfig.recipients.some(email => !email.includes('@'))}
                className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Scheduling...
                  </>
                ) : success ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Report Scheduled!
                  </>
                ) : (
                  <>
                    <Calendar className="w-4 h-4 mr-2" />
                    Schedule Report
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExportManager;