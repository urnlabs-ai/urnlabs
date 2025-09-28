import React from 'react';
interface DataPoint {
    name: string;
    value: number;
    color?: string;
}
interface PieChartProps {
    title?: string;
    description?: string;
    data: DataPoint[];
    height?: number;
    showLegend?: boolean;
    showTooltip?: boolean;
    showLabels?: boolean;
    showValues?: boolean;
    innerRadius?: number;
    outerRadius?: number;
    colors?: string[];
    formatTooltip?: (value: number, name: string) => [string, string];
    formatLabel?: (entry: DataPoint) => string;
    className?: string;
}
export declare const PieChart: React.FC<PieChartProps>;
export {};
//# sourceMappingURL=PieChart.d.ts.map