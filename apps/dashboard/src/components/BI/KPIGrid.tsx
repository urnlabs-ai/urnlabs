import React, { useState, useEffect } from 'react';
import { Filter, RefreshCw, Download, Settings } from 'lucide-react';
import { KPICard } from './KPICard';
import { BusinessKPI } from '../../services/MetricsAggregator';

interface KPIGridProps {
  kpis: BusinessKPI[];
  loading?: boolean;
  onKPIClick?: (kpi: BusinessKPI) => void;
  onRefresh?: () => void;
  onExport?: () => void;
  onConfigure?: () => void;
  autoRefresh?: boolean;
  refreshInterval?: number;
  className?: string;
}

export const KPIGrid: React.FC<KPIGridProps> = ({
  kpis,
  loading = false,
  onKPIClick,
  onRefresh,
  onExport,
  onConfigure,
  autoRefresh = true,
  refreshInterval = 30000,
  className = ''
}) => {
  const [filteredKPIs, setFilteredKPIs] = useState<BusinessKPI[]>(kpis);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'value' | 'change' | 'status'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Auto-refresh functionality
  useEffect(() => {
    if (!autoRefresh || !onRefresh) return;

    const interval = setInterval(() => {
      onRefresh();
      setLastUpdated(new Date());
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, onRefresh]);

  // Filter and sort KPIs
  useEffect(() => {
    let filtered = [...kpis];

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(kpi => kpi.category === selectedCategory);
    }

    // Filter by status
    if (selectedStatus !== 'all') {
      filtered = filtered.filter(kpi => kpi.status === selectedStatus);
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'value':
          comparison = a.value - b.value;
          break;
        case 'change':
          comparison = a.changePercent - b.changePercent;
          break;
        case 'status':
          const statusOrder = { critical: 0, warning: 1, good: 2 };
          comparison = statusOrder[a.status as keyof typeof statusOrder] - 
                      statusOrder[b.status as keyof typeof statusOrder];
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    setFilteredKPIs(filtered);
  }, [kpis, selectedCategory, selectedStatus, sortBy, sortOrder]);

  const categories = ['all', ...Array.from(new Set(kpis.map(kpi => kpi.category)))];
  const statuses = ['all', 'critical', 'warning', 'good'];

  const getStatusCount = (status: string): number => {
    if (status === 'all') return kpis.length;
    return kpis.filter(kpi => kpi.status === status).length;
  };

  const getCategoryCount = (category: string): number => {
    if (category === 'all') return kpis.length;
    return kpis.filter(kpi => kpi.category === category).length;
  };

  const handleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  if (loading) {
    return (
      <div className={`space-y-6 ${className}`}>
        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <div className="h-8 bg-gray-200 rounded w-48 animate-pulse" />
          <div className="flex space-x-2">
            <div className="h-10 w-24 bg-gray-200 rounded animate-pulse" />
            <div className="h-10 w-24 bg-gray-200 rounded animate-pulse" />
          </div>
        </div>

        {/* Filters Skeleton */}
        <div className="flex space-x-4">
          <div className="h-10 w-32 bg-gray-200 rounded animate-pulse" />
          <div className="h-10 w-32 bg-gray-200 rounded animate-pulse" />
          <div className="h-10 w-32 bg-gray-200 rounded animate-pulse" />
        </div>

        {/* Grid Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="h-48 bg-gray-200 rounded-xl animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h2 className="text-2xl font-bold text-gray-900">
            Business KPIs
          </h2>
          <span className="text-sm text-gray-500">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </span>
        </div>

        <div className="flex items-center space-x-2">
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </button>
          )}
          
          {onExport && (
            <button
              onClick={onExport}
              className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </button>
          )}

          {onConfigure && (
            <button
              onClick={onConfigure}
              className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Settings className="w-4 h-4 mr-2" />
              Configure
            </button>
          )}
        </div>
      </div>

      {/* Status Summary */}
      <div className="grid grid-cols-4 gap-4">
        {statuses.map(status => (
          <button
            key={status}
            onClick={() => setSelectedStatus(status)}
            className={`
              p-4 rounded-lg border-2 transition-all duration-200 text-left
              ${selectedStatus === status
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
              }
            `}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-900 capitalize">
                {status === 'all' ? 'Total' : status}
              </span>
              <span className={`
                text-lg font-bold
                ${status === 'critical' ? 'text-red-600' :
                  status === 'warning' ? 'text-yellow-600' :
                  status === 'good' ? 'text-green-600' : 'text-gray-900'}
              `}>
                {getStatusCount(status)}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Filters and Controls */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Filters:</span>
        </div>

        {/* Category Filter */}
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="block px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          {categories.map(category => (
            <option key={category} value={category}>
              {category === 'all' ? 'All Categories' : category} ({getCategoryCount(category)})
            </option>
          ))}
        </select>

        {/* Sort Controls */}
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-500">Sort by:</span>
          {(['name', 'value', 'change', 'status'] as const).map(field => (
            <button
              key={field}
              onClick={() => handleSort(field)}
              className={`
                px-3 py-1 rounded text-sm font-medium transition-colors duration-200
                ${sortBy === field
                  ? 'bg-blue-100 text-blue-800'
                  : 'text-gray-600 hover:text-gray-900'
                }
              `}
            >
              {field}
              {sortBy === field && (
                <span className="ml-1">
                  {sortOrder === 'asc' ? '↑' : '↓'}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Grid */}
      {filteredKPIs.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-500 text-lg">No KPIs match your current filters</div>
          <button
            onClick={() => {
              setSelectedCategory('all');
              setSelectedStatus('all');
            }}
            className="mt-2 text-blue-600 hover:text-blue-800 text-sm"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredKPIs.map(kpi => (
            <KPICard
              key={kpi.id}
              kpi={kpi}
              onClick={onKPIClick}
              showTrend={true}
              size="md"
              className="transform transition-transform duration-200 hover:scale-105"
            />
          ))}
        </div>
      )}

      {/* Auto-refresh indicator */}
      {autoRefresh && (
        <div className="flex items-center justify-center text-sm text-gray-500">
          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
          Auto-refreshing every {Math.floor(refreshInterval / 1000)} seconds
        </div>
      )}
    </div>
  );
};

export default KPIGrid;