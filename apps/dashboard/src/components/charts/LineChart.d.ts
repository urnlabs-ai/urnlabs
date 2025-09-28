import React from 'react';
interface DataPoint {
    name: string;
    [key: string]: string | number;
}
interface LineConfig {
    dataKey: string;
    color: string;
    name?: string;
    strokeWidth?: number;
    strokeDasharray?: string;
}
interface LineChartProps {
    title?: string;
    description?: string;
    data: DataPoint[];
    lines: LineConfig[];
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
export declare const LineChart: React.FC<LineChartProps>;
export {};
//# sourceMappingURL=LineChart.d.ts.map