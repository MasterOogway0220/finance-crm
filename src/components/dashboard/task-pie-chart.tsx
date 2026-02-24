'use client'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface TaskPieChartProps {
  pending: number
  completed: number
  expired: number
}

const COLORS = { pending: '#F9A825', completed: '#2E7D32', expired: '#D32F2F' }

export function TaskPieChart({ pending, completed, expired }: TaskPieChartProps) {
  const total = pending + completed + expired
  const data = [
    { name: 'Pending', value: pending, color: COLORS.pending },
    { name: 'Completed', value: completed, color: COLORS.completed },
    { name: 'Expired', value: expired, color: COLORS.expired },
  ].filter((d) => d.value > 0)

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-gray-700">Task Distribution</CardTitle>
        <p className="text-xs text-gray-400">Current month overview</p>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(val: number | undefined) => [val ?? 0, '']} />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(value) => <span className="text-xs text-gray-600">{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Center text */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ top: '-10px' }}>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-800">{total}</p>
              <p className="text-xs text-gray-500">Total</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
