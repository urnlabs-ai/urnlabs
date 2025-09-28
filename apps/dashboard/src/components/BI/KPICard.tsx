import React from 'react';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { BusinessKPI } from '../../services/MetricsAggregator';

interface KPICardProps {
  kpi: BusinessKPI;
  className?: string;
  onClick?: (kpi: BusinessKPI) => void;
  showTrend?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const KPICard: React.FC<KPICardProps> = ({
  kpi,
  className = '',
  onClick,
  showTrend = true,
  size = 'md'
}) => {
  const formatValue = (value: number, unit: string): string => {
    if (unit === '$') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(value);
    }
    
    if (unit === '%') {
      return `${value.toFixed(1)}%`;
    }
    
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M ${unit}`;
    }
    
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K ${unit}`;
    }
    
    return `${value.toFixed(1)} ${unit}`;
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'good': return 'text-green-600 bg-green-50 border-green-200';
      case 'warning': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'good': return <CheckCircle className="w-4 h-4" />;
      case 'warning': return <AlertTriangle className="w-4 h-4" />;
      case 'critical': return <XCircle className="w-4 h-4" />;
      default: return <Minus className="w-4 h-4" />;
    }
  };

  const getTrendIcon = (trend: string, change: number) => {
    if (Math.abs(change) < 0.1) {
      return <Minus className="w-4 h-4 text-gray-500" />;
    }
    
    if (trend === 'up') {
      return <TrendingUp className="w-4 h-4 text-green-600" />;
    }
    
    return <TrendingDown className="w-4 h-4 text-red-600" />;
  };

  const getCategoryColor = (category: string): string => {
    switch (category) {
      case 'performance': return 'bg-blue-100 text-blue-800';
      case 'cost': return 'bg-green-100 text-green-800';
      case 'quality': return 'bg-purple-100 text-purple-800';
      case 'usage': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const sizeClasses = {
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8'
  };

  const textSizeClasses = {
    sm: {
      title: 'text-sm',
      value: 'text-2xl',
      change: 'text-xs'
    },
    md: {
      title: 'text-base',
      value: 'text-3xl',
      change: 'text-sm'
    },
    lg: {
      title: 'text-lg',
      value: 'text-4xl',
      change: 'text-base'
    }
  };

  const progressPercentage = Math.min((kpi.value / kpi.target) * 100, 100);

  return (
    <div
      className={`
        relative bg-white rounded-xl border shadow-sm hover:shadow-md transition-all duration-200
        ${getStatusColor(kpi.status)}
        ${onClick ? 'cursor-pointer hover:scale-105' : ''}
        ${sizeClasses[size]}
        ${className}
      `}
      onClick={() => onClick?.(kpi)}
    >
      {/* Category Badge */}
      <div className="flex items-center justify-between mb-3">
        <span className={`
          inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
          ${getCategoryColor(kpi.category)}
        `}>
          {kpi.category}
        </span>
        
        <div className="flex items-center space-x-1">
          {getStatusIcon(kpi.status)}
        </div>
      </div>

      {/* KPI Title */}
      <h3 className={`
        font-semibold text-gray-900 mb-2 line-clamp-2
        ${textSizeClasses[size].title}
      `}>
        {kpi.name}
      </h3>

      {/* Main Value */}
      <div className="flex items-baseline justify-between mb-3">
        <span className={`
          font-bold text-gray-900
          ${textSizeClasses[size].value}
        `}>
          {formatValue(kpi.value, kpi.unit)}
        </span>
        
        {showTrend && (
          <div className="flex items-center space-x-1">
            {getTrendIcon(kpi.trend, kpi.changePercent)}
            <span className={`
              font-medium
              ${textSizeClasses[size].change}
              ${kpi.changePercent > 0 ? 'text-green-600' : 
                kpi.changePercent < 0 ? 'text-red-600' : 'text-gray-500'}
            `}>
              {kpi.changePercent > 0 ? '+' : ''}{kpi.changePercent.toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex justify-between items-center text-xs text-gray-600 mb-1">
          <span>Progress to Target</span>
          <span>{formatValue(kpi.target, kpi.unit)}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`
              h-2 rounded-full transition-all duration-500
              ${kpi.status === 'good' ? 'bg-green-500' :
                kpi.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'}
            `}
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {progressPercentage.toFixed(1)}% of target
        </div>
      </div>

      {/* Change Indicator */}
      {showTrend && (
        <div className={`
          text-xs
          ${textSizeClasses[size].change}
        `}>
          <span className="text-gray-500">Change: </span>
          <span className={`
            font-medium
            ${kpi.change > 0 ? 'text-green-600' : 
              kpi.change < 0 ? 'text-red-600' : 'text-gray-500'}
          `}>
            {kpi.change > 0 ? '+' : ''}{formatValue(Math.abs(kpi.change), kpi.unit)}
          </span>
        </div>
      )}

      {/* Hover Effects */}
      {onClick && (
        <div className="absolute inset-0 rounded-xl border-2 border-transparent hover:border-blue-300 transition-colors duration-200 pointer-events-none" />
      )}
    </div>
  );
};

export default KPICard;