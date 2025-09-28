import React from 'react';
import { Card, CardContent } from '@urnlabs/ui';
import { TrendingUp, TrendingDown, Minus, Activity, DollarSign, Users, Zap, Clock, Target, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
const formatValue = (value, format, prefix, suffix) => {
    let formattedValue = value.toString();
    if (typeof value === 'number') {
        switch (format) {
            case 'currency':
                formattedValue = new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2
                }).format(value);
                break;
            case 'percentage':
                formattedValue = `${value.toFixed(1)}%`;
                break;
            case 'duration':
                if (value < 60) {
                    formattedValue = `${value}s`;
                }
                else if (value < 3600) {
                    formattedValue = `${Math.floor(value / 60)}m ${value % 60}s`;
                }
                else {
                    const hours = Math.floor(value / 3600);
                    const minutes = Math.floor((value % 3600) / 60);
                    formattedValue = `${hours}h ${minutes}m`;
                }
                break;
            case 'number':
            default:
                if (value >= 1000000) {
                    formattedValue = `${(value / 1000000).toFixed(1)}M`;
                }
                else if (value >= 1000) {
                    formattedValue = `${(value / 1000).toFixed(1)}K`;
                }
                else {
                    formattedValue = value.toLocaleString();
                }
                break;
        }
    }
    if (prefix)
        formattedValue = `${prefix}${formattedValue}`;
    if (suffix)
        formattedValue = `${formattedValue}${suffix}`;
    return formattedValue;
};
const getChangeIcon = (type) => {
    switch (type) {
        case 'increase':
            return <TrendingUp className="h-3 w-3"/>;
        case 'decrease':
            return <TrendingDown className="h-3 w-3"/>;
        case 'neutral':
        default:
            return <Minus className="h-3 w-3"/>;
    }
};
const getChangeColor = (type) => {
    switch (type) {
        case 'increase':
            return 'text-green-600';
        case 'decrease':
            return 'text-red-600';
        case 'neutral':
        default:
            return 'text-gray-600';
    }
};
const getStatusIcon = (status) => {
    switch (status) {
        case 'success':
            return <CheckCircle className="h-4 w-4 text-green-600"/>;
        case 'warning':
            return <AlertTriangle className="h-4 w-4 text-yellow-600"/>;
        case 'error':
            return <XCircle className="h-4 w-4 text-red-600"/>;
        case 'neutral':
        default:
            return null;
    }
};
const getStatusColor = (status) => {
    switch (status) {
        case 'success':
            return 'border-green-200 bg-green-50';
        case 'warning':
            return 'border-yellow-200 bg-yellow-50';
        case 'error':
            return 'border-red-200 bg-red-50';
        case 'neutral':
        default:
            return '';
    }
};
const renderMiniChart = (data, color = '#3b82f6') => {
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min;
    const points = data.map((value, index) => {
        const x = (index / (data.length - 1)) * 60;
        const y = range === 0 ? 15 : 30 - ((value - min) / range) * 20;
        return `${x},${y}`;
    }).join(' ');
    return (<svg width="60" height="30" className="ml-auto">
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points}/>
    </svg>);
};
export const MetricCard = ({ title, value, description, change, trend, icon: Icon, status, format, prefix, suffix, className, size = 'md' }) => {
    const formattedValue = formatValue(value, format, prefix, suffix);
    const sizeClasses = {
        sm: 'p-4',
        md: 'p-4 sm:p-6',
        lg: 'p-6 sm:p-8'
    };
    const titleSizeClasses = {
        sm: 'text-xs sm:text-sm',
        md: 'text-xs sm:text-sm',
        lg: 'text-sm sm:text-base'
    };
    const valueSizeClasses = {
        sm: 'text-base sm:text-lg',
        md: 'text-lg sm:text-2xl',
        lg: 'text-xl sm:text-3xl'
    };
    return (<Card className={`@container ${className} ${getStatusColor(status)}`}>
      <CardContent className={sizeClasses[size]}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {Icon && (<div className="p-2 bg-primary/10 rounded-md flex-shrink-0">
                <Icon className="h-4 w-4 @lg:h-5 @lg:w-5 text-primary"/>
              </div>)}
            <div className="min-w-0">
              <p className={`font-medium ${titleSizeClasses[size]} @lg:text-base text-muted-foreground line-clamp-1`}>
                {title}
              </p>
              {description && (<p className="text-xs @lg:text-sm text-muted-foreground mt-1 hidden @sm:block">
                  {description}
                </p>)}
            </div>
          </div>
          <div className="hidden @sm:block">
            {getStatusIcon(status)}
          </div>
        </div>

        <div className="mt-3 flex items-end justify-between">
          <div className="min-w-0">
            <div className={`font-bold ${valueSizeClasses[size]} @lg:text-4xl leading-none truncate`}>
              {formattedValue}
            </div>
            {change && (<div className={`flex items-center space-x-1 mt-2 text-xs @sm:text-sm @lg:text-base ${getChangeColor(change.type)}`}>
                {getChangeIcon(change.type)}
                <span className="font-medium">
                  {Math.abs(change.value)}%
                </span>
                <span className="text-muted-foreground hidden @sm:inline">
                  vs {change.period}
                </span>
              </div>)}
          </div>
          {trend && trend.data.length > 1 && (<div className="flex items-end flex-shrink-0 hidden @sm:block">
              {renderMiniChart(trend.data, trend.color)}
            </div>)}
        </div>
      </CardContent>
    </Card>);
};
// Pre-configured metric cards for common use cases
export const RevenueCard = (props) => (<MetricCard {...props} icon={DollarSign} format="currency"/>);
export const UsersCard = (props) => (<MetricCard {...props} icon={Users} format="number"/>);
export const ActivityCard = (props) => (<MetricCard {...props} icon={Activity}/>);
export const PerformanceCard = (props) => (<MetricCard {...props} icon={Zap}/>);
export const TimeCard = (props) => (<MetricCard {...props} icon={Clock} format="duration"/>);
export const ConversionCard = (props) => (<MetricCard {...props} icon={Target} format="percentage"/>);
//# sourceMappingURL=MetricCard.js.map