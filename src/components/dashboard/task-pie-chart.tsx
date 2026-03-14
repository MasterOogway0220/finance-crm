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
      <CardContent className="pt-2">
        {total === 0 ? (
          <div className="flex items-center justify-center h-[280px] text-sm text-gray-400">No task data</div>
        ) : (
          <div className="relative">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="45%"
                  innerRadius={70}
                  outerRadius={105}
                  paddingAngle={3}
                  dataKey="value"
                  strokeWidth={2}
                  stroke="#fff"
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: number | undefined) => [val ?? 0, '']}
                  contentStyle={{ borderRadius: '8px', fontSize: '13px' }}
                />
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  iconSize={10}
                  wrapperStyle={{ paddingTop: '16px' }}
                  formatter={(value) => <span className="text-sm text-gray-600 ml-1">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Center text */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ top: '-24px' }}>
              <div className="text-center">
                <p className="text-3xl font-bold text-gray-800">{total}</p>
                <p className="text-xs text-gray-500 mt-0.5">Total Tasks</p>
              </div>
            </div>
          </div>
        )}

        {/* Stats bar */}
        {total > 0 && (
          <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t">
            <div className="text-center">
              <p className="text-lg font-bold" style={{ color: COLORS.pending }}>{pending}</p>
              <p className="text-xs text-gray-500">Pending</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold" style={{ color: COLORS.completed }}>{completed}</p>
              <p className="text-xs text-gray-500">Completed</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold" style={{ color: COLORS.expired }}>{expired}</p>
              <p className="text-xs text-gray-500">Expired</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
