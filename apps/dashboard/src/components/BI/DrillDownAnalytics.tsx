import React, { useState, useEffect } from 'react';
import { 
  ChevronDown, 
  ChevronRight, 
  Filter, 
  Download, 
  ArrowUp, 
  ArrowDown,
  MoreHorizontal,
  Search,
  Calendar,
  BarChart3,
  PieChart,
  TrendingUp
} from 'lucide-react';
import { InteractiveChart, ChartSeries, ChartConfig } from './InteractiveChart';
import { BusinessKPI, TimeRange } from '../../services/MetricsAggregator';

interface DrillDownLevel {
  id: string;
  name: string;
  description: string;
  parent?: string;
  children: string[];
  data: DrillDownData[];
  chartType: 'line' | 'bar' | 'pie' | 'area';
  aggregation: 'sum' | 'avg' | 'count' | 'max' | 'min';
}

interface DrillDownData {
  category: string;
  subcategory?: string;
  value: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
  metadata: Record<string, any>;
  children?: DrillDownData[];
}

interface DrillDownPath {
  level: string;
  category: string;
  subcategory?: string;
}

interface DrillDownAnalyticsProps {
  metric: string;
  timeRange: TimeRange;
  onExport?: (data: any, format: string) => void;
  className?: string;
}

export const DrillDownAnalytics: React.FC<DrillDownAnalyticsProps> = ({
  metric,
  timeRange,
  onExport,
  className = ''
}) => {
  const [currentPath, setCurrentPath] = useState<DrillDownPath[]>([]);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'value' | 'change' | 'name'>('value');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // Mock drill-down levels configuration
  const drillDownLevels: DrillDownLevel[] = [
    {
      id: 'overview',
      name: 'Overview',
      description: 'High-level metric breakdown',
      children: ['service', 'region', 'user_segment'],
      data: [],
      chartType: 'bar',
      aggregation: 'sum'
    },
    {
      id: 'service',
      name: 'By Service',
      description: 'Breakdown by microservice',
      parent: 'overview',
      children: ['endpoint', 'method'],
      data: [],
      chartType: 'line',
      aggregation: 'avg'
    },
    {
      id: 'region',
      name: 'By Region',
      description: 'Geographic distribution',
      parent: 'overview',
      children: ['datacenter', 'availability_zone'],
      data: [],
      chartType: 'pie',
      aggregation: 'sum'
    },
    {
      id: 'user_segment',
      name: 'By User Segment',
      description: 'User cohort analysis',
      parent: 'overview',
      children: ['subscription_tier', 'usage_pattern'],
      data: [],
      chartType: 'area',
      aggregation: 'count'
    }
  ];

  // Mock data generator
  const generateMockData = (level: string, parent?: string): DrillDownData[] => {
    const categories = {
      overview: ['API Gateway', 'Agent Services', 'Analytics', 'Database', 'ML Platform'],
      service: ['Authentication', 'Workflow Engine', 'Data Processing', 'Notifications'],
      region: ['US-East', 'US-West', 'EU-Central', 'Asia-Pacific'],
      user_segment: ['Enterprise', 'Professional', 'Starter', 'Free Tier'],
      endpoint: ['/api/auth', '/api/agents', '/api/workflows', '/api/analytics'],
      method: ['GET', 'POST', 'PUT', 'DELETE'],
      datacenter: ['DC-1', 'DC-2', 'DC-3', 'DC-4'],
      availability_zone: ['AZ-1a', 'AZ-1b', 'AZ-2a', 'AZ-2b'],
      subscription_tier: ['Enterprise', 'Pro', 'Basic', 'Free'],
      usage_pattern: ['Heavy Users', 'Regular Users', 'Light Users', 'New Users']
    };

    const cats = categories[level as keyof typeof categories] || ['Unknown'];
    
    return cats.map((category, index) => {
      const baseValue = Math.random() * 1000 + 100;
      const change = (Math.random() - 0.5) * 200;
      const changePercent = change / baseValue * 100;

      return {
        category,
        value: baseValue,
        change,
        changePercent,
        trend: Math.abs(changePercent) < 2 ? 'stable' : changePercent > 0 ? 'up' : 'down',
        metadata: {
          id: `${level}_${index}`,
          lastUpdated: new Date(),
          dataPoints: Math.floor(Math.random() * 1000) + 100,
          confidence: 0.7 + Math.random() * 0.3
        }
      };
    });
  };

  // Get current level data
  const getCurrentLevelData = (): DrillDownData[] => {
    if (currentPath.length === 0) {
      return generateMockData('overview');
    }
    
    const lastLevel = currentPath[currentPath.length - 1];
    const level = drillDownLevels.find(l => l.name.toLowerCase().includes(lastLevel.level.toLowerCase()));
    
    if (level && level.children.length > 0) {
      return generateMockData(level.children[0]);
    }
    
    return [];
  };

  // Filter and sort data
  const filteredData = React.useMemo(() => {
    let data = getCurrentLevelData();
    
    // Apply search filter
    if (searchQuery) {
      data = data.filter(item => 
        item.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.subcategory?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    // Apply sorting
    data.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'value':
          comparison = a.value - b.value;
          break;
        case 'change':
          comparison = a.changePercent - b.changePercent;
          break;
        case 'name':
          comparison = a.category.localeCompare(b.category);
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    
    return data;
  }, [currentPath, searchQuery, sortBy, sortOrder]);

  // Generate chart data for current level
  const chartData: ChartSeries[] = React.useMemo(() => {
    if (viewMode !== 'chart') return [];
    
    return [{
      name: 'Value',
      data: filteredData.map((item, index) => ({
        timestamp: `${item.category}`,
        value: item.value,
        category: item.category,
        change: item.change,
        trend: item.trend
      })),
      color: '#3B82F6',
      type: 'bar'
    }];
  }, [filteredData, viewMode]);

  const chartConfig: ChartConfig = {
    type: 'bar',
    title: `${metric} - ${currentPath.map(p => p.category).join(' > ') || 'Overview'}`,
    showLegend: false,
    showGrid: true,
    showTooltip: true,
    height: 300,
    formatters: {
      xAxis: (value) => value,
      yAxis: (value) => {
        if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
        if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
        return value.toFixed(0);
      }
    }
  };

  const handleDrillDown = (item: DrillDownData) => {
    const newPath = [...currentPath, {
      level: 'detail',
      category: item.category,
      subcategory: item.subcategory
    }];
    setCurrentPath(newPath);
  };

  const handleDrillUp = (index: number) => {
    setCurrentPath(currentPath.slice(0, index + 1));
  };

  const toggleExpanded = (itemId: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
  };

  const toggleSelection = (itemId: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const formatValue = (value: number): string => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`;
    }
    return value.toFixed(1);
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return <ArrowUp className="w-4 h-4 text-green-600" />;
      case 'down':
        return <ArrowDown className="w-4 h-4 text-red-600" />;
      default:
        return <MoreHorizontal className="w-4 h-4 text-gray-400" />;
    }
  };

  const getTrendColor = (trend: string, change: number) => {
    if (Math.abs(change) < 2) return 'text-gray-600';
    return trend === 'up' ? 'text-green-600' : 'text-red-600';
  };

  return (
    <div className={`bg-white rounded-lg border shadow-sm ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-gray-200">
        <div className="flex items-center space-x-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Drill-Down Analytics: {metric}
          </h3>
          
          {/* Breadcrumb */}
          <nav className="flex items-center space-x-2 text-sm text-gray-600">
            <button
              onClick={() => setCurrentPath([])}
              className="hover:text-gray-900 transition-colors"
            >
              Overview
            </button>
            {currentPath.map((path, index) => (
              <React.Fragment key={index}>
                <ChevronRight className="w-4 h-4" />
                <button
                  onClick={() => handleDrillUp(index)}
                  className="hover:text-gray-900 transition-colors"
                >
                  {path.category}
                </button>
              </React.Fragment>
            ))}
          </nav>
        </div>

        <div className="flex items-center space-x-2">
          {/* View Mode Toggle */}
          <div className="flex border border-gray-300 rounded">
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1 text-sm ${
                viewMode === 'table' 
                  ? 'bg-blue-500 text-white' 
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Table
            </button>
            <button
              onClick={() => setViewMode('chart')}
              className={`px-3 py-1 text-sm ${
                viewMode === 'chart' 
                  ? 'bg-blue-500 text-white' 
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Chart
            </button>
          </div>

          {onExport && (
            <button
              onClick={() => onExport(filteredData, 'csv')}
              className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </button>
          )}
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex items-center justify-between p-6 border-b border-gray-200">
        <div className="flex items-center space-x-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search categories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Sort Controls */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="text-sm border border-gray-300 rounded px-2 py-1"
            >
              <option value="value">Value</option>
              <option value="change">Change</option>
              <option value="name">Name</option>
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="p-1 text-gray-600 hover:text-gray-900"
            >
              {sortOrder === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="text-sm text-gray-600">
          {filteredData.length} items
        </div>
      </div>

      {/* Content */}
      {viewMode === 'chart' ? (
        <div className="p-6">
          <InteractiveChart
            series={chartData}
            config={chartConfig}
            loading={loading}
            onDataPointClick={(data) => {
              const item = filteredData.find(item => item.category === data.category);
              if (item) handleDrillDown(item);
            }}
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300"
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedItems(new Set(filteredData.map(item => item.metadata.id)));
                      } else {
                        setSelectedItems(new Set());
                      }
                    }}
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Value
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Change
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Trend
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Confidence
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredData.map((item) => (
                <tr 
                  key={item.metadata.id}
                  className={`hover:bg-gray-50 ${
                    selectedItems.has(item.metadata.id) ? 'bg-blue-50' : ''
                  }`}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedItems.has(item.metadata.id)}
                      onChange={() => toggleSelection(item.metadata.id)}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="text-sm font-medium text-gray-900">
                        {item.category}
                      </div>
                      {item.subcategory && (
                        <div className="text-sm text-gray-500 ml-2">
                          • {item.subcategory}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatValue(item.value)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={getTrendColor(item.trend, item.changePercent)}>
                      {item.changePercent > 0 ? '+' : ''}{item.changePercent.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getTrendIcon(item.trend)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <div className="flex items-center">
                      <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: `${item.metadata.confidence * 100}%` }}
                        />
                      </div>
                      <span className="text-xs">
                        {(item.metadata.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => handleDrillDown(item)}
                      className="text-blue-600 hover:text-blue-900 mr-4"
                    >
                      Drill Down
                    </button>
                    <button className="text-gray-600 hover:text-gray-900">
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      {selectedItems.size > 0 && (
        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">
              {selectedItems.size} items selected
            </span>
            <div className="flex space-x-2">
              <button className="text-sm text-blue-600 hover:text-blue-900">
                Compare Selected
              </button>
              <button className="text-sm text-blue-600 hover:text-blue-900">
                Export Selected
              </button>
              <button 
                onClick={() => setSelectedItems(new Set())}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Clear Selection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DrillDownAnalytics;