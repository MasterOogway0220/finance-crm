'use client'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface TaskPieChartProps {
  pending: number
  completed: number
  expired: number
}

const COLORS = { pending: '#F59E0B', completed: '#10B981', expired: '#EF4444' }

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
        <div>
          <CardTitle className="text-base font-semibold text-foreground">Task Distribution</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">Current month overview</p>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        {total === 0 ? (
          <div className="empty-state h-[240px]">
            <p className="text-sm">No task data available</p>
          </div>
        ) : (
          <div className="relative">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
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
                  contentStyle={{
                    borderRadius: '10px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    fontSize: '13px',
                    padding: '8px 12px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Center text — aligned to true chart center */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <p className="stat-value text-foreground">{total}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Total Tasks</p>
              </div>
            </div>
          </div>
        )}

        {/* Legend + Stats bar */}
        {total > 0 && (
          <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border">
            {[
              { label: 'Pending', value: pending, color: COLORS.pending, dot: 'bg-amber-400' },
              { label: 'Completed', value: completed, color: COLORS.completed, dot: 'bg-emerald-500' },
              { label: 'Expired', value: expired, color: COLORS.expired, dot: 'bg-red-500' },
            ].map((item) => (
              <div key={item.label} className="text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <span className={`h-2.5 w-2.5 rounded-full ${item.dot}`} />
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                </div>
                <p className="text-lg font-bold tabular-nums" style={{ color: item.color }}>{item.value}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
