'use client'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

interface TaskPieChartProps {
  pending: number
  completed: number
  expired: number
}

const SEGMENT_COLORS = {
  pending:   'var(--dash-warning, #F59E0B)',
  completed: 'var(--dash-success, #10B981)',
  expired:   'var(--dash-accent, #EF4444)',
}

const LEGEND_DOT_FALLBACK = {
  pending:   '#f5a70d',
  completed: '#009966',
  expired:   '#e31e24',
}

export function TaskPieChart({ pending, completed, expired }: TaskPieChartProps) {
  const total = pending + completed + expired
  const data = [
    { name: 'Pending', value: pending, color: SEGMENT_COLORS.pending },
    { name: 'Completed', value: completed, color: SEGMENT_COLORS.completed },
    { name: 'Expired', value: expired, color: SEGMENT_COLORS.expired },
  ].filter((d) => d.value > 0)

  return (
    <div className="dash-card h-full flex flex-col">
      <div className="dash-card__header" style={{ marginBottom: 4 }}>
        <div>
          <h3 className="dash-card__title">Task Distribution</h3>
          <p className="dash-card__subtitle">Current month overview</p>
        </div>
      </div>

      {total === 0 ? (
        <div
          className="flex items-center justify-center h-[280px] text-sm"
          style={{ color: 'var(--dash-muted, #64748b)' }}
        >
          No task data available
        </div>
      ) : (
        <div className="relative">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="45%"
                innerRadius={72}
                outerRadius={108}
                paddingAngle={3}
                dataKey="value"
                strokeWidth={2}
                stroke="var(--dash-surface, #fff)"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(val: number | undefined) => [val ?? 0, '']}
                contentStyle={{
                  borderRadius: '10px',
                  border: '1px solid var(--dash-border, #E2E8F0)',
                  boxShadow: '0 4px 12px rgba(11,11,15,.08)',
                  fontSize: '13px',
                  padding: '8px 12px',
                }}
                labelStyle={{ color: 'var(--dash-ink, #0b0b0f)', fontWeight: 600 }}
                itemStyle={{ color: 'var(--dash-text, #1f232b)' }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ top: '-24px' }}
          >
            <div className="text-center">
              <p
                className="text-[24px] font-bold tabular-nums"
                style={{ color: 'var(--dash-ink, #0f172a)' }}
              >
                {total}
              </p>
              <p
                className="text-xs mt-0.5"
                style={{ color: 'var(--dash-muted, #64748b)' }}
              >
                Total Tasks
              </p>
            </div>
          </div>
        </div>
      )}

      {total > 0 && (
        <div
          className="grid grid-cols-3 gap-3 mt-4 pt-4"
          style={{ borderTop: '1px solid var(--dash-border, #E2E8F0)' }}
        >
          {[
            { label: 'Pending',   value: pending,   dot: LEGEND_DOT_FALLBACK.pending },
            { label: 'Completed', value: completed, dot: LEGEND_DOT_FALLBACK.completed },
            { label: 'Expired',   value: expired,   dot: LEGEND_DOT_FALLBACK.expired },
          ].map((item) => (
            <div key={item.label} className="text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: item.dot }}
                />
                <span
                  className="text-xs"
                  style={{ color: 'var(--dash-muted, #64748b)' }}
                >
                  {item.label}
                </span>
              </div>
              <p
                className="text-lg font-bold tabular-nums"
                style={{ color: 'var(--dash-ink, #0b0b0f)' }}
              >
                {item.value}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
