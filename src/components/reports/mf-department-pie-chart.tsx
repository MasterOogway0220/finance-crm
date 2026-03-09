'use client'

import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const COLORS = ['#3b82f6', '#10b981']
const LABELS = ['Equity Referred', 'MF Own']

interface MFDepartmentPieChartProps {
  title: string
  equity: number
  mf: number
  valueLabel?: string
}

export function MFDepartmentPieChart({ title, equity, mf, valueLabel = 'Amount' }: MFDepartmentPieChartProps) {
  const raw = [
    { name: 'Equity Referred', value: equity, color: COLORS[0] },
    { name: 'MF Own', value: mf, color: COLORS[1] },
  ]
  const data = raw.filter((d) => d.value > 0)
  const total = equity + mf

  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="text-base font-semibold text-gray-700 mb-1">{title}</h3>
        {total === 0 ? (
          <div className="flex items-center justify-center h-[300px] text-sm text-gray-400">No data available</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="45%"
                  innerRadius={65}
                  outerRadius={105}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {data.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number | undefined) => [formatCurrency(v ?? 0), valueLabel]}
                  contentStyle={{ fontSize: 12 }}
                />
                <Legend
                  iconType="circle"
                  iconSize={10}
                  formatter={(value) => <span style={{ fontSize: 12, color: '#374151' }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Value breakdown below chart */}
            <div className="mt-2 grid grid-cols-2 gap-3">
              {raw.map((item) => (
                <div key={item.name} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500 truncate">{item.name}</p>
                    <p className="text-sm font-semibold text-gray-800">{formatCurrency(item.value)}</p>
                    {total > 0 && (
                      <p className="text-xs text-gray-400">{((item.value / total) * 100).toFixed(1)}%</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
