import React, { useState, useEffect, useRef } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  ReferenceLine,
  Brush,
  ComposedChart
} from 'recharts';
import { ZoomIn, ZoomOut, Download, Maximize2, Filter, TrendingUp } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export interface ChartDataPoint {
  timestamp: string | Date;
  value: number;
  [key: string]: any;
}

export interface ChartSeries {
  name: string;
  data: ChartDataPoint[];
  color?: string;
  type?: 'line' | 'area' | 'bar';
  yAxisId?: string;
}

export interface ChartConfig {
  type: 'line' | 'area' | 'bar' | 'pie' | 'composed';
  title: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  showLegend?: boolean;
  showGrid?: boolean;
  showBrush?: boolean;
  showTooltip?: boolean;
  height?: number;
  colors?: string[];
  formatters?: {
    xAxis?: (value: any) => string;
    yAxis?: (value: any) => string;
    tooltip?: (value: any, name: string) => [string, string];
  };
  thresholds?: Array<{
    value: number;
    label: string;
    color: string;
  }>;
  annotations?: Array<{
    x?: any;
    y?: any;
    label: string;
    color?: string;
  }>;
}

interface InteractiveChartProps {
  series: ChartSeries[];
  config: ChartConfig;
  loading?: boolean;
  onDataPointClick?: (data: any) => void;
  onZoom?: (domain: { start: any; end: any }) => void;
  onExport?: (format: 'png' | 'svg' | 'pdf') => void;
  className?: string;
}

const DEFAULT_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B',
  '#8B5CF6', '#06B6D4', '#84CC16', '#F97316'
];

