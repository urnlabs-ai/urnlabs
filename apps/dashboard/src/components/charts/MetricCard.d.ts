import React from 'react';
interface MetricCardProps {
    title: string;
    value: string | number;
    description?: string;
    change?: {
        value: number;
        period: string;
        type: 'increase' | 'decrease' | 'neutral';
    };
    trend?: {
        data: number[];
        color?: string;
    };
    icon?: React.ComponentType<any>;
    status?: 'success' | 'warning' | 'error' | 'neutral';
    format?: 'number' | 'currency' | 'percentage' | 'duration';
    prefix?: string;
    suffix?: string;
    className?: string;
    size?: 'sm' | 'md' | 'lg';
}
export declare const MetricCard: React.FC<MetricCardProps>;
export declare const RevenueCard: React.FC<Omit<MetricCardProps, 'icon' | 'format'>>;
export declare const UsersCard: React.FC<Omit<MetricCardProps, 'icon' | 'format'>>;
export declare const ActivityCard: React.FC<Omit<MetricCardProps, 'icon'>>;
export declare const PerformanceCard: React.FC<Omit<MetricCardProps, 'icon'>>;
export declare const TimeCard: React.FC<Omit<MetricCardProps, 'icon' | 'format'>>;
export declare const ConversionCard: React.FC<Omit<MetricCardProps, 'icon' | 'format'>>;
export {};
//# sourceMappingURL=MetricCard.d.ts.map