'use client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'

interface BrokerageChartProps {
  data: Array<{
    name: string
    [month: string]: string | number
  }>
  months: string[]
}

const MONTH_COLORS = ['#3b82f6', '#ef4444', '#a855f7', '#f59e0b', '#10b981', '#6b7280', '#06b6d4', '#ec4899']

export function BrokerageChart({ data, months }: BrokerageChartProps) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-gray-700">Brokerage by Operator</CardTitle>
        <p className="text-xs text-gray-400">Last 6 months + current</p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={100}
              tick={{ fontSize: 11 }}
            />
            <Tooltip
              formatter={(value: number | undefined, name: string | undefined) => [formatCurrency(value ?? 0), name ?? '']}
            />
            <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            {months.map((month, i) => (
              <Bar key={month} dataKey={month} stackId="a" fill={MONTH_COLORS[i % MONTH_COLORS.length]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
