'use client'
import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell
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

const MONTH_COLORS = ['#3b82f6', '#ef4444', '#a855f7', '#f59e0b', '#10b981', '#6b7280', '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#64748b']

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

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base font-semibold text-gray-700">Brokerage by Operator</CardTitle>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart
            data={filteredData}
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
              width={140}
              tick={{ fontSize: 11 }}
              tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 17) + '…' : v}
            />
            <Tooltip
              formatter={(value: number | undefined, name: string | undefined) => [formatCurrency(value ?? 0), name ?? '']}
            />
            <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            {filteredMonths.map((month, i) => (
              <Bar key={month} dataKey={month} stackId="a" fill={MONTH_COLORS[i % MONTH_COLORS.length]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
