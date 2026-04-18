'use client'
import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils'

interface BrokerageChartProps {
  data: Array<{
    name: string
    [month: string]: string | number
  }>
  months: string[]
}

// NexLink-style primary stack + semantic highlights; repeats from #1 if >6 months.
const MONTH_COLORS = [
  'var(--dash-chart-1, #4e6cad)',
  'var(--dash-chart-2, #2f4680)',
  'var(--dash-chart-3, #8aa1cf)',
  'var(--dash-chart-4, #d7dfee)',
  'var(--dash-chart-5, #009966)',
  'var(--dash-chart-6, #e31e24)',
]

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
    <div className="dash-card h-full flex flex-col dash-controls-row">
      <div className="dash-card__header">
        <div>
          <h3 className="dash-card__title">Brokerage by Operator</h3>
          <p className="dash-card__subtitle">Monthly breakdown per operator</p>
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
      <div className="flex-1 min-h-0 overflow-y-auto">
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={filteredData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 8, bottom: 5 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              horizontal={false}
              stroke="var(--dash-chart-grid, #eef0f5)"
            />
            <XAxis
              type="number"
              tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
              tick={{ fontSize: 11, fill: 'var(--dash-muted, #64748B)' }}
              axisLine={{ stroke: 'var(--dash-border, #E2E8F0)' }}
              tickLine={{ stroke: 'var(--dash-border, #E2E8F0)' }}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={yAxisWidth}
              tick={{ fontSize: 11, fill: 'var(--dash-text, #475569)' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(value: number | undefined, name: string | undefined) => [formatCurrency(value ?? 0), name ?? '']}
              contentStyle={{
                borderRadius: '10px',
                border: '1px solid var(--dash-border, #E2E8F0)',
                boxShadow: '0 4px 12px rgba(11,11,15,.08)',
                fontSize: '13px',
                padding: '8px 12px',
                color: 'var(--dash-ink, #0b0b0f)',
              }}
              cursor={{ fill: 'var(--dash-surface-alt, #F1F5F9)' }}
            />
            <Legend
              iconSize={8}
              iconType="circle"
              wrapperStyle={{ fontSize: 11, paddingTop: '8px', color: 'var(--dash-muted, #64748B)' }}
            />
            {filteredMonths.map((month, i) => (
              <Bar
                key={month}
                dataKey={month}
                stackId="a"
                fill={MONTH_COLORS[i % MONTH_COLORS.length]}
                radius={i === filteredMonths.length - 1 ? [0, 4, 4, 0] : undefined}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
