import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, AlertTriangle, Info, Calendar, Target } from 'lucide-react';
import { InteractiveChart, ChartSeries, ChartConfig } from './InteractiveChart';
import { ForecastData } from '../../services/AnalyticsService';
import { format, addDays } from 'date-fns';

interface ForecastWidgetProps {
  forecast: ForecastData;
  loading?: boolean;
  onConfigChange?: (config: ForecastConfig) => void;
  className?: string;
}

interface ForecastConfig {
  confidenceThreshold: number;
  showConfidenceBands: boolean;
  forecastPeriod: number;
  highlightAnomalies: boolean;
}

export const ForecastWidget: React.FC<ForecastWidgetProps> = ({
  forecast,
  loading = false,
  onConfigChange,
  className = ''
}) => {
  const [config, setConfig] = useState<ForecastConfig>({
    confidenceThreshold: 0.8,
    showConfidenceBands: true,
    forecastPeriod: 30,
    highlightAnomalies: true
  });

  const [showDetails, setShowDetails] = useState(false);

  // Prepare chart data
  const chartSeries: ChartSeries[] = React.useMemo(() => {
    const series: ChartSeries[] = [
      {
        name: 'Historical',
        data: forecast.historical.map(point => ({
          timestamp: point.timestamp,
          value: point.value
        })),
        color: '#3B82F6',
        type: 'line'
      },
      {
        name: 'Forecast',
        data: forecast.forecast.map(point => ({
          timestamp: point.timestamp,
          value: point.value,
          confidence: point.confidence
        })),
        color: '#10B981',
        type: 'line'
      }
    ];

    // Add confidence bands if enabled
    if (config.showConfidenceBands) {
      series.push(
        {
          name: 'Upper Confidence',
          data: forecast.forecast
            .filter(point => point.confidence >= config.confidenceThreshold)
            .map(point => ({
              timestamp: point.timestamp,
              value: point.value * (1 + (1 - point.confidence) * 0.5)
            })),
          color: '#10B981',
          type: 'area'
        },
        {
          name: 'Lower Confidence',
          data: forecast.forecast
            .filter(point => point.confidence >= config.confidenceThreshold)
            .map(point => ({
              timestamp: point.timestamp,
              value: point.value * (1 - (1 - point.confidence) * 0.5)
            })),
          color: '#10B981',
          type: 'area'
        }
      );
    }

    return series;
  }, [forecast, config]);

  const chartConfig: ChartConfig = {
    type: 'composed',
    title: `${forecast.metric} Forecast`,
    showLegend: true,
    showGrid: true,
    showTooltip: true,
    showBrush: true,
    height: 400,
    formatters: {
      xAxis: (value) => format(new Date(value), 'MMM dd'),
      yAxis: (value) => {
        if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
        if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
        return value.toFixed(1);
      },
      tooltip: (value, name) => {
        if (name.includes('Confidence')) {
          return [`${value.toFixed(2)} (confidence band)`, name];
        }
        return [`${value.toFixed(2)}`, name];
      }
    },
    annotations: [
      {
        x: new Date(),
        label: 'Current Time',
        color: '#EF4444'
      }
    ]
  };

  // Calculate forecast insights
  const insights = React.useMemo(() => {
    const currentValue = forecast.historical[forecast.historical.length - 1]?.value || 0;
    const futureValue = forecast.forecast[forecast.forecast.length - 1]?.value || 0;
    const change = futureValue - currentValue;
    const changePercent = currentValue !== 0 ? (change / currentValue) * 100 : 0;

    const highConfidencePoints = forecast.forecast.filter(
      point => point.confidence >= config.confidenceThreshold
    );

    const avgConfidence = forecast.forecast.reduce(
      (sum, point) => sum + point.confidence, 0
    ) / forecast.forecast.length;

    return {
      currentValue,
      futureValue,
      change,
      changePercent,
      trend: forecast.trend,
      accuracy: forecast.accuracy,
      avgConfidence,
      highConfidencePoints: highConfidencePoints.length,
      totalPoints: forecast.forecast.length
    };
  }, [forecast, config.confidenceThreshold]);

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'increasing':
        return <TrendingUp className="w-5 h-5 text-green-600" />;
      case 'decreasing':
        return <TrendingDown className="w-5 h-5 text-red-600" />;
      case 'seasonal':
        return <Calendar className="w-5 h-5 text-blue-600" />;
      default:
        return <Target className="w-5 h-5 text-gray-600" />;
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'increasing': return 'text-green-600 bg-green-50 border-green-200';
      case 'decreasing': return 'text-red-600 bg-red-50 border-red-200';
      case 'seasonal': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const handleConfigChange = (updates: Partial<ForecastConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    onConfigChange?.(newConfig);
  };

  if (loading) {
    return (
      <div className={`bg-white rounded-lg border p-6 ${className}`}>
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
          <div className="h-64 bg-gray-200 rounded mb-4" />
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg border shadow-sm ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <div className={`p-2 rounded-lg border ${getTrendColor(forecast.trend)}`}>
            {getTrendIcon(forecast.trend)}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {forecast.metric} Forecast
            </h3>
            <p className="text-sm text-gray-600">
              {forecast.forecast.length} day forecast • {insights.accuracy.toFixed(1)}% accuracy
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowDetails(!showDetails)}
          className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
        >
          <Info className="w-4 h-4 mr-2" />
          {showDetails ? 'Hide' : 'Show'} Details
        </button>
      </div>

      {/* Configuration Panel */}
      {showDetails && (
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <h4 className="text-sm font-medium text-gray-900 mb-4">Forecast Configuration</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Confidence Threshold
              </label>
              <input
                type="range"
                min="0.5"
                max="1"
                step="0.05"
                value={config.confidenceThreshold}
                onChange={(e) => handleConfigChange({ 
                  confidenceThreshold: parseFloat(e.target.value) 
                })}
                className="w-full"
              />
              <span className="text-xs text-gray-500">
                {(config.confidenceThreshold * 100).toFixed(0)}%
              </span>
            </div>

            <div>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={config.showConfidenceBands}
                  onChange={(e) => handleConfigChange({ 
                    showConfidenceBands: e.target.checked 
                  })}
                  className="rounded border-gray-300"
                />
                <span className="text-xs font-medium text-gray-700">
                  Show Confidence Bands
                </span>
              </label>
            </div>

            <div>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={config.highlightAnomalies}
                  onChange={(e) => handleConfigChange({ 
                    highlightAnomalies: e.target.checked 
                  })}
                  className="rounded border-gray-300"
                />
                <span className="text-xs font-medium text-gray-700">
                  Highlight Anomalies
                </span>
              </label>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Forecast Period
              </label>
              <select
                value={config.forecastPeriod}
                onChange={(e) => handleConfigChange({ 
                  forecastPeriod: parseInt(e.target.value) 
                })}
                className="w-full text-xs border border-gray-300 rounded px-2 py-1"
              >
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="p-6 border-b border-gray-200">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {insights.currentValue.toFixed(1)}
            </div>
            <div className="text-sm text-gray-600">Current Value</div>
          </div>

          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {insights.futureValue.toFixed(1)}
            </div>
            <div className="text-sm text-gray-600">
              Predicted ({config.forecastPeriod}d)
            </div>
          </div>

          <div className="text-center">
            <div className={`text-2xl font-bold ${
              insights.changePercent > 0 ? 'text-green-600' : 
              insights.changePercent < 0 ? 'text-red-600' : 'text-gray-600'
            }`}>
              {insights.changePercent > 0 ? '+' : ''}{insights.changePercent.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-600">Expected Change</div>
          </div>

          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {(insights.avgConfidence * 100).toFixed(0)}%
            </div>
            <div className="text-sm text-gray-600">Avg Confidence</div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="p-6">
        <InteractiveChart
          series={chartSeries}
          config={chartConfig}
          loading={loading}
        />
      </div>

      {/* Insights */}
      <div className="p-6 border-t border-gray-200">
        <h4 className="text-sm font-medium text-gray-900 mb-3">Forecast Insights</h4>
        <div className="space-y-2">
          <div className="flex items-start space-x-2">
            <div className={`p-1 rounded ${getTrendColor(forecast.trend)}`}>
              {getTrendIcon(forecast.trend)}
            </div>
            <div>
              <div className="text-sm font-medium text-gray-900">
                Trend: {forecast.trend.charAt(0).toUpperCase() + forecast.trend.slice(1)}
              </div>
              <div className="text-xs text-gray-600">
                Based on historical pattern analysis
              </div>
            </div>
          </div>

          <div className="flex items-start space-x-2">
            <div className="p-1 rounded bg-blue-50 text-blue-600">
              <Target className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-900">
                Model Accuracy: {(insights.accuracy * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-gray-600">
                Based on backtesting against historical data
              </div>
            </div>
          </div>

          <div className="flex items-start space-x-2">
            <div className="p-1 rounded bg-yellow-50 text-yellow-600">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-900">
                High Confidence Points: {insights.highConfidencePoints}/{insights.totalPoints}
              </div>
              <div className="text-xs text-gray-600">
                Data points above {(config.confidenceThreshold * 100).toFixed(0)}% confidence threshold
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Analysis */}
      {showDetails && (
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <h4 className="text-sm font-medium text-gray-900 mb-3">Detailed Analysis</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h5 className="text-xs font-medium text-gray-700 mb-2">Data Quality</h5>
              <ul className="text-xs text-gray-600 space-y-1">
                <li>• Historical data points: {forecast.historical.length}</li>
                <li>• Forecast data points: {forecast.forecast.length}</li>
                <li>• Model accuracy: {(insights.accuracy * 100).toFixed(1)}%</li>
                <li>• Average confidence: {(insights.avgConfidence * 100).toFixed(1)}%</li>
              </ul>
            </div>

            <div>
              <h5 className="text-xs font-medium text-gray-700 mb-2">Key Observations</h5>
              <ul className="text-xs text-gray-600 space-y-1">
                <li>• Trend direction: {forecast.trend}</li>
                <li>• Expected change: {insights.changePercent.toFixed(1)}%</li>
                <li>• Forecast period: {config.forecastPeriod} days</li>
                <li>• Next update: {format(addDays(new Date(), 1), 'MMM dd, yyyy')}</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ForecastWidget;