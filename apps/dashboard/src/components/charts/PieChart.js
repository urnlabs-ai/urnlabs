import React from 'react';
import { PieChart as RechartsPieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@urnlabs/ui';
const DEFAULT_COLORS = [
    '#0088FE',
    '#00C49F',
    '#FFBB28',
    '#FF8042',
    '#8884D8',
    '#82CA9D',
    '#FFC658',
    '#FF7C7C',
    '#8DD1E1',
    '#D084D0'
];
export const PieChart = ({ title, description, data, height = 300, showLegend = true, showTooltip = true, showLabels = false, showValues = false, innerRadius = 0, outerRadius, colors = DEFAULT_COLORS, formatTooltip, formatLabel, className }) => {
    const dataWithColors = data.map((item, index) => ({
        ...item,
        color: item.color || colors[index % colors.length]
    }));
    const defaultFormatTooltip = (value, name) => {
        const total = data.reduce((sum, item) => sum + item.value, 0);
        const percentage = ((value / total) * 100).toFixed(1);
        return [`${value.toLocaleString()} (${percentage}%)`, name];
    };
    const defaultFormatLabel = (entry) => {
        if (showValues) {
            const total = data.reduce((sum, item) => sum + item.value, 0);
            const percentage = ((entry.value / total) * 100).toFixed(1);
            return `${entry.name}: ${percentage}%`;
        }
        return entry.name;
    };
    const renderCustomLabel = (entry) => {
        if (!showLabels && !showValues)
            return null;
        const total = data.reduce((sum, item) => sum + item.value, 0);
        const percentage = ((entry.value / total) * 100).toFixed(1);
        if (showValues) {
            return `${percentage}%`;
        }
        return entry.name;
    };
    // Responsive configurations
    const responsiveHeight = Math.min(height, 300);
    const responsiveOuterRadius = outerRadius || Math.min(responsiveHeight * 0.4, 80);
    const responsiveInnerRadius = Math.max(innerRadius, 0);
    return (<Card className={`@container ${className}`}>
      {(title || description) && (<CardHeader className="pb-3">
          {title && (<CardTitle className="text-sm @sm:text-base @lg:text-lg leading-tight">
              {title}
            </CardTitle>)}
          {description && (<CardDescription className="text-xs @sm:text-sm @lg:text-base line-clamp-2 @sm:line-clamp-none">
              {description}
            </CardDescription>)}
        </CardHeader>)}
      <CardContent className="p-3 @sm:p-4 @lg:p-6">
        <ResponsiveContainer width="100%" height={responsiveHeight}>
          <RechartsPieChart>
            <Pie data={dataWithColors} cx="50%" cy="50%" labelLine={false} label={showLabels || showValues ? renderCustomLabel : false} outerRadius={responsiveOuterRadius} innerRadius={responsiveInnerRadius} fill="#8884d8" dataKey="value">
              {dataWithColors.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color}/>))}
            </Pie>
            {showTooltip && (<Tooltip content={({ active, payload }) => {
                if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    const [formattedValue, formattedName] = formatTooltip
                        ? formatTooltip(data.value, data.name)
                        : defaultFormatTooltip(data.value, data.name);
                    return (<div className="rounded-lg border bg-background p-2 shadow-md">
                        <div className="flex items-center space-x-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: data.color }}/>
                          <span className="text-sm text-muted-foreground">
                            {formattedName}:
                          </span>
                          <span className="text-sm font-medium">
                            {formattedValue}
                          </span>
                        </div>
                      </div>);
                }
                return null;
            }}/>)}
            {showLegend && (<Legend content={({ payload }) => {
                return (<div className="flex flex-wrap justify-center gap-4 pt-4">
                      {payload?.map((item, index) => (<div key={index} className="flex items-center space-x-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }}/>
                          <span className="text-xs text-muted-foreground">
                            {item.value}
                          </span>
                        </div>))}
                    </div>);
            }}/>)}
          </RechartsPieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>);
};
//# sourceMappingURL=PieChart.js.map