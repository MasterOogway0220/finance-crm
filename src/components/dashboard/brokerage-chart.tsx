'use client'
import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils'

interface BrokerageChartProps {
  data: Array<{
    name: string
    [month: string]: string | number
  }>
  months: string[]
}

const MONTH_COLORS = ['#2563EB', '#EF4444', '#8B5CF6', '#F59E0B', '#10B981', '#64748B', '#06B6D4', '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#78716C']

const PERIOD_OPTIONS = [
  { value: 'FY', label: 'Full Year' },
  { value: 'Q1', label: 'Q1 (Jan–Mar)' },
  { value: 'Q2', label: 'Q2 (Apr–Jun)' },
  { value: 'Q3', label: 'Q3 (Jul–Sep)' },
  { value: 'Q4', label: 'Q4 (Oct–Dec)' },
  { value: 'H1', label: 'H1 (Jan–Jun)' },
  { value: 'H2', label: 'H2 (Jul–Dec)' },
]

const PERIOD_MONTH_INDICES: Record<string, number[]> = {
  FY: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  Q1: [0, 1, 2],
  Q2: [3, 4, 5],
  Q3: [6, 7, 8],
  Q4: [9, 10, 11],
  H1: [0, 1, 2, 3, 4, 5],
  H2: [6, 7, 8, 9, 10, 11],
}

export function BrokerageChart({ data, months }: BrokerageChartProps) {
  const [period, setPeriod] = useState('FY')

  const filteredMonths = useMemo(() => {
    const indices = PERIOD_MONTH_INDICES[period] ?? PERIOD_MONTH_INDICES.FY
    return indices.filter((i) => i < months.length).map((i) => months[i])
  }, [period, months])

  const filteredData = useMemo(() => {
    return data.map((row) => {
      const filtered: Record<string, string | number> = { name: row.name }
      for (const m of filteredMonths) {
        filtered[m] = row[m] ?? 0
      }
      return filtered
    })
  }, [data, filteredMonths])

  const chartHeight = Math.max(300, data.length * 44)
  const maxNameLen = data.reduce((max, row) => Math.max(max, String(row.name).length), 0)
  const yAxisWidth = Math.min(220, Math.max(160, maxNameLen * 7))

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold text-foreground">Brokerage by Operator</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Monthly breakdown per operator</p>
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40 h-9 text-xs" aria-label="Select period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="overflow-y-auto">
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={filteredData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 8, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
            <XAxis
              type="number"
              tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
              tick={{ fontSize: 11, fill: '#64748B' }}
              axisLine={{ stroke: '#E2E8F0' }}
              tickLine={{ stroke: '#E2E8F0' }}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={yAxisWidth}
              tick={{ fontSize: 11, fill: '#475569' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(value: number | undefined, name: string | undefined) => [formatCurrency(value ?? 0), name ?? '']}
              contentStyle={{
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                fontSize: '13px',
                padding: '8px 12px',
              }}
              cursor={{ fill: '#F1F5F9' }}
            />
            <Legend
              iconSize={8}
              iconType="circle"
              wrapperStyle={{ fontSize: 11, paddingTop: '8px' }}
            />
            {filteredMonths.map((month, i) => (
              <Bar key={month} dataKey={month} stackId="a" fill={MONTH_COLORS[i % MONTH_COLORS.length]} radius={i === filteredMonths.length - 1 ? [0, 4, 4, 0] : undefined} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
