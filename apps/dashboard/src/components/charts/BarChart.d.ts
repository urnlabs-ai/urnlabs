import React from 'react';
interface DataPoint {
    name: string;
    [key: string]: string | number;
}
interface BarConfig {
    dataKey: string;
    color: string;
    name?: string;
    stackId?: string;
    radius?: [number, number, number, number];
}
interface BarChartProps {
    title?: string;
    description?: string;
    data: DataPoint[];
    bars: BarConfig[];
    height?: number;
    showGrid?: boolean;
    showLegend?: boolean;
    showTooltip?: boolean;
    xAxisKey?: string;
    orientation?: 'horizontal' | 'vertical';
    formatTooltip?: (value: any, name: string, props: any) => [string, string];
    formatXAxisLabel?: (value: string) => string;
    formatYAxisLabel?: (value: number) => string;
    className?: string;
}
export declare const BarChart: React.FC<BarChartProps>;
export {};
//# sourceMappingURL=BarChart.d.ts.map