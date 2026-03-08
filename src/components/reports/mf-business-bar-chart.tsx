'use client'

import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

const BAR_COLORS = ['#3b82f6', '#ef4444', '#a855f7', '#f59e0b', '#10b981', '#06b6d4', '#ec4899', '#f97316', '#84cc16', '#14b8a6', '#8b5cf6', '#6b7280']

const formatYAxis = (v: number) => {
  if (v === 0) return '0'
  if (v >= 100000) return `${(v / 100000) % 1 === 0 ? (v / 100000).toFixed(0) : (v / 100000).toFixed(1)}L`
  if (v >= 1000) return `${(v / 1000).toFixed(0)}k`
  return String(v)
}

interface MFBusinessBarChartProps {
  title: string
  data: Array<{ name: string; value: number }>
  valueLabel?: string
}

export function MFBusinessBarChart({ title, data, valueLabel = 'Amount' }: MFBusinessBarChartProps) {
  const maxVal = Math.max(...data.map((d) => d.value), 0)
  const yAxisMax = maxVal === 0 ? 10000 : Math.ceil(maxVal * 1.2 / 10000) * 10000 || Math.ceil(maxVal * 1.2)

  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="text-base font-semibold text-gray-700 mb-4">{title}</h3>
        {data.length === 0 || data.every((d) => d.value === 0) ? (
          <div className="flex items-center justify-center h-[250px] text-sm text-gray-400">No data available</div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data} margin={{ left: 10, right: 10, top: 5, bottom: 5 }} barSize={36}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 11 }} domain={[0, yAxisMax]} allowDecimals={false} />
              <Tooltip formatter={(v: number | undefined) => [formatCurrency(v ?? 0), valueLabel]} />
              <Bar dataKey="value" name={valueLabel} radius={[4, 4, 0, 0]}>
                {data.map((_, idx) => (
                  <Cell key={idx} fill={BAR_COLORS[idx % BAR_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
