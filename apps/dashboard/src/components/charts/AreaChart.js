import React from 'react';
import { AreaChart as RechartsAreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@urnlabs/ui';
export const AreaChart = ({ title, description, data, areas, height = 300, showGrid = true, showLegend = true, showTooltip = true, xAxisKey = 'name', formatTooltip, formatXAxisLabel, formatYAxisLabel, className }) => {
    const defaultFormatTooltip = (value, name) => {
        if (typeof value === 'number') {
            return [value.toLocaleString(), name];
        }
        return [value, name];
    };
    const defaultFormatYAxisLabel = (value) => {
        if (value >= 1000000) {
            return `${(value / 1000000).toFixed(1)}M`;
        }
        if (value >= 1000) {
            return `${(value / 1000).toFixed(1)}K`;
        }
        return value.toString();
    };
    // Responsive configurations
    const responsiveHeight = Math.min(height, 300);
    const responsiveMargin = {
        top: 5,
        right: 30,
        left: 20,
        bottom: 5
    };
    const responsiveStrokeWidth = 2;
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
          <RechartsAreaChart data={data} margin={responsiveMargin}>
            <defs>
              {areas.map((area, index) => (<linearGradient key={index} id={`gradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={area.color} stopOpacity={area.fillOpacity || 0.8}/>
                  <stop offset="95%" stopColor={area.color} stopOpacity={0.1}/>
                </linearGradient>))}
            </defs>
            {showGrid && (<CartesianGrid strokeDasharray="3 3" className="stroke-muted"/>)}
            <XAxis dataKey={xAxisKey} className="text-xs fill-muted-foreground" tickFormatter={formatXAxisLabel} axisLine={false} tickLine={false}/>
            <YAxis className="text-xs fill-muted-foreground" tickFormatter={formatYAxisLabel || defaultFormatYAxisLabel} axisLine={false} tickLine={false}/>
            {showTooltip && (<Tooltip content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                    return (<div className="rounded-lg border bg-background p-2 shadow-md">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex flex-col">
                            <span className="text-[0.70rem] uppercase text-muted-foreground">
                              {formatXAxisLabel ? formatXAxisLabel(label) : label}
                            </span>
                          </div>
                        </div>
                        <div className="grid gap-2">
                          {payload.map((item, index) => {
                            const [formattedValue, formattedName] = formatTooltip
                                ? formatTooltip(item.value, item.dataKey, item)
                                : defaultFormatTooltip(item.value, item.dataKey);
                            return (<div key={index} className="flex items-center space-x-2">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }}/>
                                <span className="text-sm text-muted-foreground">
                                  {formattedName}:
                                </span>
                                <span className="text-sm font-medium">
                                  {formattedValue}
                                </span>
                              </div>);
                        })}
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
            {areas.map((area, index) => (<Area key={index} type="monotone" dataKey={area.dataKey} stackId={area.stackId} stroke={area.color} fill={`url(#gradient-${index})`} strokeWidth={area.strokeWidth || responsiveStrokeWidth} name={area.name || area.dataKey}/>))}
          </RechartsAreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>);
};
//# sourceMappingURL=AreaChart.js.map