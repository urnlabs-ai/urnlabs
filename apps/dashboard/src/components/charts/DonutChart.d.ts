import React from 'react';
interface DataPoint {
    name: string;
    value: number;
    color?: string;
}
interface DonutChartProps {
    title?: string;
    description?: string;
    data: DataPoint[];
    height?: number;
    showLegend?: boolean;
    showTooltip?: boolean;
    showCenterLabel?: boolean;
    centerLabel?: string;
    centerValue?: string | number;
    innerRadius?: number;
    outerRadius?: number;
    colors?: string[];
    formatTooltip?: (value: number, name: string) => [string, string];
    className?: string;
}
export declare const DonutChart: React.FC<DonutChartProps>;
export {};
//# sourceMappingURL=DonutChart.d.ts.map