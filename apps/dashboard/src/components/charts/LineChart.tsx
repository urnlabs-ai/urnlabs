import React from 'react'
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@urnlabs/ui'

interface DataPoint {
  name: string
  [key: string]: string | number
}

interface LineConfig {
  dataKey: string
  color: string
  name?: string
  strokeWidth?: number
  strokeDasharray?: string
}

interface LineChartProps {
  title?: string
  description?: string
  data: DataPoint[]
  lines: LineConfig[]
  height?: number
  showGrid?: boolean
  showLegend?: boolean
  showTooltip?: boolean
  xAxisKey?: string
  formatTooltip?: (value: any, name: string, props: any) => [string, string]
  formatXAxisLabel?: (value: string) => string
  formatYAxisLabel?: (value: number) => string
  className?: string
}

export const LineChart: React.FC<LineChartProps> = ({
  title,
  description,
  data,
  lines,
  height = 300,
  showGrid = true,
  showLegend = true,
  showTooltip = true,
  xAxisKey = 'name',
  formatTooltip,
  formatXAxisLabel,
  formatYAxisLabel,
  className
}) => {
  const defaultFormatTooltip = (value: any, name: string) => {
    if (typeof value === 'number') {
      return [value.toLocaleString(), name]
    }
    return [value, name]
  }

  const defaultFormatYAxisLabel = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`
    }
    return value.toString()
  }

  // Responsive configurations
  const responsiveHeight = Math.min(height, 300)
  const responsiveMargin = {
    top: 5,
    right: 30,
    left: 20,
    bottom: 5
  }

  const responsiveStrokeWidth = 2
  const responsiveDotSize = 4
  const responsiveActiveDotSize = 6

  return (
    <Card className={className}>
      {(title || description) && (
        <CardHeader className="pb-3">
          {title && (
            <CardTitle className="text-sm sm:text-base leading-tight">
              {title}
            </CardTitle>
          )}
          {description && (
            <CardDescription className="text-xs sm:text-sm line-clamp-2 sm:line-clamp-none">
              {description}
            </CardDescription>
          )}
        </CardHeader>
      )}
      <CardContent className="p-4 sm:p-6">
        <ResponsiveContainer width="100%" height={responsiveHeight}>
          <RechartsLineChart
            data={data}
            margin={responsiveMargin}
          >
            {showGrid && (
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            )}
            <XAxis
              dataKey={xAxisKey}
              className="text-xs fill-muted-foreground"
              tickFormatter={formatXAxisLabel}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              className="text-xs fill-muted-foreground"
              tickFormatter={formatYAxisLabel || defaultFormatYAxisLabel}
              axisLine={false}
              tickLine={false}
            />
            {showTooltip && (
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="rounded-lg border bg-background p-2 shadow-md">
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
                              : defaultFormatTooltip(item.value, item.dataKey)

                            return (
                              <div key={index} className="flex items-center space-x-2">
                                <div
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: item.color }}
                                />
                                <span className="text-sm text-muted-foreground">
                                  {formattedName}:
                                </span>
                                <span className="text-sm font-medium">
                                  {formattedValue}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  }
                  return null
                }}
              />
            )}
            {showLegend && (
              <Legend
                content={({ payload }) => {
                  return (
                    <div className="flex flex-wrap justify-center gap-4 pt-4">
                      {payload?.map((item, index) => (
                        <div key={index} className="flex items-center space-x-2">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="text-xs text-muted-foreground">
                            {item.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                }}
              />
            )}
            {lines.map((line, index) => (
              <Line
                key={index}
                type="monotone"
                dataKey={line.dataKey}
                stroke={line.color}
                strokeWidth={line.strokeWidth || responsiveStrokeWidth}
                strokeDasharray={line.strokeDasharray}
                name={line.name || line.dataKey}
                dot={{ fill: line.color, strokeWidth: 0, r: responsiveDotSize }}
                activeDot={{ r: responsiveActiveDotSize, strokeWidth: 0 }}
              />
            ))}
          </RechartsLineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}