export const InteractiveChart: React.FC<InteractiveChartProps> = ({
  series,
  config,
  loading = false,
  onDataPointClick,
  onZoom,
  onExport,
  className = ''
}) => {
  const [zoomDomain, setZoomDomain] = useState<{ start?: any; end?: any }>({});
  const [selectedSeries, setSelectedSeries] = useState<string[]>(
    series.map(s => s.name)
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

  // Combine all series data for unified chart
  const combinedData = React.useMemo(() => {
    if (series.length === 0) return [];

    // Get all unique timestamps
    const allTimestamps = new Set<string>();
    series.forEach(s => {
      s.data.forEach(point => {
        const timestamp = typeof point.timestamp === 'string' 
          ? point.timestamp 
          : point.timestamp.toISOString();
        allTimestamps.add(timestamp);
      });
    });

    // Create combined data points
    return Array.from(allTimestamps)
      .sort()
      .map(timestamp => {
        const dataPoint: any = { timestamp };
        
        series.forEach(s => {
          const point = s.data.find(p => {
            const pointTimestamp = typeof p.timestamp === 'string' 
              ? p.timestamp 
              : p.timestamp.toISOString();
            return pointTimestamp === timestamp;
          });
          
          dataPoint[s.name] = point?.value || null;
          
          // Include any additional properties
          if (point) {
            Object.keys(point).forEach(key => {
              if (key !== 'timestamp' && key !== 'value') {
                dataPoint[`${s.name}_${key}`] = point[key];
              }
            });
          }
        });
        
        return dataPoint;
      });
  }, [series]);

  const formatXAxis = (value: any): string => {
    if (config.formatters?.xAxis) {
      return config.formatters.xAxis(value);
    }
    
    try {
      const date = typeof value === 'string' ? parseISO(value) : new Date(value);
      return format(date, 'MMM dd HH:mm');
    } catch {
      return String(value);
    }
  };

  const formatYAxis = (value: any): string => {
    if (config.formatters?.yAxis) {
      return config.formatters.yAxis(value);
    }
    
    if (typeof value === 'number') {
      if (value >= 1000000) {
        return `${(value / 1000000).toFixed(1)}M`;
      }
      if (value >= 1000) {
        return `${(value / 1000).toFixed(1)}K`;
      }
      return value.toFixed(1);
    }
    
    return String(value);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    return (
      <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-lg">
        <p className="text-sm font-medium text-gray-900 mb-2">
          {formatXAxis(label)}
        </p>
        {payload
          .filter((entry: any) => selectedSeries.includes(entry.dataKey))
          .map((entry: any, index: number) => (
            <div key={index} className="flex items-center space-x-2 text-sm">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-gray-600">{entry.dataKey}:</span>
              <span className="font-medium">
                {config.formatters?.tooltip 
                  ? config.formatters.tooltip(entry.value, entry.dataKey)[0]
                  : formatYAxis(entry.value)
                }
              </span>
            </div>
          ))}
      </div>
    );
  };

  const handleZoomChange = (domain: any) => {
    setZoomDomain(domain);
    onZoom?.(domain);
  };

  const toggleFullscreen = () => {
    if (!isFullscreen && chartRef.current) {
      if (chartRef.current.requestFullscreen) {
        chartRef.current.requestFullscreen();
      }
    }
    setIsFullscreen(!isFullscreen);
  };

  const renderChart = () => {
    const colors = config.colors || DEFAULT_COLORS;
    const height = config.height || 400;

    const commonProps = {
      width: '100%',
      height,
      data: combinedData,
      margin: { top: 20, right: 30, left: 20, bottom: 20 }
    };

    const xAxisProps = {
      dataKey: 'timestamp',
      tickFormatter: formatXAxis,
      domain: zoomDomain.start && zoomDomain.end ? [zoomDomain.start, zoomDomain.end] : undefined
    };

    const yAxisProps = {
      tickFormatter: formatYAxis
    };

    switch (config.type) {
      case 'line':
        return (
          <ResponsiveContainer {...commonProps}>
            <LineChart {...commonProps} onClick={onDataPointClick}>
              {config.showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />}
              <XAxis {...xAxisProps} />
              <YAxis {...yAxisProps} />
              {config.showTooltip && <Tooltip content={<CustomTooltip />} />}
              {config.showLegend && <Legend />}
              
              {/* Threshold lines */}
              {config.thresholds?.map((threshold, index) => (
                <ReferenceLine
                  key={index}
                  y={threshold.value}
                  stroke={threshold.color}
                  strokeDasharray="5 5"
                  label={threshold.label}
                />
              ))}
              
              {series.map((s, index) => (
                selectedSeries.includes(s.name) && (
                  <Line
                    key={s.name}
                    type="monotone"
                    dataKey={s.name}
                    stroke={s.color || colors[index % colors.length]}
                    strokeWidth={2}
                    dot={{ r: 4, strokeWidth: 2 }}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                    connectNulls={false}
                  />
                )
              ))}
              
              {config.showBrush && (
                <Brush 
                  dataKey="timestamp" 
                  height={30}
                  stroke={colors[0]}
                  onChange={handleZoomChange}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        );

      case 'area':
        return (
          <ResponsiveContainer {...commonProps}>
            <AreaChart {...commonProps} onClick={onDataPointClick}>
              {config.showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />}
              <XAxis {...xAxisProps} />
              <YAxis {...yAxisProps} />
              {config.showTooltip && <Tooltip content={<CustomTooltip />} />}
              {config.showLegend && <Legend />}
              
              {series.map((s, index) => (
                selectedSeries.includes(s.name) && (
                  <Area
                    key={s.name}
                    type="monotone"
                    dataKey={s.name}
                    stackId="1"
                    stroke={s.color || colors[index % colors.length]}
                    fill={s.color || colors[index % colors.length]}
                    fillOpacity={0.3}
                  />
                )
              ))}
            </AreaChart>
          </ResponsiveContainer>
        );

      case 'bar':
        return (
          <ResponsiveContainer {...commonProps}>
            <BarChart {...commonProps} onClick={onDataPointClick}>
              {config.showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />}
              <XAxis {...xAxisProps} />
              <YAxis {...yAxisProps} />
              {config.showTooltip && <Tooltip content={<CustomTooltip />} />}
              {config.showLegend && <Legend />}
              
              {series.map((s, index) => (
                selectedSeries.includes(s.name) && (
                  <Bar
                    key={s.name}
                    dataKey={s.name}
                    fill={s.color || colors[index % colors.length]}
                    radius={[2, 2, 0, 0]}
                  />
                )
              ))}
            </BarChart>
          </ResponsiveContainer>
        );

      case 'composed':
        return (
          <ResponsiveContainer {...commonProps}>
            <ComposedChart {...commonProps} onClick={onDataPointClick}>
              {config.showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />}
              <XAxis {...xAxisProps} />
              <YAxis {...yAxisProps} />
              {config.showTooltip && <Tooltip content={<CustomTooltip />} />}
              {config.showLegend && <Legend />}
              
              {series.map((s, index) => {
                if (!selectedSeries.includes(s.name)) return null;
                
                const color = s.color || colors[index % colors.length];
                
                switch (s.type || 'line') {
                  case 'bar':
                    return (
                      <Bar
                        key={s.name}
                        dataKey={s.name}
                        fill={color}
                        yAxisId={s.yAxisId || 'left'}
                      />
                    );
                  case 'area':
                    return (
                      <Area
                        key={s.name}
                        type="monotone"
                        dataKey={s.name}
                        stroke={color}
                        fill={color}
                        fillOpacity={0.3}
                        yAxisId={s.yAxisId || 'left'}
                      />
                    );
                  default:
                    return (
                      <Line
                        key={s.name}
                        type="monotone"
                        dataKey={s.name}
                        stroke={color}
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        yAxisId={s.yAxisId || 'left'}
                      />
                    );
                }
              })}
            </ComposedChart>
          </ResponsiveContainer>
        );

      case 'pie':
        const pieData = series[0]?.data.map((point, index) => ({
          name: `Data ${index + 1}`,
          value: point.value,
          timestamp: point.timestamp
        })) || [];

        return (
          <ResponsiveContainer {...commonProps}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                outerRadius={150}
                fill="#8884d8"
                dataKey="value"
                onClick={onDataPointClick}
              >
                {pieData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={colors[index % colors.length]} 
                  />
                ))}
              </Pie>
              {config.showTooltip && <Tooltip />}
              {config.showLegend && <Legend />}
            </PieChart>
          </ResponsiveContainer>
        );

      default:
        return <div>Unsupported chart type</div>;
    }
  };

  if (loading) {
    return (
      <div className={`bg-white rounded-lg border p-6 ${className}`}>
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={chartRef}
      className={`bg-white rounded-lg border shadow-sm ${className} ${
        isFullscreen ? 'fixed inset-0 z-50 p-8' : ''
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-gray-200">
        <div className="flex items-center space-x-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {config.title}
          </h3>
          
          {/* Series toggle */}
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <div className="flex flex-wrap gap-2">
              {series.map((s, index) => (
                <button
                  key={s.name}
                  onClick={() => {
                    setSelectedSeries(prev => 
                      prev.includes(s.name)
                        ? prev.filter(name => name !== s.name)
                        : [...prev, s.name]
                    );
                  }}
                  className={`
                    inline-flex items-center px-2 py-1 rounded text-xs font-medium
                    ${selectedSeries.includes(s.name)
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }
                  `}
                >
                  <div 
                    className="w-2 h-2 rounded-full mr-1" 
                    style={{ 
                      backgroundColor: selectedSeries.includes(s.name) 
                        ? (s.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length])
                        : '#gray'
                    }}
                  />
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setZoomDomain({})}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
            title="Reset zoom"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          
          <button
            onClick={toggleFullscreen}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
            title="Fullscreen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          {onExport && (
            <button
              onClick={() => onExport('png')}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
              title="Export chart"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="p-6">
        {series.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-gray-500">
            <div className="text-center">
              <TrendingUp className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>No data available</p>
            </div>
          </div>
        ) : (
          renderChart()
        )}
      </div>

      {/* Annotations */}
      {config.annotations && config.annotations.length > 0 && (
        <div className="px-6 pb-6">
          <div className="text-sm text-gray-600">
            <strong>Annotations:</strong>
            <ul className="mt-1 space-y-1">
              {config.annotations.map((annotation, index) => (
                <li key={index} className="flex items-center space-x-2">
                  <div 
                    className="w-2 h-2 rounded-full" 
                    style={{ backgroundColor: annotation.color || '#gray' }}
                  />
                  <span>{annotation.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default InteractiveChart;