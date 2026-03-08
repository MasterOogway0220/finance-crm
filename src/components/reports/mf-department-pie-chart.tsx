'use client'

import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, type PieLabelRenderProps } from 'recharts'

const COLORS = ['#3b82f6', '#10b981']

interface MFDepartmentPieChartProps {
  title: string
  equity: number
  mf: number
  valueLabel?: string
}

export function MFDepartmentPieChart({ title, equity, mf, valueLabel = 'Amount' }: MFDepartmentPieChartProps) {
  const data = [
    { name: 'Equity Referred', value: equity },
    { name: 'MF Own', value: mf },
  ].filter((d) => d.value > 0)

  const total = equity + mf

  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="text-base font-semibold text-gray-700 mb-4">{title}</h3>
        {total === 0 ? (
          <div className="flex items-center justify-center h-[250px] text-sm text-gray-400">No data available</div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={3}
                dataKey="value"
                label={(props: PieLabelRenderProps) => `${props.name || ''} (${((props.percent ?? 0) * 100).toFixed(0)}%)`}
                labelLine={false}
              >
                {data.map((_, idx) => (
                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number | undefined) => [formatCurrency(v ?? 0), valueLabel]} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
