'use client'

import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty'
import type { TrendChartDataPoint, MetricKey } from '@/lib/customer-analytics'
import { METRIC_OPTIONS } from '@/lib/customer-analytics'

const COLORS = [
  'hsl(221, 83%, 53%)',  // blue
  'hsl(142, 76%, 36%)',  // green
  'hsl(0, 84%, 60%)',    // red
  'hsl(38, 92%, 50%)',   // amber
  'hsl(262, 83%, 58%)',  // purple
  'hsl(173, 80%, 40%)',  // teal
  'hsl(330, 81%, 60%)',  // pink
  'hsl(25, 95%, 53%)',   // orange
]

interface RevenueTrendChartProps {
  data: TrendChartDataPoint[]
  metric: MetricKey
  customerNames: string[]
  loading: boolean
}

export function RevenueTrendChart({
  data,
  metric,
  customerNames,
  loading,
}: RevenueTrendChartProps) {
  const metricOption = useMemo(
    () => METRIC_OPTIONS.find((o) => o.value === metric) ?? METRIC_OPTIONS[0],
    [metric],
  )

  const chartConfig = useMemo<ChartConfig>(() => {
    const config: ChartConfig = {}
    customerNames.forEach((name, i) => {
      config[name] = {
        label: name,
        color: COLORS[i % COLORS.length],
      }
    })
    return config
  }, [customerNames])

  const chartTitle = `Xu hướng ${metricOption.label}`

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{chartTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : data.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Chưa có dữ liệu</EmptyTitle>
              <EmptyDescription>
                Không có dữ liệu xu hướng cho khoảng thời gian đã chọn.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <LineChart
              data={data}
              margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" className="text-xs" />
              <YAxis
                className="text-xs"
                tickFormatter={(v: number) =>
                  metric === 'orders'
                    ? Math.round(v).toLocaleString('vi-VN')
                    : `${(v / 1_000_000).toFixed(1)}tr`
                }
                label={{
                  value: metricOption.yAxisLabel,
                  angle: -90,
                  position: 'insideLeft',
                  style: { fontSize: 11, fill: 'hsl(var(--muted-foreground))' },
                }}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => (
                      <span className="text-foreground font-mono font-medium tabular-nums">
                        {metricOption.formatValue(Number(value))}
                      </span>
                    )}
                  />
                }
              />
              <Legend />
              {customerNames.map((name, i) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
