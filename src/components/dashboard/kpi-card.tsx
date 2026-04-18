'use client'
import { useId } from 'react'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface KpiCardProps {
  title: string
  value: string | number
  subtitle?: string
  /** Retained for backward compatibility with existing call sites;
   *  no longer rendered in the redesigned card. */
  icon?: LucideIcon
  accent?: 'blue' | 'indigo' | 'green' | 'emerald' | 'amber' | 'red'
  trend?: { value: string; positive: boolean }
  /** Retained for backward compat; currently inert.
   *  Clickability is driven by actionLabel + onAction instead. */
  onClick?: () => void
  actionLabel?: string
  onAction?: () => void
  sparkData?: number[]
}

const ACCENT_TO_STROKE: Record<NonNullable<KpiCardProps['accent']>, string> = {
  blue:    'var(--dash-primary, #4e6cad)',
  indigo:  'var(--dash-primary, #4e6cad)',
  green:   'var(--dash-success, #009966)',
  emerald: 'var(--dash-success, #009966)',
  amber:   'var(--dash-warning, #f5a70d)',
  red:     'var(--dash-accent, #e31e24)',
}

// High-signal KPIs get a 1px top accent border when accent is red.
// Controlled via a title whitelist so every caller keeps working
// without needing a new prop.
const ATTENTION_RED_TITLES = new Set(['Overdue Tasks', 'Not Traded', 'Tasks Expired'])

export function KpiCard({
  title,
  value,
  subtitle,
  accent = 'blue',
  trend,
  actionLabel,
  onAction,
  sparkData,
}: KpiCardProps) {
  const strokeColor = ACCENT_TO_STROKE[accent]
  const isAttentionRed = accent === 'red' && ATTENTION_RED_TITLES.has(title)

  const sparkSeries =
    sparkData && sparkData.length > 0
      ? sparkData.map((v, i) => ({ i, v }))
      : null

  const reactId = useId()
  const gradientId = `kpi-spark-${reactId.replace(/:/g, '')}`

  return (
    <div
      className="dash-card flex flex-col gap-3"
      style={
        isAttentionRed
          ? { borderTop: '1px solid var(--dash-accent, #e31e24)' }
          : undefined
      }
    >
      <div className="flex items-center justify-between">
        <p
          className="text-[13px] font-semibold"
          style={{ color: 'var(--dash-muted, #64748b)' }}
        >
          {title}
        </p>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <p
            className="text-[28px] font-bold leading-none tabular-nums truncate"
            style={{ color: 'var(--dash-ink, #0f172a)' }}
          >
            {value}
          </p>
          {trend && (
            <span className={cn('dash-pill', trend.positive ? 'dash-pill--success' : 'dash-pill--danger')}>
              <span>{trend.positive ? '▲' : '▼'}</span>
              {trend.value}
            </span>
          )}
        </div>

        {sparkSeries && (
          <div className="h-8 w-[72px] flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkSeries} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={strokeColor} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={strokeColor}
                  strokeWidth={1.5}
                  fill={`url(#${gradientId})`}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {(subtitle || (actionLabel && onAction)) && (
        <div
          className="flex items-center justify-between pt-3"
          style={{ borderTop: '1px solid var(--dash-border, #e2e8f0)' }}
        >
          {subtitle && (
            <p
              className="text-[12px] truncate"
              style={{ color: 'var(--dash-muted, #64748b)' }}
            >
              {subtitle}
            </p>
          )}
          {actionLabel && onAction ? (
            <button
              type="button"
              onClick={onAction}
              className="text-[12px] font-semibold dash-link-arrow cursor-pointer"
              style={{ color: strokeColor }}
            >
              {actionLabel} →
            </button>
          ) : subtitle ? (
            <span
              aria-hidden
              className="dash-link-arrow text-[14px]"
              style={{ color: strokeColor }}
            >
              →
            </span>
          ) : null}
        </div>
      )}
    </div>
  )
}
