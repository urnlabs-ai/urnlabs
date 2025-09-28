import React from 'react';
interface DataPoint {
    name: string;
    [key: string]: string | number;
}
interface AreaConfig {
    dataKey: string;
    color: string;
    name?: string;
    strokeWidth?: number;
    fillOpacity?: number;
    stackId?: string;
}
interface AreaChartProps {
    title?: string;
    description?: string;
    data: DataPoint[];
    areas: AreaConfig[];
    height?: number;
    showGrid?: boolean;
    showLegend?: boolean;
    showTooltip?: boolean;
    xAxisKey?: string;
    formatTooltip?: (value: any, name: string, props: any) => [string, string];
    formatXAxisLabel?: (value: string) => string;
    formatYAxisLabel?: (value: number) => string;
    className?: string;
}
export declare const AreaChart: React.FC<AreaChartProps>;
export {};
//# sourceMappingURL=AreaChart.d.ts.map